-- G2: tarla konumu/sınırı, Bitki Bilgi Paketi (sürümlü), "Yakınım yapsın" kodları.

-- ---------------------------------------------------------------------------
-- Tarla: sınır, ada/parsel, konum yolu, istemci kimliği (çevrimdışı sıradan çift kayıt olmasın)
-- ---------------------------------------------------------------------------
ALTER TABLE fields
  ADD COLUMN boundary        jsonb CHECK (boundary IS NULL OR boundary->>'type' = 'Polygon'),
  ADD COLUMN parcel_block    text CHECK (length(parcel_block) <= 20),
  ADD COLUMN parcel_no       text CHECK (length(parcel_no) <= 20),
  ADD COLUMN location_source text CHECK (location_source IN ('gps', 'koy', 'harita', 'yakin')),
  ADD COLUMN client_id       uuid;
CREATE UNIQUE INDEX fields_owner_client_idx ON fields(owner_id, client_id) WHERE client_id IS NOT NULL;

GRANT UPDATE (boundary, parcel_block, parcel_no, location_source) ON fields TO tp_app;

-- PostGIS varsa nokta ve sınır geometrisi de tutulur (mekânsal sorgular için). Eklenti yoksa
-- (ör. PGlite testleri) sessizce atlanır; alan hesabı her durumda @tarim/agro-core ile yapılır.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    EXECUTE $q$ALTER TABLE fields ADD COLUMN geom geography(Point, 4326)
      GENERATED ALWAYS AS (CASE WHEN lat IS NULL OR lon IS NULL THEN NULL
        ELSE ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography END) STORED
    $q$;
    EXECUTE 'ALTER TABLE fields ADD COLUMN boundary_geom geography(Polygon, 4326)';
    EXECUTE 'CREATE INDEX fields_geom_idx ON fields USING gist (geom)';
    EXECUTE 'CREATE INDEX fields_boundary_geom_idx ON fields USING gist (boundary_geom)';
    EXECUTE $q$CREATE FUNCTION fields_sync_boundary() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        NEW.boundary_geom := CASE WHEN NEW.boundary IS NULL THEN NULL
          ELSE ST_SetSRID(ST_GeomFromGeoJSON(NEW.boundary::text), 4326)::geography END;
        RETURN NEW;
      END $f$
    $q$;
    EXECUTE 'CREATE TRIGGER fields_sync_boundary BEFORE INSERT OR UPDATE OF boundary ON fields
      FOR EACH ROW EXECUTE FUNCTION fields_sync_boundary()';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PostGIS geometri sütunları eklenemedi: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- Bitki Bilgi Paketi (PLAN §4): ürün, sürümlü paket, evreler. Herkes okur; yazma yalnız sistem.
-- ---------------------------------------------------------------------------
CREATE TABLE crops (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  name_tr     text NOT NULL,
  name_en     text,
  grp         text NOT NULL,
  lifespan    text NOT NULL CHECK (lifespan IN ('yillik', 'cok-yillik')),
  common_rank int UNIQUE CHECK (common_rank BETWEEN 1 AND 6),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crop_pack_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_id        text NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
  version        int NOT NULL CHECK (version >= 1),
  review_status  text NOT NULL DEFAULT 'taslak-uzman-onayi-bekliyor'
                 CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli')),
  kc_ini         numeric NOT NULL CHECK (kc_ini > 0),
  kc_mid         numeric NOT NULL CHECK (kc_mid > 0),
  kc_end         numeric NOT NULL CHECK (kc_end > 0),
  kc_end_max     numeric CHECK (kc_end_max IS NULL OR kc_end_max >= kc_end),
  max_height_m   numeric,
  note           text,
  source         text NOT NULL,
  source_version text NOT NULL,
  retrieved_at   timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crop_id, version)
);

CREATE TABLE crop_stages (
  pack_id          uuid NOT NULL REFERENCES crop_pack_versions(id) ON DELETE CASCADE,
  seq              int NOT NULL,
  name_tr          text NOT NULL,
  kc               numeric CHECK (kc IS NULL OR kc > 0),
  frost_critical_c numeric,
  review_status    text NOT NULL DEFAULT 'taslak-uzman-onayi-bekliyor'
                   CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli')),
  source           text NOT NULL,
  PRIMARY KEY (pack_id, seq)
);

-- Yayımlanmış sürümün değerleri değişmez; yalnız onay durumu güncellenebilir. Değişiklik = yeni sürüm.
CREATE FUNCTION crop_pack_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'review_status') IS DISTINCT FROM (to_jsonb(OLD) - 'review_status') THEN
    RAISE EXCEPTION 'paket sürümü değiştirilemez; yeni sürüm ekleyin' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crop_pack_guard BEFORE UPDATE ON crop_pack_versions FOR EACH ROW EXECUTE FUNCTION crop_pack_guard();
CREATE TRIGGER audit_crop_pack_versions AFTER INSERT OR UPDATE OR DELETE ON crop_pack_versions
  FOR EACH ROW EXECUTE FUNCTION audit_row();

GRANT SELECT ON crops, crop_pack_versions, crop_stages TO tp_app;

