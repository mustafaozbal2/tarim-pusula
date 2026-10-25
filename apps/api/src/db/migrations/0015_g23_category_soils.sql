-- G23: duyuru kategorisi (ana sayfa slaytı: Güncel Haberler, Bilgilendirmeler, Yönlendirmeler, Önlemler,
-- Tarımda Yeni Teknolojiler) ve toprak türlerinin FAO-56 Tablo 19'daki 9 doku sınıfına tamamlanması.
ALTER TABLE announcements ADD COLUMN category text
  CHECK (category IS NULL OR category IN ('guncel', 'bilgilendirme', 'yonlendirme', 'onlem', 'teknoloji'));

-- Çiftçi dilinde kısa tarif (elle tutunca nasıl). Hesapta kullanılmaz; yalnız ekranda yardımcıdır.
ALTER TABLE soil_types ADD COLUMN hint_tr text;

-- FAO-56 Tablo 19: tarla kapasitesi ve solma noktası aralıklarının orta değeri (m3/m3). Mevcut 3 kayıt
-- (kumlu, tınlı, killi) aynen kalır; taslak durumundadır, uzman onayı gerekir.
INSERT INTO soil_types(key, name_tr, theta_fc, theta_wp, source, source_version, source_date) VALUES
  ('tinli-kum', 'Tınlı kum', 0.15, 0.065, 'FAO-56 Tablo 19 (aralık orta değeri)', 'taslak-2026-10-25', '2026-10-25'),
  ('kumlu-tin', 'Kumlu tın', 0.23, 0.11, 'FAO-56 Tablo 19 (aralık orta değeri)', 'taslak-2026-10-25', '2026-10-25'),
  ('siltli-tin', 'Siltli tın', 0.29, 0.15, 'FAO-56 Tablo 19 (aralık orta değeri)', 'taslak-2026-10-25', '2026-10-25'),
  ('silt', 'Siltli toprak (milli)', 0.32, 0.17, 'FAO-56 Tablo 19 (aralık orta değeri)', 'taslak-2026-10-25', '2026-10-25'),
  ('siltli-killi-tin', 'Siltli killi tın', 0.335, 0.205, 'FAO-56 Tablo 19 (aralık orta değeri)', 'taslak-2026-10-25', '2026-10-25'),
  ('siltli-kil', 'Siltli kil', 0.36, 0.23, 'FAO-56 Tablo 19 (aralık orta değeri)', 'taslak-2026-10-25', '2026-10-25')
ON CONFLICT (key) DO NOTHING;

UPDATE soil_types SET hint_tr = CASE key
  WHEN 'kumlu' THEN 'Elinde sıkınca dağılır, top olmaz. Su çabuk süzülür; sık ve az sulanır.'
  WHEN 'tinli-kum' THEN 'Sıkınca zor top olur, hemen dağılır. Suyu az tutar.'
  WHEN 'kumlu-tin' THEN 'Sıkınca top olur ama dokununca dağılır. Suyu orta tutar.'
  WHEN 'tinli' THEN 'Yumuşak, ufalanır, sıkınca top olur. Tarım için en dengeli topraktır.'
  WHEN 'siltli-tin' THEN 'Kuruyken un gibi, ıslakken kaygan. Suyu iyi tutar.'
  WHEN 'silt' THEN 'Pudra gibi ince; ıslakken sabun gibi kayar. Kaymak bağlayabilir.'
  WHEN 'siltli-killi-tin' THEN 'Sıkınca sert top olur, parmakta iz bırakır. Suyu çok tutar.'
  WHEN 'siltli-kil' THEN 'Islakken yapışkan, kuruyunca çatlar. Suyu çok tutar, yavaş verir.'
  WHEN 'killi' THEN 'Islakken hamur gibi yapışır, kuruyunca taş gibi sertleşir. Su yavaş süzülür.'
  ELSE hint_tr END;
