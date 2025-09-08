// server.js — QLA Mathematics Platform v3.0.1 (Railway-Ready with YouTube Fix)
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

// Configuration
const config = {
  PORT: process.env.PORT || 8080,
  ENV: process.env.NODE_ENV || 'production',
  DATABASE_URL: process.env.DATABASE_URL,
  PGSSL: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  MAX_FILE_SIZE: process.env.MAX_UPLOAD_SIZE || '100mb',
  SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT) || 604800000,
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: 100, // requests per window
  DB_RETRY_ATTEMPTS: 30, // Retry database connection 30 times
  DB_RETRY_DELAY: 2000, // Wait 2 seconds between retries
};

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with enhanced configuration
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Database connection pool with better configuration
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

// Error handling for pool
pool.on('error', (err, client) => {
  console.error('Unexpected database error on idle client', err);
});

// Enhanced Security Configuration with YouTube Support
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
        "https://s.ytimg.com",
        "https://apis.google.com"
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
        "https://yt3.ggpht.com",
        "https://img.youtube.com"
      ],
      mediaSrc: ["'self'", "https:", "blob:"],
      connectSrc: [
        "'self'", 
        "ws:", 
        "wss:", 
        "https:",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://apis.google.com"
      ],
      frameSrc: [
        "'self'", 
        "https://www.youtube.com", 
        "https://www.youtube-nocookie.com",
        "https://player.vimeo.com"
      ],
      childSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com"
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Additional middleware
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true
}));

// Request logging
if (config.ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Create logs directory if it doesn't exist
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

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW,
  max: config.RATE_LIMIT_MAX,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 requests per window
  message: 'Too many attempts, please try again later.'
});

// Apply rate limiting to API routes
app.use('/api/', limiter);
app.use('/auth/', strictLimiter);

// Body parsing middleware
app.use(express.json({ limit: config.MAX_FILE_SIZE }));
app.use(express.urlencoded({ extended: true, limit: config.MAX_FILE_SIZE }));

// Authentication and sessions
mountAuth(app, pool);

// Static file serving with enhanced caching
const staticOptions = {
  maxAge: config.ENV === 'production' ? '7d' : 0,
  etag: true,
  lastModified: true,
  index: false,
  dotfiles: 'deny',
  setHeaders: (res, filepath) => {
    if (filepath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (filepath.match(/\.(jpg|jpeg|png|gif|ico|svg)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
    }
  }
};

// Static routes
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));
app.use('/lessons/grade7', express.static(path.join(__dirname, 'grade7'), staticOptions));
app.use('/lessons/grade8', express.static(path.join(__dirname, 'grade8'), staticOptions));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), staticOptions));
app.use(express.static(path.join(__dirname, 'public'), staticOptions));

// Protected portal routes
app.get('/portal/student', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal-student.html'));
});

app.get('/portal/teacher', requireAuth, requireTeacher, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal-teacher.html'));
});

app.get('/portal/admin', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal-admin.html'));
});

// Root redirect with smart routing
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

// API Routes with middleware
app.use('/api/lessons', requireAuth, lessonsRouter);
app.use('/api/uploads', requireAuth, requireTeacher, uploadsRouter);
app.use('/api/assignments', requireAuth, requireTeacher, assignmentsRouter);
app.use('/api/assessments', requireAuth, assessmentsRouter);
app.use('/api/progress', requireAuth, progressRouter);
app.use('/api/classes', requireAuth, requireTeacher, classesRouter);
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);
app.use('/api/interactive', requireAuth, interactiveLessonsRouter);

// Enhanced health check endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'unknown',
    version: '3.0.1'
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

