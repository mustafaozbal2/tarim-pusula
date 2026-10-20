-- G4: takvim şablonları ve kurum duyuruları.
-- Hedefleme (il/ilçe/köy/daire/ürün) `targeting` jsonb içinde tutulur; eşleştirme @tarim/agro-core
-- `targeting.ts` ile yapılır (birim testli). Başka ilin duyurusu API'de çiftçiye hiç dönmez.

CREATE TABLE announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_org    text NOT NULL CHECK (length(source_org) BETWEEN 1 AND 120),
  title         text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  body          text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  source_url    text CHECK (source_url IS NULL OR length(source_url) <= 500),
  published_at  timestamptz NOT NULL,
  expires_at    timestamptz,
  targeting     jsonb NOT NULL DEFAULT '{"places":[],"circle":null,"cropIds":[]}'::jsonb,
  version       int NOT NULL DEFAULT 1,
  review_status text NOT NULL DEFAULT 'taslak-uzman-onayi-bekliyor'
                CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli')),
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > published_at)
);
CREATE INDEX announcements_published_idx ON announcements(published_at DESC);

CREATE TRIGGER audit_announcements AFTER INSERT OR UPDATE OR DELETE ON announcements
  FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
-- Duyurular kamusal içeriktir; okuma için giriş yeterli. Hangi çiftçiye gösterileceği API'de hedeflemeyle süzülür.
CREATE POLICY ann_select ON announcements FOR SELECT TO tp_app USING (app_user_id() IS NOT NULL);
-- Kurum yöneticisi, uzman ve yönetici duyuru ekler; her zaman taslak başlar, kendi adına.
CREATE POLICY ann_insert ON announcements FOR INSERT TO tp_app
  WITH CHECK (
    (app_has_role('institution_admin') OR app_has_role('expert') OR app_has_role('admin'))
    AND created_by = app_user_id()
    AND review_status = 'taslak-uzman-onayi-bekliyor'
  );
-- Onay yalnız uzman ya da yönetici tarafından; içerik sütunları güncellenemez (sütun yetkisi).
CREATE POLICY ann_review ON announcements FOR UPDATE TO tp_app
  USING (app_has_role('expert') OR app_has_role('admin'))
  WITH CHECK (reviewed_by = app_user_id());
GRANT SELECT, INSERT ON announcements TO tp_app;
GRANT UPDATE (review_status, reviewed_by) ON announcements TO tp_app;

CREATE TABLE calendar_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_id        text NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
  title          text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  detail         text NOT NULL CHECK (length(detail) BETWEEN 1 AND 1000),
  stage          text,
  start_month    int NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  start_day      int NOT NULL CHECK (start_day BETWEEN 1 AND 31),
  end_month      int NOT NULL CHECK (end_month BETWEEN 1 AND 12),
  end_day        int NOT NULL CHECK (end_day BETWEEN 1 AND 31),
  targeting      jsonb NOT NULL DEFAULT '{"places":[],"circle":null,"cropIds":[]}'::jsonb,
  review_status  text NOT NULL DEFAULT 'taslak-uzman-onayi-bekliyor'
                 CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli')),
  -- Kural 6: kaynak + sürüm + tarih zorunlu (atıfsız şablon girilemez).
  source         text NOT NULL CHECK (length(source) BETWEEN 1 AND 300),
  source_version text NOT NULL CHECK (length(source_version) >= 1),
  source_date    date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX calendar_templates_key_idx
  ON calendar_templates(crop_id, title, start_month, start_day);

CREATE TRIGGER audit_calendar_templates AFTER INSERT OR UPDATE OR DELETE ON calendar_templates
  FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE calendar_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY cal_select ON calendar_templates FOR SELECT TO tp_app USING (app_user_id() IS NOT NULL);
-- Şablonlar yalnız içe aktarma (sistem bağlamı) ile yazılır; uygulama rolü yazamaz. Onay iş akışı G5'te.
GRANT SELECT ON calendar_templates TO tp_app;
