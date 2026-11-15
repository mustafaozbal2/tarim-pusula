-- "Ne Eksem?": ekim niyeti beyanı. Çiftçi, tarlası için bir ürüne kaç dekar ayırmayı düşündüğünü
-- beyan eder; bölge toplamı (kişisiz, yalnız dekar toplamı ve beyan sayısı) azalan kota için kullanılır.
-- Kural 6: kaynak = çiftçi beyanı. KVKK: dışa aktarıma dahil (wallet.ts), hesap silmede CASCADE.

CREATE TABLE ekim_niyetleri (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id    uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop_id     text NOT NULL REFERENCES crops(id),
  dekar       double precision NOT NULL CHECK (dekar > 0 AND dekar <= 100000),
  season      text NOT NULL CHECK (season ~ '^[0-9]{4}$'),
  province    text,
  district    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_id, crop_id, season)
);
CREATE INDEX ekim_niyetleri_bolge_idx ON ekim_niyetleri(season, province, crop_id);

ALTER TABLE ekim_niyetleri ENABLE ROW LEVEL SECURITY;
CREATE POLICY ekim_niyetleri_select ON ekim_niyetleri FOR SELECT TO tp_app
  USING (can_access_field(field_id, 'read'));
CREATE POLICY ekim_niyetleri_insert ON ekim_niyetleri FOR INSERT TO tp_app
  WITH CHECK (can_access_field(field_id, 'write') AND user_id = app_user_id());
CREATE POLICY ekim_niyetleri_update ON ekim_niyetleri FOR UPDATE TO tp_app
  USING (can_access_field(field_id, 'write'));
CREATE POLICY ekim_niyetleri_delete ON ekim_niyetleri FOR DELETE TO tp_app
  USING (can_access_field(field_id, 'write'));
REVOKE ALL ON ekim_niyetleri FROM tp_app;
GRANT SELECT, INSERT, UPDATE (dekar), DELETE ON ekim_niyetleri TO tp_app;
