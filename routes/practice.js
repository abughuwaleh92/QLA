// routes/practice.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
});

// Get available skills for practice
router.get('/skills', async (req, res) => {
  try {
    const { grade, unit } = req.query;
    let query = `
      SELECT 
        s.*,
        sm.mastery_level,
        sm.status,
        sm.questions_attempted,
        sm.questions_correct,
        sm.last_practiced,
        COUNT(DISTINCT pq.id) as available_questions
      FROM skills s
      LEFT JOIN skill_mastery sm ON s.id = sm.skill_id AND sm.user_email = $1
      LEFT JOIN practice_questions pq ON pq.skill_id = s.id
      WHERE 1=1
    `;
    
    const params = [req.user?.email];
    if (grade) {
      params.push(parseInt(grade));
      query += ` AND s.grade = $${params.length}`;
    }
    if (unit) {
      params.push(parseInt(unit));
      query += ` AND s.unit = $${params.length}`;
    }
    
    query += ` GROUP BY s.id, sm.mastery_level, sm.status, sm.questions_attempted, sm.questions_correct, sm.last_practiced
               ORDER BY s.grade, s.unit, s.order_index`;
    
    const { rows } = await pool.query(query, params);
    
    // Calculate progress percentages
    const skillsWithProgress = rows.map(skill => ({
      ...skill,
      mastery_level: skill.mastery_level || 0,
      progress_percentage: skill.mastery_level || 0,
      accuracy: skill.questions_attempted > 0 
        ? Math.round((skill.questions_correct / skill.questions_attempted) * 100)
        : 0,
      needsReview: skill.last_practiced && 
        new Date() - new Date(skill.last_practiced) > 7 * 24 * 60 * 60 * 1000 // 7 days
    }));
    
    res.json(skillsWithProgress);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Start a practice session
router.post('/session/start', express.json(), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { skill_id, session_type = 'targeted', num_questions = 10 } = req.body;
    const userEmail = req.user?.email;
    
    // Create practice session
    const sessionResult = await client.query(
      `INSERT INTO practice_sessions (user_email, skill_id, session_type)
       VALUES ($1, $2, $3) RETURNING id`,
      [userEmail, skill_id || null, session_type]
    );
    
    const sessionId = sessionResult.rows[0].id;
    
    // Get questions based on session type
    let questions = [];
    
    if (session_type === 'targeted' && skill_id) {
      // Get questions for specific skill, ordered by difficulty
      const questionsResult = await client.query(
        `SELECT pq.*, s.name as skill_name
         FROM practice_questions pq
         JOIN skills s ON s.id = pq.skill_id
         WHERE pq.skill_id = $1
         ORDER BY pq.difficulty_level, RANDOM()
         LIMIT $2`,
        [skill_id, num_questions]
      );
      questions = questionsResult.rows;
      
    } else if (session_type === 'mixed') {
      // Get questions from multiple skills the student is learning
      const questionsResult = await client.query(
        `SELECT DISTINCT pq.*, s.name as skill_name
         FROM practice_questions pq
         JOIN skills s ON s.id = pq.skill_id
         JOIN skill_mastery sm ON sm.skill_id = pq.skill_id
         WHERE sm.user_email = $1 
           AND sm.status IN ('learning', 'practiced')
         ORDER BY RANDOM()
         LIMIT $2`,
        [userEmail, num_questions]
      );
      questions = questionsResult.rows;
      
    } else if (session_type === 'review') {
      // Get questions from skills that need review
      const questionsResult = await client.query(
        `SELECT DISTINCT pq.*, s.name as skill_name
         FROM practice_questions pq
         JOIN skills s ON s.id = pq.skill_id
         JOIN skill_mastery sm ON sm.skill_id = pq.skill_id
         WHERE sm.user_email = $1 
           AND (sm.last_practiced < NOW() - INTERVAL '7 days' OR sm.mastery_level < 70)
         ORDER BY sm.last_practiced ASC, RANDOM()
         LIMIT $2`,
        [userEmail, num_questions]
      );
      questions = questionsResult.rows;
      
    } else if (session_type === 'adaptive') {
      // Adaptive: mix of review, current level, and slight challenge
      const adaptiveResult = await client.query(
        `WITH user_skills AS (
           SELECT skill_id, mastery_level
           FROM skill_mastery
           WHERE user_email = $1
         )
         SELECT pq.*, s.name as skill_name
         FROM practice_questions pq
         JOIN skills s ON s.id = pq.skill_id
         LEFT JOIN user_skills us ON us.skill_id = pq.skill_id
         WHERE 
           -- Include questions matching user's level
           (us.mastery_level IS NOT NULL AND 
            pq.difficulty_level BETWEEN 
              GREATEST(1, (us.mastery_level / 20)::int - 1) AND 
              LEAST(5, (us.mastery_level / 20)::int + 1))
           OR
           -- Include new skills at easy level
           (us.mastery_level IS NULL AND pq.difficulty_level <= 2)
         ORDER BY 
           CASE 
             WHEN us.mastery_level IS NULL THEN 0
             ELSE ABS(pq.difficulty_level - (us.mastery_level / 20)::int)
           END,
           RANDOM()
         LIMIT $2`,
        [userEmail, num_questions]
      );
      questions = adaptiveResult.rows;
    }
    
    await client.query('COMMIT');
    
    res.json({
      session_id: sessionId,
      session_type,
      questions: questions.map(q => ({
        id: q.id,
        skill_id: q.skill_id,
        skill_name: q.skill_name,
        question_type: q.question_type,
        question_text: q.question_text,
        question_data: q.question_data,
        hints: q.hints,
        difficulty_level: q.difficulty_level,
        points: q.points,
        estimated_time: q.estimated_time_seconds
      })),
      total_questions: questions.length
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error starting practice session:', error);
    res.status(500).json({ error: 'Failed to start practice session' });
  } finally {
    client.release();
  }
});

// Submit answer for a practice question
router.post('/answer', express.json(), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      session_id,
      question_id,
      user_answer,
      hints_used = 0,
      time_taken_seconds,
      confidence_level
    } = req.body;
    
    const userEmail = req.user?.email;
    
    // Get question details and check answer
    const questionResult = await client.query(
      `SELECT * FROM practice_questions WHERE id = $1`,
      [question_id]
    );
    
    if (questionResult.rows.length === 0) {
      throw new Error('Question not found');
    }
    
    const question = questionResult.rows[0];
    const correctAnswer = question.correct_answer;
    
    // Check if answer is correct based on question type
    let isCorrect = false;
    
    if (question.question_type === 'mcq' || question.question_type === 'true_false') {
      isCorrect = JSON.stringify(user_answer) === JSON.stringify(correctAnswer);
    } else if (question.question_type === 'numeric') {
      const tolerance = correctAnswer.tolerance || 0.01;
      const userNum = parseFloat(user_answer);
      const correctNum = parseFloat(correctAnswer.value);
      isCorrect = Math.abs(userNum - correctNum) <= tolerance;
    } else if (question.question_type === 'multi_select') {
      const userSet = new Set(user_answer || []);
      const correctSet = new Set(correctAnswer || []);
      isCorrect = userSet.size === correctSet.size && 
                  [...userSet].every(item => correctSet.has(item));
    } else if (question.question_type === 'text') {
      const normalizedUser = (user_answer || '').toLowerCase().trim();
      const acceptedAnswers = correctAnswer.accepted || [correctAnswer.value];
      isCorrect = acceptedAnswers.some(ans => 
        normalizedUser === (ans || '').toLowerCase().trim()
      );
    }
    
    // Record the attempt
    await client.query(
      `INSERT INTO practice_attempts 
       (session_id, question_id, user_email, skill_id, user_answer, is_correct, 
        hints_used, time_taken_seconds, confidence_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [session_id, question_id, userEmail, question.skill_id, 
       JSON.stringify(user_answer), isCorrect, hints_used, 
       time_taken_seconds, confidence_level]
    );
    
    // Update skill mastery using the function
    const masteryResult = await client.query(
      `SELECT update_skill_mastery($1, $2, $3, $4) as new_mastery`,
      [userEmail, question.skill_id, isCorrect, time_taken_seconds]
    );
    
    const newMastery = masteryResult.rows[0].new_mastery;
    
    // Check for achievements
    const achievements = await checkAchievements(client, userEmail, {
      isCorrect,
      hintsUsed: hints_used,
      timeSpent: time_taken_seconds,
      skillId: question.skill_id,
      sessionId: session_id
    });
    
    // Log analytics event
    await client.query(
      `INSERT INTO practice_analytics 
       (user_email, event_type, skill_id, question_id, session_id, event_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userEmail, 'answer_submitted', question.skill_id, question_id, session_id,
       JSON.stringify({ is_correct: isCorrect, hints_used, time_taken_seconds })]
    );
    
    await client.query('COMMIT');
    
    res.json({
      is_correct: isCorrect,
      correct_answer: correctAnswer,
      solution_steps: question.solution_steps,
      new_mastery_level: newMastery,
      points_earned: isCorrect ? question.points : 0,
      achievements_earned: achievements
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  } finally {
    client.release();
  }
});

// End practice session
router.post('/session/end', express.json(), async (req, res) => {
  try {
    const { session_id } = req.body;
    const userEmail = req.user?.email;
    
    // Calculate session statistics
    const statsResult = await pool.query(
      `SELECT 
         COUNT(*) as questions_attempted,
         SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as questions_correct,
         AVG(time_taken_seconds) as avg_time,
         SUM(time_taken_seconds) as total_time
       FROM practice_attempts
       WHERE session_id = $1 AND user_email = $2`,
      [session_id, userEmail]
    );
    
    const stats = statsResult.rows[0];
    const accuracy = stats.questions_attempted > 0 
      ? (stats.questions_correct / stats.questions_attempted * 100) 
      : 0;
    
    // Update session record
    await pool.query(
      `UPDATE practice_sessions
       SET ended_at = NOW(),
           questions_attempted = $2,
           questions_correct = $3,
           average_time_per_question = $4,
           session_score = $5
       WHERE id = $1`,
      [session_id, stats.questions_attempted, stats.questions_correct, 
       stats.avg_time, accuracy]
    );
    
    // Get mastery changes for this session
    const masteryChanges = await pool.query(
      `SELECT DISTINCT
         s.name as skill_name,
         sm.mastery_level,
         sm.status
       FROM practice_attempts pa
       JOIN skills s ON s.id = pa.skill_id
       JOIN skill_mastery sm ON sm.skill_id = pa.skill_id AND sm.user_email = pa.user_email
       WHERE pa.session_id = $1 AND pa.user_email = $2`,
      [session_id, userEmail]
    );
    
    res.json({
      session_stats: {
        questions_attempted: parseInt(stats.questions_attempted),
        questions_correct: parseInt(stats.questions_correct),
        accuracy: Math.round(accuracy),
        total_time_seconds: parseInt(stats.total_time),
        average_time_per_question: Math.round(stats.avg_time)
      },
      skill_progress: masteryChanges.rows
    });
    
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Get student progress dashboard
router.get('/progress', async (req, res) => {
  try {
    const userEmail = req.user?.email;
    
    // Overall statistics
    const overallStats = await pool.query(
      `SELECT 
         COUNT(DISTINCT skill_id) as total_skills_practiced,
         COUNT(DISTINCT CASE WHEN status = 'mastered' THEN skill_id END) as skills_mastered,
         SUM(questions_attempted) as total_questions,
         SUM(questions_correct) as correct_questions,
         SUM(time_spent_seconds) / 3600.0 as total_hours
       FROM skill_mastery
       WHERE user_email = $1`,
      [userEmail]
    );
    
    // Skills by status
    const skillsByStatus = await pool.query(
      `SELECT 
         s.grade,
         s.unit,
         s.name,
         sm.status,
         sm.mastery_level,
         sm.last_practiced
       FROM skill_mastery sm
       JOIN skills s ON s.id = sm.skill_id
       WHERE sm.user_email = $1
       ORDER BY s.grade, s.unit, s.order_index`,
      [userEmail]
    );
    
    // Recent achievements
    const achievements = await pool.query(
      `SELECT 
         ad.*,
         sa.earned_at
       FROM student_achievements sa
       JOIN achievement_definitions ad ON ad.id = sa.achievement_id
       WHERE sa.user_email = $1
       ORDER BY sa.earned_at DESC
       LIMIT 10`,
      [userEmail]
    );
    
    // Learning streak
    const streakResult = await pool.query(
      `WITH daily_practice AS (
         SELECT DATE(created_at) as practice_date
         FROM practice_attempts
         WHERE user_email = $1
         GROUP BY DATE(created_at)
         ORDER BY practice_date DESC
       )
       SELECT 
         COUNT(*) FILTER (WHERE practice_date >= CURRENT_DATE - INTERVAL '6 days') as current_streak,
         COUNT(*) as total_days_practiced
       FROM daily_practice`,
      [userEmail]
    );
    
    // Units progress
    const unitsProgress = await pool.query(
      `SELECT 
         s.grade,
         s.unit,
         COUNT(DISTINCT s.id) as total_skills,
         COUNT(DISTINCT CASE WHEN sm.status = 'mastered' THEN s.id END) as mastered_skills,
         AVG(COALESCE(sm.mastery_level, 0)) as avg_mastery
       FROM skills s
       LEFT JOIN skill_mastery sm ON sm.skill_id = s.id AND sm.user_email = $1
       GROUP BY s.grade, s.unit
       ORDER BY s.grade, s.unit`,
      [userEmail]
    );
    
    res.json({
      overall_stats: overallStats.rows[0],
      skills_progress: skillsByStatus.rows,
      achievements: achievements.rows,
      streak: streakResult.rows[0],
      units_progress: unitsProgress.rows.map(unit => ({
        ...unit,
        completion_percentage: unit.total_skills > 0 
          ? Math.round((unit.mastered_skills / unit.total_skills) * 100)
          : 0
      }))
    });
    
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Get learning recommendations
router.get('/recommendations', async (req, res) => {
  try {
    const userEmail = req.user?.email;
    
    // Get skills that need review
    const reviewNeeded = await pool.query(
      `SELECT 
         s.*,
         sm.mastery_level,
         sm.last_practiced,
         'review' as recommendation_type
       FROM skill_mastery sm
       JOIN skills s ON s.id = sm.skill_id
       WHERE sm.user_email = $1
         AND sm.status != 'mastered'
         AND (sm.last_practiced < NOW() - INTERVAL '7 days' 
              OR sm.mastery_level < 50)
       ORDER BY sm.last_practiced ASC
       LIMIT 5`,
      [userEmail]
    );
    
    // Get next skills to learn (prerequisites met)
    const nextSkills = await pool.query(
      `WITH mastered_skills AS (
         SELECT skill_id
         FROM skill_mastery
         WHERE user_email = $1 AND status = 'mastered'
       )
       SELECT s.*, 'next' as recommendation_type
       FROM skills s
       WHERE s.id NOT IN (
         SELECT skill_id FROM skill_mastery WHERE user_email = $1
       )
       AND (
         s.prerequisite_skills IS NULL 
         OR s.prerequisite_skills = '[]'::jsonb
         OR NOT EXISTS (
           SELECT 1 
           FROM jsonb_array_elements(s.prerequisite_skills) AS prereq
           WHERE prereq::int NOT IN (SELECT skill_id FROM mastered_skills)
         )
       )
       ORDER BY s.grade, s.unit, s.order_index
       LIMIT 5`,
      [userEmail]
    );
    
    // Get challenge skills (for high performers)
    const challengeSkills = await pool.query(
      `SELECT 
         s.*,
         'challenge' as recommendation_type
       FROM skills s
       WHERE s.id NOT IN (
         SELECT skill_id FROM skill_mastery WHERE user_email = $1
       )
       AND EXISTS (
         SELECT 1 FROM practice_questions pq 
         WHERE pq.skill_id = s.id AND pq.difficulty_level >= 4
       )
       ORDER BY s.grade DESC, s.unit DESC
       LIMIT 3`,
      [userEmail]
    );
    
    res.json({
      review_needed: reviewNeeded.rows,
      next_skills: nextSkills.rows,
      challenge_skills: challengeSkills.rows
    });
    
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// Helper function to check achievements
async function checkAchievements(client, userEmail, context) {
  const earnedAchievements = [];
  
  try {
    // Check first practice achievement
    if (context.sessionId) {
      const firstPractice = await client.query(
        `SELECT COUNT(*) as count FROM practice_sessions WHERE user_email = $1`,
        [userEmail]
      );
      
      if (firstPractice.rows[0].count === 1) {
        await client.query(
          `INSERT INTO student_achievements (user_email, achievement_id)
           SELECT $1, id FROM achievement_definitions WHERE name = 'first_practice'
           ON CONFLICT DO NOTHING`,
          [userEmail]
        );
        earnedAchievements.push('First Steps');
      }
    }
    
    // Check accuracy streak
    if (context.isCorrect) {
      const streakResult = await client.query(
        `SELECT current_streak FROM skill_mastery 
         WHERE user_email = $1 AND skill_id = $2`,
        [userEmail, context.skillId]
      );
      
      const streak = streakResult.rows[0]?.current_streak || 0;
      
      if (streak === 20) {
        await client.query(
          `INSERT INTO student_achievements (user_email, achievement_id)
           SELECT $1, id FROM achievement_definitions WHERE name = 'accuracy_ace'
           ON CONFLICT DO NOTHING`,
          [userEmail]
        );
        earnedAchievements.push('Accuracy Ace');
      }
    }
    
    // Check speed achievement
    if (context.isCorrect && context.timeSpent < 30) {
      const speedResult = await client.query(
        `SELECT COUNT(*) as count
         FROM practice_attempts
         WHERE user_email = $1 
           AND is_correct = true 
           AND time_taken_seconds < 30
           AND created_at > NOW() - INTERVAL '24 hours'`,
        [userEmail]
      );
      
      if (speedResult.rows[0].count >= 10) {
        await client.query(
          `INSERT INTO student_achievements (user_email, achievement_id)
           SELECT $1, id FROM achievement_definitions WHERE name = 'speed_demon'
           ON CONFLICT DO NOTHING`,
          [userEmail]
        );
        earnedAchievements.push('Speed Demon');
      }
    }
    
  } catch (error) {
    console.error('Error checking achievements:', error);
  }
  
  return earnedAchievements;
}

module.exports = router;