// System statistics endpoint
app.get('/api/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM lessons) as total_lessons,
        (SELECT COUNT(*) FROM interactive_lessons) as interactive_lessons,
        (SELECT COUNT(DISTINCT user_email) FROM progress) as active_students,
        (SELECT COUNT(DISTINCT teacher_email) FROM teacher_classes) as active_teachers,
        (SELECT COUNT(*) FROM assignments) as total_assignments,
        (SELECT COUNT(*) FROM assessment_attempts) as total_attempts,
        (SELECT AVG(score_pct) FROM assessment_attempts WHERE score_pct IS NOT NULL) as avg_score,
        (SELECT COUNT(*) FROM classes) as total_classes
    `);
    
    res.json({
      ...stats.rows[0],
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: io.engine.clientsCount || 0
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Enhanced WebSocket handling with rooms and namespaces
const classroomNamespace = io.of('/classroom');
const studentNamespace = io.of('/student');

// Initialize classroom features
initClassroom(classroomNamespace);

// Student real-time features
studentNamespace.on('connection', (socket) => {
  console.log('Student connected:', socket.id);
  
  socket.on('join-lesson', (lessonId) => {
    socket.join(`lesson-${lessonId}`);
    
    // Track active students
    studentNamespace.to(`lesson-${lessonId}`).emit('student-joined', {
      studentId: socket.id,
      timestamp: Date.now()
    });
  });
  
  socket.on('progress-update', async (data) => {
    const { lessonId, componentId, progress } = data;
    
    // Broadcast to teachers monitoring this lesson
    classroomNamespace.to(`monitoring-${lessonId}`).emit('student-progress', {
      studentId: socket.id,
      componentId,
      progress
    });
    
    // Store progress in database
    try {
      await pool.query(
        `INSERT INTO component_progress 
         (lesson_id, component_id, user_email, data) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (lesson_id, component_id, user_email) 
         DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [lessonId, componentId, socket.handshake.auth?.email || 'anonymous', JSON.stringify(progress)]
      );
    } catch (error) {
      console.error('Progress update error:', error);
    }
  });
  
  socket.on('help-request', (data) => {
    // Notify teachers when student needs help
    classroomNamespace.emit('student-help', {
      studentId: socket.id,
      lessonId: data.lessonId,
      componentId: data.componentId,
      message: data.message
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Student disconnected:', socket.id);
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Application error:', err);
  
  // Log to database in production
  if (config.ENV === 'production') {
    pool.query(
      'INSERT INTO error_logs (error_message, error_stack, url, method, user_email) VALUES ($1, $2, $3, $4, $5)',
      [err.message, err.stack, req.originalUrl, req.method, req.user?.email]
    ).catch(console.error);
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
    path: req.path,
    method: req.method
  });
});

// Database helper functions with Railway-specific retry logic
async function waitForDatabase() {
  console.log('🔌 Waiting for database connection...');
  
  for (let attempt = 1; attempt <= config.DB_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await pool.query('SELECT NOW() as time');
      console.log(`✅ Database connected at ${result.rows[0].time}`);
      return true;
    } catch (error) {
      console.log(`⏳ Database connection attempt ${attempt}/${config.DB_RETRY_ATTEMPTS}...`);
      if (attempt === config.DB_RETRY_ATTEMPTS) {
        console.error('❌ Failed to connect to database after all attempts');
        console.error('   Error:', error.message);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, config.DB_RETRY_DELAY));
    }
  }
  return false;
}

