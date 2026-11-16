-- G36: yapay zekâ cevabını bildirme (Google Play "yapay zekâ ile üretilen içerik" politikası: kullanıcı,
-- sakıncalı ya da yanlış bulduğu yapay zekâ cevabını uygulamadan çıkmadan bildirebilmelidir).
-- KVKK: hesap silinince CASCADE ile gider; yalnız yönetici okur.
CREATE TABLE yz_bildirimleri (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  reason     text NOT NULL CHECK (reason IN ('yanlis', 'sakincali', 'zararli', 'diger')),
  note       text CHECK (note IS NULL OR length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX yz_bildirimleri_at_idx ON yz_bildirimleri(created_at DESC);
ALTER TABLE yz_bildirimleri ENABLE ROW LEVEL SECURITY;
CREATE POLICY yz_bildirimleri_insert ON yz_bildirimleri FOR INSERT TO tp_app
  WITH CHECK (user_id = app_user_id());
CREATE POLICY yz_bildirimleri_select ON yz_bildirimleri FOR SELECT TO tp_app
  USING (user_id = app_user_id() OR app_has_role('admin'));
GRANT SELECT, INSERT ON yz_bildirimleri TO tp_app;
