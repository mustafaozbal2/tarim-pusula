-- G8: sulama komutları, cihaz sırları ve cihaz durumu.
-- Vana komutu yalnız tarlaya YAZMA yetkisi olan kullanıcıdan (sahip ya da 'write' izni) kabul edilir;
-- yetki kararı RLS'tedir, uygulama kodundaki bir hata başkasının vanasını açtıramaz.

-- Cihaz sırrı: MQTT parolası ve komut imza anahtarı bundan türetilir. Uygulama rolüne HİÇBİR yetki yok;
-- yalnız sunucu içi kod (sistem bağlamı) okur. (Rest şifrelemesi sertleştirme görevinde.)
CREATE TABLE device_secrets (
  device_id  uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  secret     text NOT NULL CHECK (length(secret) >= 32),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cihazın son bildirdiği durum (cihaz saatinden değil, sunucu alım saatinden `last_seen_at`).
CREATE TABLE device_state (
  device_id    uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  valve_open   boolean NOT NULL DEFAULT false,
  closes_at    timestamptz,
  last_seen_at timestamptz NOT NULL,
  last_reason  text NOT NULL
);

CREATE TABLE irrigation_commands (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  field_id        uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action          text NOT NULL CHECK (action IN ('open', 'close')),
  -- Sunucu da sınırlar; cihaz yine kendi başına 30 dakikaya kırpar (iki ayrı sınır).
  minutes         int CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 30),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 80),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'acked', 'rejected', 'expired', 'failed')),
  reason          text,
  created_at      timestamptz NOT NULL,
  expires_at      timestamptz NOT NULL,
  sent_at         timestamptz,
  acked_at        timestamptz,
  -- Sunucu saatiyle: komut oluşturulduktan cihaz onayı gelene kadar geçen süre.
  latency_ms      int CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CHECK (action = 'close' OR minutes IS NOT NULL),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX irrigation_commands_device_idx ON irrigation_commands(device_id, created_at DESC);

CREATE TRIGGER audit_irrigation_commands AFTER INSERT OR UPDATE OR DELETE ON irrigation_commands
  FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE device_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE irrigation_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_state_select ON device_state FOR SELECT TO tp_app
  USING (EXISTS (SELECT 1 FROM devices d WHERE d.id = device_id AND can_access_field(d.field_id, 'read')));

CREATE POLICY irr_select ON irrigation_commands FOR SELECT TO tp_app
  USING (can_access_field(field_id, 'read'));
-- Komut yalnız kendi adına, cihazın gerçek tarlası için ve yazma yetkisiyle eklenir; durumu 'pending' başlar.
CREATE POLICY irr_insert ON irrigation_commands FOR INSERT TO tp_app
  WITH CHECK (
    user_id = app_user_id()
    AND status = 'pending'
    AND can_access_field(field_id, 'write')
    AND EXISTS (SELECT 1 FROM devices d WHERE d.id = device_id AND d.field_id = irrigation_commands.field_id)
  );

REVOKE ALL ON device_secrets, device_state, irrigation_commands FROM tp_app;
GRANT SELECT ON device_state TO tp_app;
GRANT SELECT, INSERT ON irrigation_commands TO tp_app;

-- Komut satırı sonradan yeniden yazılamaz: yalnız durum ilerler (sunucu bağlamı güncelleyebilir).
CREATE FUNCTION irrigation_commands_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.device_id <> OLD.device_id OR NEW.user_id <> OLD.user_id OR NEW.action <> OLD.action
     OR NEW.minutes IS DISTINCT FROM OLD.minutes OR NEW.idempotency_key <> OLD.idempotency_key
     OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'komutun içeriği değiştirilemez' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER irrigation_commands_guard BEFORE UPDATE ON irrigation_commands
  FOR EACH ROW EXECUTE FUNCTION irrigation_commands_guard();