async function createTables() {
  console.log('📊 Creating/updating database tables...');
  
  try {
    // Error logging table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        error_message TEXT,
        error_stack TEXT,
        url TEXT,
        method VARCHAR(10),
        user_email TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Notification system
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        type VARCHAR(50),
        title TEXT,
        message TEXT,
        data JSONB,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Activity logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_email TEXT,
        action VARCHAR(100),
        entity_type VARCHAR(50),
        entity_id INT,
        metadata JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_email);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
      CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at);
    `);
    
    console.log('✅ Additional tables created successfully');
  } catch (error) {
    console.error('⚠️  Error creating tables:', error.message);
    // Don't throw - continue with startup
  }
}

async function runMigrations() {
  console.log('🔄 Running database migrations...');
  const dir = path.join(__dirname, 'migrations');
  
  // Create migrations directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('📁 Created migrations directory');
    return;
  }
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  
  if (files.length === 0) {
    console.log('ℹ️  No migration files found');
    return;
  }
  
  try {
    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        filename VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    for (const file of files) {
      // Check if migration was already run
      const { rows } = await pool.query('SELECT 1 FROM migrations WHERE filename = $1', [file]);
      if (rows.length > 0) {
        console.log(`⏭️  Migration already executed: ${file}`);
        continue;
      }
      
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      if (!sql.trim()) {
        console.log(`⏭️  Skipped empty migration: ${file}`);
        continue;
      }
      
      try {
        // Split by semicolons and execute each statement
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        await pool.query('BEGIN');
        
        for (const statement of statements) {
          try {
            await pool.query(statement);
          } catch (stmtError) {
            // Skip if object already exists
            if (stmtError.message.includes('already exists')) {
              console.log(`  ⚠️  Object already exists (continuing)`);
            } else {
              throw stmtError;
            }
          }
        }
        
        // Record successful migration
        await pool.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [file]
        );
        
        await pool.query('COMMIT');
        console.log(`✅ Migration executed: ${file}`);
        
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`⚠️  Migration failed: ${file}`);
        console.error(`   Error: ${error.message}`);
        // Continue with other migrations
      }
    }
    
    console.log('✅ Migrations complete');
  } catch (error) {
    console.error('⚠️  Migration error:', error.message);
    // Don't throw - continue with startup
  }
}

async function syncLessons() {
  console.log('📚 Syncing lessons from filesystem...');
  const grades = [7, 8];
  
  try {
    for (const grade of grades) {
      const dir = path.join(__dirname, `grade${grade}`);
      if (!fs.existsSync(dir)) {
        console.log(`⚠️  Grade ${grade} directory not found`);
        continue;
      }
      
      const files = fs.readdirSync(dir)
        .filter(fn => fn.toLowerCase().endsWith('.html'))
        .sort();
      
      console.log(`  Found ${files.length} lessons for Grade ${grade}`);
      
      for (let i = 0; i < files.length; i++) {
        const filename = files[i];
        const filepath = path.join(dir, filename);
        const stats = fs.statSync(filepath);
        
        // Parse lesson info from filename
        let unit = Math.floor(i / 5) + 1;
        let order = (i % 5) + 1;
        
        const match = filename.match(/lesson-(\d+)-(\d+)\.html/i) || 
                      filename.match(/lesson-(\d+)\.html/i);
        if (match) {
          if (match.length === 3) {
            unit = parseInt(match[1]);
            order = parseInt(match[2]);
          } else {
            order = parseInt(match[1]);
          }
        }
        
        // Extract title from HTML
        let title = filename.replace(/[-_]/g, ' ').replace(/\.html$/i, '');
        try {
          const content = fs.readFileSync(filepath, 'utf8');
          const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch) {
            title = titleMatch[1]
              .replace(/QLA|Grade \d+|G\d+|[•·]/g, '')
              .trim();
          }
        } catch (e) {
          // Continue with filename-based title
        }
        
        const slug = `${grade}-${unit}-${order}`;
        const htmlPath = `/lessons/grade${grade}/${filename}`;
        
        await pool.query(
          `INSERT INTO lessons 
           (slug, grade, unit, lesson_order, title, html_path, is_public, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, $5, $6, true, $7, $7)
           ON CONFLICT (slug) 
           DO UPDATE SET 
             title = EXCLUDED.title,
             html_path = EXCLUDED.html_path,
             updated_at = NOW()`,
          [slug, grade, unit, order, title, htmlPath, new Date(stats.mtime)]
        );
      }
    }
    
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM lessons');
    console.log(`✅ Synced ${rows[0].count} lessons total`);
  } catch (error) {
    console.error('⚠️  Lesson sync error:', error.message);
    // Don't throw - continue with startup
  }
}

async function seedData() {
  console.log('🌱 Seeding initial data...');
  
  try {
    // Create default classes if none exist
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
    
    // Create sample question banks for each lesson (limit to 5 for performance)
    const { rows: lessons } = await pool.query('SELECT id, title FROM lessons LIMIT 5');
    for (const lesson of lessons) {
      const { rows: existing } = await pool.query(
        'SELECT 1 FROM assessments WHERE lesson_id = $1 LIMIT 1',
        [lesson.id]
      );
      
      if (existing.length === 0) {
        // Create question bank
        const { rows: bank } = await pool.query(
          'INSERT INTO question_banks (title, created_by) VALUES ($1, $2) RETURNING id',
          [`${lesson.title} - Assessment`, 'system']
        );
        
        // Add sample questions
        const questions = [
          {
            type: 'mcq',
            prompt: 'Which concept is most important in this lesson?',
            options: ['Understanding', 'Speed', 'Memorization', 'Guessing'],
            answer: 0,
            points: 1
          },
          {
            type: 'tf',
            prompt: 'This lesson builds on previous knowledge.',
            options: ['True', 'False'],
            answer: 0,
            points: 1
          },
          {
            type: 'num',
            prompt: 'What is 10 + 15?',
            answer: { value: 25, tolerance: 0 },
            points: 1
          }
        ];
        
        for (const q of questions) {
          await pool.query(
            'INSERT INTO questions (bank_id, type, prompt, options, answer, points) VALUES ($1, $2, $3, $4, $5, $6)',
            [bank[0].id, q.type, q.prompt, JSON.stringify(q.options), JSON.stringify(q.answer), q.points]
          );
        }
        
        // Create assessment
        await pool.query(
          'INSERT INTO assessments (lesson_id, bank_id, title, pass_pct, created_by) VALUES ($1, $2, $3, $4, $5)',
          [lesson.id, bank[0].id, `${lesson.title} - Quiz`, 70, 'system']
        );
      }
    }
    
    console.log('✅ Seeding complete');
  } catch (error) {
    console.error('⚠️  Seeding error:', error.message);
    // Don't throw - continue with startup
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n📴 ${signal} signal received: closing HTTP server`);
  
  // Close socket connections
  io.close(() => {
    console.log('WebSocket server closed');
  });
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Close database pool
  await pool.end();
  console.log('Database connections closed');
  
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Try to log to database
  pool.query(
    'INSERT INTO error_logs (error_message, error_stack) VALUES ($1, $2)',
    [error.message, error.stack]
  ).catch(console.error);
  
  // Don't exit immediately in production
  if (config.ENV !== 'production') {
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log but don't exit
  pool.query(
    'INSERT INTO error_logs (error_message, error_stack) VALUES ($1, $2)',
    ['Unhandled Promise Rejection', String(reason)]
  ).catch(console.error);
});

