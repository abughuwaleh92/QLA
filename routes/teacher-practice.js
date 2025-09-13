// routes/teacher-practice.js - Fixed version with better error handling
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
async function getBankColumns(client) {
  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='practice_banks'
  `);
  const cols = rows.map(r => r.column_name);
  return {
    hasName: cols.includes('name'),
    hasTitle: cols.includes('title'),
    hasIsActive: cols.includes('is_active')
  };
}

// --------------- SKILLS -------------------

// GET /api/teacher/practice/skills?grade=7
router.get('/skills', async (req, res) => {
  const client = await pool.connect();
  try {
    const tbl = await skillTable();
    const grade = toInt(req.query.grade);
    const params = [];
    let where = '';
    
    // Check if is_active column exists
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = $1 AND column_name = 'is_active'`,
      [tbl]
    );
    
    if (cols.length > 0) {
      where = 'WHERE is_active IS DISTINCT FROM false';
    }
    
    if (grade !== null) { 
      params.push(grade); 
      where += where ? ` AND grade = $${params.length}` : ` WHERE grade = $${params.length}`;
    }

    const { rows } = await client.query(
      `SELECT id, name, grade, unit, description
         FROM ${tbl}
        ${where}
        ORDER BY unit NULLS LAST, name`, 
      params
    );
    
    console.log(`[Skills] Found ${rows.length} skills for grade ${grade || 'all'}`);
    res.json({ ok: true, skills: rows });
  } catch (e) {
    console.error('[Skills] List skills error:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// POST /api/teacher/practice/skills
router.post('/skills', async (req, res) => {
  const client = await pool.connect();
  try {
    const name  = (req.body.name || '').trim();
    const unit  = toInt(req.body.unit);
    const grade = toInt(req.body.grade);
    const description = (req.body.description || '').trim();
    const createdBy = req.user?.email || 'teacher';

    console.log('[Skills] Creating skill:', { name, unit, grade, description });

    if (!name || unit === null || grade === null) {
      console.log('[Skills] Validation failed:', { name, unit, grade });
      return bad(res, 400, 'invalid_input', 'Name, unit, and grade are required');
    }

    const tbl = await skillTable();
    
    // Check which columns exist
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = $1 AND column_name IN ('is_active', 'created_by', 'description', 'order_index')`,
      [tbl]
    );
    const hasIsActive = cols.some(c => c.column_name === 'is_active');
    const hasCreatedBy = cols.some(c => c.column_name === 'created_by');
    const hasDescription = cols.some(c => c.column_name === 'description');

    await client.query('BEGIN');
    
    // Build dynamic insert query based on available columns
    const columns = ['name', 'grade', 'unit'];
    const values = [name, grade, unit];

    if (hasDescription && description) {
      columns.push('description');
      values.push(description);
    }
    
    if (hasIsActive) {
      columns.push('is_active');
      values.push(true);
    }
    
    if (hasCreatedBy) {
      columns.push('created_by');
      values.push(createdBy);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(',');
    const insertQuery = `INSERT INTO ${tbl} (${columns.join(',')}) 
                        VALUES (${placeholders})
                        RETURNING id, name, grade, unit`;
    
    console.log('[Skills] Executing insert with columns:', columns);
    const ins = await client.query(insertQuery, values);
    const skill = ins.rows[0];
    console.log('[Skills] Created skill:', skill);

    // Always create a default bank
    let bank = null;
    const bankName = `${name} - Practice Bank`;
    if (await tableExists('practice_banks')) {
      try {
        // Check columns for practice_banks
        const { rows: bankCols } = await client.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name = 'practice_banks' AND column_name IN ('name', 'title', 'created_by')`,
          []
        );
        const hasName = bankCols.some(c => c.column_name === 'name');
        const hasTitle = bankCols.some(c => c.column_name === 'title');
        const hasCreatedByBank = bankCols.some(c => c.column_name === 'created_by');
        
        const bankColumns = ['skill_id', 'is_active'];
        const bankValues = [skill.id, true];
        
        if (hasName) {
          bankColumns.push('name');
          bankValues.push(bankName);
        }
        if (hasTitle) {
          bankColumns.push('title');
          bankValues.push(bankName);
        }
        if (hasCreatedByBank) {
          bankColumns.push('created_by');
          bankValues.push(createdBy);
        }
        
        const bankPlaceholders = bankValues.map((_, i) => `$${i + 1}`).join(',');
        const ib = await client.query(
          `INSERT INTO practice_banks (${bankColumns.join(',')})
           VALUES (${bankPlaceholders})
           RETURNING id, skill_id`,
          bankValues
        );
        bank = { ...ib.rows[0], name: bankName };
        console.log('[Skills] Created default bank:', bank);
      } catch (bankErr) {
        console.warn('[Skills] Could not create default bank:', bankErr.message);
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, skill, bank, message: 'Skill created successfully' });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('[Skills] Create skill error:', e);
    res.status(500).json({ error: e.message || 'Failed to create skill' });
  } finally { 
    client.release(); 
  }
});