-- ---------------------------------------------------------------------------
-- Yakınım yapsın: 6 haneli, 24 saat geçerli kod -> yakının önerdiği tarla -> çiftçi onayı
-- ---------------------------------------------------------------------------
CREATE TABLE nearby_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       text NOT NULL CHECK (code ~ '^[0-9]{6}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nearby_codes_code_idx ON nearby_codes(code);
CREATE INDEX nearby_codes_owner_idx ON nearby_codes(owner_id);

CREATE TABLE nearby_proposals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id    uuid NOT NULL REFERENCES nearby_codes(id) ON DELETE CASCADE,
  owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  helper_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  field_id   uuid REFERENCES fields(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX nearby_proposals_owner_idx ON nearby_proposals(owner_id, status);

-- Deneme sayacı: kod tahminini sınırlar. Uygulama rolü doğrudan erişemez.
CREATE TABLE nearby_attempts (
  id      bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at      timestamptz NOT NULL DEFAULT now(),
  ok      boolean NOT NULL
);
CREATE INDEX nearby_attempts_user_idx ON nearby_attempts(user_id, at);

CREATE TRIGGER audit_nearby_codes     AFTER INSERT OR UPDATE OR DELETE ON nearby_codes     FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_nearby_proposals AFTER INSERT OR UPDATE OR DELETE ON nearby_proposals FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE nearby_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nearby_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE nearby_attempts  ENABLE ROW LEVEL SECURITY;

CREATE POLICY nearby_codes_select ON nearby_codes FOR SELECT TO tp_app USING (owner_id = app_user_id());
CREATE POLICY nearby_proposals_select ON nearby_proposals FOR SELECT TO tp_app
  USING (owner_id = app_user_id() OR helper_id = app_user_id());
CREATE POLICY nearby_proposals_update ON nearby_proposals FOR UPDATE TO tp_app
  USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());

GRANT SELECT ON nearby_codes, nearby_proposals TO tp_app;
GRANT UPDATE (status, decided_at, field_id) ON nearby_proposals TO tp_app;

-- Çiftçi yeni kod üretir; öncekiler iptal olur. Kod, etkin kodlar arasında benzersizdir.
CREATE FUNCTION nearby_create_code() RETURNS TABLE (code text, expires_at timestamptz)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid := app_user_id();
  v_code  text;
  v_exp   timestamptz := now() + interval '24 hours';
  v_id    uuid;
  i int := 0;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'oturum yok' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(7002);
  UPDATE nearby_codes SET revoked_at = now() WHERE owner_id = v_owner AND revoked_at IS NULL;
  LOOP
    v_code := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM nearby_codes c WHERE c.code = v_code AND c.revoked_at IS NULL AND c.expires_at > now());
    i := i + 1;
    IF i > 50 THEN RAISE EXCEPTION 'kod üretilemedi'; END IF;
  END LOOP;
  INSERT INTO nearby_codes(owner_id, code, expires_at) VALUES (v_owner, v_code, v_exp) RETURNING id INTO v_id;
  PERFORM write_audit('nearby.code.create', 'nearby_codes', v_id::text, '{}');
  RETURN QUERY SELECT v_code, v_exp;
END $$;

-- Yakın kodu kullanıp tarla önerir. Geçersiz kod NULL döner (başarısızlar sayılır, saatte 10 sınırı).
-- Başarılı olursa kullanıcıya 'assistant' rolü verilir; tarla yine de çiftçi onaylayana dek oluşmaz.
CREATE FUNCTION nearby_claim(p_code text, p_payload jsonb) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := app_user_id();
  v_row  nearby_codes%ROWTYPE;
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'oturum yok' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM nearby_attempts WHERE user_id = v_user AND NOT ok AND at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'cok-deneme' USING ERRCODE = 'P0429';
  END IF;
  SELECT * INTO v_row FROM nearby_codes
    WHERE code = p_code AND revoked_at IS NULL AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND OR v_row.owner_id = v_user
     OR (SELECT count(*) FROM nearby_proposals WHERE code_id = v_row.id AND status = 'pending') >= 20 THEN
    INSERT INTO nearby_attempts(user_id, ok) VALUES (v_user, false);
    PERFORM write_audit('nearby.claim.denied', 'nearby_codes', NULL, '{}');
    RETURN NULL;
  END IF;
  INSERT INTO nearby_attempts(user_id, ok) VALUES (v_user, true);
  INSERT INTO user_roles(user_id, role, granted_by) VALUES (v_user, 'assistant', v_row.owner_id)
    ON CONFLICT DO NOTHING;
  INSERT INTO nearby_proposals(code_id, owner_id, helper_id, payload)
    VALUES (v_row.id, v_row.owner_id, v_user, p_payload) RETURNING id INTO v_id;
  PERFORM write_audit('nearby.claim', 'nearby_proposals', v_id::text, '{}');
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION nearby_create_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION nearby_claim(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nearby_create_code() TO tp_app;
GRANT EXECUTE ON FUNCTION nearby_claim(text, jsonb) TO tp_app;
