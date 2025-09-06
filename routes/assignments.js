const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL==='disable'?false:{ rejectUnauthorized:false } });

router.get('/', async (req,res)=>{
  try { const { rows } = await pool.query(`SELECT * FROM assignments ORDER BY created_at DESC LIMIT 200`); res.json(rows); }
  catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.post('/', express.json(), async (req,res)=>{
  try {
    const { lesson_id, class_code, pass_pct, due_at } = req.body;
    const { rows } = await pool.query(`INSERT INTO assignments (lesson_id, class_code, pass_pct, due_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [parseInt(lesson_id), class_code, parseInt(pass_pct)||70, due_at||null, req.user?.email||null]);
    res.json(rows[0]);
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

module.exports = router;
