// server.js — QLA Mathematics LMS (enhanced v2.2)
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
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Enhanced security settings
app.use(helmet({ 
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));
app.use(compression());
app.use(cors());

// Request logging in development
if (ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Auth & sessions
mountAuth(app, pool);

// Static files with caching
const staticOptions = {
  maxAge: ENV === 'production' ? '1d' : 0,
  etag: true
};
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
app.use('/lessons/grade7', express.static(path.join(__dirname, 'grade7'), staticOptions));
app.use('/lessons/grade8', express.static(path.join(__dirname, 'grade8'), staticOptions));
app.use(express.static(path.join(__dirname, 'public'), staticOptions));

// Portals (protected)
app.get('/portal/student', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal-student.html')));
app.get('/portal/teacher', requireAuth, requireTeacher, (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal-teacher.html')));
app.get('/portal/admin', requireAuth, requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal-admin.html')));

// Default redirect
app.get('/', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const role = req.user?.role;
    if (role === 'admin') return res.redirect('/portal/admin');
    if (role === 'teacher') return res.redirect('/portal/teacher');
    return res.redirect('/portal/student');
  }
  res.redirect('/login');
});

// APIs with enhanced error handling
app.use('/api/lessons', requireAuth, (req, res, next) => {
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'DELETE'].includes(method) && (!req.user || (req.user.role !== 'teacher' && req.user.role !== 'admin'))) {
    return res.status(403).json({ error: 'teacher_only' });
  }
  next();
}, lessonsRouter);

app.use('/api/uploads', requireAuth, requireTeacher, uploadsRouter);
app.use('/api/assignments', requireAuth, requireTeacher, assignmentsRouter);
app.use('/api/assessments', requireAuth, assessmentsRouter);
app.use('/api/progress', requireAuth, progressRouter);
app.use('/api/classes', requireAuth, requireTeacher, classesRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);

// Health check with database connectivity
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      ok: true, 
      env: ENV,
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (e) {
    res.status(503).json({ 
      ok: false, 
      env: ENV,
      error: 'Database connection failed'
    });
  }
});

// Socket classroom with enhanced features
initClassroom(io);

