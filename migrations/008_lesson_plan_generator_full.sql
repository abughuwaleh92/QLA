
-- 008_lesson_plan_generator_full.sql
-- End-to-end schema to support the Lesson Plan Generator

BEGIN;

-- Store generated plans
CREATE TABLE IF NOT EXISTS generated_lesson_plans (
  id                BIGSERIAL PRIMARY KEY,
  topic             TEXT NOT NULL,
  grade             INT  NOT NULL CHECK (grade BETWEEN 1 AND 12),
  learning_outcomes JSONB,
  plan_data         JSONB NOT NULL,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_glp_created_by ON generated_lesson_plans (created_by);
CREATE INDEX IF NOT EXISTS idx_glp_created_at ON generated_lesson_plans (created_at DESC);

-- Optional feedback to enable analytics
CREATE TABLE IF NOT EXISTS lesson_plan_feedback (
  id                   BIGSERIAL PRIMARY KEY,
  plan_id              BIGINT NOT NULL REFERENCES generated_lesson_plans(id) ON DELETE CASCADE,
  effectiveness_rating INT CHECK (effectiveness_rating BETWEEN 1 AND 5),
  engagement_rating    INT CHECK (engagement_rating BETWEEN 1 AND 5),
  comments             TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE VIEW lesson_plan_analytics AS
SELECT 
  glp.id,
  glp.topic,
  glp.grade,
  glp.created_by,
  glp.created_at,
  COUNT(lpf.id)                           AS feedback_count,
  ROUND(AVG(lpf.effectiveness_rating)::numeric, 2) AS avg_effectiveness,
  ROUND(AVG(lpf.engagement_rating)::numeric, 2)    AS avg_engagement
FROM generated_lesson_plans glp
LEFT JOIN lesson_plan_feedback lpf ON lpf.plan_id = glp.id
GROUP BY glp.id, glp.topic, glp.grade, glp.created_by, glp.created_at
ORDER BY glp.created_at DESC;

COMMIT;
