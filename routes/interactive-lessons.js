// routes/interactive-lessons.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false } 
});

// Video upload configuration
const videoStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'lesson-videos');
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const videoUpload = multer({ 
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp4|webm|ogg|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
});

// Create interactive lesson
router.post('/create', express.json({ limit: '10mb' }), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      title,
      grade,
      unit,
      objectives,
      duration,
      difficulty,
      components
    } = req.body;
    
    // Create main lesson entry
    const lessonResult = await client.query(
      `INSERT INTO interactive_lessons 
       (title, grade, unit, objectives, duration_minutes, difficulty, created_by, structure) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id`,
      [title, grade, unit, objectives, duration, difficulty, req.user?.email || 'system', JSON.stringify(components)]
    );
    
    const lessonId = lessonResult.rows[0].id;
    
    // Process each component
    for (const component of components) {
      await client.query(
        `INSERT INTO lesson_components 
         (lesson_id, type, order_index, title, data, settings) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          lessonId,
          component.type,
          components.indexOf(component),
          component.data.title,
          JSON.stringify(component.data),
          JSON.stringify(component.settings || {})
        ]
      );
      
      // If checkpoint or assessment, create questions
      if (component.type === 'checkpoint' || component.type === 'assessment') {
        for (const question of (component.data.questions || [])) {
          await client.query(
            `INSERT INTO component_questions 
             (lesson_id, component_type, question, options, correct_answer, points, explanation) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              lessonId,
              component.type,
              question.question,
              JSON.stringify(question.options || []),
              JSON.stringify(question.correct),
              question.points || 1,
              question.explanation || null
            ]
          );
        }
      }
    }
    
    // Create notification for new lesson
    await client.query(
      `INSERT INTO notifications 
       (user_email, type, title, message, data) 
       SELECT student_email, 'new_lesson', $1, $2, $3
       FROM enrollments 
       WHERE class_id IN (SELECT id FROM classes WHERE grade = $4)`,
      [
        'New Interactive Lesson Available',
        `${title} is now available for Grade ${grade}`,
        JSON.stringify({ lessonId, grade, unit }),
        grade
      ]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      lessonId,
      message: 'Interactive lesson created successfully'
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating lesson:', error);
    res.status(500).json({ error: 'Failed to create lesson' });
  } finally {
    client.release();
  }
});

// Upload video for lesson
router.post('/upload-video', videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }
    
    const videoUrl = `/uploads/lesson-videos/${req.file.filename}`;
    
    // Store video metadata
    await pool.query(
      `INSERT INTO lesson_videos 
       (filename, url, size_bytes, duration_seconds, uploaded_by) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, url`,
      [
        req.file.filename,
        videoUrl,
        req.file.size,
        req.body.duration || null,
        req.user?.email || 'system'
      ]
    );
    
    res.json({ 
      success: true,
      url: videoUrl,
      filename: req.file.filename
    });
    
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