// Real-time progress updates
io.on('connection', (socket) => {
  console.log('New socket connection:', socket.id);
  
  socket.on('progress:update', async (data) => {
    // Broadcast progress to teachers
    io.to('teachers').emit('student:progress', data);
  });
  
  socket.on('join:role', (role) => {
    if (role === 'teacher' || role === 'admin') {
      socket.join('teachers');
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Database initialization and seeding ---
async function runMigrations() {
  console.log('🔄 Running database migrations...');
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!sql.trim()) continue;
    try {
      await pool.query(sql);
      console.log('✅ Migration:', f);
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('⏭️  Migration (skipped):', f);
      } else {
        console.error('❌ Migration failed:', f, e.message);
        throw e;
      }
    }
  }
}

// Import lessons from filesystem with enhanced metadata
async function syncLessons() {
  console.log('📚 Syncing lessons from filesystem...');
  const grades = [7, 8];
  
  function listHtml(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(fn => fn.toLowerCase().endsWith('.html')).sort();
  }
  
  for (const g of grades) {
    const dir = path.join(__dirname, 'grade' + g);
    const files = listHtml(dir);
    
    // Enhanced lesson metadata
    const lessonMetadata = {
      7: {
        1: { name: 'Number Systems', description: 'Rational numbers, operations, and number theory' },
        2: { name: 'Algebraic Expressions', description: 'Variables, equations, and problem solving' },
        3: { name: 'Geometry', description: 'Angles, shapes, and spatial reasoning' },
        4: { name: 'Statistics & Probability', description: 'Data analysis and chance' }
      },
      8: {
        1: { name: 'Advanced Number Systems', description: 'Exponents, roots, and scientific notation' },
        2: { name: 'Linear Relationships', description: 'Functions, graphs, and systems of equations' },
        3: { name: 'Geometric Transformations', description: 'Congruence, similarity, and coordinate geometry' },
        4: { name: 'Data Science', description: 'Statistical analysis and probability models' }
      }
    };
    
    for (let i = 0; i < files.length; i++) {
      const fn = files[i];
      let unit = Math.floor(i / 5) + 1; // 5 lessons per unit
      let order = (i % 5) + 1;
      
      // Parse lesson numbering from filename
      const m = fn.match(/lesson-(\d+)-(\d+)\.html/i) || fn.match(/lesson-(\d+)\.html/i);
      if (m && m.length === 3) {
        unit = parseInt(m[1]);
        order = parseInt(m[2]);
      } else if (m && m.length === 2) {
        order = parseInt(m[1]);
      }
      
      // Generate better title from HTML content if possible
      const htmlPath = path.join(dir, fn);
      let title = fn.replace(/[-_]/g, ' ').replace(/\.html$/i, '').replace(/\b\w/g, c => c.toUpperCase());
      let description = lessonMetadata[g]?.[unit]?.description || 'Interactive mathematics lesson';
      
      try {
        const content = fs.readFileSync(htmlPath, 'utf8');
        const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
          title = titleMatch[1].replace(/QLA|Grade \d+|G\d+|•/g, '').trim();
        }
      } catch (e) {
        // Use default title
      }
      
      const slug = `${g}-${unit}-${order}-${fn}`.toLowerCase();
      
      try {
        const existing = await pool.query('SELECT id FROM lessons WHERE slug=$1', [slug]);
        
        if (existing.rowCount === 0) {
          await pool.query(
            `INSERT INTO lessons (slug, grade, unit, lesson_order, title, description, html_path, is_public) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [slug, g, unit, order, title, description, `/lessons/grade${g}/${fn}`]
          );
          console.log(`✅ Added lesson: Grade ${g}, Unit ${unit}, Lesson ${order} - ${title}`);
        } else {
          await pool.query(
            `UPDATE lessons SET title=$2, description=$3, html_path=$4, updated_at=now() WHERE slug=$1`,
            [slug, title, description, `/lessons/grade${g}/${fn}`]
          );
        }
      } catch (e) {
        console.error('Sync error:', fn, e.message);
      }
    }
  }
}

// Enhanced question bank seeding with variety
async function seedQuestionBanks() {
  console.log('🎯 Seeding question banks and assessments...');
  
  try {
    const { rows: lessons } = await pool.query(`SELECT l.id, l.title, l.grade, l.unit, l.lesson_order FROM lessons l`);
    
    for (const L of lessons) {
      const has = await pool.query(`SELECT 1 FROM assessments WHERE lesson_id=$1 LIMIT 1`, [L.id]);
      if (has.rowCount) continue;
      
      const bank = await pool.query(
        `INSERT INTO question_banks (title, created_by) VALUES ($1, $2) RETURNING id`,
        [`Bank • ${L.title}`, 'system']
      );
      const bid = bank.rows[0].id;
      
      // Create varied questions based on grade level
      const questions = L.grade === 7 ? [
        {
          type: 'mcq',
          prompt: `In the context of "${L.title}", which skill is most important?`,
          options: ['Problem solving', 'Memorization', 'Speed', 'Guessing'],
          answer: 0,
          points: 1
        },
        {
          type: 'tf',
          prompt: 'Understanding the concept is more important than getting the right answer.',
          options: ['True', 'False'],
          answer: 0,
          points: 1
        },
        {
          type: 'num',
          prompt: 'If x + 7 = 15, what is x?',
          answer: { value: 8, tolerance: 0 },
          points: 2
        },
        {
          type: 'text',
          prompt: 'Name one real-world application of this lesson.',
          answer: { accept: ['shopping', 'money', 'measurement', 'building', 'science'] },
          points: 1
        },
        {
          type: 'multi',
          prompt: 'Select all properties of rational numbers:',
          options: ['Can be written as a fraction', 'Include all decimals', 'Include integers', 'Always positive'],
          answer: [0, 2],
          points: 2
        }
      ] : [
        {
          type: 'mcq',
          prompt: `Which mathematical concept from "${L.title}" applies to real-world problems?`,
          options: ['Linear relationships', 'Random guessing', 'Memorization only', 'None of these'],
          answer: 0,
          points: 1
        },
        {
          type: 'tf',
          prompt: 'Algebraic thinking helps in solving complex problems systematically.',
          options: ['True', 'False'],
          answer: 0,
          points: 1
        },
        {
          type: 'num',
          prompt: 'Solve: 3x - 12 = 24. What is x?',
          answer: { value: 12, tolerance: 0 },
          points: 2
        },
        {
          type: 'text',
          prompt: 'Describe one strategy you learned in this lesson.',
          answer: { accept: ['substitution', 'graphing', 'factoring', 'simplifying', 'solving'] },
          points: 1
        },
        {
          type: 'multi',
          prompt: 'Which are examples of linear equations?',
          options: ['y = 2x + 3', 'x² + y = 5', 'y = 5x', 'xy = 10'],
          answer: [0, 2],
          points: 2
        }
      ];
      
      for (const q of questions) {
        await pool.query(
          `INSERT INTO questions (bank_id, type, prompt, options, answer, points) VALUES ($1, $2, $3, $4, $5, $6)`,
          [bid, q.type, q.prompt, q.options ? JSON.stringify(q.options) : null, JSON.stringify(q.answer), q.points]
        );
      }
      
      await pool.query(
        `INSERT INTO assessments (lesson_id, bank_id, title, pass_pct, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [L.id, bid, `Assessment: ${L.title}`, 70, 'system']
      );
      
      console.log(`✅ Created assessment for: ${L.title}`);
    }
  } catch (e) {
    console.error('Seed banks error:', e.message);
  }
}

// Seed default classes and sample data
async function seedDefaultData() {
  console.log('🏫 Setting up default classes and sample data...');
  
  try {
    // Check if classes exist
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM classes`);
    
    if (rows[0].n === 0) {
      // Create default classes
      await pool.query(`
        INSERT INTO classes (code, name, grade, created_by) VALUES 
        ('G7A', 'Grade 7 - Section A', 7, 'system'),
        ('G7B', 'Grade 7 - Section B', 7, 'system'),
        ('G8A', 'Grade 8 - Section A', 8, 'system'),
        ('G8B', 'Grade 8 - Section B', 8, 'system'),
        ('MATH7', 'Mathematics Grade 7', 7, 'system'),
        ('MATH8', 'Mathematics Grade 8', 8, 'system')
      `);
      console.log('✅ Created default classes');
      
      // Add sample teacher assignments (if teacher emails are configured)
      const teacherEmails = (process.env.TEACHER_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
      for (const email of teacherEmails) {
        const classes = await pool.query(`SELECT id FROM classes WHERE grade IN (7, 8)`);
        for (const cls of classes.rows) {
          await pool.query(
            `INSERT INTO teacher_classes (class_id, teacher_email) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [cls.id, email]
          );
        }
      }
      
      console.log('✅ Assigned teachers to classes');
    }
    
    // Create sample assignments if none exist
    const { rows: assignments } = await pool.query(`SELECT COUNT(*)::int AS n FROM assignments`);
    if (assignments[0].n === 0) {
      const { rows: lessons } = await pool.query(`SELECT id FROM lessons WHERE grade=7 LIMIT 3`);
      const { rows: classes } = await pool.query(`SELECT id, code FROM classes WHERE grade=7 LIMIT 2`);
      
      if (lessons.length > 0 && classes.length > 0) {
        for (const lesson of lessons) {
          for (const cls of classes) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7); // Due in 1 week
            
            await pool.query(
              `INSERT INTO assignments (lesson_id, class_code, pass_pct, due_at, created_by) 
               VALUES ($1, $2, $3, $4, $5)`,
              [lesson.id, cls.code, 70, dueDate.toISOString().split('T')[0], 'system']
            );
          }
        }
        console.log('✅ Created sample assignments');
      }
    }
    
  } catch (e) {
    console.error('Seed data error:', e.message);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
  await pool.end();
  process.exit(0);
});

