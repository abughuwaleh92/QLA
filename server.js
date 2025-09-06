// server.js — QLA Mathematics LMS (extended)
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const { mountAuth, requireAuth, requireTeacher, requireAdmin } = require('./auth');
const lessonsRouter = require('./routes/lessons');
const uploadsRouter = require('./routes/uploads');
const assignmentsRouter = require('./routes/assignments');
const assessmentsRouter = require('./routes/assessments');
const progressRouter = require('./routes/progress');
const classesRouter = require('./routes/classes');
const adminRouter = require('./routes/admin');
const { initClassroom } = require('./routes/classroom');

const PORT = process.env.PORT || 8080;
const ENV = process.env.NODE_ENV || 'production';
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL==='disable'?false:{ rejectUnauthorized:false } });

app.use(helmet({ contentSecurityPolicy:false }));
app.use(compression());
app.use(cors());

// Auth & sessions
mountAuth(app, pool);

// Static
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/lessons/grade7', express.static(path.join(__dirname, 'grade7')));
app.use('/lessons/grade8', express.static(path.join(__dirname, 'grade8')));
app.use(express.static(path.join(__dirname, 'public')));

// Portals (protected)
app.get('/portal/student', requireAuth, (req,res)=> res.sendFile(path.join(__dirname, 'public', 'portal-student.html')));
app.get('/portal/teacher', requireAuth, requireTeacher, (req,res)=> res.sendFile(path.join(__dirname, 'public', 'portal-teacher.html')));
app.get('/portal/admin', requireAuth, requireAdmin, (req,res)=> res.sendFile(path.join(__dirname, 'public', 'portal-admin.html')));

// APIs
app.use('/api/lessons', requireAuth, (req,res,next)=>{
  const method = req.method.toUpperCase();
  if (['POST','PUT','DELETE'].includes(method) && (!req.user || (req.user.role!=='teacher' && req.user.role!=='admin'))) return res.status(403).json({ error:'teacher_only' });
  next();
}, lessonsRouter);
app.use('/api/uploads', requireAuth, requireTeacher, uploadsRouter);
app.use('/api/assignments', requireAuth, requireTeacher, assignmentsRouter);
app.use('/api/assessments', requireAuth, assessmentsRouter);
app.use('/api/progress', requireAuth, progressRouter);
app.use('/api/classes', requireAuth, requireTeacher, classesRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);

// Health
app.get('/api/health', (req,res)=> res.json({ ok:true, env: ENV }));

// Socket classroom
initClassroom(io);

// --- Migrations runner ---
async function runMigrations(){
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
  for (const f of files){
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!sql.trim()) continue;
    try { await pool.query(sql); console.log('✅ migration', f); }
    catch(e){ console.error('❌ migration failed', f, e.message); }
  }
}

