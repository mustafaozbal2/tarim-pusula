-- G17: duyuruya isteğe bağlı görsel (küçük, veri adresi olarak; en çok ~200 KB).
-- Ayrı depolama (nesne deposu) gelene kadar basit tutulur; denetim satırı görseli içermez (audit_row yalnız işlem türünü yazar).
ALTER TABLE announcements ADD COLUMN image_data_url text
  CHECK (image_data_url IS NULL OR (length(image_data_url) <= 300000
    AND image_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));

-- Görselli düzenleme: eski imza (görselsiz) olduğu gibi kalır; bu işlev görseli de günceller.
CREATE FUNCTION edit_announcement(
  p_id uuid, p_source_org text, p_title text, p_body text, p_source_url text,
  p_published_at timestamptz, p_expires_at timestamptz, p_targeting jsonb, p_image text
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ver int;
BEGIN
  v_ver := edit_announcement(p_id, p_source_org, p_title, p_body, p_source_url,
    p_published_at, p_expires_at, p_targeting);
  UPDATE announcements SET image_data_url = p_image WHERE id = p_id;
  RETURN v_ver;
END $$;

REVOKE ALL ON FUNCTION edit_announcement(uuid, text, text, text, text, timestamptz, timestamptz, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edit_announcement(uuid, text, text, text, text, timestamptz, timestamptz, jsonb, text) TO tp_app;
