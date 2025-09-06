
CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  slug TEXT,
  grade INT,
  unit INT,
  lesson_order INT,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  html_path TEXT,
  html_content TEXT,
  is_public BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lessons_slug_unique ON lessons(slug);
CREATE UNIQUE INDEX IF NOT EXISTS lessons_grade_unit_order_unique ON lessons(grade,unit,lesson_order);