// --- Import lessons from filesystem into DB ---
async function syncLessons(){
  const grades = [7,8];
  function listHtml(dir){ return fs.readdirSync(dir).filter(fn=>fn.toLowerCase().endsWith('.html')).sort(); }
  for (const g of grades){
    const dir = path.join(__dirname, 'grade'+g);
    if (!fs.existsSync(dir)) continue;
    const files = listHtml(dir);
    let unit = 1;
    for (let i=0; i<files.length; i++){
      const fn = files[i];
      let u = unit, order = (i%10)+1;
      const m = fn.match(/lesson-(\d+)-(\d+)\.html/i) || fn.match(/lesson-(\d+)\.html/i);
      if (m && m.length===3){ u = parseInt(m[1]); order = parseInt(m[2]); }
      else if (m && m.length===2){ order = parseInt(m[1]); }
      const title = fn.replace(/[-_]/g,' ').replace(/\.html$/i,'').replace(/\b\w/g, c=>c.toUpperCase());
      const slug = `${g}-${u}-${order}-${fn}`.toLowerCase();
      try {
        const r = await pool.query(`INSERT INTO lessons (slug, grade, unit, lesson_order, title, html_path) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [slug, g, u, order, title, `/lessons/grade${g}/${fn}`]);
        if (!r.rowCount){
          await pool.query(`UPDATE lessons SET title=$5, html_path=$6, updated_at=now() WHERE slug=$1`, [slug, g, u, order, title, `/lessons/grade${g}/${fn}`]);
        }
      } catch(e){ console.error('sync error', fn, e.message); }
    }
  }
}

// --- Seed question banks & assessments for lessons without any ---
async function seedQuestionBanks(){
  try {
    const { rows: lessons } = await pool.query(`SELECT l.id, l.title, l.grade, l.unit, l.lesson_order FROM lessons l`);
    for (const L of lessons){
      const has = await pool.query(`SELECT 1 FROM assessments WHERE lesson_id=$1 LIMIT 1`, [L.id]);
      if (has.rowCount) continue;
      const bank = await pool.query(`INSERT INTO question_banks (title, created_by) VALUES ($1,$2) RETURNING id`, [`Auto • ${L.title}`, 'seed@system']);
      const bid = bank.rows[0].id;

      // Q1: MCQ
      await pool.query(`INSERT INTO questions (bank_id,type,prompt,options,answer,points) VALUES ($1,'mcq',$2,$3,$4,1)`,
        [bid, `Which statement best describes "${L.title}"?`, JSON.stringify(["I can explain the key idea","I have no idea","It's about geometry","It's about statistics"]), 0]);
      // Q2: True/False
      await pool.query(`INSERT INTO questions (bank_id,type,prompt,options,answer,points) VALUES ($1,'tf',$2,$3,$4,1)`,
        [bid, `You should attempt the practice before moving on.`, JSON.stringify(["True","False"]), 0]);
      // Q3: Numeric
      await pool.query(`INSERT INTO questions (bank_id,type,prompt,options,answer,points) VALUES ($1,'num',$2,NULL,$3,1)`,
        [bid, `Compute 24 ÷ 6 + 3 × 2`, JSON.stringify({ value: 10, tolerance: 0 }) ]);
      // Q4: Text
      await pool.query(`INSERT INTO questions (bank_id,type,prompt,options,answer,points) VALUES ($1,'text',$2,NULL,$3,1)`,
        [bid, `Type one keyword from this lesson`, JSON.stringify({ accept: [] }) ]);
      // Q5: Multi-select
      await pool.query(`INSERT INTO questions (bank_id,type,prompt,options,answer,points) VALUES ($1,'multi',$2,$3,$4,2)`,
        [bid, `Select the algebra topics`, JSON.stringify(["Like terms","Prime factorization","Graphing lines","Pythagoras"]), JSON.stringify([0,2]) ]);

      await pool.query(`INSERT INTO assessments (lesson_id, bank_id, title, pass_pct, created_by) VALUES ($1,$2,$3,$4,$5)`, [L.id, bid, `Check • ${L.title}`, 70, 'seed@system']);
      console.log('Seeded assessment for lesson', L.id);
    }
  } catch(e){ console.error('seed banks error', e.message); }
}

// --- Seed default classes (if none exist) ---
async function seedDefaultClasses(){
  try {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM classes`);
    if (rows[0].n > 0) return;
    await pool.query(`INSERT INTO classes (code,name,grade,created_by) VALUES ('G7','Grade 7 — General',7,'seed@system'), ('G8','Grade 8 — General',8,'seed@system')`);
    console.log('Seeded default classes G7, G8');
  } catch(e){ console.error('seed classes error', e.message); }
}

// --- Boot ---
(async () => {
  await runMigrations();
  await syncLessons();
  await seedQuestionBanks();
  await seedDefaultClasses();
  server.listen(PORT, () => {
    console.log(`\n║                                                            ║`);
    console.log(`║     🚀 QLA Mathematics LMS Server v2.1 (Extended)         ║`);
    console.log(`║                                                            ║`);
    console.log(`║     Environment:  ${ENV.padEnd(10)}                         ║`);
    console.log(`║     Port:         ${String(PORT).padEnd(10)}                         ║`);
    console.log(`║     URL:          /                                        ║`);
    console.log(`║                                                            ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝`);
  });
})();
