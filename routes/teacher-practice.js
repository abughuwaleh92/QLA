// routes/teacher-practice.js  (FULL REPLACEMENT)
const express = require('express');
const router = express.Router();

// Parse both JSON and HTML form posts
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- DB pool discovery (uses your ../db if present; otherwise DATABASE_URL) ---
let pool;
try { pool = require('../db').pool || require('../db'); } catch {}
try { pool = pool || require('../lib/db').pool || require('../lib/db'); } catch {}
if (!pool) {
  const { Pool } = require('pg');
  const ssl = process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false;
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
}

// Optional dependency for HTML importer
let cheerio;
try { cheerio = require('cheerio'); } catch {
  console.warn('[teacher-practice] "cheerio" missing. HTML import route will return 501 until installed (npm i cheerio).');
}

// ---------------- helpers ----------------
const toInt = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
async function tableExists(name) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS r', [name]);
  return !!rows?.[0]?.r;
}
async function skillTable() {
  if (await tableExists('skills')) return 'skills';
  if (await tableExists('practice_skills')) return 'practice_skills';
  throw new Error('No "skills" or "practice_skills" table exists.');
}
function bad(res, status, msg, detail) { return res.status(status).json({ error: msg, detail: detail || null }); }

// --------------- SKILLS -------------------

