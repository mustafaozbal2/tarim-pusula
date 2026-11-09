-- Tarama kaydı: değerlendirilen her haberin sonucu ve nedeni (neden haber olmadı?).
CREATE TABLE scan_log (
  id         bigserial PRIMARY KEY,
  source_id  uuid REFERENCES official_sources(id) ON DELETE CASCADE,
  url        text NOT NULL,
  title      text,
  outcome    text NOT NULL CHECK (outcome IN ('eklendi', 'ilgisiz', 'eski', 'suresi-gecmis', 'metin-yok', 'hata', 'robots')),
  reason     text,
  analyzer   text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scan_log_at_idx ON scan_log(at DESC);
ALTER TABLE scan_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY scan_log_admin ON scan_log FOR SELECT TO tp_app USING (app_has_role('admin'));
GRANT SELECT ON scan_log TO tp_app;
