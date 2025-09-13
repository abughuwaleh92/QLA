// server.js - QLA Mathematics Platform v3.1.0 (Fixed Version)
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const dayjs = require('dayjs');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

// Import modules
const { mountAuth, requireAuth, requireTeacher, requireAdmin } = require('./auth');
const lessonsRouter = require('./routes/lessons');
const uploadsRouter = require('./routes/uploads');
const assignmentsRouter = require('./routes/assignments');
const assessmentsRouter = require('./routes/assessments');
const progressRouter = require('./routes/progress');
const classesRouter = require('./routes/classes');
const adminRouter = require('./routes/admin');
const interactiveLessonsRouter = require('./routes/interactive-lessons');
const { initClassroom } = require('./routes/classroom');
const lessonPlanGeneratorRouter = require('./routes/lesson-plan-generator');
const lessonPlanExportRouter = require('./routes/lesson-plan-export');
const practiceRouter = require('./routes/practice');
const teacherPracticeRouter = require('./routes/teacher-practice');


// Enhanced Configuration with fixes
const config = {
  PORT: process.env.PORT || 8080,
  ENV: process.env.NODE_ENV || 'production',
  DATABASE_URL: process.env.DATABASE_URL,
  PGSSL: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  MAX_FILE_SIZE: process.env.MAX_UPLOAD_SIZE || '100mb',
  SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT) || 604800000,
  // Fixed rate limits
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 500,
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 50,
  DB_RETRY_ATTEMPTS: 30,
  DB_RETRY_DELAY: 2000,
};

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Database connection pool with enhanced error handling
const pool = new Pool({ 
  connectionString: config.DATABASE_URL,
  ssl: config.PGSSL,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  query_timeout: 30000,
  application_name: 'qla-math-platform'
});

// Enhanced error recovery for database
pool.on('error', async (err, client) => {
  console.error('Database pool error:', err.message);
  
  // Auto-recover session table if corrupted
  if (err.message && (err.message.includes('session') || err.message.includes('relation'))) {
    console.log('Attempting to auto-fix session table...');
    try {
      const fixClient = await pool.connect();
      await fixClient.query(`
        CREATE TABLE IF NOT EXISTS session (
          sid VARCHAR NOT NULL COLLATE "default",
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL,
          PRIMARY KEY (sid)
        );
        CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
      `);
      fixClient.release();
      console.log('✅ Session table auto-fixed');
    } catch (fixErr) {
      console.error('Could not auto-fix session table:', fixErr.message);
    }
  }
});

// Enhanced Security with YouTube Support
app.use(helmet({ 
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'", 
        "https://cdn.jsdelivr.net", 
        "https://cdn.tailwindcss.com", 
        "https://cdnjs.cloudflare.com",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://s.ytimg.com"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://cdn.jsdelivr.net", 
        "https://fonts.googleapis.com", 
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'", 
        "https://fonts.gstatic.com", 
        "https://cdnjs.cloudflare.com"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "https:", 
        "blob:",
        "https://i.ytimg.com",
        "https://yt3.ggpht.com"
      ],
      mediaSrc: ["'self'", "https:", "blob:"],
      connectSrc: [
        "'self'", 
        "ws:", 
        "wss:", 
        "https:",
        "https://www.youtube.com"
      ],
      frameSrc: [
        "'self'", 
        "https://www.youtube.com", 
        "https://www.youtube-nocookie.com",
        "https://player.vimeo.com"
      ],
      childSrc: ["'self'", "https://www.youtube.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Middleware
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true
}));

// Request logging
if (config.ENV === 'development') {
  app.use(morgan('dev'));
} else {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'), 
    { flags: 'a' }
  );
  app.use(morgan('combined', { stream: accessLogStream }));
}

// FIXED Rate limiting with reasonable limits
const apiLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW,
  max: config.RATE_LIMIT_MAX,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for static assets
    return req.path.startsWith('/assets') || 
           req.path.startsWith('/uploads') ||
           req.path.endsWith('.css') || 
           req.path.endsWith('.js') ||
           req.path.endsWith('.png') ||
           req.path.endsWith('.jpg') ||
           req.path.endsWith('.html');
  }
});

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: config.AUTH_RATE_LIMIT_MAX,
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
  skip: (req) => {
    // Skip for successful authentications
    return req.user !== undefined;
  }
});

