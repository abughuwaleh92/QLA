const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL==='disable'?false:{ rejectUnauthorized:false } });

// Create/update assessment and bank
router.post('/', express.json({limit:'1mb'}), async (req,res)=>{
  try {
    const { lesson_id, title, pass_pct=70, bank } = req.body; // bank = { questions: [...] }
    const ab = await pool.query(`INSERT INTO question_banks (title, created_by) VALUES ($1,$2) RETURNING id`, [title||'Bank', req.user?.email||null]);
    const bank_id = ab.rows[0].id;
    // Insert questions
    for (const q of (bank?.questions||[])) {
      await pool.query(`INSERT INTO questions (bank_id, type, prompt, options, answer, points) VALUES ($1,$2,$3,$4,$5,$6)`,
        [bank_id, q.type, q.prompt, q.options||null, q.answer||null, q.points||1]);
    }
    const as = await pool.query(`INSERT INTO assessments (lesson_id, bank_id, title, pass_pct, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [parseInt(lesson_id), bank_id, title||'Assessment', parseInt(pass_pct)||70, req.user?.email||null]);
    res.json(as.rows[0]);
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

// List for lesson
router.get('/for-lesson', async (req,res)=>{
  try {
    const lesson_id = parseInt(req.query.lesson_id);
    const { rows } = await pool.query(`SELECT a.id,a.title,a.pass_pct, (SELECT COUNT(*) FROM questions q WHERE q.bank_id=a.bank_id) as num_questions FROM assessments a WHERE a.lesson_id=$1 ORDER BY a.created_at DESC`, [lesson_id]);
    res.json(rows);
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

// Fetch one assessment with questions
router.get('/:id', async (req,res)=>{
  try {
    const id = parseInt(req.params.id);
    const a = await pool.query(`SELECT id, title, pass_pct, bank_id FROM assessments WHERE id=$1`, [id]);
    if (!a.rows.length) return res.status(404).json({ error:'not_found' });
    const qs = await pool.query(`SELECT id, type, prompt, options, answer, points FROM questions WHERE bank_id=$1 ORDER BY id`, [a.rows[0].bank_id]);
    res.json({ assessment: a.rows[0], questions: qs.rows });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

// Submit answers
router.post('/:id/submit', express.json({limit:'1mb'}), async (req,res)=>{
  try {
    const id = parseInt(req.params.id);
    const answers = req.body.answers || []; // [{question_id, value}]
    const a = await pool.query(`SELECT id, bank_id, pass_pct FROM assessments WHERE id=$1`, [id]);
    if (!a.rows.length) return res.status(404).json({ error:'not_found' });
    const qs = await pool.query(`SELECT id, type, prompt, options, answer, points FROM questions WHERE bank_id=$1 ORDER BY id`, [a.rows[0].bank_id]);
    let score = 0, total = 0;
    const map = new Map(); answers.forEach(x=>map.set(x.question_id, x.value));
    for (const q of qs.rows) {
      total += (q.points||1);
      const val = map.get(q.id);
      let correct = false;
      if (q.type==='mcq' || q.type==='tf') correct = String(val) === String(q.answer);
      else if (q.type==='multi') {
        const a1 = JSON.stringify((q.answer||[]).map(Number).sort()); const a2 = JSON.stringify((val||[]).map(Number).sort()); correct = a1===a2;
      } else if (q.type==='num') {
        const tol = (q.answer && q.answer.tolerance) || 0;
        correct = Math.abs(parseFloat(val) - parseFloat(q.answer.value)) <= tol;
      } else if (q.type==='text') {
        const acc = (q.answer && q.answer.accept) || []; const norm = s => String(s||'').toLowerCase().trim();
        correct = acc.map(norm).includes(norm(val));
      }
      if (correct) score += (q.points||1);
    }
    const pct = total>0 ? Math.round(score/total*100) : 0;
    const { rows } = await pool.query(`INSERT INTO assessment_attempts (assessment_id, user_email, score_pct, responses) VALUES ($1,$2,$3,$4) RETURNING id`,
      [id, req.user?.email||null, pct, JSON.stringify(answers)]);
    res.json({ attempt_id: rows[0].id, score_pct: pct, passed: pct >= (a.rows[0].pass_pct||70) });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

module.exports = router;
