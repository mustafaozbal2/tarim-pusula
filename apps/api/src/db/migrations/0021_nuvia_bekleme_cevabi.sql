-- Uzman süresinde cevaplamazsa Nuvia (yapay zekâ) geçici cevabı. Uzmanın cevabı gelince o esastır;
-- yapay zekâ cevabı ayrı alanda durur, uzman kuyruğunu ve onay akışını bozmaz.
ALTER TABLE expert_questions
  ADD COLUMN ai_answer text CHECK (ai_answer IS NULL OR length(ai_answer) BETWEEN 1 AND 2500),
  ADD COLUMN ai_source text CHECK (ai_source IS NULL OR length(ai_source) BETWEEN 1 AND 300),
  ADD COLUMN ai_answered_at timestamptz,
  ADD COLUMN ai_tried_at timestamptz;