// GET /api/teacher/practice/skills?grade=7
router.get('/skills', async (req, res) => {
  const client = await pool.connect();
  try {
    const tbl = await skillTable();
    const grade = toInt(req.query.grade);
    const params = [];
    let where = 'WHERE is_active IS DISTINCT FROM false';
    if (grade !== null) { params.push(grade); where += ` AND grade = $${params.length}`; }

    const { rows } = await client.query(
      `SELECT id, name, grade, unit
         FROM ${tbl}
        ${where}
        ORDER BY COALESCE(unit,1), name`,
      params
    );
    res.json({ ok: true, skills: rows });
  } catch (e) {
    console.error('List skills:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// POST /api/teacher/practice/skills
// Accepts form-data or JSON: { name, unit, grade, default_bank_name? }
router.post('/skills', async (req, res) => {
  const client = await pool.connect();
  try {
    const name  = (req.body.name || '').trim();
    const unit  = toInt(req.body.unit);
    const grade = toInt(req.body.grade);
    const defaultBank = (req.body.default_bank_name || '').trim();

    if (!name || unit === null || grade === null) return bad(res, 400, 'invalid_input', { name, unit, grade });

    const tbl = await skillTable();
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO ${tbl} (name, grade, unit, is_active)
       VALUES ($1,$2,$3,true)
       RETURNING id, name, grade, unit`,
      [name, grade, unit]
    );
    const skill = ins.rows[0];

    let bank = null;
    if (defaultBank) {
      if (!(await tableExists('practice_banks'))) throw new Error('practice_banks table missing');
      const ib = await client.query(
        `INSERT INTO practice_banks (skill_id, name, is_active)
         VALUES ($1,$2,true)
         RETURNING id, name, skill_id`,
        [skill.id, defaultBank]
      );
      bank = ib.rows[0];
    }

    await client.query('COMMIT');
    res.json({ ok: true, skill, bank });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Create skill:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// --------------- BANKS --------------------

// GET /api/teacher/practice/banks?skillId=123
router.get('/banks', async (req, res) => {
  if (!(await tableExists('practice_banks'))) return bad(res, 500, 'no_practice_banks_table');
  const client = await pool.connect();
  try {
    const skillId = toInt(req.query.skillId);
    const params = [];
    let where = 'WHERE is_active IS DISTINCT FROM false';
    if (skillId !== null) { params.push(skillId); where += ` AND skill_id = $${params.length}`; }

    const { rows } = await client.query(
      `SELECT id, name, skill_id
         FROM practice_banks
        ${where}
        ORDER BY id DESC`,
      params
    );
    res.json({ ok: true, banks: rows });
  } catch (e) {
    console.error('List banks:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// POST /api/teacher/practice/banks  { skill_id, name }
router.post('/banks', async (req, res) => {
  if (!(await tableExists('practice_banks'))) return bad(res, 500, 'no_practice_banks_table');
  const client = await pool.connect();
  try {
    const skill_id = toInt(req.body.skill_id);
    const name = (req.body.name || '').trim();
    if (skill_id === null || !name) return bad(res, 400, 'invalid_input');

    const { rows } = await client.query(
      `INSERT INTO practice_banks (skill_id, name, is_active)
       VALUES ($1,$2,true)
       RETURNING id, name, skill_id`,
      [skill_id, name]
    );
    res.json({ ok: true, bank: rows[0] });
  } catch (e) {
    console.error('Create bank:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// ------------- QUESTIONS ------------------

// GET /api/teacher/practice/banks/:bankId/questions
router.get('/banks/:bankId/questions', async (req, res) => {
  if (!(await tableExists('practice_questions'))) return bad(res, 500, 'no_practice_questions_table');
  const client = await pool.connect();
  try {
    const bankId = toInt(req.params.bankId);
    if (bankId === null) return bad(res, 400, 'invalid_bank');
    const { rows } = await client.query(
      `SELECT id, question_type, question_text, question_data, correct_answer, solution_steps, hints, difficulty_level, points
         FROM practice_questions
        WHERE bank_id = $1
        ORDER BY id DESC`,
      [bankId]
    );
    res.json({ ok: true, questions: rows });
  } catch (e) {
    console.error('List questions:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// POST /api/teacher/practice/questions
// Accepts: bank_id, skill_id, question_type, question_text, question_data?, correct_answer, solution_steps?, hints?
router.post('/questions', async (req, res) => {
  if (!(await tableExists('practice_questions'))) return bad(res, 500, 'no_practice_questions_table');
  const client = await pool.connect();
  try {
    const b = toInt(req.body.bank_id);
    const s = toInt(req.body.skill_id);
    const t = (req.body.question_type || '').trim();
    const text = (req.body.question_text || '').trim();
    if (b === null || s === null || !t || !text) return bad(res, 400, 'invalid_input');

    const qd = req.body.question_data ? JSON.stringify(req.body.question_data) : '{}';
    const ca = JSON.stringify(req.body.correct_answer);
    const steps = req.body.solution_steps ? JSON.stringify(req.body.solution_steps) : null;
    const hints = req.body.hints ? JSON.stringify(req.body.hints) : '[]';
    const diff = toInt(req.body.difficulty_level) ?? 3;
    const pts  = toInt(req.body.points) ?? 10;

    const { rows } = await client.query(
      `INSERT INTO practice_questions
       (bank_id, skill_id, question_type, question_text, question_data, correct_answer, solution_steps, hints, difficulty_level, points)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [b, s, t, text, qd, ca, steps, hints, diff, pts]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error('Create question:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// -------- HTML Import (optional) ----------

// POST /api/teacher/practice/banks/:bankId/import-html  { html }
router.post('/banks/:bankId/import-html', async (req, res) => {
  if (!cheerio) return res.status(501).json({ error: 'html_import_disabled_missing_dependency', fix: 'npm i cheerio' });
  if (!(await tableExists('practice_banks')) || !(await tableExists('practice_questions'))) {
    return bad(res, 500, 'missing_practice_tables');
  }
  const client = await pool.connect();
  try {
    const bankId = toInt(req.params.bankId);
    const html = (req.body.html || '').trim();
    if (bankId === null || !html) return bad(res, 400, 'missing_bank_or_html');

    await client.query('BEGIN');
    const { rows: b } = await client.query('SELECT id, skill_id FROM practice_banks WHERE id=$1', [bankId]);
    if (!b.length) throw new Error('bank_not_found');
    const skillId = b[0].skill_id;

    const $ = cheerio.load(html);
    const jobs = [];
    $('.q').each((_, el) => {
      const $q = $(el);
      let type = ($q.attr('data-type') || 'mcq').trim();
      const prompt = $q.find('.prompt').first().text().trim();
      if (!prompt) return;

      const options = $q.find('.options li').toArray().map(li => $(li).text().trim());
      const ansRaw  = $q.find('.answer').first().text().trim();
      const hints   = $q.find('.hints div').toArray().map(d => $(d).text().trim()).filter(Boolean);
      const steps   = $q.find('.steps div').toArray().map(d => $(d).text().trim()).filter(Boolean);

      const qd = {}; let ca = null;
      if (['mcq','true_false','multi_select'].includes(type)) {
        qd.options = options;
        if (type === 'multi_select') {
          ca = (ansRaw || '').split(',').map(s => Number(s.trim())).filter(Number.isFinite);
        } else {
          const idx = Number(ansRaw); ca = Number.isFinite(idx) ? idx : 0;
        }
      } else if (type === 'numeric') {
        ca = { value: Number(ansRaw), tolerance: 0 };
      } else if (type === 'text') {
        ca = { accept: [ansRaw] };
      } else {
        type = 'mcq'; qd.options = options;
        const idx = Number(ansRaw); ca = Number.isFinite(idx) ? idx : 0;
      }

      jobs.push(client.query(
        `INSERT INTO practice_questions
         (bank_id, skill_id, question_type, question_text, question_data, correct_answer, solution_steps, hints, difficulty_level, points)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          bankId, skillId, type, prompt,
          JSON.stringify(qd), JSON.stringify(ca),
          steps.length ? JSON.stringify(steps) : null,
          JSON.stringify(hints || []), 3, 10
        ]
      ));
    });

    const r = await Promise.all(jobs);
    await client.query('COMMIT');
    res.json({ ok: true, inserted: r.length });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Import HTML:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

module.exports = router;
