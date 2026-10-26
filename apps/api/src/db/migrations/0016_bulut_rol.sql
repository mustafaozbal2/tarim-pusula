-- Bulut Postgres (Neon vb.): bağlanan kullanıcı süper kullanıcı değildir. Kullanıcı bağlamındaki işlemler
-- `SET LOCAL ROLE tp_app` ile RLS altına girer; bunun için bağlanan kullanıcının tp_app üyeliği gerekir
-- (PG16+ CREATEROLE sahibine rolü otomatik SET yetkisiyle vermez). Süper kullanıcıda (yerel, PGlite)
-- zaten gerekli değildir; hata verirse yok sayılır.
DO $$
BEGIN
  EXECUTE format('GRANT tp_app TO %I', current_user);
EXCEPTION WHEN others THEN
  NULL;
END $$;
