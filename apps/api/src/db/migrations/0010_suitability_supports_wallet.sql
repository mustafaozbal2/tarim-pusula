-- G11: ürün uygunluk faktörleri, devlet destekleri, Veri Cüzdanı paylaşım izinleri.
-- Faktör aralığı ve destek kayıtları kamusal içeriktir (giriş yeterli okumak için); yazma sistem bağlamından,
-- onay yalnız uzman/yönetici tarafından ve yalnız onay sütunlarına. Kaynaksız kayıt tutulamaz (kural 6).

CREATE TABLE suitability_factors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_id        text NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
  factor_key     text NOT NULL CHECK (factor_key ~ '^[a-z0-9-]+$'),
  label          text NOT NULL CHECK (length(btrim(label)) > 0),
  unit           text NOT NULL,
  -- Yamuk köşeleri a <= b <= c <= d; [b, c] ideal aralık.
  a              double precision NOT NULL,
  b              double precision NOT NULL,
  c              double precision NOT NULL,
  d              double precision NOT NULL,
  weight         double precision NOT NULL CHECK (weight > 0),
  review_status  text NOT NULL DEFAULT 'taslak-uzman-onayi-bekliyor'
                 CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli')),
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  source         text NOT NULL CHECK (length(btrim(source)) > 0),
  source_version text NOT NULL CHECK (length(btrim(source_version)) > 0),
  source_date    date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (a <= b AND b <= c AND c <= d),
  UNIQUE (crop_id, factor_key)
);

CREATE TABLE supports (
  id             text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  title          text NOT NULL CHECK (length(btrim(title)) > 0),
  summary        text NOT NULL CHECK (length(btrim(summary)) > 0),
  crop_ids       text[] NOT NULL DEFAULT '{}',
  provinces      text[] NOT NULL DEFAULT '{}',
  min_area       double precision CHECK (min_area IS NULL OR min_area >= 0),
  max_area       double precision CHECK (max_area IS NULL OR max_area > 0),
  apply_from     date,
  apply_to       date,
  review_status  text NOT NULL DEFAULT 'taslak-uzman-onayi-bekliyor'
                 CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli')),
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  source         text NOT NULL CHECK (length(btrim(source)) > 0),
  source_url     text,
  source_version text NOT NULL CHECK (length(btrim(source_version)) > 0),
  source_date    date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (apply_from IS NULL OR apply_to IS NULL OR apply_to >= apply_from)
);

CREATE TRIGGER audit_suitability_factors AFTER INSERT OR UPDATE OR DELETE ON suitability_factors
  FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_supports AFTER INSERT OR UPDATE OR DELETE ON supports
  FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE suitability_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE supports ENABLE ROW LEVEL SECURITY;
CREATE POLICY sf_select ON suitability_factors FOR SELECT TO tp_app USING (app_user_id() IS NOT NULL);
CREATE POLICY sup_select ON supports FOR SELECT TO tp_app USING (app_user_id() IS NOT NULL);
CREATE POLICY sf_review ON suitability_factors FOR UPDATE TO tp_app
  USING (app_has_role('expert') OR app_has_role('admin'))
  WITH CHECK (reviewed_by = app_user_id());
CREATE POLICY sup_review ON supports FOR UPDATE TO tp_app
  USING (app_has_role('expert') OR app_has_role('admin'))
  WITH CHECK (reviewed_by = app_user_id());
GRANT SELECT ON suitability_factors, supports TO tp_app;
GRANT UPDATE (review_status, reviewed_by) ON suitability_factors, supports TO tp_app;

-- ---------------------------------------------------------------------------
-- Veri Cüzdanı: çiftçi, verisinin hangi kısmını kime, ne amaçla, ne zamana kadar paylaştığını yönetir.
-- Paylaşım kapsamı sabit kategorilerdir; alıcı yalnız o kategorinin özetini görür (shared_fields işlevi).
-- ---------------------------------------------------------------------------
CREATE TABLE data_shares (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  categories   text[] NOT NULL CHECK (
    cardinality(categories) BETWEEN 1 AND 6
    AND categories <@ ARRAY['fields', 'irrigation', 'questions', 'devices', 'consents', 'profile']::text[]
  ),
  purpose      text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 3 AND 200),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  CHECK (owner_id <> recipient_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '366 days')
);
CREATE INDEX data_shares_owner_idx ON data_shares(owner_id, created_at DESC);
CREATE INDEX data_shares_recipient_idx ON data_shares(recipient_id) WHERE revoked_at IS NULL;

CREATE TRIGGER audit_data_shares AFTER INSERT OR UPDATE OR DELETE ON data_shares
  FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE data_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY ds_select ON data_shares FOR SELECT TO tp_app
  USING (owner_id = app_user_id() OR recipient_id = app_user_id());
CREATE POLICY ds_insert ON data_shares FOR INSERT TO tp_app
  WITH CHECK (owner_id = app_user_id() AND revoked_at IS NULL);
-- Yalnız sahip, yalnız geri alma sütununa dokunabilir.
CREATE POLICY ds_revoke ON data_shares FOR UPDATE TO tp_app
  USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());
GRANT SELECT, INSERT ON data_shares TO tp_app;
GRANT UPDATE (revoked_at) ON data_shares TO tp_app;

-- Alıcının görebildiği tarla özeti: yalnız süresi geçmemiş, geri alınmamış ve 'fields' kapsamlı paylaşım.
-- Veri minimizasyonu: tam koordinat ve sınır YOK; ilçe düzeyi konum.
CREATE FUNCTION shared_fields() RETURNS TABLE (
  "ownerId" uuid, "fieldId" uuid, name text, province text, district text,
  "cropId" text, "areaDecare" double precision, "shareId" uuid, "expiresAt" timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.owner_id, f.id, f.name, f.province, f.district, f.crop_id, f.area_decare, s.id, s.expires_at
  FROM data_shares s JOIN fields f ON f.owner_id = s.owner_id
  WHERE s.recipient_id = app_user_id()
    AND s.revoked_at IS NULL AND s.expires_at > now()
    AND 'fields' = ANY (s.categories)
  ORDER BY f.created_at, f.id
$$;
REVOKE ALL ON FUNCTION shared_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shared_fields() TO tp_app;