// Get interactive lesson for student
router.get('/lesson/:id', async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);
    const studentEmail = req.user?.email;
    
    // Get lesson data
    const lessonResult = await pool.query(
      `SELECT l.*, 
              (SELECT COUNT(*) FROM lesson_progress WHERE lesson_id = l.id AND user_email = $2) as attempts
       FROM interactive_lessons l 
       WHERE l.id = $1`,
      [lessonId, studentEmail]
    );
    
    if (lessonResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    const lesson = lessonResult.rows[0];
    
    // Get components
    const componentsResult = await pool.query(
      `SELECT * FROM lesson_components 
       WHERE lesson_id = $1 
       ORDER BY order_index`,
      [lessonId]
    );
    
    // Get student progress
    const progressResult = await pool.query(
      `SELECT * FROM lesson_progress 
       WHERE lesson_id = $1 AND user_email = $2 
       ORDER BY started_at DESC 
       LIMIT 1`,
      [lessonId, studentEmail]
    );
    
    // Get component progress
    const componentProgressResult = await pool.query(
      `SELECT * FROM component_progress 
       WHERE lesson_id = $1 AND user_email = $2`,
      [lessonId, studentEmail]
    );
    
    // Track lesson access
    await pool.query(
      `INSERT INTO lesson_progress 
       (lesson_id, user_email, started_at, last_accessed) 
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (lesson_id, user_email) 
       DO UPDATE SET last_accessed = NOW()`,
      [lessonId, studentEmail]
    );
    
    // Log activity
    await pool.query(
      `INSERT INTO activity_logs 
       (user_email, action, entity_type, entity_id, metadata) 
       VALUES ($1, $2, $3, $4, $5)`,
      [studentEmail, 'view_lesson', 'interactive_lesson', lessonId, JSON.stringify({ timestamp: Date.now() })]
    );
    
    res.json({
      lesson,
      components: componentsResult.rows,
      progress: progressResult.rows[0] || null,
      componentProgress: componentProgressResult.rows
    });
    
  } catch (error) {
    console.error('Error fetching lesson:', error);
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// Track video progress (fixed column names)
router.post('/video-progress', express.json(), async (req, res) => {
  try {
    const {
      lessonId,
      componentId,
      watchTime,
      duration,
      percentWatched,
      completed,
      segments
    } = req.body;
    
    await pool.query(
      `INSERT INTO video_progress 
       (lesson_id, component_id, user_email, watch_time, total_duration, percent_watched, completed, watched_segments) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (lesson_id, component_id, user_email) 
       DO UPDATE SET 
         watch_time = GREATEST(video_progress.watch_time, EXCLUDED.watch_time),
         percent_watched = GREATEST(video_progress.percent_watched, EXCLUDED.percent_watched),
         completed = video_progress.completed OR EXCLUDED.completed,
         watched_segments = COALESCE(video_progress.watched_segments, '[]'::jsonb) || COALESCE(EXCLUDED.watched_segments, '[]'::jsonb),
         updated_at = NOW()`,
      [lessonId, componentId, req.user?.email, watchTime, duration, percentWatched, completed, JSON.stringify(segments || [])]
    );
    
    // Check if video watching requirement is met
    if (percentWatched >= 90 && !completed) {
      await pool.query(
        `UPDATE component_progress 
         SET completed = true, completed_at = NOW() 
         WHERE lesson_id = $1 AND component_id = $2 AND user_email = $3`,
        [lessonId, componentId, req.user?.email]
      );
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error tracking video progress:', error);
    res.status(500).json({ error: 'Failed to track progress' });
  }
});

// Submit checkpoint answers
router.post('/checkpoint', express.json(), async (req, res) => {
  try {
    const {
      lessonId,
      componentId,
      answers,
      timeSpent
    } = req.body;
    
    // Validate answers
    const questionsResult = await pool.query(
      `SELECT * FROM component_questions 
       WHERE lesson_id = $1 AND component_type = 'checkpoint' 
       ORDER BY id`,
      [lessonId]
    );
    
    const questions = questionsResult.rows;
    let correctCount = 0;
    let totalPoints = 0;
    let earnedPoints = 0;
    
    const feedback = questions.map((q, index) => {
      const userAnswer = answers[index];
      const correctAnswer = JSON.parse(q.correct_answer);
      const correct = JSON.stringify(userAnswer) === q.correct_answer;
      
      totalPoints += q.points;
      if (correct) {
        correctCount++;
        earnedPoints += q.points;
      }
      
      return {
        questionId: q.id,
        correct,
        userAnswer,
        correctAnswer,
        explanation: q.explanation
      };
    });
    
    const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const passed = score >= 100; // Checkpoints require 100%
    
    // Store attempt
    await pool.query(
      `INSERT INTO checkpoint_attempts 
       (lesson_id, component_id, user_email, answers, score, passed, time_spent_seconds) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [lessonId, componentId, req.user?.email, JSON.stringify(answers), score, passed, timeSpent]
    );
    
    // Update component progress if passed
    if (passed) {
      await pool.query(
        `INSERT INTO component_progress 
         (lesson_id, component_id, user_email, completed, score, completed_at) 
         VALUES ($1, $2, $3, true, $4, NOW())
         ON CONFLICT (lesson_id, component_id, user_email) 
         DO UPDATE SET 
           completed = true, 
           score = EXCLUDED.score,
           completed_at = NOW()`,
        [lessonId, componentId, req.user?.email, score]
      );
      
      // Check for achievement
      await checkAchievements(req.user?.email, 'checkpoint_perfect', { lessonId, componentId });
    }
    
    res.json({
      passed,
      score,
      feedback,
      correctCount,
      totalQuestions: questions.length
    });
    
  } catch (error) {
    console.error('Error submitting checkpoint:', error);
    res.status(500).json({ error: 'Failed to submit checkpoint' });
  }
});

// Complete component
router.post('/complete-component', express.json(), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      lessonId,
      componentId,
      componentType,
      data
    } = req.body;
    
    // Mark component as complete
    await client.query(
      `INSERT INTO component_progress 
       (lesson_id, component_id, user_email, completed, data, completed_at) 
       VALUES ($1, $2, $3, true, $4, NOW())
       ON CONFLICT (lesson_id, component_id, user_email) 
       DO UPDATE SET 
         completed = true,
         data = EXCLUDED.data,
         completed_at = NOW(),
         updated_at = NOW()`,
      [lessonId, componentId, req.user?.email, JSON.stringify(data || {})]
    );
    
    // Check if all components are complete
    const progressResult = await client.query(
      `SELECT 
         (SELECT COUNT(*) FROM lesson_components WHERE lesson_id = $1) as total,
         (SELECT COUNT(*) FROM component_progress WHERE lesson_id = $1 AND user_email = $2 AND completed = true) as completed`,
      [lessonId, req.user?.email]
    );
    
    const { total, completed } = progressResult.rows[0];
    const lessonComplete = completed >= total;
    
    if (lessonComplete) {
      // Calculate final score
      const scoreResult = await client.query(
        `SELECT AVG(score) as avg_score 
         FROM component_progress 
         WHERE lesson_id = $1 AND user_email = $2 AND score IS NOT NULL`,
        [lessonId, req.user?.email]
      );
      
      const finalScore = scoreResult.rows[0].avg_score || 0;
      
      // Mark lesson as complete
      await client.query(
        `UPDATE lesson_progress 
         SET completed = true, 
             completion_date = NOW(), 
             score = $3
         WHERE lesson_id = $1 AND user_email = $2`,
        [lessonId, req.user?.email, finalScore]
      );
      
      // Update learning streak
      await updateLearningStreak(req.user?.email);
      
      // Check for achievements
      await checkAchievements(req.user?.email, 'lesson_complete', { lessonId, score: finalScore });
      
      // Create completion notification
      await client.query(
        `INSERT INTO notifications 
         (user_email, type, title, message, data) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user?.email,
          'lesson_complete',
          'Lesson Completed!',
          `Congratulations! You've completed the lesson with a score of ${Math.round(finalScore)}%`,
          JSON.stringify({ lessonId, score: finalScore })
        ]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      componentComplete: true,
      lessonComplete,
      progress: {
        completed,
        total
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error completing component:', error);
    res.status(500).json({ error: 'Failed to complete component' });
  } finally {
    client.release();
  }
});

// Get student analytics for a lesson
router.get('/analytics/:lessonId', async (req, res) => {
  try {
    const lessonId = parseInt(req.params.lessonId);
    const isTeacher = req.user?.role === 'teacher' || req.user?.role === 'admin';
    
    if (!isTeacher) {
      return res.status(403).json({ error: 'Teacher access required' });
    }
    
    // Get completion stats
    const completionResult = await pool.query(
      `SELECT 
         COUNT(DISTINCT user_email) as total_students,
         COUNT(DISTINCT CASE WHEN completed THEN user_email END) as completed_students,
         AVG(CASE WHEN completed THEN 
           EXTRACT(EPOCH FROM (completion_date - started_at))/60 
         END) as avg_completion_time_minutes
       FROM lesson_progress 
       WHERE lesson_id = $1`,
      [lessonId]
    );
    
    // Get checkpoint performance
    const checkpointResult = await pool.query(
      `SELECT 
         AVG(score) as avg_score,
         COUNT(*) as total_attempts,
         SUM(CASE WHEN passed THEN 1 ELSE 0 END) as passed_attempts,
         AVG(time_spent_seconds) as avg_time_seconds
       FROM checkpoint_attempts 
       WHERE lesson_id = $1`,
      [lessonId]
    );
    
    // Get video engagement
    const videoResult = await pool.query(
      `SELECT 
         AVG(percent_watched) as avg_percent_watched,
         COUNT(DISTINCT user_email) as unique_viewers,
         SUM(CASE WHEN completed THEN 1 ELSE 0 END) as full_completions
       FROM video_progress 
       WHERE lesson_id = $1`,
      [lessonId]
    );
    
    // Get per-question analytics
    const questionResult = await pool.query(
      `SELECT 
         cq.question,
         cq.id,
         COUNT(DISTINCT ca.user_email) as attempts,
         AVG(
           CASE 
             WHEN (ca.answers::jsonb->>((cq.id - 
               (SELECT MIN(id) FROM component_questions WHERE lesson_id = $1))::text))::jsonb = cq.correct_answer::jsonb
             THEN 100 ELSE 0 
           END
         ) as success_rate
       FROM component_questions cq
       LEFT JOIN checkpoint_attempts ca ON ca.lesson_id = cq.lesson_id
       WHERE cq.lesson_id = $1
       GROUP BY cq.id, cq.question
       ORDER BY cq.id`,
      [lessonId]
    );
    
    // Get student performance distribution
    const distributionResult = await pool.query(
      `SELECT 
         CASE 
           WHEN score >= 90 THEN 'A'
           WHEN score >= 80 THEN 'B'
           WHEN score >= 70 THEN 'C'
           WHEN score >= 60 THEN 'D'
           ELSE 'F'
         END as grade,
         COUNT(*) as count
       FROM lesson_progress
       WHERE lesson_id = $1 AND completed = true
       GROUP BY grade
       ORDER BY grade`,
      [lessonId]
    );
    
    res.json({
      completion: completionResult.rows[0],
      checkpoint: checkpointResult.rows[0],
      video: videoResult.rows[0],
      questions: questionResult.rows,
      gradeDistribution: distributionResult.rows
    });
    
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get all interactive lessons for catalog
router.get('/catalog', async (req, res) => {
  try {
    const grade = req.query.grade ? parseInt(req.query.grade) : null;
    const studentEmail = req.user?.email;
    
    let query = `
      SELECT 
        il.*,
        COUNT(DISTINCT lp.user_email) as student_count,
        AVG(CASE WHEN lp.completed THEN 100 ELSE 0 END) as completion_rate,
        (SELECT completed FROM lesson_progress WHERE lesson_id = il.id AND user_email = $2) as user_completed,
        (SELECT score FROM lesson_progress WHERE lesson_id = il.id AND user_email = $2) as user_score
      FROM interactive_lessons il
      LEFT JOIN lesson_progress lp ON lp.lesson_id = il.id
    `;
    
    const params = [grade, studentEmail];
    if (grade) {
      query += ' WHERE il.grade = $1';
    } else {
      params.shift(); // Remove grade from params
      query = query.replace('$2', '$1'); // Adjust parameter placeholder
    }
    
    query += ' GROUP BY il.id ORDER BY il.grade, il.unit, il.created_at';
    
    const result = await pool.query(query, params.filter(p => p !== null));
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching catalog:', error);
    res.status(500).json({ error: 'Failed to fetch catalog' });
  }
});

// Get student's learning dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const studentEmail = req.user?.email;
    
    // Get overall stats
    const statsResult = await pool.query(
      `SELECT 
         COUNT(DISTINCT lesson_id) as lessons_started,
         COUNT(DISTINCT CASE WHEN completed THEN lesson_id END) as lessons_completed,
         AVG(CASE WHEN completed THEN score END) as avg_score,
         SUM(total_time_seconds) / 60 as total_time_minutes
       FROM lesson_progress 
       WHERE user_email = $1`,
      [studentEmail]
    );
    
    // Get recent activity
    const recentResult = await pool.query(
      `SELECT 
         il.title,
         il.id,
         lp.last_accessed,
         lp.completed,
         lp.score
       FROM lesson_progress lp
       JOIN interactive_lessons il ON il.id = lp.lesson_id
       WHERE lp.user_email = $1
       ORDER BY lp.last_accessed DESC
       LIMIT 5`,
      [studentEmail]
    );
    
    // Get learning streak
    const streakResult = await pool.query(
      `SELECT * FROM learning_streaks WHERE user_email = $1`,
      [studentEmail]
    );
    
    // Get achievements
    const achievements = streakResult.rows[0]?.achievements || [];
    
    res.json({
      stats: statsResult.rows[0],
      recentActivity: recentResult.rows,
      streak: streakResult.rows[0] || { current_streak: 0, longest_streak: 0 },
      achievements
    });
    
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// Helper function to update learning streak
async function updateLearningStreak(userEmail) {
  try {
    await pool.query(
      `INSERT INTO learning_streaks 
       (user_email, current_streak, longest_streak, last_activity_date, total_lessons_completed) 
       VALUES ($1, 1, 1, CURRENT_DATE, 1)
       ON CONFLICT (user_email) 
       DO UPDATE SET
         current_streak = CASE 
           WHEN learning_streaks.last_activity_date = CURRENT_DATE - INTERVAL '1 day' 
           THEN learning_streaks.current_streak + 1
           WHEN learning_streaks.last_activity_date < CURRENT_DATE - INTERVAL '1 day'
           THEN 1
           ELSE learning_streaks.current_streak
         END,
         longest_streak = GREATEST(
           learning_streaks.longest_streak,
           CASE 
             WHEN learning_streaks.last_activity_date = CURRENT_DATE - INTERVAL '1 day' 
             THEN learning_streaks.current_streak + 1
             ELSE 1
           END
         ),
         last_activity_date = CURRENT_DATE,
         total_lessons_completed = learning_streaks.total_lessons_completed + 1,
         updated_at = NOW()`,
      [userEmail]
    );
  } catch (error) {
    console.error('Error updating streak:', error);
  }
}

// Helper function to check achievements
async function checkAchievements(userEmail, type, data) {
  try {
    const achievements = [];
    
    if (type === 'checkpoint_perfect') {
      achievements.push({
        id: 'perfect_checkpoint',
        name: 'Perfect Checkpoint',
        description: 'Scored 100% on a checkpoint',
        icon: '🎯',
        earnedAt: new Date()
      });
    }
    
    if (type === 'lesson_complete' && data.score >= 90) {
      achievements.push({
        id: 'excellence',
        name: 'Excellence',
        description: 'Completed a lesson with 90% or higher',
        icon: '⭐',
        earnedAt: new Date()
      });
    }
    
    if (achievements.length > 0) {
      await pool.query(
        `UPDATE learning_streaks 
         SET achievements = achievements || $2::jsonb 
         WHERE user_email = $1`,
        [userEmail, JSON.stringify(achievements)]
      );
    }
  } catch (error) {
    console.error('Error checking achievements:', error);
  }
}

module.exports = router;
