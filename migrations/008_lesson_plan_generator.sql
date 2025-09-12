-- migrations/008_lesson_plans.sql
-- Create lesson plans table for AI-generated lesson plans

CREATE TABLE IF NOT EXISTS lesson_plans (
  id SERIAL PRIMARY KEY,
  teacher_email TEXT NOT NULL,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  learning_outcomes JSONB NOT NULL,
  grade INT NOT NULL,
  duration_minutes INT DEFAULT 50,
  subject TEXT DEFAULT 'Mathematics',
  unit TEXT,
  difficulty VARCHAR(20) DEFAULT 'intermediate',
  structure JSONB NOT NULL,
  is_template BOOLEAN DEFAULT FALSE,
  shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesson_plans_teacher ON lesson_plans(teacher_email);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_grade ON lesson_plans(grade);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_created ON lesson_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_shared ON lesson_plans(shared) WHERE shared = TRUE;

-- Create lesson plan templates table
CREATE TABLE IF NOT EXISTS lesson_plan_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  topic_category TEXT,
  grade_range INT[],
  structure_template JSONB NOT NULL,
  created_by TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lesson plan shares table for collaboration
CREATE TABLE IF NOT EXISTS lesson_plan_shares (
  id SERIAL PRIMARY KEY,
  lesson_plan_id INT NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  permission VARCHAR(20) DEFAULT 'view', -- 'view' or 'edit'
  shared_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lesson_plan_id, shared_with_email)
);

-- Insert some default templates
INSERT INTO lesson_plan_templates (name, description, topic_category, grade_range, structure_template, created_by) VALUES
(
  'Problem-Based Learning',
  'Student-centered approach focusing on real-world problem solving',
  'general',
  ARRAY[7, 8],
  '{"approach": "problem-based", "phases": ["problem_presentation", "exploration", "solution_development", "presentation", "reflection"]}',
  'system'
),
(
  'Inquiry-Based Learning',
  'Discovery learning through guided inquiry and exploration',
  'general',
  ARRAY[7, 8],
  '{"approach": "inquiry", "phases": ["engage", "explore", "explain", "elaborate", "evaluate"]}',
  'system'
),
(
  'Collaborative Learning',
  'Group-based activities promoting peer learning',
  'general',
  ARRAY[7, 8],
  '{"approach": "collaborative", "phases": ["individual_prep", "group_work", "peer_review", "presentation", "synthesis"]}',
  'system'
)
ON CONFLICT DO NOTHING;
