-- G24: onaylı uzmanın duyurusu doğrudan yayındadır (uzman onayıdır). Uzman olmayan kurum yetkilisi
-- yine taslak ekler ve bir uzmanın onayına düşer (kural 1). Kural veritabanında da korunur.
DROP POLICY ann_insert ON announcements;
CREATE POLICY ann_insert ON announcements FOR INSERT TO tp_app
  WITH CHECK (
    (app_has_role('institution_admin') OR app_has_role('expert') OR app_has_role('admin'))
    AND created_by = app_user_id()
    AND (
      (review_status = 'taslak-uzman-onayi-bekliyor' AND reviewed_by IS NULL)
      OR (review_status = 'uzman-onayli' AND app_has_role('expert') AND reviewed_by = app_user_id())
    )
  );