// --------------- BANKS --------------------

// GET /api/teacher/practice/banks?skill_id=123
const client = await pool.connect();
try {
  const { hasName, hasTitle, hasIsActive } = await getBankColumns(client);
  const nameCol = hasName ? 'name' : (hasTitle ? 'title' : null);
  if (!nameCol) throw new Error('practice_banks needs a "name" or "title" column');

  const skillId = toInt(req.query.skillId ?? req.query.skill_id);
  const params = [];
  let where = 'WHERE 1=1';
  if (hasIsActive) where += ' AND is_active IS DISTINCT FROM false';
  if (skillId !== null) { params.push(skillId); where += ` AND skill_id = $${params.length}`; }

  const { rows } = await client.query(
    `SELECT id, ${nameCol} AS name, skill_id FROM practice_banks
      ${where}
     ORDER BY id DESC`, params
  );
  res.json({ ok: true, banks: rows });
} finally { client.release(); }
router.get('/banks', async (req, res) => {
  if (!(await tableExists('practice_banks'))) return bad(res, 500, 'no_practice_banks_table');
  const client = await pool.connect();
  try {
    const skillId = toInt(req.query.skill_id);
    const params = [];
    let where = '';
    
    // Check if is_active column exists
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'practice_banks' AND column_name = 'is_active'`,
      []
    );
    
    if (cols.length > 0) {
      where = 'WHERE is_active IS DISTINCT FROM false';
    }
    
    if (skillId !== null) { 
      params.push(skillId); 
      where += where ? ` AND skill_id = $${params.length}` : ` WHERE skill_id = $${params.length}`;
    }

    // Get count of questions for each bank
    const { rows } = await client.query(
      `SELECT pb.id, 
              COALESCE(pb.name, pb.title) as title,
              pb.skill_id,
              pb.difficulty,
              pb.is_active,
              COUNT(pq.id) as question_count
         FROM practice_banks pb
         LEFT JOIN practice_questions pq ON pq.bank_id = pb.id
        ${where}
        GROUP BY pb.id
        ORDER BY pb.id DESC`,
      params
    );
    
    console.log(`[Banks] Found ${rows.length} banks for skill ${skillId || 'all'}`);
    res.json({ ok: true, banks: rows });
  } catch (e) {
    console.error('[Banks] List banks error:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// POST /api/teacher/practice/banks
router.post('/banks', async (req, res) => {
  if (!(await tableExists('practice_banks'))) return bad(res, 500, 'no_practice_banks_table');
  const client = await pool.connect();
  try {
    const skill_id = toInt(req.body.skill_id);
    const title = (req.body.title || req.body.name || '').trim();
    const difficulty = req.body.difficulty || 'medium';
    const createdBy = req.user?.email || 'teacher';
    
    if (skill_id === null || !title) {
      return bad(res, 400, 'invalid_input', 'skill_id and title are required');
    }

    // Check columns
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'practice_banks' AND column_name IN ('name', 'title', 'created_by')`,
      []
    );
    const hasName = cols.some(c => c.column_name === 'name');
    const hasTitle = cols.some(c => c.column_name === 'title');
    const hasCreatedBy = cols.some(c => c.column_name === 'created_by');
    
    const columns = ['skill_id', 'is_active', 'difficulty'];
    const values = [skill_id, true, difficulty];
    
    if (hasName) {
      columns.push('name');
      values.push(title);
    }
    if (hasTitle) {
      columns.push('title');
      values.push(title);
    }
    if (hasCreatedBy) {
      columns.push('created_by');
      values.push(createdBy);
    }
    
    const placeholders = values.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await client.query(
      `INSERT INTO practice_banks (${columns.join(',')})
       VALUES (${placeholders})
       RETURNING id, skill_id`,
      values
    );
    
    const bank = { ...rows[0], title };
    console.log('[Banks] Created bank:', bank);
    res.json({ ok: true, bank });
  } catch (e) {
    console.error('[Banks] Create bank error:', e);
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
      `SELECT id, question_type, question_text, question_data, correct_answer, 
              solution_steps, hints, difficulty_level, points
         FROM practice_questions
        WHERE bank_id = $1
        ORDER BY id DESC`,
      [bankId]
    );
    
    console.log(`[Questions] Found ${rows.length} questions for bank ${bankId}`);
    res.json({ ok: true, questions: rows });
  } catch (e) {
    console.error('[Questions] List questions error:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// POST /api/teacher/practice/questions
router.post('/questions', async (req, res) => {
  if (!(await tableExists('practice_questions'))) return bad(res, 500, 'no_practice_questions_table');
  const client = await pool.connect();
  try {
    const b = toInt(req.body.bank_id);
    const s = toInt(req.body.skill_id);
    const t = (req.body.question_type || '').trim();
    const text = (req.body.question_text || '').trim();
    
    console.log('[Questions] Creating question:', { bank_id: b, skill_id: s, type: t });
    
    if (b === null || s === null || !t || !text) {
      return bad(res, 400, 'invalid_input', 'bank_id, skill_id, question_type, and question_text are required');
    }

    const qd = req.body.question_data || {};
    const ca = req.body.correct_answer;
    const steps = req.body.solution_steps || [];
    const hints = req.body.hints || [];
    const diff = toInt(req.body.difficulty_level) ?? 3;
    const pts  = toInt(req.body.points) ?? 10;

    const { rows } = await client.query(
      `INSERT INTO practice_questions
       (bank_id, skill_id, question_type, question_text, question_data, correct_answer, 
        solution_steps, hints, difficulty_level, points)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [b, s, t, text, JSON.stringify(qd), JSON.stringify(ca), 
       JSON.stringify(steps), JSON.stringify(hints), diff, pts]
    );
    
    console.log('[Questions] Created question:', rows[0].id);
    res.json({ ok: true, id: rows[0].id, message: 'Question added successfully' });
  } catch (e) {
    console.error('[Questions] Create question error:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// DELETE /api/teacher/practice/questions/:id
router.delete('/questions/:id', async (req, res) => {
  if (!(await tableExists('practice_questions'))) return bad(res, 500, 'no_practice_questions_table');
  const client = await pool.connect();
  try {
    const id = toInt(req.params.id);
    if (id === null) return bad(res, 400, 'invalid_id');
    
    const { rowCount } = await client.query(
      'DELETE FROM practice_questions WHERE id = $1',
      [id]
    );
    
    if (rowCount === 0) {
      return bad(res, 404, 'question_not_found');
    }
    
    console.log('[Questions] Deleted question:', id);
    res.json({ ok: true, message: 'Question deleted' });
  } catch (e) {
    console.error('[Questions] Delete question error:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// ------------ CREATE ASSESSMENT FROM BANK ------------

// POST /api/teacher/practice/create-assessment
router.post('/create-assessment', async (req, res) => {
  const client = await pool.connect();
  try {
    const bank_id = toInt(req.body.bank_id);
    const title = (req.body.title || '').trim();
    const lesson_id = toInt(req.body.lesson_id);
    const pass_pct = toInt(req.body.pass_pct) || 70;
    
    if (!bank_id || !title) {
      return bad(res, 400, 'invalid_input', 'bank_id and title are required');
    }
    
    await client.query('BEGIN');
    
    // Check if assessments table exists
    if (!(await tableExists('assessments'))) {
      throw new Error('assessments table does not exist');
    }
    
    // Create assessment
    const { rows } = await client.query(
      `INSERT INTO assessments (lesson_id, bank_id, title, pass_pct, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [lesson_id, bank_id, title, pass_pct, req.user?.email || 'teacher']
    );
    
    await client.query('COMMIT');
    console.log('[Assessment] Created assessment from bank:', rows[0].id);
    res.json({ ok: true, assessment_id: rows[0].id, message: 'Assessment created successfully' });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('[Assessment] Create error:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

// -------- HTML Import (optional) ----------

// POST /api/teacher/practice/banks/:bankId/import-html
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
    console.log('[Import] Imported', r.length, 'questions from HTML');
    res.json({ ok: true, inserted: r.length });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('[Import] HTML error:', e);
    res.status(500).json({ error: String(e.message || e) });
  } finally { client.release(); }
});

module.exports = router;