// Main initialization function
async function initialize() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 QLA Mathematics Platform v3.0.1                    ║');
  console.log('║     Railway-Ready with YouTube Support                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  try {
    // Wait for database with Railway-specific retry logic
    const dbConnected = await waitForDatabase();
    
    if (!dbConnected) {
      console.error('❌ Could not establish database connection');
      console.log('⚠️  Starting server anyway - some features may be unavailable');
    } else {
      // Run initialization tasks only if database is connected
      try {
        await createTables();
        await runMigrations();
        await syncLessons();
        await seedData();
      } catch (initError) {
        console.error('⚠️  Initialization error:', initError.message);
        console.log('   Continuing with server startup...');
      }
    }
    
    // Start server regardless of database status
    server.listen(config.PORT, '0.0.0.0', () => {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║     ✨ Server is running!                                  ║');
      console.log('║                                                            ║');
      console.log(`║     🌍 Environment:  ${config.ENV.padEnd(37)}║`);
      console.log(`║     🔌 Port:         ${String(config.PORT).padEnd(37)}║`);
      console.log(`║     🔗 Local:        http://localhost:${config.PORT.toString().padEnd(20)}║`);
      console.log('║                                                            ║');
      console.log('║     📚 Features:                                          ║');
      console.log('║     • Interactive Video Lessons with YouTube Support      ║');
      console.log('║     • Fixed Content Security Policy                       ║');
      console.log('║     • Mandatory Checkpoints                               ║');
      console.log('║     • Real-time Progress Tracking                         ║');
      console.log('║     • Live Classroom Mode                                 ║');
      console.log('║     • Advanced Analytics                                  ║');
      console.log('║     • Gamification & Achievements                         ║');
      console.log('║                                                            ║');
      console.log('║     📱 Portals:                                           ║');
      console.log('║     • Student: /portal/student                            ║');
      console.log('║     • Teacher: /portal/teacher                            ║');
      console.log('║     • Admin:   /portal/admin                              ║');
      console.log('║                                                            ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      
      // Log configuration warnings
      if (!process.env.GOOGLE_CLIENT_ID) {
        console.warn('⚠️  Warning: Google OAuth not configured - authentication may not work');
      }
      if (!process.env.DATABASE_URL) {
        console.warn('⚠️  Warning: DATABASE_URL not set - database features disabled');
      }
      if (config.ENV === 'development') {
        console.log('📝 Development mode - verbose logging enabled');
      }
      
      console.log('🚀 Platform ready for use with YouTube support!');
      console.log('🎥 YouTube videos should now work properly in lessons\n');
    });
    
  } catch (error) {
    console.error('❌ Fatal error during startup:', error);
    process.exit(1);
  }
}

// Start the application
initialize();
