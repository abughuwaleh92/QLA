
CREATE TABLE IF NOT EXISTS classes(
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  grade INT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS teacher_classes(
  id SERIAL PRIMARY KEY,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_email TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enrollments(
  id SERIAL PRIMARY KEY,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL
);
