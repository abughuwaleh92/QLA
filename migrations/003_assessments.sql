
CREATE TABLE IF NOT EXISTS question_banks(
  id SERIAL PRIMARY KEY,
  title TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS questions(
  id SERIAL PRIMARY KEY,
  bank_id INT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- mcq, multi, num, text, tf
  prompt TEXT NOT NULL,
  options JSONB,
  answer JSONB,
  points INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS assessments(
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  bank_id INT NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  title TEXT,
  pass_pct INT DEFAULT 70,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assessment_attempts(
  id SERIAL PRIMARY KEY,
  assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  user_email TEXT,
  score_pct INT,
  responses JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ DEFAULT now()
);
