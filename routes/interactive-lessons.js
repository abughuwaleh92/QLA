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
    await fs.mkdir(dir, { recursive: true });
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
       ORDER BY created_at DESC 
       LIMIT 1`,
      [lessonId, studentEmail]
    );
    
    res.json({
      lesson,
      components: componentsResult.rows,
      progress: progressResult.rows[0] || null
    });
    
  } catch (error) {
    console.error('Error fetching lesson:', error);
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// Track video progress
router.post('/video-progress', express.json(), async (req, res) => {
  try {
    const {
      lessonId,
      componentId,
      currentTime,
      duration,
      percentWatched,
      completed
    } = req.body;
    
    await pool.query(
      `INSERT INTO video_progress 
       (lesson_id, component_id, user_email, current_time, duration, percent_watched, completed) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (lesson_id, component_id, user_email) 
       DO UPDATE SET 
         current_time = GREATEST(video_progress.current_time, EXCLUDED.current_time),
         percent_watched = GREATEST(video_progress.percent_watched, EXCLUDED.percent_watched),
         completed = video_progress.completed OR EXCLUDED.completed,
         updated_at = NOW()`,
      [lessonId, componentId, req.user?.email, currentTime, duration, percentWatched, completed]
    );
    
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
        correctAnswer: JSON.parse(q.correct_answer),
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
         (lesson_id, component_id, user_email, completed, score) 
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (lesson_id, component_id, user_email) 
         DO UPDATE SET completed = true, score = EXCLUDED.score`,
        [lessonId, componentId, req.user?.email, score]
      );
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
  try {
    const {
      lessonId,
      componentId,
      componentType,
      data
    } = req.body;
    
    await pool.query(
      `INSERT INTO component_progress 
       (lesson_id, component_id, user_email, completed, data) 
       VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (lesson_id, component_id, user_email) 
       DO UPDATE SET 
         completed = true,
         data = EXCLUDED.data,
         updated_at = NOW()`,
      [lessonId, componentId, req.user?.email, JSON.stringify(data || {})]
    );
    
    // Check if all components are complete
    const progressResult = await pool.query(
      `SELECT 
         (SELECT COUNT(*) FROM lesson_components WHERE lesson_id = $1) as total,
         (SELECT COUNT(*) FROM component_progress WHERE lesson_id = $1 AND user_email = $2 AND completed = true) as completed`,
      [lessonId, req.user?.email]
    );
    
    const { total, completed } = progressResult.rows[0];
    const lessonComplete = completed >= total;
    
    if (lessonComplete) {
      // Mark lesson as complete
      await pool.query(
        `INSERT INTO lesson_progress 
         (lesson_id, user_email, completed, completion_date) 
         VALUES ($1, $2, true, NOW())
         ON CONFLICT (lesson_id, user_email) 
         DO UPDATE SET 
           completed = true,
           completion_date = NOW()`,
        [lessonId, req.user?.email]
      );
    }
    
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
    console.error('Error completing component:', error);
    res.status(500).json({ error: 'Failed to complete component' });
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
           EXTRACT(EPOCH FROM (completion_date - created_at))/60 
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
             WHEN ca.answers::jsonb->>(cq.id::text - 
               (SELECT MIN(id) FROM component_questions WHERE lesson_id = $1)::text
             ) = cq.correct_answer::text 
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
    
    res.json({
      completion: completionResult.rows[0],
      checkpoint: checkpointResult.rows[0],
      video: videoResult.rows[0],
      questions: questionResult.rows
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
    
    let query = `
      SELECT 
        il.*,
        COUNT(DISTINCT lp.user_email) as student_count,
        AVG(CASE WHEN lp.completed THEN 100 ELSE 0 END) as completion_rate
      FROM interactive_lessons il
      LEFT JOIN lesson_progress lp ON lp.lesson_id = il.id
    `;
    
    const params = [];
    if (grade) {
      query += ' WHERE il.grade = $1';
      params.push(grade);
    }
    
    query += ' GROUP BY il.id ORDER BY il.grade, il.unit, il.created_at';
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching catalog:', error);
    res.status(500).json({ error: 'Failed to fetch catalog' });
  }
});

module.exports = router;
