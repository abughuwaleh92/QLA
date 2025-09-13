-- Migration to fix skills and practice_banks tables
BEGIN;

-- Add missing columns to skills table if they don't exist
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure practice_banks table exists with correct structure
CREATE TABLE IF NOT EXISTS practice_banks (
  id SERIAL PRIMARY KEY,
  skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  difficulty VARCHAR(20) DEFAULT 'medium',
  created_by TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add name column if only title exists
ALTER TABLE practice_banks ADD COLUMN IF NOT EXISTS name TEXT;
UPDATE practice_banks SET name = COALESCE(title, 'Untitled Bank') WHERE name IS NULL;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_skills_grade ON skills(grade);
CREATE INDEX IF NOT EXISTS idx_skills_unit ON skills(unit);
CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(is_active);
CREATE INDEX IF NOT EXISTS idx_practice_banks_skill ON practice_banks(skill_id);
CREATE INDEX IF NOT EXISTS idx_practice_banks_active ON practice_banks(is_active);

COMMIT;
