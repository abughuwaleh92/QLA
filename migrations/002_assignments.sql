
CREATE TABLE IF NOT EXISTS assignments(
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  class_code TEXT NOT NULL,
  pass_pct INT DEFAULT 70,
  due_at DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
