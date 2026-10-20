-- G12: içerik içe aktarma hattı. Her dosya için ne olduğu (kaynak künyesi, içerik özeti, sonuç) kaydedilir.
-- Yazma yalnız sistem bağlamındaki hattan gelir; uygulama rolüne (tp_app) hiçbir yetki verilmez.

CREATE TABLE ingest_log (
  id             bigserial PRIMARY KEY,
  file_name      text NOT NULL,
  file_sha256    text NOT NULL,
  format         text CHECK (format IN ('pdf', 'docx', 'txt')),
  kind           text CHECK (kind IN ('kutuphane', 'bitki-paketi')),
  outcome        text NOT NULL CHECK (outcome IN ('yuklendi', 'ayni-icerik', 'atlandi', 'hata')),
  reason         text,
  -- Künye (kural 6): kaynak, tarih, sürüm. Atlanan dosyada bilinen kadarı yazılır.
  source_title   text,
  publisher      text,
  source_date    date,
  source_version text,
  target_id      text,
  review_status  text CHECK (review_status IS NULL OR review_status = 'taslak-uzman-onayi-bekliyor'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Yüklenen her kayıt taslak başlar ve künyesi tamdır.
  CHECK (outcome <> 'yuklendi' OR (
    review_status IS NOT NULL AND source_title IS NOT NULL AND publisher IS NOT NULL
    AND source_date IS NOT NULL AND source_version IS NOT NULL AND target_id IS NOT NULL))
);
CREATE INDEX ingest_log_sha_idx ON ingest_log(file_sha256);

CREATE TRIGGER audit_ingest_log AFTER INSERT ON ingest_log
  FOR EACH ROW EXECUTE FUNCTION audit_row();
ALTER TABLE ingest_log ENABLE ROW LEVEL SECURITY;