// Apply rate limiting
app.use('/api/', apiLimiter);
app.use('/auth/', authLimiter);

// Body parsing
app.use(express.json({ limit: config.MAX_FILE_SIZE }));
app.use(express.urlencoded({ extended: true, limit: config.MAX_FILE_SIZE }));

// Authentication - mount after rate limiting
mountAuth(app, pool);

// Static file serving
const staticOptions = {
  maxAge: config.ENV === 'production' ? '7d' : 0,
  etag: true,
  lastModified: true,
  index: false,
  dotfiles: 'deny'
};

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
app.use('/lessons/grade7', express.static(path.join(__dirname, 'grade7'), staticOptions));
app.use('/lessons/grade8', express.static(path.join(__dirname, 'grade8'), staticOptions));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), staticOptions));
app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/api/lesson-plan-generator', requireAuth, requireTeacher, lessonPlanGeneratorRouter);
app.use('/api/lesson-plan-export', requireAuth, requireTeacher, lessonPlanExportRouter);
app.use('/api/practice', requireAuth, practiceRouter);
app.use('/api/teacher/practice', requireAuth, requireTeacher, teacherPracticeRouter);

// Protected portals
app.get('/portal/student', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal-student.html'));
});

app.get('/portal/teacher', requireAuth, requireTeacher, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal-teacher.html'));
});

app.get('/portal/admin', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal-admin.html'));
});

// Root route
app.get('/', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const role = req.user?.role;
    const redirectMap = {
      'admin': '/portal/admin',
      'teacher': '/portal/teacher',
      'student': '/portal/student'
    };
    return res.redirect(redirectMap[role] || '/portal/student');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.use('/api/lessons', requireAuth, lessonsRouter);
app.use('/api/uploads', requireAuth, requireTeacher, uploadsRouter);
app.use('/api/assignments', requireAuth, requireTeacher, assignmentsRouter);
app.use('/api/assessments', requireAuth, assessmentsRouter);
app.use('/api/progress', requireAuth, progressRouter);
app.use('/api/classes', requireAuth, requireTeacher, classesRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);
app.use('/api/interactive', requireAuth, interactiveLessonsRouter);

// Enhanced health check
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'unknown',
    version: '3.1.0',
    rateLimit: {
      window: config.RATE_LIMIT_WINDOW,
      max: config.RATE_LIMIT_MAX
    }
  };

  try {
    const result = await pool.query('SELECT NOW() as time, version() as version');
    health.database = 'connected';
    health.dbVersion = result.rows[0].version.split(' ')[0];
    health.dbTime = result.rows[0].time;
    res.json(health);
  } catch (error) {
    health.status = 'degraded';
    health.database = 'disconnected';
    health.error = error.message;
    res.status(503).json(health);
  }
});

// WebSocket handling
initClassroom(io.of('/classroom'));

// Error handling
app.use((err, req, res, next) => {
  console.error('Application error:', err);
  
  // Don't log session-related errors as critical
  if (!err.message?.includes('session')) {
    pool.query(
      'INSERT INTO error_logs (error_message, error_stack, url, method, user_email) VALUES ($1, $2, $3, $4, $5)',
      [err.message, err.stack, req.originalUrl, req.method, req.user?.email]
    ).catch(() => {}); // Ignore logging errors
  }
  
  res.status(err.status || 500).json({
    error: config.ENV === 'production' ? 'Internal server error' : err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path
  });
});

// Database initialization functions
async function waitForDatabase() {
  console.log('🔌 Waiting for database connection...');
  
  for (let attempt = 1; attempt <= config.DB_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await pool.query('SELECT NOW() as time');
      console.log(`✅ Database connected at ${result.rows[0].time}`);
      return true;
    } catch (error) {
      console.log(`⏳ Database attempt ${attempt}/${config.DB_RETRY_ATTEMPTS}...`);
      if (attempt === config.DB_RETRY_ATTEMPTS) {
        console.error('❌ Database connection failed:', error.message);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, config.DB_RETRY_DELAY));
    }
  }
  return false;
}

