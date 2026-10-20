-- G7: Pusula AI uzman kuyruğu. Emin olunmayan, riskli ya da fotoğraflı sorular insana düşer;
-- uzmanın cevabı (uzman işaretlerse) aynı soruya verilen sonraki cevaplarda önbellek olur.

CREATE TABLE expert_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_id      uuid REFERENCES fields(id) ON DELETE SET NULL,
  question      text NOT NULL CHECK (length(question) BETWEEN 1 AND 1000),
  question_norm text NOT NULL,
  reason        text NOT NULL CHECK (reason IN ('kaynak-yok', 'onaysiz', 'veri-yok', 'foto', 'uzman', 'riskli')),
  has_image     boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'bekliyor' CHECK (status IN ('bekliyor', 'cevaplandi')),
  answer        text CHECK (answer IS NULL OR length(answer) BETWEEN 1 AND 2000),
  answer_source text CHECK (answer_source IS NULL OR length(answer_source) BETWEEN 1 AND 300),
  cacheable     boolean NOT NULL DEFAULT false,
  answered_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  answered_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Cevaplanmış kayıt kaynaklı olmalı (atıfsız iddia yok).
  CHECK (status = 'bekliyor' OR (answer IS NOT NULL AND answer_source IS NOT NULL AND answered_by IS NOT NULL))
);
CREATE INDEX expert_questions_status_idx ON expert_questions(status, created_at);
CREATE INDEX expert_questions_norm_idx ON expert_questions(question_norm) WHERE cacheable;

-- Fotoğraf ayrı tutulur: denetim/listelerde ikili veri taşınmasın, silme kolay olsun.
CREATE TABLE expert_question_images (
  question_id uuid PRIMARY KEY REFERENCES expert_questions(id) ON DELETE CASCADE,
  mime        text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  data        bytea NOT NULL CHECK (length(data) BETWEEN 1 AND 6000000)
);

CREATE TRIGGER audit_expert_questions AFTER INSERT OR UPDATE OR DELETE ON expert_questions
  FOR EACH ROW EXECUTE FUNCTION audit_row();

ALTER TABLE expert_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY eq_select ON expert_questions FOR SELECT TO tp_app
  USING (user_id = app_user_id() OR app_has_role('expert') OR app_has_role('admin'));
CREATE POLICY eq_insert ON expert_questions FOR INSERT TO tp_app
  WITH CHECK (user_id = app_user_id() AND status = 'bekliyor' AND answer IS NULL);
CREATE POLICY eq_answer ON expert_questions FOR UPDATE TO tp_app
  USING (app_has_role('expert') OR app_has_role('admin'))
  WITH CHECK (answered_by = app_user_id() AND status = 'cevaplandi');
GRANT SELECT, INSERT ON expert_questions TO tp_app;
GRANT UPDATE (status, answer, answer_source, cacheable, answered_by, answered_at) ON expert_questions TO tp_app;

ALTER TABLE expert_question_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY eqi_select ON expert_question_images FOR SELECT TO tp_app
  USING (EXISTS (SELECT 1 FROM expert_questions q WHERE q.id = question_id
    AND (q.user_id = app_user_id() OR app_has_role('expert') OR app_has_role('admin'))));
CREATE POLICY eqi_insert ON expert_question_images FOR INSERT TO tp_app
  WITH CHECK (EXISTS (SELECT 1 FROM expert_questions q WHERE q.id = question_id AND q.user_id = app_user_id()));
GRANT SELECT, INSERT ON expert_question_images TO tp_app;

-- Başka çiftçilerin sorularına bakmadan yalnız "uzmanın önbelleğe aldığı" cevabı döndürür.
CREATE FUNCTION expert_cache_lookup(p_norm text)
  RETURNS TABLE(answer text, answer_source text, answered_at timestamptz)
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT answer, answer_source, answered_at FROM expert_questions
  WHERE app_user_id() IS NOT NULL AND cacheable AND status = 'cevaplandi' AND question_norm = p_norm
  ORDER BY answered_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION expert_cache_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expert_cache_lookup(text) TO tp_app;
