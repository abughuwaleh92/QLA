// routes/teacher-practice.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const express = require('express');
const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
});
let cheerio;
try {
  cheerio = require('cheerio');
} catch (err) {
  console.warn('[teacher-practice] Optional dependency "cheerio" is missing. The HTML import route will be disabled until it is installed.');
}
// Get all skills for management
router.get('/skills', async (req, res) => {
  try {
    const { grade } = req.query;
    let query = `
      SELECT 
        s.*,
        COUNT(DISTINCT pq.id) as question_count,
        COUNT(DISTINCT pb.id) as bank_count,
        COUNT(DISTINCT sm.user_email) as students_practicing,
        AVG(sm.mastery_level) as avg_mastery
      FROM skills s
      LEFT JOIN practice_questions pq ON pq.skill_id = s.id
      LEFT JOIN practice_banks pb ON pb.skill_id = s.id
      LEFT JOIN skill_mastery sm ON sm.skill_id = s.id
      WHERE 1=1
    `;
    
    const params = [];
    if (grade) {
      params.push(parseInt(grade));
      query += ` AND s.grade = $${params.length}`;
    }
    
    query += ` GROUP BY s.id ORDER BY s.grade, s.unit, s.order_index`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
    
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Create or update skill
router.post('/skills', express.json(), async (req, res) => {
  try {
    const { name, description, grade, unit, order_index, prerequisite_skills } = req.body;
    
    const result = await pool.query(
      `INSERT INTO skills (name, description, grade, unit, order_index, prerequisite_skills)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description, grade, unit, order_index || 0, 
       JSON.stringify(prerequisite_skills || [])]
    );
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// Get question banks
router.get('/banks', async (req, res) => {
  try {
    const { skill_id } = req.query;
    let query = `
      SELECT 
        pb.*,
        s.name as skill_name,
        COUNT(pq.id) as question_count
      FROM practice_banks pb
      JOIN skills s ON s.id = pb.skill_id
      LEFT JOIN practice_questions pq ON pq.bank_id = pb.id
      WHERE pb.is_active = true
    `;
    
    const params = [];
    if (skill_id) {
      params.push(parseInt(skill_id));
      query += ` AND pb.skill_id = $${params.length}`;
    }
    
    query += ` GROUP BY pb.id, s.name ORDER BY pb.created_at DESC`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
    
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch question banks' });
  }
});

// Create question bank
router.post('/banks/:bankId/import-html', express.json({ limit: '2mb' }), async (req, res) => {
  if (!cheerio) {
    return res.status(501).json({
      error: 'html_import_disabled_missing_dependency',
      fix: 'Install cheerio in production: npm i cheerio && rebuild/redeploy'
    });
  }

  const client = await pool.connect();
  try {
    const bankId = Number(req.params.bankId);
    const { html } = req.body || {};
    if (!bankId || !html) return res.status(400).json({ error: 'missing_bank_or_html' });

    await client.query('BEGIN');

    const { rows: bankRows } = await client.query(
      'SELECT skill_id FROM practice_banks WHERE id = $1',
      [bankId]
    );
    if (!bankRows.length) throw new Error('bank_not_found');
    const skillId = bankRows[0].skill_id;

    const $ = cheerio.load(html);
    const inserts = [];

    $('.q').each((_, qel) => {
      const $q = $(qel);
      let question_type = String($q.attr('data-type') || 'mcq').trim();
      const prompt = $q.find('.prompt').first().text().trim();
      if (!prompt) return; // skip empty entries

      const options = $q.find('.options li').toArray().map(li => $(li).text().trim());
      const ansText = $q.find('.answer').first().text().trim();
      const hints  = $q.find('.hints div').toArray().map(d => $(d).text().trim()).filter(Boolean);
      const steps  = $q.find('.steps div').toArray().map(d => $(d).text().trim()).filter(Boolean);

      let question_data = {};
      let correct_answer = null;

      if (['mcq','true_false','multi_select'].includes(question_type)) {
        question_data.options = options;
        if (question_type === 'multi_select') {
          correct_answer = (ansText || '')
            .split(',')
            .map(s => Number(s.trim()))
            .filter(v => Number.isFinite(v));
        } else {
          const idx = Number(ansText);
          correct_answer = Number.isFinite(idx) ? idx : 0;
        }
      } else if (question_type === 'numeric') {
        correct_answer = { value: Number(ansText), tolerance: 0 };
      } else if (question_type === 'text') {
        correct_answer = { accept: [ansText] };
      } else {
        // fallback to MCQ
        question_type = 'mcq';
        question_data.options = options;
        const idx = Number(ansText);
        correct_answer = Number.isFinite(idx) ? idx : 0;
      }

      inserts.push(
        client.query(
          `INSERT INTO practice_questions
           (bank_id, skill_id, question_type, question_text, question_data, correct_answer,
            solution_steps, hints, difficulty_level, points)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            bankId,
            skillId,
            question_type,
            prompt,
            JSON.stringify(question_data),
            JSON.stringify(correct_answer),
            steps.length ? JSON.stringify(steps) : null,
            JSON.stringify(hints || []),
            3,
            10
          ]
        )
      );
    });

    await Promise.all(inserts);
    await client.query('COMMIT');
    res.json({ ok: true, inserted: inserts.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('HTML import failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});
// Get questions for a bank
router.get('/banks/:bankId/questions', async (req, res) => {
  try {
    const bankId = parseInt(req.params.bankId);
    
    const questions = await pool.query(
      `SELECT pq.*, s.name as skill_name
       FROM practice_questions pq
       JOIN skills s ON s.id = pq.skill_id
       WHERE pq.bank_id = $1
       ORDER BY pq.difficulty_level, pq.created_at`,
      [bankId]
    );
    
    res.json(questions.rows);
    
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});


// Create practice question
router.post('/questions', express.json(), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      bank_id,
      skill_id,
      question_type,
      question_text,
      question_data,
      correct_answer,
      solution_steps,
      hints,
      difficulty_level,
      points,
      estimated_time_seconds,
      tags
    } = req.body;
    
    // Validate question data
    if (!question_text || !correct_answer) {
      throw new Error('Question text and correct answer are required');
    }
    
    // Insert question
    const result = await client.query(
      `INSERT INTO practice_questions 
       (bank_id, skill_id, question_type, question_text, question_data, 
        correct_answer, solution_steps, hints, difficulty_level, points, 
        estimated_time_seconds, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [bank_id, skill_id, question_type, question_text, 
       JSON.stringify(question_data), JSON.stringify(correct_answer),
       solution_steps ? JSON.stringify(solution_steps) : null,
       hints ? JSON.stringify(hints) : '[]',
       difficulty_level || 3, points || 10,
       estimated_time_seconds || 60, tags || []]
    );
    
    await client.query('COMMIT');
    res.json(result.rows[0]);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating question:', error);
    res.status(500).json({ error: error.message || 'Failed to create question' });
  } finally {
    client.release();
  }
});

// Update question
router.put('/questions/:id', express.json(), async (req, res) => {
  try {
    const questionId = parseInt(req.params.id);
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    const allowedFields = [
      'question_text', 'question_data', 'correct_answer', 
      'solution_steps', 'hints', 'difficulty_level', 'points'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(
          typeof req.body[field] === 'object' 
            ? JSON.stringify(req.body[field]) 
            : req.body[field]
        );
        paramCount++;
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(questionId);
    
    const result = await pool.query(
      `UPDATE practice_questions 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete question
router.delete('/questions/:id', async (req, res) => {
  try {
    const questionId = parseInt(req.params.id);
    
    await pool.query('DELETE FROM practice_questions WHERE id = $1', [questionId]);
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Get class progress overview
router.get('/class-progress/:classCode', async (req, res) => {
  try {
    const classCode = req.params.classCode;
    
    // Get students in class
    const studentsResult = await pool.query(
      `SELECT e.student_email
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       WHERE c.code = $1`,
      [classCode]
    );
    
    const studentEmails = studentsResult.rows.map(r => r.student_email);
    
    if (studentEmails.length === 0) {
      return res.json({ students: [] });
    }
    
    // Get detailed progress for each student
    const progressResult = await pool.query(
      `SELECT 
         sm.user_email,
         s.grade,
         s.unit,
         s.name as skill_name,
         sm.mastery_level,
         sm.status,
         sm.questions_attempted,
         sm.questions_correct,
         sm.last_practiced,
         sm.time_spent_seconds
       FROM skill_mastery sm
       JOIN skills s ON s.id = sm.skill_id
       WHERE sm.user_email = ANY($1)
       ORDER BY sm.user_email, s.grade, s.unit, s.order_index`,
      [studentEmails]
    );
    
    // Get session statistics
    const sessionsResult = await pool.query(
      `SELECT 
         user_email,
         COUNT(*) as total_sessions,
         AVG(session_score) as avg_score,
         SUM(questions_attempted) as total_questions,
         SUM(questions_correct) as correct_questions
       FROM practice_sessions
       WHERE user_email = ANY($1) AND ended_at IS NOT NULL
       GROUP BY user_email`,
      [studentEmails]
    );
    
    // Get achievements
    const achievementsResult = await pool.query(
      `SELECT 
         sa.user_email,
         COUNT(*) as achievement_count,
         SUM(ad.points) as total_points
       FROM student_achievements sa
       JOIN achievement_definitions ad ON ad.id = sa.achievement_id
       WHERE sa.user_email = ANY($1)
       GROUP BY sa.user_email`,
      [studentEmails]
    );
    
    // Organize data by student
    const studentMap = new Map();
    
    // Initialize students
    studentEmails.forEach(email => {
      studentMap.set(email, {
        email,
        skills: [],
        overall_mastery: 0,
        total_time_hours: 0,
        sessions: { total: 0, avg_score: 0, accuracy: 0 },
        achievements: { count: 0, points: 0 }
      });
    });
    
    // Add skill progress
    progressResult.rows.forEach(row => {
      const student = studentMap.get(row.user_email);
      if (student) {
        student.skills.push({
          skill_name: row.skill_name,
          mastery_level: row.mastery_level,
          status: row.status,
          accuracy: row.questions_attempted > 0 
            ? Math.round((row.questions_correct / row.questions_attempted) * 100)
            : 0
        });
        student.total_time_hours += (row.time_spent_seconds || 0) / 3600;
      }
    });
    
    // Add session stats
    sessionsResult.rows.forEach(row => {
      const student = studentMap.get(row.user_email);
      if (student) {
        student.sessions = {
          total: parseInt(row.total_sessions),
          avg_score: Math.round(row.avg_score || 0),
          accuracy: row.total_questions > 0
            ? Math.round((row.correct_questions / row.total_questions) * 100)
            : 0
        };
      }
    });
    
    // Add achievements
    achievementsResult.rows.forEach(row => {
      const student = studentMap.get(row.user_email);
      if (student) {
        student.achievements = {
          count: parseInt(row.achievement_count),
          points: parseInt(row.total_points)
        };
      }
    });
    
    // Calculate overall mastery for each student
    studentMap.forEach(student => {
      if (student.skills.length > 0) {
        const totalMastery = student.skills.reduce((sum, skill) => 
          sum + skill.mastery_level, 0);
        student.overall_mastery = Math.round(totalMastery / student.skills.length);
      }
      student.total_time_hours = Math.round(student.total_time_hours * 10) / 10;
    });
    
    res.json({
      class_code: classCode,
      students: Array.from(studentMap.values())
    });
    
  } catch (error) {
    console.error('Error fetching class progress:', error);
    res.status(500).json({ error: 'Failed to fetch class progress' });
  }
});

// Get detailed student progress
router.get('/student-progress/:email', async (req, res) => {
  try {
    const studentEmail = req.params.email;
    
    // Get skill mastery details
    const skillsResult = await pool.query(
      `SELECT 
         s.*,
         sm.mastery_level,
         sm.status,
         sm.questions_attempted,
         sm.questions_correct,
         sm.current_streak,
         sm.best_streak,
         sm.last_practiced,
         sm.time_spent_seconds
       FROM skills s
       LEFT JOIN skill_mastery sm ON sm.skill_id = s.id AND sm.user_email = $1
       ORDER BY s.grade, s.unit, s.order_index`,
      [studentEmail]
    );
    
    // Get recent practice sessions
    const sessionsResult = await pool.query(
      `SELECT 
         ps.*,
         s.name as skill_name
       FROM practice_sessions ps
       LEFT JOIN skills s ON s.id = ps.skill_id
       WHERE ps.user_email = $1
       ORDER BY ps.started_at DESC
       LIMIT 20`,
      [studentEmail]
    );
    
    // Get recent attempts with details
    const attemptsResult = await pool.query(
      `SELECT 
         pa.*,
         pq.question_text,
         pq.difficulty_level,
         s.name as skill_name
       FROM practice_attempts pa
       JOIN practice_questions pq ON pq.id = pa.question_id
       JOIN skills s ON s.id = pa.skill_id
       WHERE pa.user_email = $1
       ORDER BY pa.created_at DESC
       LIMIT 50`,
      [studentEmail]
    );
    
    // Get achievements
    const achievementsResult = await pool.query(
      `SELECT 
         ad.*,
         sa.earned_at,
         sa.progress
       FROM student_achievements sa
       JOIN achievement_definitions ad ON ad.id = sa.achievement_id
       WHERE sa.user_email = $1
       ORDER BY sa.earned_at DESC`,
      [studentEmail]
    );
    
    // Get learning analytics
    const analyticsResult = await pool.query(
      `WITH daily_stats AS (
         SELECT 
           DATE(created_at) as practice_date,
           COUNT(DISTINCT session_id) as sessions,
           COUNT(*) as questions,
           SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
           AVG(time_taken_seconds) as avg_time
         FROM practice_attempts
         WHERE user_email = $1 
           AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)
       )
       SELECT * FROM daily_stats ORDER BY practice_date DESC`,
      [studentEmail]
    );
    
    res.json({
      student_email: studentEmail,
      skills: skillsResult.rows,
      recent_sessions: sessionsResult.rows,
      recent_attempts: attemptsResult.rows,
      achievements: achievementsResult.rows,
      daily_analytics: analyticsResult.rows
    });
    
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({ error: 'Failed to fetch student progress' });
  }
});

// Create assessment questions from practice questions
router.post('/create-assessment', express.json(), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { 
      lesson_id, 
      title, 
      pass_pct = 70,
      question_ids,
      skill_ids 
    } = req.body;
    
    const teacherEmail = req.user?.email;
    
    // Create question bank for assessment
    const bankResult = await client.query(
      `INSERT INTO question_banks (title, created_by)
       VALUES ($1, $2)
       RETURNING id`,
      [title, teacherEmail]
    );
    
    const bankId = bankResult.rows[0].id;
    
    // Copy practice questions to assessment questions
    if (question_ids && question_ids.length > 0) {
      for (const practiceQuestionId of question_ids) {
        const pqResult = await client.query(
          `SELECT * FROM practice_questions WHERE id = $1`,
          [practiceQuestionId]
        );
        
        if (pqResult.rows.length > 0) {
          const pq = pqResult.rows[0];
          
          await client.query(
            `INSERT INTO questions (bank_id, type, prompt, options, answer, points)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [bankId, pq.question_type, pq.question_text, 
             pq.question_data.options || null,
             pq.correct_answer, pq.points]
          );
        }
      }
    } else if (skill_ids && skill_ids.length > 0) {
      // Auto-select questions from skills
      const questionsResult = await client.query(
        `SELECT * FROM practice_questions 
         WHERE skill_id = ANY($1)
         ORDER BY difficulty_level, RANDOM()
         LIMIT 10`,
        [skill_ids]
      );
      
      for (const pq of questionsResult.rows) {
        await client.query(
          `INSERT INTO questions (bank_id, type, prompt, options, answer, points)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [bankId, pq.question_type, pq.question_text,
           pq.question_data.options || null,
           pq.correct_answer, pq.points]
        );
      }
    }
    
    // Create assessment
    const assessmentResult = await client.query(
      `INSERT INTO assessments (lesson_id, bank_id, title, pass_pct, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [lesson_id, bankId, title, pass_pct, teacherEmail]
    );
    
    await client.query('COMMIT');
    res.json(assessmentResult.rows[0]);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating assessment:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  } finally {
    client.release();
  }
});

// Get analytics summary
router.get('/analytics', async (req, res) => {
  try {
    const { start_date, end_date, class_code } = req.query;
    
    let studentFilter = '';
    const params = [];
    
    if (class_code) {
      const classResult = await pool.query(
        `SELECT e.student_email
         FROM enrollments e
         JOIN classes c ON c.id = e.class_id
         WHERE c.code = $1`,
        [class_code]
      );
      
      const emails = classResult.rows.map(r => r.student_email);
      if (emails.length > 0) {
        params.push(emails);
        studentFilter = ` AND user_email = ANY($${params.length})`;
      }
    }
    
    // Overall statistics
    const overallQuery = `
      SELECT 
        COUNT(DISTINCT user_email) as total_students,
        COUNT(DISTINCT skill_id) as skills_practiced,
        SUM(questions_attempted) as total_questions,
        SUM(questions_correct) as correct_questions,
        AVG(mastery_level) as avg_mastery,
        SUM(time_spent_seconds) / 3600.0 as total_hours
      FROM skill_mastery
      WHERE 1=1 ${studentFilter}
    `;
    
    const overallResult = await pool.query(overallQuery, params);
    
    // Most practiced skills
    const topSkillsQuery = `
      SELECT 
        s.name,
        COUNT(DISTINCT pa.user_email) as students,
        COUNT(pa.id) as attempts,
        AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END) as success_rate
      FROM practice_attempts pa
      JOIN skills s ON s.id = pa.skill_id
      WHERE 1=1 ${studentFilter.replace('user_email', 'pa.user_email')}
      GROUP BY s.id, s.name
      ORDER BY attempts DESC
      LIMIT 10
    `;
    
    const topSkillsResult = await pool.query(topSkillsQuery, params);
    
    // Struggling skills (lowest success rate)
    const strugglingQuery = `
      SELECT 
        s.name,
        AVG(sm.mastery_level) as avg_mastery,
        COUNT(DISTINCT sm.user_email) as students,
        AVG(CASE WHEN sm.questions_attempted > 0 
            THEN sm.questions_correct::float / sm.questions_attempted * 100 
            ELSE 0 END) as accuracy
      FROM skill_mastery sm
      JOIN skills s ON s.id = sm.skill_id
      WHERE sm.questions_attempted > 5 ${studentFilter.replace('user_email', 'sm.user_email')}
      GROUP BY s.id, s.name
      HAVING AVG(sm.mastery_level) < 50
      ORDER BY avg_mastery ASC
      LIMIT 10
    `;
    
    const strugglingResult = await pool.query(strugglingQuery, params);
    
    res.json({
      overall: overallResult.rows[0],
      top_skills: topSkillsResult.rows,
      struggling_skills: strugglingResult.rows
    });
    
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
