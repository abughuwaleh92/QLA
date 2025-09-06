
CREATE TABLE IF NOT EXISTS progress(
  user_email TEXT NOT NULL,
  lesson_ref TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_email, lesson_ref)
);
CREATE TABLE IF NOT EXISTS progress_events(
  id SERIAL PRIMARY KEY,
  user_email TEXT,
  lesson_ref TEXT,
  slide INT,
  total INT,
  extra JSONB,
  ts TIMESTAMPTZ DEFAULT now()
);
