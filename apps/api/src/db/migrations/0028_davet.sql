-- "Tanıdık çiftçini davet et": her kullanıcının kişisel davet kodu, ve kimin davetiyle katıldığı.
-- Yeni kişisel veri toplanmaz: yalnız rastgele kod ve davet eden kullanıcının kimliği.
ALTER TABLE users
  ADD COLUMN davet_kodu  text UNIQUE,
  ADD COLUMN davet_eden  uuid REFERENCES users(id) ON DELETE SET NULL;
GRANT UPDATE (davet_kodu) ON users TO tp_app;

-- Davet edenin yalnız KENDİ davetiyle katılanların SAYISINI görmesi için (satır sızdırmaz).
CREATE FUNCTION davet_sayisi() RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT count(*)::int FROM users WHERE davet_eden = app_user_id() $$;
GRANT EXECUTE ON FUNCTION davet_sayisi() TO tp_app;
