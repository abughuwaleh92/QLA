const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL==='disable'?false:{ rejectUnauthorized:false } });

function slugify(s){ return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

// Catalog from DB, with resolver base for static lessons
router.get('/catalog', async (req,res) => {
  try {
    const grade = req.query.grade ? parseInt(req.query.grade) : null;
    const all = req.query.all === '1' || req.query.all === 'true';
    const params = []; let where = 'WHERE is_public = true';
    if (grade && !all) { params.push(grade); where += ` AND grade = $${params.length}`; }
    const q = `SELECT id, slug, grade, unit, lesson_order as "order", title, description, video_url, html_path,
                      CASE WHEN html_path IS NOT NULL THEN html_path
                           ELSE '/api/lessons/'||id||'/render' END AS src
               FROM lessons ${where} ORDER BY grade, unit, lesson_order, id;`;
    const { rows } = await pool.query(q, params);
    // Build units map
    const unitsMap = new Map();
    for (const r of rows) {
      const key = `${r.grade}-${r.unit}`;
      if (!unitsMap.has(key)) unitsMap.set(key, { grade:r.grade, num:r.unit, name:`Unit ${r.unit}`, lessons:[] });
      unitsMap.get(key).lessons.push({ id:r.id, title:r.title, grade:r.grade, unit:r.unit, order:r.order, src:r.src, html_path:r.html_path });
    }
    // Provide resolverBase for static folders
    res.json({ units: Array.from(unitsMap.values()), resolverBase: grade?`/lessons/grade${grade}`:null });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.get('/resolve', async (req,res)=>{
  const grade = parseInt(req.query.grade), unit = parseInt(req.query.unit), order = parseInt(req.query.order);
  const base = `/lessons/grade${grade}`;
  const candidates = [
    `${base}/lesson-${unit}-${order}.html`,
    `${base}/lesson-${order}.html`,
    `${base}/welcome.html`
  ];
  try {
    const { rows } = await pool.query(`SELECT html_path FROM lessons WHERE grade=$1 AND unit=$2 AND lesson_order=$3 LIMIT 1`, [grade,unit,order]);
    if (rows[0]?.html_path) return res.json({ src: rows[0].html_path });
  } catch(_){}
  return res.json({ src: candidates[0], candidates });
});

router.post('/', express.json({limit:'4mb'}), async (req,res) => {
  try {
    const { title, grade, unit, lesson_order, description, video_url, html_path, html_content } = req.body;
    const slug = slugify(`${grade}-${unit}-${lesson_order}-${title}`);
    const insert = `INSERT INTO lessons (slug, grade, unit, lesson_order, title, description, video_url, html_path, html_content)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id`;
    const params = [slug, grade, unit, lesson_order, title, description||null, video_url||null, html_path||null, html_content||null];
    const r = await pool.query(insert, params);
    let id = r.rows[0]?.id;
    if (!id) {
      await pool.query(`UPDATE lessons SET grade=$2, unit=$3, lesson_order=$4, title=$5, description=$6, video_url=$7, html_path=$8, html_content=$9, updated_at=now() WHERE slug=$1`, params);
      const q = await pool.query(`SELECT id FROM lessons WHERE slug=$1`, [slug]);
      id = q.rows[0].id;
    }
    res.json({ id, slug });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.put('/:id', express.json({limit:'4mb'}), async (req,res)=>{
  try {
    const id = parseInt(req.params.id);
    const allowed = ['title','description','video_url','html_path','html_content','grade','unit','lesson_order','is_public'];
    const sets=[]; const vals=[]; let i=1;
    for (const k of allowed) if (k in req.body) { sets.push(`${k}=$${i++}`); vals.push(req.body[k]); }
    if (!sets.length) return res.json({ ok:true });
    vals.push(id);
    await pool.query(`UPDATE lessons SET ${sets.join(',')}, updated_at=now() WHERE id=$${i}`, vals);
    res.json({ ok:true });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.delete('/:id', async (req,res)=>{
  try { await pool.query(`DELETE FROM lessons WHERE id=$1`, [parseInt(req.params.id)]); res.json({ ok:true }); }
  catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.get('/:id/render', async (req,res)=>{
  try {
    const id = parseInt(req.params.id);
    const { rows } = await pool.query(`SELECT title, html_content FROM lessons WHERE id=$1`, [id]);
    if (!rows.length) return res.status(404).send('Not found');
    const html = rows[0].html_content || '<p>No content.</p>';
    res.set('Content-Type','text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${rows[0].title}</title></head><body>${html}<script src="/js/lesson-bridge.js"></script></body></html>`);
  } catch(e){ console.error(e); res.status(500).send(String(e)); }
});

module.exports = router;