// Initialize application
(async () => {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     🚀 QLA Mathematics Platform v2.2 (Enhanced)           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    // Test database connection
    console.log('🔌 Connecting to database...');
    await pool.query('SELECT 1');
    console.log('✅ Database connected successfully\n');
    
    // Run initialization tasks
    await runMigrations();
    await syncLessons();
    await seedQuestionBanks();
    await seedDefaultData();
    
    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log(`║     ✨ Server is running!                                 ║`);
      console.log(`║                                                            ║`);
      console.log(`║     🌍 Environment:  ${ENV.padEnd(37)}║`);
      console.log(`║     🔌 Port:         ${String(PORT).padEnd(37)}║`);
      console.log(`║     🔗 URL:          http://localhost:${PORT.toString().padEnd(20)}║`);
      console.log(`║                                                            ║`);
      console.log(`║     📚 Features:                                          ║`);
      console.log(`║     • Student Portal    (/portal/student)                 ║`);
      console.log(`║     • Teacher Portal    (/portal/teacher)                 ║`);
      console.log(`║     • Admin Portal      (/portal/admin)                   ║`);
      console.log(`║     • Real-time Classes (Socket.io)                       ║`);
      console.log(`║     • Interactive Lessons (Grade 7 & 8)                   ║`);
      console.log(`║     • Assessments & Progress Tracking                     ║`);
      console.log(`║                                                            ║`);
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      
      if (ENV === 'development') {
        console.log('📝 Development mode - verbose logging enabled');
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();