async function ensureSessionTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        PRIMARY KEY (sid)
      );
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
    `);
    console.log('✅ Session table ready');
  } catch (error) {
    console.error('⚠️  Session table error:', error.message);
  }
}

async function createTables() {
  console.log('📊 Creating database tables...');
  
  try {
    // First ensure session table
    await ensureSessionTable();
    
    // Create other tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        error_message TEXT,
        error_stack TEXT,
        url TEXT,
        method VARCHAR(10),
        user_email TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        type VARCHAR(50),
        title TEXT,
        message TEXT,
        data JSONB,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email);
      CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at);
    `);
    
    console.log('✅ Tables created successfully');
  } catch (error) {
    console.error('⚠️  Table creation error:', error.message);
  }
}

async function runMigrations() {
  console.log('🔄 Running migrations...');
  const dir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('📁 Created migrations directory');
    return;
  }
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        filename VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    
    for (const file of files) {
      const { rows } = await pool.query('SELECT 1 FROM migrations WHERE filename = $1', [file]);
      if (rows.length > 0) continue;
      
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      if (!sql.trim()) continue;
      
      try {
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        
        await pool.query('BEGIN');
        for (const statement of statements) {
          try {
            await pool.query(statement);
          } catch (stmtError) {
            if (!stmtError.message.includes('already exists')) throw stmtError;
          }
        }
        
        await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`✅ Migration executed: ${file}`);
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`⚠️  Migration failed: ${file} - ${error.message}`);
      }
    }
    
    console.log('✅ Migrations complete');
  } catch (error) {
    console.error('⚠️  Migration error:', error.message);
  }
}

