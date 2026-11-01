-- G24: şifreli giriş, yetkili (kurum) profilleri ve kademe, uzman sorusu yönlendirme, bildirim kutusu.

-- Şifre: scrypt özeti (düz şifre hiçbir yerde yok). Giriş denemesi sınırı.
ALTER TABLE users ADD COLUMN password_hash text;
ALTER TABLE users ADD COLUMN failed_logins int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN login_locked_until timestamptz;

-- Yetkili profili. Kademe (kapsam) kurum türünden çıkar: bakanlık ülke, il müdürlüğü il, ilçe
-- müdürlüğü/belediye ilçe, diğerleri il. Başvuru yönetici onayıyla açılır; onaysız yetkili yayın yapamaz.
CREATE TABLE staff_profiles (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  institution    text NOT NULL CHECK (institution IN (
                   'bakanlik', 'il_mudurlugu', 'ilce_mudurlugu', 'belediye', 'ziraat_odasi',
                   'kooperatif', 'universite', 'arastirma_enstitusu', 'danismanlik')),
  institution_name text NOT NULL CHECK (length(institution_name) BETWEEN 2 AND 160),
  province       text,
  district       text,
  title          text NOT NULL CHECK (length(title) BETWEEN 2 AND 80),
  registry_no    text NOT NULL CHECK (length(registry_no) BETWEEN 2 AND 40),
  expertise      text[] NOT NULL DEFAULT '{}',
  wants_role     text NOT NULL DEFAULT 'expert' CHECK (wants_role IN ('expert', 'institution_admin')),
  status         text NOT NULL DEFAULT 'basvuru' CHECK (status IN ('basvuru', 'onayli', 'reddedildi')),
  decided_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (institution = 'bakanlik' OR province IS NOT NULL),
  CHECK (institution NOT IN ('ilce_mudurlugu', 'belediye') OR district IS NOT NULL)
);
CREATE INDEX staff_profiles_place_idx ON staff_profiles(province, district) WHERE status = 'onayli';
CREATE TRIGGER audit_staff_profiles AFTER INSERT OR UPDATE OR DELETE ON staff_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_row();
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_profiles_own ON staff_profiles FOR SELECT TO tp_app USING (user_id = app_user_id());
GRANT SELECT ON staff_profiles TO tp_app;

-- Uzman sorusu: arazinin yeri ve ürünü, atanan uzman.
ALTER TABLE expert_questions ADD COLUMN province text;
ALTER TABLE expert_questions ADD COLUMN district text;
ALTER TABLE expert_questions ADD COLUMN crop_id text;
ALTER TABLE expert_questions ADD COLUMN assigned_to uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expert_questions ADD COLUMN assigned_at timestamptz;
CREATE INDEX expert_questions_assigned_idx ON expert_questions(assigned_to, status);

-- Uygulama içi bildirim kutusu (zil): uzman cevabı vb. Telefon bildirimi (push) ayrıca gönderilir.
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('uzman_cevap', 'duyuru', 'basvuru')),
  title      text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  ref_id     uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_own ON notifications FOR SELECT TO tp_app USING (user_id = app_user_id());
CREATE POLICY notifications_own_upd ON notifications FOR UPDATE TO tp_app USING (user_id = app_user_id());
GRANT SELECT, UPDATE (read_at) ON notifications TO tp_app;
