const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const multer = require('multer');
const { parse } = require('csv-parse');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL==='disable'?false:{ rejectUnauthorized:false } });
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', async (req,res)=>{
  try {
    const isAdmin = req.user?.role === 'admin';
    if (isAdmin) {
      const { rows } = await pool.query(`SELECT c.*, (SELECT COUNT(*) FROM enrollments e WHERE e.class_id=c.id) AS students FROM classes c ORDER BY c.created_at DESC`);
      return res.json(rows);
    }
    const { rows } = await pool.query(`SELECT c.*, (SELECT COUNT(*) FROM enrollments e WHERE e.class_id=c.id) AS students
      FROM classes c JOIN teacher_classes t ON t.class_id=c.id WHERE t.teacher_email=$1 ORDER BY c.created_at DESC`, [req.user?.email||null]);
    res.json(rows);
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.post('/', express.json(), async (req,res)=>{
  try {
    const { code, name, grade } = req.body;
    const c = await pool.query(`INSERT INTO classes (code, name, grade, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [code, name, grade||null, req.user?.email||null]);
    if (req.user?.email) await pool.query(`INSERT INTO teacher_classes (class_id, teacher_email) VALUES ($1,$2)`, [c.rows[0].id, req.user.email]);
    res.json(c.rows[0]);
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.post('/:id/enroll', express.json(), async (req,res)=>{
  try {
    const id = parseInt(req.params.id);
    const { student_email } = req.body;
    await pool.query(`INSERT INTO enrollments (class_id, student_email) VALUES ($1,$2)`, [id, (student_email||'').toLowerCase()]);
    res.json({ ok:true });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.get('/:id/enrollments', async (req,res)=>{
  try {
    const id = parseInt(req.params.id);
    const { rows } = await pool.query(`SELECT * FROM enrollments WHERE class_id=$1 ORDER BY id DESC`, [id]);
    res.json(rows);
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.post('/import', upload.single('csv'), async (req,res)=>{
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error:'admin_only' });
    if (!req.file) return res.status(400).json({ error:'missing_csv' });
    const content = req.file.buffer.toString('utf8');
    const rows = [];
    await new Promise((resolve, reject)=>{
      parse(content, { columns:true, skip_empty_lines:true, trim:true }, (err, out)=>{ if (err) return reject(err); out.forEach(r=>rows.push(r)); resolve(); });
    });
    let added=0;
    for (const r of rows){
      const code = String(r.class_code||'').trim();
      const email = String(r.student_email||'').trim().toLowerCase();
      if (!code || !email) continue;
      const c = await pool.query(`INSERT INTO classes (code, name) VALUES ($1,$2) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [code, r.class_name||code]);
      await pool.query(`INSERT INTO enrollments (class_id, student_email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [c.rows[0].id, email]);
      added++;
    }
    res.json({ ok:true, rows: rows.length, added });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

module.exports = router;
