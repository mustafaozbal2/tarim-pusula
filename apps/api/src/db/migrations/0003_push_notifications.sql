-- G3: push bildirimi cihaz kayıtları ve gönderim kaydı (mükerrer bildirimi önler).

CREATE TABLE push_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE CHECK (length(token) BETWEEN 10 AND 200),
  platform     text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON push_tokens(user_id);

CREATE TRIGGER audit_push_tokens AFTER INSERT OR UPDATE OR DELETE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_tokens_select ON push_tokens FOR SELECT TO tp_app USING (user_id = app_user_id());
CREATE POLICY push_tokens_delete ON push_tokens FOR DELETE TO tp_app USING (user_id = app_user_id());
GRANT SELECT, DELETE ON push_tokens TO tp_app;

-- Aynı telefon başka hesaba geçince belirteç yeni kullanıcıya taşınır; bunu RLS altındaki
-- tablo yazamaz, bu yüzden tek yol bu işlev (yalnız çağıranın kendi kimliğiyle).
CREATE FUNCTION push_register(p_token text, p_platform text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := app_user_id();
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'oturum yok' USING ERRCODE = '42501'; END IF;
  INSERT INTO push_tokens(user_id, token, platform) VALUES (v_user, p_token, p_platform)
    ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
      last_seen_at = now()
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION push_register(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_register(text, text) TO tp_app;

-- Gönderim kaydı: (olay, kullanıcı) başına bir kez. Yalnız sunucu (sistem) bağlamı yazar; uygulama rolü erişemez.
CREATE TABLE notification_log (
  dedupe_key text NOT NULL,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('frost', 'irrigation', 'info')),
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dedupe_key, user_id)
);
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
