/**
 * Teacher Practice API (FULL REWRITE)
 * - Skills: list/create/update
 * - Banks: list/create
 * - Questions: list/create
 * - HTML import (optional, uses "cheerio" if installed)
 * - Build assessment from a bank (guarded)
 *
 * This file is defensive:
 * - Detects whether you use "skills" or "practice_skills"
 * - Returns 501 for importer if "cheerio" is not installed
 * - Avoids redeclarations of express/router/pool
 */

const express = require('express');
const router = express.Router();

let pool;
// Try common db module locations
try { pool = require('../db').pool || require('../db'); } catch (e) {}
try { pool = pool || require('../lib/db').pool || require('../lib/db'); } catch (e) {}
if (!pool) {
  // Fallback to environment-based pg pool
  const { Pool } = require('pg');
  const ssl = process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false;
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
}

let cheerio;
try { cheerio = require('cheerio'); }
catch {
  console.warn('[teacher-practice] Optional dependency "cheerio" not installed. HTML importer route will return 501 until installed.');
}

// --------- helpers ---------

async function tableExists(name) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS r', [name]);
  return !!rows?.[0]?.r;
}

async function skillTable() {
  if (await tableExists('skills')) return 'skills';
  if (await tableExists('practice_skills')) return 'practice_skills';
  throw new Error('No "skills" or "practice_skills" table found.');
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bad(res, status, msg, detail) {
  return res.status(status).json({ error: msg, detail: detail || null });
}

// --------- Skills ---------

// GET /skills?grade=7
router.get('/skills', async (req, res) => {
  const client = await pool.connect();
  try {
    const tbl = await skillTable();
    const grade = toInt(req.query.grade);
    const params = [];
    let where = 'WHERE is_active IS DISTINCT FROM false';
    if (grade !== null) {
      params.push(grade);
      where += ` AND grade = $${params.length}`;
    }
    const { rows } = await client.query(
      `SELECT id, name, grade, unit
         FROM ${tbl}
        ${where}
        ORDER BY COALESCE(unit, 1), name`,
      params
    );
    res.json({ ok: true, skills: rows });
  } catch (e) {
    console.error('List skills failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// POST /skills  { grade, unit, name, default_bank_name? }
router.post('/skills', express.json({ limit: '64kb' }), async (req, res) => {
  const client = await pool.connect();
  try {
    const { grade, unit, name, default_bank_name } = req.body || {};
    const g = toInt(grade), u = toInt(unit);
    if (!name || g === null || u === null) return bad(res, 400, 'invalid_input', { grade, unit, name });

    const tbl = await skillTable();
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO ${tbl} (name, grade, unit, is_active)
       VALUES ($1,$2,$3,true)
       RETURNING id, name, grade, unit`,
      [String(name).trim(), g, u]
    );
    const skill = ins.rows[0];

    let bank = null;
    if (default_bank_name && String(default_bank_name).trim()) {
      if (!(await tableExists('practice_banks'))) throw new Error('practice_banks table missing');
      const ib = await client.query(
        `INSERT INTO practice_banks (skill_id, name, is_active)
         VALUES ($1,$2,true)
         RETURNING id, name, skill_id`,
        [skill.id, String(default_bank_name).trim()]
      );
      bank = ib.rows[0];
    }

    await client.query('COMMIT');
    res.json({ ok: true, skill, bank });
  } catch (e) {
    await pool.query('ROLLBACK').catch(()=>{});
    console.error('Create skill failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// PATCH /skills/:id  { name?, grade?, unit?, is_active?, is_public? }
router.patch('/skills/:id', express.json({ limit: '32kb' }), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = toInt(req.params.id);
    if (id === null) return bad(res, 400, 'invalid_id');

    const tbl = await skillTable();
    const fields = [];
    const vals = [];
    function set(col, val) {
      vals.push(val);
      fields.push(`${col} = $${vals.length}`);
    }
    if ('name' in req.body) set('name', String(req.body.name).trim());
    if ('grade' in req.body) set('grade', toInt(req.body.grade));
    if ('unit' in req.body) set('unit', toInt(req.body.unit));
    if ('is_active' in req.body) set('is_active', !!req.body.is_active);
    if ('is_public' in req.body && await tableExists(`${tbl}`)) set('is_public', !!req.body.is_public);

    if (!fields.length) return bad(res, 400, 'no_fields');

    vals.push(id);
    const { rows } = await client.query(
      `UPDATE ${tbl} SET ${fields.join(', ')} WHERE id = $${vals.length} RETURNING id, name, grade, unit, is_active`,
      vals
    );
    res.json({ ok: true, skill: rows[0] || null });
  } catch (e) {
    console.error('Update skill failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// --------- Banks ---------

// GET /banks?skillId=123
router.get('/banks', async (req, res) => {
  if (!(await tableExists('practice_banks'))) return bad(res, 500, 'no_practice_banks_table');
  const client = await pool.connect();
  try {
    const skillId = toInt(req.query.skillId);
    const params = [];
    let where = 'WHERE is_active IS DISTINCT FROM false';
    if (skillId !== null) { params.push(skillId); where += ` AND skill_id = $${params.length}`; }
    const { rows } = await client.query(
      `SELECT id, name, skill_id FROM practice_banks ${where} ORDER BY id DESC`,
      params
    );
    res.json({ ok: true, banks: rows });
  } catch (e) {
    console.error('List banks failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// POST /banks { skill_id, name }
router.post('/banks', express.json({ limit: '32kb' }), async (req, res) => {
  if (!(await tableExists('practice_banks'))) return bad(res, 500, 'no_practice_banks_table');
  const client = await pool.connect();
  try {
    const { skill_id, name } = req.body || {};
    const sid = toInt(skill_id);
    if (sid === null || !name) return bad(res, 400, 'invalid_input');
    const { rows } = await client.query(
      `INSERT INTO practice_banks (skill_id, name, is_active)
       VALUES ($1,$2,true) RETURNING id, name, skill_id`,
      [sid, String(name).trim()]
    );
    res.json({ ok: true, bank: rows[0] });
  } catch (e) {
    console.error('Create bank failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// --------- Questions ---------

// GET /banks/:bankId/questions
router.get('/banks/:bankId/questions', async (req, res) => {
  if (!(await tableExists('practice_questions'))) return bad(res, 500, 'no_practice_questions_table');
  const client = await pool.connect();
  try {
    const bankId = toInt(req.params.bankId);
    if (bankId === null) return bad(res, 400, 'invalid_bank');

    const { rows } = await client.query(
      `SELECT id, question_type, question_text, question_data, correct_answer, difficulty_level, points
         FROM practice_questions
        WHERE bank_id = $1
        ORDER BY id DESC`,
      [bankId]
    );
    res.json({ ok: true, questions: rows });
  } catch (e) {
    console.error('List questions failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// POST /questions
// { bank_id, skill_id, question_type, question_text, question_data, correct_answer, solution_steps?, hints? }
router.post('/questions', express.json({ limit: '256kb' }), async (req, res) => {
  if (!(await tableExists('practice_questions'))) return bad(res, 500, 'no_practice_questions_table');
  const client = await pool.connect();
  try {
    const b = toInt(req.body.bank_id);
    const s = toInt(req.body.skill_id);
    const t = String(req.body.question_type || '').trim();
    const text = String(req.body.question_text || '').trim();
    if (b === null || s === null || !t || !text) return bad(res, 400, 'invalid_input');

    const qd = req.body.question_data ? JSON.stringify(req.body.question_data) : '{}';
    const ca = JSON.stringify(req.body.correct_answer);
    const steps = req.body.solution_steps ? JSON.stringify(req.body.solution_steps) : null;
    const hints = req.body.hints ? JSON.stringify(req.body.hints) : '[]';
    const diff = toInt(req.body.difficulty_level) ?? 3;
    const pts = toInt(req.body.points) ?? 10;

    const { rows } = await client.query(
      `INSERT INTO practice_questions
       (bank_id, skill_id, question_type, question_text, question_data, correct_answer, solution_steps, hints, difficulty_level, points)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [b, s, t, text, qd, ca, steps, hints, diff, pts]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error('Create question failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// --------- HTML Importer (optional cheerio) ---------

// POST /banks/:bankId/import-html  { html }
router.post('/banks/:bankId/import-html', express.json({ limit: '5mb' }), async (req, res) => {
  if (!cheerio) {
    return res.status(501).json({
      error: 'html_import_disabled_missing_dependency',
      fix: 'Install cheerio: npm i cheerio (ensure it is in dependencies), then rebuild/redeploy'
    });
  }
  if (!(await tableExists('practice_banks')) || !(await tableExists('practice_questions'))) {
    return bad(res, 500, 'missing_practice_tables');
  }

  const client = await pool.connect();
  try {
    const bankId = toInt(req.params.bankId);
    const { html } = req.body || {};
    if (bankId === null || !html) return bad(res, 400, 'missing_bank_or_html');

    await client.query('BEGIN');
    const { rows: b } = await client.query('SELECT id, skill_id FROM practice_banks WHERE id = $1', [bankId]);
    if (!b.length) throw new Error('bank_not_found');
    const skillId = b[0].skill_id;

    const $ = cheerio.load(html);
    const jobs = [];
    $('.q').each((_, el) => {
      const $q = $(el);
      let type = String($q.attr('data-type') || 'mcq').trim();
      const prompt = $q.find('.prompt').first().text().trim();
      if (!prompt) return;

      const options = $q.find('.options li').toArray().map(li => $(li).text().trim());
      const ansRaw = $q.find('.answer').first().text().trim();
      const hints = $q.find('.hints div').toArray().map(d => $(d).text().trim()).filter(Boolean);
      const steps = $q.find('.steps div').toArray().map(d => $(d).text().trim()).filter(Boolean);

      const qd = {};
      let ca = null;

      if (['mcq','true_false','multi_select'].includes(type)) {
        qd.options = options;
        if (type === 'multi_select') {
          ca = (ansRaw || '').split(',').map(s => Number(s.trim())).filter(Number.isFinite);
        } else {
          const idx = Number(ansRaw);
          ca = Number.isFinite(idx) ? idx : 0;
        }
      } else if (type === 'numeric') {
        ca = { value: Number(ansRaw), tolerance: 0 };
      } else if (type === 'text') {
        ca = { accept: [ansRaw] };
      } else {
        // fallback to mcq
        type = 'mcq';
        qd.options = options;
        const idx = Number(ansRaw);
        ca = Number.isFinite(idx) ? idx : 0;
      }

      jobs.push(client.query(
        `INSERT INTO practice_questions
         (bank_id, skill_id, question_type, question_text, question_data, correct_answer, solution_steps, hints, difficulty_level, points)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          bankId,
          skillId,
          type,
          prompt,
          JSON.stringify(qd),
          JSON.stringify(ca),
          steps.length ? JSON.stringify(steps) : null,
          JSON.stringify(hints || []),
          3,
          10
        ]
      ));
    });

    const results = await Promise.all(jobs);
    await client.query('COMMIT');
    res.json({ ok: true, inserted: results.length });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('HTML import failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

// --------- Build assessment from a bank (optional) ---------

// POST /assessments/from-bank { bank_id, name?, points_per_q? }
router.post('/assessments/from-bank', express.json({ limit: '64kb' }), async (req, res) => {
  const hasAssess = await tableExists('assessments');
  if (!hasAssess) return res.status(501).json({ error: 'assessments_table_missing' });

  const client = await pool.connect();
  try {
    const bankId = toInt(req.body.bank_id);
    if (bankId === null) return bad(res, 400, 'invalid_bank');

    // get questions
    const { rows: qs } = await client.query(
      `SELECT id FROM practice_questions WHERE bank_id = $1 ORDER BY id`, [bankId]
    );
    if (!qs.length) return bad(res, 400, 'bank_empty');

    await client.query('BEGIN');

    const aName = String(req.body.name || `Assessment from bank ${bankId}`).trim();
    const { rows: a } = await client.query(
      `INSERT INTO assessments (name, is_active) VALUES ($1, true) RETURNING id, name`,
      [aName]
    );
    const assess = a[0];

    const pts = toInt(req.body.points_per_q) ?? 1;
    for (const row of qs) {
      await client.query(
        `INSERT INTO assessment_questions (assessment_id, question_id, points) VALUES ($1,$2,$3)`,
        [assess.id, row.id, pts]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, assessment: assess, count: qs.length });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Create assessment from bank failed:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    client.release();
  }
});

module.exports = router;
