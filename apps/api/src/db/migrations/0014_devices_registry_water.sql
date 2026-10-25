-- G21: cihaz kaydı künyesi (üretici, model, kaynak, sürüm), cihaz ölçümleri, toprak türleri ve bitki su parametreleri.
-- Değişmez kural 6: her veri kaynağı için kaynak + tarih + sürüm saklanır.

ALTER TABLE devices
  ADD COLUMN manufacturer      text CHECK (manufacturer IS NULL OR length(manufacturer) <= 80),
  ADD COLUMN model             text CHECK (model IS NULL OR length(model) <= 80),
  ADD COLUMN connection_method text NOT NULL DEFAULT 'eslestirme-kodu'
             CHECK (connection_method IN ('eslestirme-kodu', 'uretici-bulutu', 'csv-elle')),
  ADD COLUMN provider_id       text CHECK (provider_id IS NULL OR length(provider_id) <= 40),
  ADD COLUMN external_id       text CHECK (external_id IS NULL OR length(external_id) <= 80),
  -- Künye: verinin kaynağı (adaptör kimliği) ve adaptör arayüzü sürümü.
  ADD COLUMN source            text NOT NULL DEFAULT 'esp32-mqtt',
  ADD COLUMN adapter_version   text NOT NULL DEFAULT '1.0.0';
ALTER TABLE devices ADD CONSTRAINT devices_kind_check
  CHECK (kind IN ('sulama', 'nem-sensoru', 'hava-istasyonu', 'drone', 'ilaclama', 'diger'));

-- Cihaz ölçümleri (sensör, CSV, üretici bulutu). Nem m³/m³, sıcaklık °C.
CREATE TABLE device_readings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  field_id    uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  at          timestamptz NOT NULL,
  metric      text NOT NULL CHECK (metric IN ('soil-moisture', 'soil-temp', 'air-temp', 'rain', 'flow-m3')),
  value       double precision NOT NULL,
  unit        text NOT NULL CHECK (unit IN ('m3/m3', 'C', 'mm', 'm3')),
  source      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, at, metric)
);
CREATE INDEX device_readings_idx ON device_readings(device_id, metric, at DESC);

ALTER TABLE device_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY readings_select ON device_readings FOR SELECT TO tp_app
  USING (can_access_field(field_id, 'read'));
-- Ölçümü yalnız tarlaya yazma yetkisi olan kullanıcı, o tarlanın kendi cihazı için ekler.
CREATE POLICY readings_insert ON device_readings FOR INSERT TO tp_app
  WITH CHECK (
    can_access_field(field_id, 'write')
    AND recorded_by = app_user_id()
    AND EXISTS (SELECT 1 FROM devices d WHERE d.id = device_id AND d.field_id = device_readings.field_id)
  );
REVOKE ALL ON device_readings FROM tp_app;
GRANT SELECT, INSERT ON device_readings TO tp_app;

-- Toprak türleri: tarla kapasitesi ve solma noktası (hacim oranı, m³/m³). Tohum TASLAKTIR; uzman onaylar.
CREATE TABLE soil_types (
  key            text PRIMARY KEY CHECK (key ~ '^[a-z0-9-]+$'),
  name_tr        text NOT NULL,
  theta_fc       numeric NOT NULL CHECK (theta_fc > 0 AND theta_fc < 1),
  theta_wp       numeric NOT NULL CHECK (theta_wp > 0 AND theta_wp < theta_fc),
  review_status  text NOT NULL DEFAULT 'taslak-uzman-onayi-bekliyor'
                 CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli')),
  source         text NOT NULL CHECK (length(source) >= 1),
  source_version text NOT NULL,
  source_date    date NOT NULL,
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO soil_types(key, name_tr, theta_fc, theta_wp, source, source_version, source_date) VALUES
  ('kumlu', 'Kumlu toprak', 0.12, 0.045, 'FAO-56 Tablo 19 (aralık orta değeri)', 'taslak-2026-10-19', '2026-10-19'),
  ('tinli', 'Tınlı toprak', 0.25, 0.11, 'FAO-56 Tablo 19 (aralık orta değeri)', 'taslak-2026-10-19', '2026-10-19'),
  ('killi', 'Killi toprak', 0.36, 0.22, 'FAO-56 Tablo 19 (aralık orta değeri)', 'taslak-2026-10-19', '2026-10-19');
CREATE TRIGGER audit_soil_types AFTER INSERT OR UPDATE OR DELETE ON soil_types
  FOR EACH ROW EXECUTE FUNCTION audit_row();
GRANT SELECT ON soil_types TO tp_app;

-- Bitki su parametreleri: kök derinliği Zr (m) ve tablo tükenme oranı p (FAO-56 Tablo 22). Tohum YOK:
-- değerler uzman/kurum tarafından kaynakla girilir ve onaylanır; onaysızken sulama önerisi/rapor üretilmez.
CREATE TABLE crop_water_params (
  crop_id        text PRIMARY KEY REFERENCES crops(id) ON DELETE CASCADE,
  root_depth_m   numeric NOT NULL CHECK (root_depth_m > 0 AND root_depth_m <= 5),
  p_table        numeric NOT NULL CHECK (p_table > 0 AND p_table < 1),
  review_status  text NOT NULL DEFAULT 'taslak-uzman-onayi-bekliyor'
                 CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli')),
  source         text NOT NULL CHECK (length(source) >= 1),
  source_version text NOT NULL,
  source_date    date NOT NULL,
  reviewed_by    uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE TRIGGER audit_crop_water_params AFTER INSERT OR UPDATE OR DELETE ON crop_water_params
  FOR EACH ROW EXECUTE FUNCTION audit_row();
GRANT SELECT ON crop_water_params TO tp_app;

-- Satır güvenliği: okuma her giriş yapmış kullanıcıya; onay yalnız uzman/yönetici; su parametresi yalnız uzman/yönetici ekler.
ALTER TABLE soil_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_water_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY soil_select ON soil_types FOR SELECT TO tp_app USING (app_user_id() IS NOT NULL);
CREATE POLICY cwp_select ON crop_water_params FOR SELECT TO tp_app USING (app_user_id() IS NOT NULL);
CREATE POLICY soil_review ON soil_types FOR UPDATE TO tp_app
  USING (app_has_role('expert') OR app_has_role('admin'))
  WITH CHECK (reviewed_by = app_user_id());
CREATE POLICY cwp_review ON crop_water_params FOR UPDATE TO tp_app
  USING (app_has_role('expert') OR app_has_role('admin'))
  WITH CHECK (reviewed_by = app_user_id());
CREATE POLICY cwp_insert ON crop_water_params FOR INSERT TO tp_app
  WITH CHECK (app_has_role('expert') OR app_has_role('admin'));
GRANT UPDATE (review_status, reviewed_by) ON soil_types, crop_water_params TO tp_app;
CREATE POLICY cwp_delete ON crop_water_params FOR DELETE TO tp_app
  USING (app_has_role('expert') OR app_has_role('admin'));
GRANT INSERT, DELETE ON crop_water_params TO tp_app;
