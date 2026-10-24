-- G15: reddetme, onay geri çekme, duyuru düzenleme/silme.
-- Her işlem gerekçe ister ve denetim satırı bırakır. Reddedilen veri çiftçiye hiç gösterilmez.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid::regclass::text IN ('crop_pack_versions', 'crop_stages', 'announcements')
      AND pg_get_constraintdef(c.oid) LIKE '%review_status%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE crop_pack_versions ADD CONSTRAINT crop_pack_versions_review_chk
  CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli', 'reddedildi'));
ALTER TABLE crop_stages ADD CONSTRAINT crop_stages_review_chk
  CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli', 'reddedildi'));
ALTER TABLE announcements ADD CONSTRAINT announcements_review_chk
  CHECK (review_status IN ('taslak-uzman-onayi-bekliyor', 'uzman-onayli', 'reddedildi'));

CREATE FUNCTION assert_reviewer(p_reason text) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_user_id() IS NULL OR NOT (app_has_role('expert') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'gerekçe zorunlu' USING ERRCODE = '23514';
  END IF;
END $$;

-- Paket: taslak > reddedildi ; onaylı > taslak (geri çekme, yeniden onay gerekir).
CREATE FUNCTION withdraw_crop_pack(p_pack uuid, p_from text, p_to text, p_action text, p_reason text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_reviewer(p_reason);
  UPDATE crop_pack_versions SET review_status = p_to WHERE id = p_pack AND review_status = p_from;
  IF NOT FOUND THEN RAISE EXCEPTION 'paket yok ya da durumu uygun değil' USING ERRCODE = 'P0002'; END IF;
  PERFORM write_audit(p_action, 'crop_pack_versions', p_pack::text, jsonb_build_object('reason', p_reason));
END $$;

CREATE FUNCTION withdraw_crop_stage(p_pack uuid, p_seq int, p_from text, p_to text, p_action text, p_reason text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_reviewer(p_reason);
  UPDATE crop_stages SET review_status = p_to
    WHERE pack_id = p_pack AND seq = p_seq AND review_status = p_from;
  IF NOT FOUND THEN RAISE EXCEPTION 'evre yok ya da durumu uygun değil' USING ERRCODE = 'P0002'; END IF;
  PERFORM write_audit(p_action, 'crop_stages', p_pack::text || ':' || p_seq, jsonb_build_object('reason', p_reason));
END $$;

CREATE FUNCTION withdraw_announcement(p_id uuid, p_from text, p_to text, p_action text, p_reason text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_reviewer(p_reason);
  UPDATE announcements SET review_status = p_to, reviewed_by = app_user_id()
    WHERE id = p_id AND review_status = p_from;
  IF NOT FOUND THEN RAISE EXCEPTION 'duyuru yok ya da durumu uygun değil' USING ERRCODE = 'P0002'; END IF;
  PERFORM write_audit(p_action, 'announcements', p_id::text, jsonb_build_object('reason', p_reason));
END $$;

-- Duyuru düzenleme: sahibi ya da uzman/yönetici. Her düzenleme sürümü artırır ve taslağa döndürür
-- (onaylı metin sessizce değişemez; yeniden onay gerekir).
CREATE FUNCTION edit_announcement(
  p_id uuid, p_source_org text, p_title text, p_body text, p_source_url text,
  p_published_at timestamptz, p_expires_at timestamptz, p_targeting jsonb
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid; v_ver int;
BEGIN
  IF app_user_id() IS NULL OR NOT (app_has_role('institution_admin') OR app_has_role('expert') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  SELECT created_by INTO v_owner FROM announcements WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'duyuru yok' USING ERRCODE = 'P0002'; END IF;
  IF v_owner IS DISTINCT FROM app_user_id() AND NOT (app_has_role('expert') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  UPDATE announcements SET source_org = p_source_org, title = p_title, body = p_body,
      source_url = p_source_url, published_at = p_published_at, expires_at = p_expires_at,
      targeting = p_targeting, version = version + 1,
      review_status = 'taslak-uzman-onayi-bekliyor', reviewed_by = NULL
    WHERE id = p_id RETURNING version INTO v_ver;
  PERFORM write_audit('announcements.edit', 'announcements', p_id::text, jsonb_build_object('version', v_ver));
  RETURN v_ver;
END $$;

CREATE FUNCTION delete_announcement(p_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF app_user_id() IS NULL OR NOT (app_has_role('institution_admin') OR app_has_role('expert') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  SELECT created_by INTO v_owner FROM announcements WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'duyuru yok' USING ERRCODE = 'P0002'; END IF;
  IF v_owner IS DISTINCT FROM app_user_id() AND NOT (app_has_role('expert') OR app_has_role('admin')) THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  DELETE FROM announcements WHERE id = p_id;
  PERFORM write_audit('announcements.delete', 'announcements', p_id::text, '{}');
END $$;

-- Genel işlevler uygulama rolüne AÇIK DEĞİL (durum geçişi parametreyle seçilebilseydi onay denetimi aşılırdı).
-- Dışarıya yalnız sabit geçişli ince sarmalayıcılar verilir.
REVOKE ALL ON FUNCTION assert_reviewer(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION withdraw_crop_pack(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION withdraw_crop_stage(uuid, int, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION withdraw_announcement(uuid, text, text, text, text) FROM PUBLIC;

CREATE FUNCTION reject_crop_pack(p_id uuid, p_reason text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ SELECT withdraw_crop_pack(p_id, 'taslak-uzman-onayi-bekliyor', 'reddedildi', 'panel.crop_pack.reject', p_reason) $$;
CREATE FUNCTION revoke_crop_pack(p_id uuid, p_reason text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ SELECT withdraw_crop_pack(p_id, 'uzman-onayli', 'taslak-uzman-onayi-bekliyor', 'panel.crop_pack.revoke', p_reason) $$;
CREATE FUNCTION reject_crop_stage(p_id uuid, p_seq int, p_reason text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ SELECT withdraw_crop_stage(p_id, p_seq, 'taslak-uzman-onayi-bekliyor', 'reddedildi', 'panel.crop_stage.reject', p_reason) $$;
CREATE FUNCTION revoke_crop_stage(p_id uuid, p_seq int, p_reason text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ SELECT withdraw_crop_stage(p_id, p_seq, 'uzman-onayli', 'taslak-uzman-onayi-bekliyor', 'panel.crop_stage.revoke', p_reason) $$;
CREATE FUNCTION reject_announcement(p_id uuid, p_reason text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ SELECT withdraw_announcement(p_id, 'taslak-uzman-onayi-bekliyor', 'reddedildi', 'announcements.reject', p_reason) $$;
CREATE FUNCTION revoke_announcement(p_id uuid, p_reason text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ SELECT withdraw_announcement(p_id, 'uzman-onayli', 'taslak-uzman-onayi-bekliyor', 'announcements.revoke', p_reason) $$;

REVOKE ALL ON FUNCTION reject_crop_pack(uuid, text), revoke_crop_pack(uuid, text),
  reject_crop_stage(uuid, int, text), revoke_crop_stage(uuid, int, text),
  reject_announcement(uuid, text), revoke_announcement(uuid, text),
  edit_announcement(uuid, text, text, text, text, timestamptz, timestamptz, jsonb),
  delete_announcement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reject_crop_pack(uuid, text), revoke_crop_pack(uuid, text),
  reject_crop_stage(uuid, int, text), revoke_crop_stage(uuid, int, text),
  reject_announcement(uuid, text), revoke_announcement(uuid, text),
  edit_announcement(uuid, text, text, text, text, timestamptz, timestamptz, jsonb),
  delete_announcement(uuid) TO tp_app;
