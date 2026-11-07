-- Resmi kurum sitelerini günde birkaç kez tarayıp yeni haber/duyuruyu çiftçiye getirme (G30).
-- Kaynak listesi veridir (kod değil): yönetici ekler/kapatır. Her kaynak için robots.txt sonucu ve son durum saklanır.
CREATE TABLE official_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  kind            text NOT NULL CHECK (kind IN ('bakanlik', 'il_mudurlugu', 'ilce_mudurlugu', 'universite', 'diger')),
  province        text,
  district        text,
  url             text NOT NULL CHECK (url ~ '^https://[^\s]+$'),
  active          boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_status     text,
  last_new_count  int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (url)
);
ALTER TABLE official_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY official_sources_read ON official_sources FOR SELECT TO tp_app USING (app_user_id() IS NOT NULL);
CREATE POLICY official_sources_admin ON official_sources FOR ALL TO tp_app
  USING (app_has_role('admin')) WITH CHECK (app_has_role('admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON official_sources TO tp_app;

-- Görülen bağlantılar: aynı haber ikinci kez eklenmez.
CREATE TABLE scan_seen (
  source_id  uuid NOT NULL REFERENCES official_sources(id) ON DELETE CASCADE,
  url        text NOT NULL,
  seen_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, url)
);
ALTER TABLE scan_seen ENABLE ROW LEVEL SECURITY;
CREATE POLICY scan_seen_admin ON scan_seen FOR SELECT TO tp_app USING (app_has_role('admin'));
GRANT SELECT ON scan_seen TO tp_app;

-- Otomatik alınan duyuru: panel girişi değildir, uzman onayı yoktur; özgün bağlantı ve kaynak sitesi saklanır.
ALTER TABLE announcements
  ADD COLUMN auto boolean NOT NULL DEFAULT false,
  ADD COLUMN source_site_id uuid REFERENCES official_sources(id) ON DELETE SET NULL,
  ADD COLUMN image_url text CHECK (image_url IS NULL OR (length(image_url) <= 1000 AND image_url ~ '^https://[^[:space:]]+$'));
CREATE UNIQUE INDEX announcements_source_url_idx ON announcements(source_url) WHERE auto;