async function syncLessons() {
  console.log('📚 Syncing lessons...');
  const grades = [7, 8];
  
  try {
    for (const grade of grades) {
      const dir = path.join(__dirname, `grade${grade}`);
      
      // Create directory if missing
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        
        // Create welcome file
        const welcomeHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Welcome to Grade ${grade}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-8">
  <h1 class="text-3xl font-bold mb-4">Welcome to Grade ${grade} Mathematics</h1>
  <p>Interactive lessons coming soon!</p>
  <script src="/js/lesson-bridge.js"></script>
</body>
</html>`;
        fs.writeFileSync(path.join(dir, 'welcome.html'), welcomeHtml);
        console.log(`Created grade${grade} directory with welcome file`);
      }
      
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
      
      // Add default lessons if no files exist
      if (files.length === 0) {
        const defaultLessons = [
          { title: 'Introduction to Mathematics', unit: 1, order: 1 },
          { title: 'Number Systems', unit: 1, order: 2 },
          { title: 'Basic Operations', unit: 1, order: 3 },
          { title: 'Fractions and Decimals', unit: 2, order: 1 },
          { title: 'Algebra Introduction', unit: 2, order: 2 }
        ];
        
        for (const lesson of defaultLessons) {
          const slug = `${grade}-${lesson.unit}-${lesson.order}`;
          await pool.query(
            `INSERT INTO lessons (slug, grade, unit, lesson_order, title, is_public)
             VALUES ($1, $2, $3, $4, $5, true)
             ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title`,
            [slug, grade, lesson.unit, lesson.order, lesson.title]
          );
        }
        console.log(`Added ${defaultLessons.length} default lessons for grade ${grade}`);
      } else {
        // Sync existing files
        for (let i = 0; i < files.length; i++) {
          const filename = files[i];
          const unit = Math.floor(i / 5) + 1;
          const order = (i % 5) + 1;
          const slug = `${grade}-${unit}-${order}`;
          const htmlPath = `/lessons/grade${grade}/${filename}`;
          let title = filename.replace('.html', '').replace(/[-_]/g, ' ');
          
          // Try to extract title from HTML
          try {
            const content = fs.readFileSync(path.join(dir, filename), 'utf8');
            const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
              title = titleMatch[1].replace(/QLA|Grade \d+|[•·]/g, '').trim();
            }
          } catch (e) {}
          
          await pool.query(
            `INSERT INTO lessons (slug, grade, unit, lesson_order, title, html_path, is_public)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             ON CONFLICT (slug) DO UPDATE SET 
               title = EXCLUDED.title,
               html_path = EXCLUDED.html_path`,
            [slug, grade, unit, order, title, htmlPath]
          );
        }
        console.log(`Synced ${files.length} lessons for grade ${grade}`);
      }
    }
    
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM lessons');
    console.log(`✅ Total lessons in database: ${rows[0].count}`);
  } catch (error) {
    console.error('⚠️  Lesson sync error:', error.message);
  }
}

async function seedData() {
  console.log('🌱 Seeding initial data...');
  
  try {
    // Create default classes
    const { rows: classCount } = await pool.query('SELECT COUNT(*) as count FROM classes');
    if (classCount[0].count === 0) {
      await pool.query(`
        INSERT INTO classes (code, name, grade, created_by) VALUES 
        ('G7A', 'Grade 7 - Section A', 7, 'system'),
        ('G7B', 'Grade 7 - Section B', 7, 'system'),
        ('G8A', 'Grade 8 - Section A', 8, 'system'),
        ('G8B', 'Grade 8 - Section B', 8, 'system')
        ON CONFLICT (code) DO NOTHING
      `);
      console.log('✅ Created default classes');
    }
    
    // Create sample assessments for first 5 lessons
    const { rows: lessons } = await pool.query('SELECT id, title FROM lessons LIMIT 5');
    for (const lesson of lessons) {
      const { rows: existing } = await pool.query(
        'SELECT 1 FROM assessments WHERE lesson_id = $1 LIMIT 1',
        [lesson.id]
      );
      
      if (existing.length === 0) {
        const { rows: bank } = await pool.query(
          'INSERT INTO question_banks (title, created_by) VALUES ($1, $2) RETURNING id',
          [`${lesson.title} - Assessment`, 'system']
        );
        
        const questions = [
          { type: 'mcq', prompt: 'What is 2 + 2?', options: ['3', '4', '5', '6'], answer: 1, points: 1 },
          { type: 'tf', prompt: 'Mathematics is useful.', options: ['True', 'False'], answer: 0, points: 1 }
        ];
        
        for (const q of questions) {
          await pool.query(
            'INSERT INTO questions (bank_id, type, prompt, options, answer, points) VALUES ($1, $2, $3, $4, $5, $6)',
            [bank[0].id, q.type, q.prompt, JSON.stringify(q.options), JSON.stringify(q.answer), q.points]
          );
        }
        
        await pool.query(
          'INSERT INTO assessments (lesson_id, bank_id, title, pass_pct, created_by) VALUES ($1, $2, $3, $4, $5)',
          [lesson.id, bank[0].id, `${lesson.title} - Quiz`, 70, 'system']
        );
      }
    }
    
    console.log('✅ Seeding complete');
  } catch (error) {
    console.error('⚠️  Seeding error:', error.message);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n📴 ${signal} received: closing server`);
  
  io.close(() => console.log('WebSocket server closed'));
  server.close(() => console.log('HTTP server closed'));
  await pool.end();
  console.log('Database connections closed');
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Main initialization
async function initialize() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 QLA Mathematics Platform v3.1.0                    ║');
  console.log('║     Fixed Session, Rate Limiting & Lessons                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  try {
    const dbConnected = await waitForDatabase();
    
    if (!dbConnected) {
      console.error('❌ Database connection failed - starting in degraded mode');
      console.log('⚠️  Some features will be unavailable');
    } else {
      try {
        await createTables();
        await runMigrations();
        await syncLessons();
        await seedData();
      } catch (initError) {
        console.error('⚠️  Initialization warning:', initError.message);
        console.log('   Continuing with server startup...');
      }
    }
    
    server.listen(config.PORT, '0.0.0.0', () => {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║     ✨ Server is running!                                 ║');
      console.log(`║     🔌 Port: ${String(config.PORT).padEnd(46)}║`);
      console.log(`║     📊 Rate Limits: ${config.RATE_LIMIT_MAX} requests per ${Math.floor(config.RATE_LIMIT_WINDOW/60000)} minutes       ║`);
      console.log(`║     🔐 Auth Limits: ${config.AUTH_RATE_LIMIT_MAX} attempts per 5 minutes         ║`);
      console.log('║                                                            ║');
      console.log('║     Access at: http://localhost:' + config.PORT + '                     ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      
      if (!process.env.DATABASE_URL) {
        console.warn('⚠️  Warning: DATABASE_URL not set');
      }
      if (!process.env.GOOGLE_CLIENT_ID) {
        console.warn('⚠️  Warning: Google OAuth not configured');
      }
      
      console.log('🚀 Platform ready with all fixes applied!\n');
    });
    
  } catch (error) {
    console.error('❌ Fatal startup error:', error);
    process.exit(1);
  }
}

// Start the application
initialize();
