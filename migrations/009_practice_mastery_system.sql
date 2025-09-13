-- migrations/009_practice_mastery_system.sql
-- Comprehensive Practice & Mastery System for QLA Mathematics Platform

-- Skills/Topics table - defines what students need to master
CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  grade INT NOT NULL,
  unit INT NOT NULL,
  order_index INT DEFAULT 0,
  parent_skill_id INT REFERENCES skills(id),
  prerequisite_skills JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Practice Question Banks - separate from assessment banks
CREATE TABLE IF NOT EXISTS practice_banks (
  id SERIAL PRIMARY KEY,
  skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  difficulty VARCHAR(20) DEFAULT 'medium', -- easy, medium, hard, adaptive
  created_by TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Practice Questions with hints
CREATE TABLE IF NOT EXISTS practice_questions (
  id SERIAL PRIMARY KEY,
  bank_id INT NOT NULL REFERENCES practice_banks(id) ON DELETE CASCADE,
  skill_id INT NOT NULL REFERENCES skills(id),
  question_type VARCHAR(50) NOT NULL, -- mcq, numeric, text, multi_select, equation
  question_text TEXT NOT NULL,
  question_data JSONB NOT NULL, -- includes options, images, equations
  correct_answer JSONB NOT NULL,
  solution_steps JSONB, -- step-by-step solution
  hints JSONB DEFAULT '[]'::jsonb, -- array of progressive hints
  difficulty_level INT DEFAULT 3, -- 1-5 scale
  points INT DEFAULT 10,
  estimated_time_seconds INT DEFAULT 60,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student Skill Mastery Tracking
CREATE TABLE IF NOT EXISTS skill_mastery (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  mastery_level DECIMAL(5,2) DEFAULT 0, -- 0-100%
  questions_attempted INT DEFAULT 0,
  questions_correct INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  last_practiced TIMESTAMPTZ,
  time_spent_seconds INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'not_started', -- not_started, learning, practiced, mastered, review_needed
  mastery_achieved_at TIMESTAMPTZ,
  UNIQUE(user_email, skill_id)
);

-- Practice Sessions
CREATE TABLE IF NOT EXISTS practice_sessions (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  skill_id INT REFERENCES skills(id),
  session_type VARCHAR(30), -- targeted, mixed, review, adaptive
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  questions_attempted INT DEFAULT 0,
  questions_correct INT DEFAULT 0,
  average_time_per_question DECIMAL(10,2),
  session_score DECIMAL(5,2),
  mastery_delta DECIMAL(5,2), -- change in mastery from this session
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Practice Attempts (individual question attempts)
CREATE TABLE IF NOT EXISTS practice_attempts (
  id SERIAL PRIMARY KEY,
  session_id INT REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES practice_questions(id),
  user_email TEXT NOT NULL,
  skill_id INT NOT NULL REFERENCES skills(id),
  user_answer JSONB,
  is_correct BOOLEAN,
  hints_used INT DEFAULT 0,
  time_taken_seconds INT,
  attempt_number INT DEFAULT 1,
  confidence_level INT, -- 1-5 student's confidence
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Achievements/Badges System
CREATE TABLE IF NOT EXISTS achievement_definitions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category VARCHAR(50), -- mastery, streak, speed, accuracy, completion
  criteria_type VARCHAR(50), -- skill_mastery, questions_solved, time_based, streak_based
  criteria_value JSONB NOT NULL,
  points INT DEFAULT 10,
  rarity VARCHAR(20) DEFAULT 'common', -- common, rare, epic, legendary
  badge_color VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student Achievements
CREATE TABLE IF NOT EXISTS student_achievements (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  achievement_id INT NOT NULL REFERENCES achievement_definitions(id),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  progress DECIMAL(5,2) DEFAULT 100, -- for progressive achievements
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(user_email, achievement_id)
);

-- Learning Paths - recommended sequence of skills
CREATE TABLE IF NOT EXISTS learning_paths (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  skill_id INT NOT NULL REFERENCES skills(id),
  sequence_order INT NOT NULL,
  status VARCHAR(20) DEFAULT 'locked', -- locked, available, in_progress, completed
  unlocked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_email, skill_id)
);

-- Daily/Weekly Goals
CREATE TABLE IF NOT EXISTS student_goals (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  goal_type VARCHAR(20), -- daily, weekly, custom
  target_questions INT,
  target_time_minutes INT,
  target_skills INT,
  current_questions INT DEFAULT 0,
  current_time_minutes INT DEFAULT 0,
  current_skills INT DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics Events for detailed tracking
CREATE TABLE IF NOT EXISTS practice_analytics (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  event_type VARCHAR(50), -- question_viewed, hint_used, answer_submitted, session_start, session_end
  skill_id INT REFERENCES skills(id),
  question_id INT REFERENCES practice_questions(id),
  session_id INT REFERENCES practice_sessions(id),
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboards
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  leaderboard_type VARCHAR(30), -- weekly, monthly, all_time, skill_specific
  score INT DEFAULT 0,
  rank INT,
  period_start DATE,
  period_end DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_skill_mastery_user ON skill_mastery(user_email);
CREATE INDEX IF NOT EXISTS idx_skill_mastery_status ON skill_mastery(status);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_user ON practice_attempts(user_email);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_session ON practice_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_student_achievements_user ON student_achievements(user_email);
CREATE INDEX IF NOT EXISTS idx_learning_paths_user ON learning_paths(user_email);
CREATE INDEX IF NOT EXISTS idx_practice_analytics_user ON practice_analytics(user_email);
CREATE INDEX IF NOT EXISTS idx_practice_analytics_created ON practice_analytics(created_at);

-- Insert default achievements
INSERT INTO achievement_definitions (name, display_name, description, icon, category, criteria_type, criteria_value, points, rarity) VALUES
('first_practice', 'First Steps', 'Complete your first practice session', '🎯', 'completion', 'questions_solved', '{"count": 1}', 10, 'common'),
('skill_master', 'Skill Master', 'Master your first skill (100% mastery)', '🏆', 'mastery', 'skill_mastery', '{"mastery": 100, "count": 1}', 50, 'rare'),
('streak_week', 'Week Warrior', 'Practice 7 days in a row', '🔥', 'streak', 'streak_based', '{"days": 7}', 30, 'rare'),
('speed_demon', 'Speed Demon', 'Answer 10 questions correctly in under 30 seconds each', '⚡', 'speed', 'time_based', '{"questions": 10, "time": 30}', 25, 'rare'),
('accuracy_ace', 'Accuracy Ace', 'Get 20 questions correct in a row', '🎯', 'accuracy', 'streak_based', '{"correct": 20}', 40, 'epic'),
('hint_free', 'No Hints Needed', 'Complete 50 questions without using hints', '🧠', 'mastery', 'questions_solved', '{"count": 50, "hints": 0}', 35, 'rare'),
('unit_complete', 'Unit Champion', 'Master all skills in a unit', '🏅', 'completion', 'skill_mastery', '{"unit_complete": true}', 100, 'epic'),
('perfect_session', 'Perfect Session', 'Complete a practice session with 100% accuracy', '⭐', 'accuracy', 'session_based', '{"accuracy": 100}', 20, 'common'),
('early_bird', 'Early Bird', 'Practice before 7 AM', '🌅', 'time_based', 'time_based', '{"before_hour": 7}', 15, 'common'),
('night_owl', 'Night Owl', 'Practice after 10 PM', '🦉', 'time_based', 'time_based', '{"after_hour": 22}', 15, 'common')
ON CONFLICT (name) DO NOTHING;

-- Create views for analytics
CREATE OR REPLACE VIEW student_mastery_overview AS
SELECT 
  sm.user_email,
  s.grade,
  s.unit,
  COUNT(DISTINCT sm.skill_id) as total_skills,
  COUNT(DISTINCT CASE WHEN sm.status = 'mastered' THEN sm.skill_id END) as mastered_skills,
  COUNT(DISTINCT CASE WHEN sm.status IN ('learning', 'practiced') THEN sm.skill_id END) as in_progress_skills,
  AVG(sm.mastery_level) as average_mastery,
  SUM(sm.time_spent_seconds) / 3600.0 as total_hours_practiced
FROM skill_mastery sm
JOIN skills s ON s.id = sm.skill_id
GROUP BY sm.user_email, s.grade, s.unit;

CREATE OR REPLACE VIEW skill_difficulty_analysis AS
SELECT 
  pq.skill_id,
  s.name as skill_name,
  COUNT(DISTINCT pa.user_email) as students_attempted,
  COUNT(pa.id) as total_attempts,
  AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0.0 END) as success_rate,
  AVG(pa.hints_used) as avg_hints_used,
  AVG(pa.time_taken_seconds) as avg_time_seconds
FROM practice_attempts pa
JOIN practice_questions pq ON pq.id = pa.question_id
JOIN skills s ON s.id = pq.skill_id
GROUP BY pq.skill_id, s.name;

-- Function to calculate and update mastery level
CREATE OR REPLACE FUNCTION update_skill_mastery(
  p_user_email TEXT,
  p_skill_id INT,
  p_correct BOOLEAN,
  p_time_spent INT
) RETURNS DECIMAL AS $$
DECLARE
  v_current_mastery DECIMAL;
  v_new_mastery DECIMAL;
  v_weight DECIMAL;
BEGIN
  -- Get current mastery
  SELECT mastery_level INTO v_current_mastery
  FROM skill_mastery
  WHERE user_email = p_user_email AND skill_id = p_skill_id;
  
  IF v_current_mastery IS NULL THEN
    v_current_mastery := 0;
    INSERT INTO skill_mastery (user_email, skill_id, mastery_level)
    VALUES (p_user_email, p_skill_id, 0)
    ON CONFLICT (user_email, skill_id) DO NOTHING;
  END IF;
  
  -- Calculate weight based on current mastery (adaptive learning)
  IF v_current_mastery < 30 THEN
    v_weight := 0.15; -- Larger jumps when starting
  ELSIF v_current_mastery < 70 THEN
    v_weight := 0.10; -- Medium jumps in middle
  ELSE
    v_weight := 0.05; -- Smaller jumps near mastery
  END IF;
  
  -- Update mastery based on correctness
  IF p_correct THEN
    v_new_mastery := LEAST(100, v_current_mastery + (100 - v_current_mastery) * v_weight);
  ELSE
    v_new_mastery := GREATEST(0, v_current_mastery - v_current_mastery * v_weight * 0.5);
  END IF;
  
  -- Update the mastery record
  UPDATE skill_mastery
  SET 
    mastery_level = v_new_mastery,
    questions_attempted = questions_attempted + 1,
    questions_correct = questions_correct + CASE WHEN p_correct THEN 1 ELSE 0 END,
    current_streak = CASE 
      WHEN p_correct THEN current_streak + 1 
      ELSE 0 
    END,
    best_streak = GREATEST(best_streak, current_streak + CASE WHEN p_correct THEN 1 ELSE 0 END),
    time_spent_seconds = time_spent_seconds + COALESCE(p_time_spent, 0),
    last_practiced = NOW(),
    status = CASE
      WHEN v_new_mastery >= 95 THEN 'mastered'
      WHEN v_new_mastery >= 70 THEN 'practiced'
      WHEN v_new_mastery >= 30 THEN 'learning'
      ELSE 'learning'
    END,
    mastery_achieved_at = CASE
      WHEN v_new_mastery >= 95 AND mastery_achieved_at IS NULL THEN NOW()
      ELSE mastery_achieved_at
    END
  WHERE user_email = p_user_email AND skill_id = p_skill_id;
  
  RETURN v_new_mastery;
END;
$$ LANGUAGE plpgsql;
