-- migrations/008_lesson_plan_generator.sql
-- Add support for AI lesson plan generation

-- Table to store generated lesson plans
CREATE TABLE IF NOT EXISTS generated_lesson_plans (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  grade INT NOT NULL,
  learning_outcomes JSONB,
  plan_data JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lesson_plans_created_by ON generated_lesson_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_created_at ON generated_lesson_plans(created_at DESC);

-- Add a column to lessons table to link to generated plans
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS generated_plan_id INT REFERENCES generated_lesson_plans(id);

-- Create table for lesson plan templates (for future customization)
CREATE TABLE IF NOT EXISTS lesson_plan_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_structure JSONB NOT NULL,
  grade_level INT,
  subject TEXT DEFAULT 'Mathematics',
  created_by TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default QLA template
INSERT INTO lesson_plan_templates (name, description, template_structure, is_default) 
VALUES (
  'QLA Standard Lesson Plan',
  'Standard Qatar Leadership Academy lesson plan format with student-centered activities',
  '{
    "sections": [
      {"name": "Organisation", "duration": 2, "type": "opening"},
      {"name": "Recall", "duration": 3, "type": "review"},
      {"name": "Starter", "duration": 10, "type": "engagement"},
      {"name": "Inquiry Question", "duration": 10, "type": "inquiry"},
      {"name": "Main", "duration": 20, "type": "core"},
      {"name": "Plenary: Feedback and Reflection", "duration": 10, "type": "closing"}
    ],
    "assessment_methods": ["Question answer", "Observation", "Discussion", "Reflection", "Participation", "Work in pairs", "Math Software"],
    "differentiation_levels": ["low_medium", "high_ability"],
    "required_components": ["objectives", "activities", "assessment", "resources", "vocabulary", "homework"]
  }'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- Table for storing favorite/saved lesson components
CREATE TABLE IF NOT EXISTS lesson_component_library (
  id SERIAL PRIMARY KEY,
  teacher_email TEXT NOT NULL,
  component_type VARCHAR(50) NOT NULL, -- 'starter', 'inquiry', 'main', 'assessment', etc.
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  tags TEXT[],
  grade_levels INT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_component_library_teacher ON lesson_component_library(teacher_email);
CREATE INDEX IF NOT EXISTS idx_component_library_type ON lesson_component_library(component_type);

-- Track lesson plan usage and effectiveness
CREATE TABLE IF NOT EXISTS lesson_plan_feedback (
  id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES generated_lesson_plans(id),
  teacher_email TEXT NOT NULL,
  effectiveness_rating INT CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
  engagement_rating INT CHECK (engagement_rating >= 1 AND engagement_rating <= 5),
  notes TEXT,
  modifications_made JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add view for lesson plan analytics
CREATE OR REPLACE VIEW lesson_plan_analytics AS
SELECT 
  glp.id,
  glp.topic,
  glp.grade,
  glp.created_by,
  glp.created_at,
  COUNT(DISTINCT lpf.id) as feedback_count,
  AVG(lpf.effectiveness_rating) as avg_effectiveness,
  AVG(lpf.engagement_rating) as avg_engagement
FROM generated_lesson_plans glp
LEFT JOIN lesson_plan_feedback lpf ON lpf.plan_id = glp.id
GROUP BY glp.id, glp.topic, glp.grade, glp.created_by, glp.created_at;
