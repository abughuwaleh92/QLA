const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL==='disable'?false:{ rejectUnauthorized:false } });

router.post('/event', express.json(), async (req,res)=>{
  try {
    const { lessonId, slide, total, extra } = req.body||{};
    await pool.query(`INSERT INTO progress_events (user_email, lesson_ref, slide, total, extra) VALUES ($1,$2,$3,$4,$5)`, [req.user?.email||null, String(lessonId||''), slide||null, total||null, extra?JSON.stringify(extra):null]);
    res.json({ ok:true });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.post('/complete', express.json(), async (req,res)=>{
  try {
    const { lessonId } = req.body;
    await pool.query(`INSERT INTO progress (user_email, lesson_ref, completed_at) VALUES ($1,$2,now())
                      ON CONFLICT (user_email, lesson_ref) DO UPDATE SET completed_at = EXCLUDED.completed_at`,
                      [req.user?.email||null, String(lessonId||'')]);
    res.json({ ok:true });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.get('/summary', async (req,res)=>{
  try {
    const user = req.user?.email||null;
    const { rows } = await pool.query(`SELECT COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed FROM progress WHERE user_email=$1`, [user]);
    res.json({ completed: parseInt(rows[0]?.completed||0) });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

// Progress for a class (teacher/admin)
router.get('/for-class', async (req,res)=>{
  try {
    const class_id = parseInt(req.query.class_id);
    const { rows } = await pool.query(`
      SELECT e.student_email AS email,
             COUNT(p.*) FILTER (WHERE p.completed_at IS NOT NULL) AS completed_lessons
      FROM enrollments e
      LEFT JOIN progress p ON p.user_email = e.student_email
      WHERE e.class_id=$1
      GROUP BY e.student_email
      ORDER BY email
    `, [class_id]);
    res.json(rows);
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

module.exports = router;
