-- İkiz Tarım (dijital ikiz): çiftçi kayıtları (sulama, ölçülen yağış) ve tahmin karnesi.
-- Kural 6: her kayıt kaynak taşır. Kayıtlar tarlaya yazma yetkisi olan kullanıcıya açıktır (RLS).

CREATE TABLE twin_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id    uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  on_date     date NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('sulama', 'yagis')),
  mm          double precision NOT NULL CHECK (mm >= 0 AND mm <= 500),
  note        text CHECK (note IS NULL OR length(note) <= 200),
  source      text NOT NULL DEFAULT 'ciftci' CHECK (source IN ('ciftci', 'cihaz', 'sayac')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX twin_events_field_idx ON twin_events(field_id, on_date DESC);

ALTER TABLE twin_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY twin_events_select ON twin_events FOR SELECT TO tp_app
  USING (can_access_field(field_id, 'read'));
CREATE POLICY twin_events_insert ON twin_events FOR INSERT TO tp_app
  WITH CHECK (can_access_field(field_id, 'write') AND user_id = app_user_id());
CREATE POLICY twin_events_delete ON twin_events FOR DELETE TO tp_app
  USING (can_access_field(field_id, 'write'));
REVOKE ALL ON twin_events FROM tp_app;
GRANT SELECT, INSERT, DELETE ON twin_events TO tp_app;

-- Tahmin karnesi: her çalıştırmada "sulama yapılmazsa" eksik su tahmini (p10/p50/p90) ile dönem
-- ETc ve yağış toplamı saklanır; hedef gün gelince gerçekleşen (analiz) değerle karşılaştırılır.
CREATE TABLE twin_forecasts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id      uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  issued_on     date NOT NULL,
  target_date   date NOT NULL,
  horizon_days  int NOT NULL CHECK (horizon_days BETWEEN 1 AND 16),
  dr_p10        double precision NOT NULL,
  dr_p50        double precision NOT NULL,
  dr_p90        double precision NOT NULL,
  etc_mm        double precision NOT NULL,
  rain_mm       double precision NOT NULL,
  -- Doğrulama: analiz değeri (hava gerçekleşmesiyle yeniden hesaplanan Dr ve toplamlar).
  verified_at   timestamptz,
  actual_dr     double precision,
  actual_etc_mm double precision,
  actual_rain_mm double precision,
  -- Hedefe kadar sulama kaydı varsa Dr karşılaştırması anlamsızdır; yalnız ETc/yağış puanlanır.
  irrigated     boolean,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_id, issued_on, target_date)
);
CREATE INDEX twin_forecasts_field_idx ON twin_forecasts(field_id, target_date);

ALTER TABLE twin_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY twin_forecasts_select ON twin_forecasts FOR SELECT TO tp_app
  USING (can_access_field(field_id, 'read'));
CREATE POLICY twin_forecasts_write ON twin_forecasts FOR INSERT TO tp_app
  WITH CHECK (can_access_field(field_id, 'read'));
CREATE POLICY twin_forecasts_update ON twin_forecasts FOR UPDATE TO tp_app
  USING (can_access_field(field_id, 'read'));
REVOKE ALL ON twin_forecasts FROM tp_app;
GRANT SELECT, INSERT, UPDATE ON twin_forecasts TO tp_app;
