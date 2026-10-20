-- G5: kurum paneli. İki adımlı giriş (TOTP), uzman onay işlevleri, evre verisi girişi.

-- Oturum, yalnız ikinci adım (TOTP) geçilince "mfa_at" alır; panel uçları bunu arar.
ALTER TABLE sessions ADD COLUMN mfa_at timestamptz;

-- TOTP sırrı yalnız sunucu (sistem bağlamı) okur; uygulama rolünün hiçbir yetkisi yok.
CREATE TABLE user_mfa (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret       text NOT NULL,
  confirmed_at timestamptz,
  last_step    bigint NOT NULL DEFAULT 0,
  failures     int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY;

-- Evreyi giren kişi, kendi girdiğini onaylayamaz (dört göz ilkesi).
ALTER TABLE crop_stages ADD COLUMN entered_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Onay durumu dışındaki sütunlar değişmez kuralı korunur (kural zaten yalnız review_status'u serbest bırakıyor).

-- Uzman/yönetici bir paketin Kc değerlerini onaylar. Kendi kullanıcı bağlamında çalışır, denetim satırı bırakır.
CREATE FUNCTION review_crop_pack(p_pack uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_user_id() IS NULL OR NOT (app_has_role('expert') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  UPDATE crop_pack_versions SET review_status = 'uzman-onayli'
    WHERE id = p_pack AND review_status = 'taslak-uzman-onayi-bekliyor';
  IF NOT FOUND THEN RAISE EXCEPTION 'paket yok ya da zaten onaylı' USING ERRCODE = 'P0002'; END IF;
  PERFORM write_audit('panel.crop_pack.approve', 'crop_pack_versions', p_pack::text, '{}');
END $$;

-- Evre (Kc / don eşiği) ekleme: kaynak (atıf) zorunlu, taslak başlar, kimin girdiği kayıtlıdır.
CREATE FUNCTION add_crop_stage(p_pack uuid, p_name text, p_kc numeric, p_frost numeric, p_source text)
  RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seq int;
BEGIN
  IF app_user_id() IS NULL OR NOT (app_has_role('expert') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  IF p_source IS NULL OR length(btrim(p_source)) < 3 THEN
    RAISE EXCEPTION 'kaynak (atıf) zorunlu' USING ERRCODE = '23514';
  END IF;
  IF p_kc IS NULL AND p_frost IS NULL THEN
    RAISE EXCEPTION 'Kc ya da don eşiği gerekli' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crop_pack_versions WHERE id = p_pack) THEN
    RAISE EXCEPTION 'paket yok' USING ERRCODE = 'P0002';
  END IF;
  SELECT coalesce(max(seq), 0) + 1 INTO v_seq FROM crop_stages WHERE pack_id = p_pack;
  INSERT INTO crop_stages(pack_id, seq, name_tr, kc, frost_critical_c, source, entered_by)
    VALUES (p_pack, v_seq, p_name, p_kc, p_frost, p_source, app_user_id());
  PERFORM write_audit('panel.crop_stage.add', 'crop_stages', p_pack::text || ':' || v_seq, '{}');
  RETURN v_seq;
END $$;

-- Evre onayı: girişi yapan kişi dışında bir uzman gerekir.
CREATE FUNCTION review_crop_stage(p_pack uuid, p_seq int) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_by uuid;
BEGIN
  IF app_user_id() IS NULL OR NOT (app_has_role('expert') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  SELECT entered_by INTO v_by FROM crop_stages
    WHERE pack_id = p_pack AND seq = p_seq AND review_status = 'taslak-uzman-onayi-bekliyor';
  IF NOT FOUND THEN RAISE EXCEPTION 'evre yok ya da zaten onaylı' USING ERRCODE = 'P0002'; END IF;
  IF v_by IS NOT NULL AND v_by = app_user_id() THEN
    RAISE EXCEPTION 'kendi girdiğiniz veriyi onaylayamazsınız' USING ERRCODE = '42501';
  END IF;
  UPDATE crop_stages SET review_status = 'uzman-onayli' WHERE pack_id = p_pack AND seq = p_seq;
  PERFORM write_audit('panel.crop_stage.approve', 'crop_stages', p_pack::text || ':' || p_seq, '{}');
END $$;

GRANT EXECUTE ON FUNCTION review_crop_pack(uuid) TO tp_app;
GRANT EXECUTE ON FUNCTION add_crop_stage(uuid, text, numeric, numeric, text) TO tp_app;
GRANT EXECUTE ON FUNCTION review_crop_stage(uuid, int) TO tp_app;
