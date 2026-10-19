-- G1: kullanıcı, rol, tarla, cihaz, rıza, denetim kaydı. Her tablo satır düzeyi güvenlik (RLS) altındadır.
-- Uygulama sorguları `SET LOCAL ROLE tp_app` ile çalışır; bu rol RLS'yi atlayamaz.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tp_app') THEN
    CREATE ROLE tp_app NOLOGIN;
  END IF;
END $$;

CREATE TYPE app_role AS ENUM
  ('farmer', 'assistant', 'cooperative', 'advisor', 'institution_admin', 'expert', 'admin');

-- Kimlik: yalnız telefon. TC kimlik no hiçbir yerde yok (KVKK veri minimizasyonu).
CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL UNIQUE CHECK (phone ~ '^\+905\d{9}$'),
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       app_role NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE fields (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  province     text,
  district     text,
  village      text,
  lat          double precision CHECK (lat BETWEEN -90 AND 90),
  lon          double precision CHECK (lon BETWEEN -180 AND 180),
  area_decare  double precision CHECK (area_decare > 0),
  crop_id      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fields_owner_idx ON fields(owner_id);

-- Yakın / danışman / kooperatif erişimi: sahibi verir, "read" veya "write".
CREATE TABLE field_access (
  field_id   uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level      text NOT NULL CHECK (level IN ('read', 'write')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (field_id, user_id)
);

CREATE TABLE devices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id   uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  kind       text NOT NULL DEFAULT 'sulama',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Rıza kayıtları yalnız eklenir; geri çekme yeni bir satırdır (granted = false).
CREATE TABLE consents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose        text NOT NULL,
  granted        boolean NOT NULL,
  policy_version text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Giriş altyapısı: uygulama rolü bu tablolara hiç erişemez.
CREATE TABLE otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL
);
CREATE INDEX otp_codes_phone_idx ON otp_codes(phone, created_at);

CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL
);

-- Değiştirilemez, zincirli denetim kaydı.
CREATE TABLE audit_log (
  seq         bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id    uuid,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   text NOT NULL,
  hash        text NOT NULL
);

-- ---------------------------------------------------------------------------
-- Yardımcı işlevler (SECURITY DEFINER: RLS özyinelemesini önler)
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app_has_role(r app_role) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = app_user_id() AND role = r) $$;

CREATE FUNCTION is_field_owner(fid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM fields WHERE id = fid AND owner_id = app_user_id()) $$;

