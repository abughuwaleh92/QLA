-- migrations/006_interactive_lessons.sql
-- Fixed Interactive Lessons System Tables

-- Main interactive lessons table
CREATE TABLE IF NOT EXISTS interactive_lessons (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  grade INT NOT NULL,
  unit INT NOT NULL,
  objectives TEXT,
  duration_minutes INT DEFAULT 30,
  difficulty VARCHAR(20) DEFAULT 'intermediate',
  structure JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lesson components (video, content, checkpoint, etc.)
CREATE TABLE IF NOT EXISTS lesson_components (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  order_index INT NOT NULL,
  title TEXT,
  data JSONB,
  settings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Component questions for checkpoints and assessments
CREATE TABLE IF NOT EXISTS component_questions (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
  component_type VARCHAR(50),
  question TEXT NOT NULL,
  question_type VARCHAR(20) DEFAULT 'multiple-choice',
  options JSONB,
  correct_answer JSONB,
  points INT DEFAULT 1,
  explanation TEXT,
  hints JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video metadata and tracking
CREATE TABLE IF NOT EXISTS lesson_videos (
  id SERIAL PRIMARY KEY,
  lesson_id INT REFERENCES interactive_lessons(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  size_bytes BIGINT,
  duration_seconds INT,
  transcript TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video progress tracking (fixed column names)
CREATE TABLE IF NOT EXISTS video_progress (
  lesson_id INT NOT NULL,
  component_id INT NOT NULL,
  user_email TEXT NOT NULL,
  watch_time FLOAT DEFAULT 0,
  total_duration FLOAT,
  percent_watched FLOAT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  watched_segments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (lesson_id, component_id, user_email)
);

-- Component progress tracking
CREATE TABLE IF NOT EXISTS component_progress (
  lesson_id INT NOT NULL,
  component_id INT NOT NULL,
  user_email TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  score FLOAT,
  data JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (lesson_id, component_id, user_email)
);

-- Checkpoint attempts
CREATE TABLE IF NOT EXISTS checkpoint_attempts (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL,
  component_id INT NOT NULL,
  user_email TEXT NOT NULL,
  answers JSONB NOT NULL,
  score FLOAT NOT NULL,
  passed BOOLEAN DEFAULT FALSE,
  time_spent_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Overall lesson progress
CREATE TABLE IF NOT EXISTS lesson_progress (
  lesson_id INT NOT NULL,
  user_email TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  completed BOOLEAN DEFAULT FALSE,
  completion_date TIMESTAMPTZ,
  total_time_seconds INT DEFAULT 0,
  current_component INT DEFAULT 0,
  score FLOAT,
  certificate_issued BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (lesson_id, user_email)
);

-- Interactive activity results
CREATE TABLE IF NOT EXISTS activity_results (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL,
  component_id INT NOT NULL,
  user_email TEXT NOT NULL,
  activity_type VARCHAR(50),
  result JSONB,
  score FLOAT,
  time_spent_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Practice problem attempts
CREATE TABLE IF NOT EXISTS practice_attempts (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL,
  component_id INT NOT NULL,
  user_email TEXT NOT NULL,
  problem_index INT NOT NULL,
  user_answer TEXT,
  is_correct BOOLEAN,
  hints_used INT DEFAULT 0,
  attempts INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student notes and bookmarks
CREATE TABLE IF NOT EXISTS student_notes (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  component_id INT,
  note_text TEXT,
  timestamp_seconds FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lesson ratings and feedback
CREATE TABLE IF NOT EXISTS lesson_feedback (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  difficulty_rating INT CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
  feedback_text TEXT,
  helpful_components TEXT[],
  confusing_components TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learning streaks and achievements
CREATE TABLE IF NOT EXISTS learning_streaks (
  user_email TEXT PRIMARY KEY,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_activity_date DATE,
  total_lessons_completed INT DEFAULT 0,
  total_time_minutes INT DEFAULT 0,
  achievements JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Classroom live session data
CREATE TABLE IF NOT EXISTS live_sessions (
  id SERIAL PRIMARY KEY,
  lesson_id INT REFERENCES interactive_lessons(id) ON DELETE CASCADE,
  class_code TEXT NOT NULL,
  teacher_email TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  current_component INT DEFAULT 0,
  student_count INT DEFAULT 0,
  session_data JSONB
);

-- Real-time student responses during live sessions
CREATE TABLE IF NOT EXISTS live_responses (
  id SERIAL PRIMARY KEY,
  session_id INT REFERENCES live_sessions(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL,
  component_id INT,
  response JSONB,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesson_components_lesson ON lesson_components(lesson_id);
CREATE INDEX IF NOT EXISTS idx_video_progress_user ON video_progress(user_email);
CREATE INDEX IF NOT EXISTS idx_component_progress_user ON component_progress(user_email);
CREATE INDEX IF NOT EXISTS idx_checkpoint_attempts_lesson ON checkpoint_attempts(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_email);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_completed ON lesson_progress(completed);
CREATE INDEX IF NOT EXISTS idx_activity_results_user ON activity_results(user_email);
CREATE INDEX IF NOT EXISTS idx_student_notes_user ON student_notes(user_email);

-- Create views for analytics
CREATE OR REPLACE VIEW lesson_completion_stats AS
SELECT 
  il.id,
  il.title,
  il.grade,
  il.unit,
  COUNT(DISTINCT lp.user_email) as total_students,
  COUNT(DISTINCT CASE WHEN lp.completed THEN lp.user_email END) as completed_students,
  AVG(CASE WHEN lp.completed THEN lp.total_time_seconds END) as avg_completion_time,
  AVG(CASE WHEN lp.completed THEN lp.score END) as avg_score
FROM interactive_lessons il
LEFT JOIN lesson_progress lp ON lp.lesson_id = il.id
GROUP BY il.id, il.title, il.grade, il.unit;

CREATE OR REPLACE VIEW student_performance AS
SELECT 
  lp.user_email,
  COUNT(DISTINCT lp.lesson_id) as lessons_started,
  COUNT(DISTINCT CASE WHEN lp.completed THEN lp.lesson_id END) as lessons_completed,
  AVG(lp.score) as avg_score,
  SUM(lp.total_time_seconds) / 60 as total_time_minutes,
  ls.current_streak,
  ls.longest_streak
FROM lesson_progress lp
LEFT JOIN learning_streaks ls ON ls.user_email = lp.user_email
GROUP BY lp.user_email, ls.current_streak, ls.longest_streak;
