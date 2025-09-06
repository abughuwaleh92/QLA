const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { google } = require('googleapis');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL==='disable'?false:{ rejectUnauthorized:false } });

function gclassConfigured(){ return !!process.env.GC_SERVICE_ACCOUNT && !!process.env.GC_IMPERSONATE_USER; }
function gauth(){
  const creds = JSON.parse(process.env.GC_SERVICE_ACCOUNT);
  const scopes = (process.env.GC_SCOPES || 'https://www.googleapis.com/auth/admin.directory.user.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.courses.readonly').split(/\s+/);
  return new google.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes, subject: process.env.GC_IMPERSONATE_USER });
}

router.get('/metrics', async (req,res)=>{
  try {
    const q = async (sql, params=[]) => (await pool.query(sql, params)).rows[0];
    const lessons = await q(`SELECT COUNT(*)::int AS n FROM lessons`);
    const assignments = await q(`SELECT COUNT(*)::int AS n FROM assignments`);
    const assessments = await q(`SELECT COUNT(*)::int AS n FROM assessments`);
    const attempts = await q(`SELECT COUNT(*)::int AS n FROM assessment_attempts`);
    const progress = await q(`SELECT COUNT(*)::int AS n FROM progress`);
    res.json({ lessons: lessons.n, assignments: assignments.n, assessments: assessments.n, attempts: attempts.n, completions: progress.n });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.get('/top-lessons', async (req,res)=>{
  try {
    const { rows } = await pool.query(`SELECT l.id, l.title, l.grade, l.unit, l.lesson_order,
      COALESCE((SELECT COUNT(*) FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id WHERE a.lesson_id=l.id),0) AS attempts,
      COALESCE((SELECT COUNT(*) FROM progress p WHERE p.lesson_ref LIKE l.grade||'%'||'-'||l.unit||'-'||l.lesson_order),0) AS completions
      FROM lessons l ORDER BY attempts DESC, completions DESC LIMIT 20`);
    res.json(rows);
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.get('/users', async (req,res)=>{
  try {
    const { rows } = await pool.query(`
      WITH u AS (
        SELECT user_email AS email FROM progress WHERE user_email IS NOT NULL
        UNION
        SELECT user_email FROM assessment_attempts WHERE user_email IS NOT NULL
      )
      SELECT email, COUNT(*) AS events FROM progress WHERE user_email IN (SELECT email FROM u) GROUP BY email ORDER BY events DESC LIMIT 100
    `);
    res.json(rows);
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

router.get('/gclass/courses', async (req,res)=>{
  try {
    if (!gclassConfigured()) return res.json({ configured:false, courses:[] });
    const auth = gauth(); await auth.authorize();
    const classroom = google.classroom({ version:'v1', auth });
    const out = await classroom.courses.list({ courseStates: ['ACTIVE'] });
    res.json({ configured:true, courses: out.data.courses||[] });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});
router.get('/gclass/:courseId/students', async (req,res)=>{
  try {
    if (!gclassConfigured()) return res.json({ configured:false, students:[] });
    const auth = gauth(); await auth.authorize();
    const classroom = google.classroom({ version:'v1', auth });
    const students = []; let pageToken = null;
    do {
      const r = await classroom.courses.students.list({ courseId: req.params.courseId, pageToken });
      (r.data.students||[]).forEach(s=> students.push({ email: s.profile.emailAddress, name: s.profile.name?.fullName }));
      pageToken = r.data.nextPageToken || null;
    } while(pageToken);
    res.json({ configured:true, students });
  } catch(e){ console.error(e); res.status(500).json({ error:String(e) }); }
});

module.exports = router;
