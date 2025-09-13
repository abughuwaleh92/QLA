-- Migration to fix teacher-student integration
-- Adds missing tables and relationships

-- Ensure skills table has teacher ownership
ALTER TABLE skills ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Add visibility to practice banks
ALTER TABLE practice_banks ADD COLUMN IF NOT EXISTS class_codes TEXT[];
ALTER TABLE practice_banks ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Create teacher-student roster management
CREATE TABLE IF NOT EXISTS class_students (
  id SERIAL PRIMARY KEY,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL,
  student_name TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(class_id, student_email)
);

-- Create question bank sharing
CREATE TABLE IF NOT EXISTS shared_question_banks (
  id SERIAL PRIMARY KEY,
  bank_id INT NOT NULL REFERENCES practice_banks(id) ON DELETE CASCADE,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL,
  shared_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bank_id, class_id)
);

-- Create lesson visibility table
CREATE TABLE IF NOT EXISTS lesson_visibility (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  visible BOOLEAN DEFAULT true,
  order_index INT DEFAULT 0,
  UNIQUE(lesson_id, class_id)
);

-- Add HTML content support to practice questions
ALTER TABLE practice_questions ADD COLUMN IF NOT EXISTS question_html TEXT;
ALTER TABLE practice_questions ADD COLUMN IF NOT EXISTS supports_latex BOOLEAN DEFAULT false;
ALTER TABLE practice_questions ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add teacher notes and feedback
CREATE TABLE IF NOT EXISTS question_feedback (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES practice_questions(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  feedback_text TEXT,
  is_helpful BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create student invitation codes
CREATE TABLE IF NOT EXISTS class_invitations (
  id SERIAL PRIMARY KEY,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  invitation_code VARCHAR(8) UNIQUE NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  uses_remaining INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add preview capability
CREATE TABLE IF NOT EXISTS question_previews (
  id SERIAL PRIMARY KEY,
  question_id INT REFERENCES practice_questions(id),
  preview_html TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_class_students_email ON class_students(student_email);
CREATE INDEX IF NOT EXISTS idx_shared_banks_class ON shared_question_banks(class_id);
CREATE INDEX IF NOT EXISTS idx_lesson_visibility_class ON lesson_visibility(class_id);
CREATE INDEX IF NOT EXISTS idx_practice_banks_published ON practice_banks(is_published);

-- Insert default data for testing
INSERT INTO class_invitations (class_id, invitation_code, created_by, expires_at)
SELECT id, UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8)), created_by, NOW() + INTERVAL '30 days'
FROM classes
WHERE NOT EXISTS (
  SELECT 1 FROM class_invitations WHERE class_invitations.class_id = classes.id
);
