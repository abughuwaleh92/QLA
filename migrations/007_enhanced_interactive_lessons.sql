-- migrations/007_enhanced_interactive_lessons.sql
-- Enhanced Interactive Lessons System

-- Lesson sections (video, content, activity, quiz)
CREATE TABLE IF NOT EXISTS lesson_sections (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  section_type VARCHAR(50) NOT NULL, -- 'video', 'content', 'activity', 'quiz', 'checkpoint'
  section_order INT NOT NULL,
  title TEXT NOT NULL,
  content JSONB,
  required_score INT DEFAULT 70, -- Minimum score to proceed
  points_available INT DEFAULT 100,
  time_estimate_minutes INT DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student section progress
CREATE TABLE IF NOT EXISTS section_progress (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  section_id INT NOT NULL REFERENCES lesson_sections(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'locked', -- 'locked', 'available', 'in_progress', 'completed'
  score INT DEFAULT 0,
  points_earned INT DEFAULT 0,
  attempts INT DEFAULT 0,
  time_spent_seconds INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_activity TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_email, section_id)
);

-- Video watch tracking
CREATE TABLE IF NOT EXISTS video_watch_progress (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  section_id INT NOT NULL REFERENCES lesson_sections(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  duration_seconds INT,
  watched_seconds INT DEFAULT 0,
  watch_percentage DECIMAL(5,2) DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  last_position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_email, section_id)
);

-- Interactive activities responses
CREATE TABLE IF NOT EXISTS activity_responses (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  section_id INT NOT NULL REFERENCES lesson_sections(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  activity_type VARCHAR(50), -- 'drag_drop', 'fill_blank', 'matching', 'coding', 'drawing'
  response JSONB,
  is_correct BOOLEAN,
  points_earned INT DEFAULT 0,
  time_taken_seconds INT,
  hint_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz questions and responses
CREATE TABLE IF NOT EXISTS section_questions (
  id SERIAL PRIMARY KEY,
  section_id INT NOT NULL REFERENCES lesson_sections(id) ON DELETE CASCADE,
  question_order INT NOT NULL,
  question_type VARCHAR(20), -- 'mcq', 'true_false', 'numeric', 'text', 'multi_select'
  question_text TEXT NOT NULL,
  question_data JSONB, -- includes options, correct_answer, hints, explanation
  points INT DEFAULT 10,
  difficulty VARCHAR(20) DEFAULT 'medium' -- 'easy', 'medium', 'hard'
);

CREATE TABLE IF NOT EXISTS question_responses (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  question_id INT NOT NULL REFERENCES section_questions(id) ON DELETE CASCADE,
  response JSONB,
  is_correct BOOLEAN,
  points_earned INT DEFAULT 0,
  attempt_number INT DEFAULT 1,
  time_taken_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lesson achievements and badges
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  points_required INT,
  criteria JSONB, -- Complex criteria like "complete 5 lessons in a row"
  badge_color VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  achievement_id INT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  lesson_id INT REFERENCES lessons(id),
  UNIQUE(user_email, achievement_id)
);

-- Overall lesson completion tracking
CREATE TABLE IF NOT EXISTS lesson_completions (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  total_score INT DEFAULT 0,
  total_points_earned INT DEFAULT 0,
  total_points_available INT DEFAULT 0,
  completion_percentage DECIMAL(5,2) DEFAULT 0,
  grade VARCHAR(2), -- 'A+', 'A', 'B+', 'B', 'C', 'F'
  time_spent_seconds INT DEFAULT 0,
  completed_at TIMESTAMPTZ,
  certificate_issued BOOLEAN DEFAULT FALSE,
  UNIQUE(user_email, lesson_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_section_progress_user ON section_progress(user_email);
CREATE INDEX IF NOT EXISTS idx_section_progress_status ON section_progress(status);
CREATE INDEX IF NOT EXISTS idx_video_watch_user ON video_watch_progress(user_email);
CREATE INDEX IF NOT EXISTS idx_activity_responses_user ON activity_responses(user_email);
CREATE INDEX IF NOT EXISTS idx_question_responses_user ON question_responses(user_email);
CREATE INDEX IF NOT EXISTS idx_lesson_completions_user ON lesson_completions(user_email);

-- Insert some default achievements
INSERT INTO achievements (name, description, icon, points_required, badge_color) VALUES
('First Steps', 'Complete your first lesson', '🎯', 100, 'green'),
('Video Watcher', 'Watch 10 videos completely', '📺', 1000, 'blue'),
('Quiz Master', 'Score 100% on 5 quizzes', '🏆', 500, 'gold'),
('Streak Champion', 'Complete lessons 7 days in a row', '🔥', 700, 'red'),
('Problem Solver', 'Solve 50 activities correctly', '💡', 500, 'yellow'),
('Perfect Score', 'Get 100% on any lesson', '⭐', 0, 'purple')
ON CONFLICT DO NOTHING;