CREATE FUNCTION has_field_grant(fid uuid, need text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (
       SELECT 1 FROM field_access fa
       WHERE fa.field_id = fid AND fa.user_id = app_user_id()
         AND (need = 'read' OR fa.level = 'write')) $$;

CREATE FUNCTION can_access_field(fid uuid, need text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT is_field_owner(fid) OR has_field_grant(fid, need) $$;

-- Denetim kaydı yazıcısı: tek yazma yolu. Zinciri kilitle, önceki özeti bağla.
CREATE FUNCTION write_audit(p_action text, p_entity text, p_entity_id text, p_detail jsonb)
  RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev text;
  v_at   timestamptz := clock_timestamp();
  v_actor uuid := app_user_id();
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
  v_hash text;
  v_seq  bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(7001);
  SELECT hash INTO v_prev FROM audit_log ORDER BY seq DESC LIMIT 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  v_hash := encode(sha256(convert_to(
    v_prev || '|' || v_at::text || '|' || coalesce(v_actor::text, '') || '|' || p_action || '|' ||
    p_entity || '|' || coalesce(p_entity_id, '') || '|' || v_detail::text, 'UTF8')), 'hex');
  INSERT INTO audit_log(at, actor_id, action, entity, entity_id, detail, prev_hash, hash)
    VALUES (v_at, v_actor, p_action, p_entity, p_entity_id, v_detail, v_prev, v_hash)
    RETURNING seq INTO v_seq;
  RETURN v_seq;
END $$;

-- Zinciri baştan doğrular; bozulma varsa ilk bozuk satırın seq değerini döndürür, yoksa NULL.
CREATE FUNCTION verify_audit_chain() RETURNS bigint
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_prev text := repeat('0', 64);
BEGIN
  FOR r IN SELECT * FROM audit_log ORDER BY seq LOOP
    IF r.prev_hash <> v_prev OR r.hash <> encode(sha256(convert_to(
         r.prev_hash || '|' || r.at::text || '|' || coalesce(r.actor_id::text, '') || '|' || r.action ||
         '|' || r.entity || '|' || coalesce(r.entity_id, '') || '|' || r.detail::text, 'UTF8')), 'hex')
    THEN RETURN r.seq; END IF;
    v_prev := r.hash;
  END LOOP;
  RETURN NULL;
END $$;

-- Değiştirme / silme / boşaltma engeli (tablo sahibi dahil).
CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log değiştirilemez' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- Her yazma (ekle / güncelle / sil) denetim satırı üretir. Kişisel veri kopyalanmaz: yalnız anahtarlar.
CREATE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
BEGIN
  PERFORM write_audit(
    lower(TG_OP) || '.' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    coalesce(j->>'id', (j->>'field_id') || ':' || (j->>'user_id'), (j->>'user_id') || ':' || (j->>'role')),
    jsonb_build_object('op', TG_OP));
  RETURN NULL;
END $$;

CREATE TRIGGER audit_users        AFTER INSERT OR UPDATE OR DELETE ON users        FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_user_roles   AFTER INSERT OR UPDATE OR DELETE ON user_roles   FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_fields       AFTER INSERT OR UPDATE OR DELETE ON fields       FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_field_access AFTER INSERT OR UPDATE OR DELETE ON field_access FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_devices      AFTER INSERT OR UPDATE OR DELETE ON devices      FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_consents     AFTER INSERT OR UPDATE OR DELETE ON consents     FOR EACH ROW EXECUTE FUNCTION audit_row();

-- Tarlanın sahibi sonradan değiştirilemez; updated_at otomatik.
CREATE FUNCTION fields_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_id <> OLD.owner_id THEN
    RAISE EXCEPTION 'tarla sahibi değiştirilemez' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER fields_guard BEFORE UPDATE ON fields FOR EACH ROW EXECUTE FUNCTION fields_guard();

-- Rıza kayıtları güncellenemez (hesap silme CASCADE ile silmeye izin verir).
CREATE FUNCTION consents_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rıza kaydı değiştirilemez' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER consents_no_update BEFORE UPDATE ON consents FOR EACH ROW EXECUTE FUNCTION consents_no_update();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fields       ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions     ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select ON users FOR SELECT TO tp_app USING (id = app_user_id() OR app_has_role('admin'));
CREATE POLICY users_update ON users FOR UPDATE TO tp_app USING (id = app_user_id()) WITH CHECK (id = app_user_id());
CREATE POLICY users_delete ON users FOR DELETE TO tp_app USING (id = app_user_id());

CREATE POLICY roles_select ON user_roles FOR SELECT TO tp_app USING (user_id = app_user_id() OR app_has_role('admin'));
CREATE POLICY roles_insert ON user_roles FOR INSERT TO tp_app WITH CHECK (app_has_role('admin'));
CREATE POLICY roles_delete ON user_roles FOR DELETE TO tp_app USING (app_has_role('admin'));

CREATE POLICY fields_select ON fields FOR SELECT TO tp_app USING (owner_id = app_user_id() OR has_field_grant(id, 'read'));
CREATE POLICY fields_insert ON fields FOR INSERT TO tp_app WITH CHECK (owner_id = app_user_id());
CREATE POLICY fields_update ON fields FOR UPDATE TO tp_app USING (owner_id = app_user_id() OR has_field_grant(id, 'write')) WITH CHECK (owner_id = app_user_id() OR has_field_grant(id, 'write'));
CREATE POLICY fields_delete ON fields FOR DELETE TO tp_app USING (owner_id = app_user_id());

CREATE POLICY access_select ON field_access FOR SELECT TO tp_app USING (user_id = app_user_id() OR is_field_owner(field_id));
CREATE POLICY access_insert ON field_access FOR INSERT TO tp_app WITH CHECK (is_field_owner(field_id) AND user_id <> app_user_id());
CREATE POLICY access_update ON field_access FOR UPDATE TO tp_app USING (is_field_owner(field_id)) WITH CHECK (is_field_owner(field_id));
CREATE POLICY access_delete ON field_access FOR DELETE TO tp_app USING (is_field_owner(field_id) OR user_id = app_user_id());

CREATE POLICY devices_select ON devices FOR SELECT TO tp_app USING (can_access_field(field_id, 'read'));
CREATE POLICY devices_insert ON devices FOR INSERT TO tp_app WITH CHECK (can_access_field(field_id, 'write'));
CREATE POLICY devices_update ON devices FOR UPDATE TO tp_app USING (can_access_field(field_id, 'write')) WITH CHECK (can_access_field(field_id, 'write'));
CREATE POLICY devices_delete ON devices FOR DELETE TO tp_app USING (can_access_field(field_id, 'write'));

CREATE POLICY consents_select ON consents FOR SELECT TO tp_app USING (user_id = app_user_id());
CREATE POLICY consents_insert ON consents FOR INSERT TO tp_app WITH CHECK (user_id = app_user_id());

CREATE POLICY audit_select ON audit_log FOR SELECT TO tp_app USING (actor_id = app_user_id() OR app_has_role('admin'));

-- ---------------------------------------------------------------------------
-- Yetkiler: en az ayrıcalık
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO tp_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM tp_app;
GRANT SELECT, UPDATE (display_name), DELETE ON users TO tp_app;
GRANT SELECT, INSERT, DELETE ON user_roles TO tp_app;
GRANT SELECT, INSERT, UPDATE (name, province, district, village, lat, lon, area_decare, crop_id), DELETE ON fields TO tp_app;
GRANT SELECT, INSERT, UPDATE (level), DELETE ON field_access TO tp_app;
GRANT SELECT, INSERT, UPDATE (name), DELETE ON devices TO tp_app;
GRANT SELECT, INSERT ON consents TO tp_app;
GRANT SELECT ON audit_log TO tp_app;
REVOKE ALL ON FUNCTION write_audit(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION write_audit(text, text, text, jsonb) TO tp_app;
GRANT EXECUTE ON FUNCTION verify_audit_chain() TO tp_app;
