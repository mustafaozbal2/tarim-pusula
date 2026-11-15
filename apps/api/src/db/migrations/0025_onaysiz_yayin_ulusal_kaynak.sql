-- G36 (15.11.2026): uzman onayı aşaması şimdilik kapalı; ülke geneli resmî kaynaklar; tarama turu kaydı.
-- Onay durumu sütunları ve onay işlevleri DURUR (UZMAN_ONAYI=1 ile yeniden açılır); yalnız yeni kayıtların
-- varsayılan durumu sunucu ayarından gelir (apps/api/src/onay.ts).

-- Kaynak türleri: araştırma enstitüsü, ulusal kurum (TKDK, TMO, TARSİM...), istatistik (TÜİK).
ALTER TABLE official_sources DROP CONSTRAINT official_sources_kind_check;
ALTER TABLE official_sources ADD CONSTRAINT official_sources_kind_check
  CHECK (kind IN ('bakanlik', 'il_mudurlugu', 'ilce_mudurlugu', 'universite', 'enstitu', 'kurum', 'istatistik', 'diger'));

-- Siteye özel haber bağlantısı kalıbı (düzenli ifade; boşsa /Haber/123/... ve /Duyuru/123/... kalıbı) ve liste biçimi.
ALTER TABLE official_sources
  ADD COLUMN link_pattern text CHECK (link_pattern IS NULL OR length(link_pattern) BETWEEN 3 AND 300),
  ADD COLUMN format text NOT NULL DEFAULT 'html' CHECK (format IN ('html', 'tuik'));

-- Başvuru son günü (metinden bulunduysa): ana sayfada "Faaliyet Zamanı"nda son gün satırı olur.
ALTER TABLE announcements ADD COLUMN apply_until date;

-- Tarama turu kaydı: günde kaç tur atıldı, kaç haber değerlendirildi, kaçı eklendi (panelden izlenir).
CREATE TABLE scan_runs (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sources     int NOT NULL DEFAULT 0,
  evaluated   int NOT NULL DEFAULT 0,
  new_count   int NOT NULL DEFAULT 0,
  error       text
);
CREATE INDEX scan_runs_started_idx ON scan_runs(started_at DESC);
ALTER TABLE scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY scan_runs_admin ON scan_runs FOR SELECT TO tp_app USING (app_has_role('admin'));
GRANT SELECT ON scan_runs TO tp_app;

-- Duyurular (hibe, destek, başvuru) haber gibi 45 günde eskimez. Daha önce "eski" diye geçilen ya da ilk
-- taramada değerlendirilmeden görüldü sayılan duyuru bağlantıları yeniden değerlendirilsin.
DELETE FROM scan_seen s
 WHERE s.url ~* '/duyuru'
   AND NOT EXISTS (SELECT 1 FROM announcements a WHERE a.source_url = s.url);
