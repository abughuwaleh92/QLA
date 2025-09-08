#!/usr/bin/env node
// scripts/fix-all.js - Complete repair script for QLA Platform
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.magenta}${'='.repeat(50)}${colors.reset}\n${colors.magenta}${msg}${colors.reset}\n${colors.magenta}${'='.repeat(50)}${colors.reset}`)
};

async function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      env: process.env
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

async function fixAll() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     🔧 QLA Mathematics Platform - Complete Repair         ║
║                        Version 3.1.0                       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  // Check environment
  log.section('STEP 1: Environment Check');
  
  const requiredVars = [
    'DATABASE_URL',
    'GOOGLE_CLIENT_ID', 
    'GOOGLE_CLIENT_SECRET',
    'OAUTH_CALLBACK_URL',
    'COOKIE_SECRET'
  ];
  
  const missing = [];
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      log.success(`${varName} is set`);
    } else {
      missing.push(varName);
      log.error(`${varName} is missing`);
    }
  }
  
  if (missing.length > 0) {
    console.log('\n');
    log.error('Missing required environment variables!');
    console.log('\nPlease set these in Railway or your .env file:');
    missing.forEach(v => console.log(`  ${v}=your_value_here`));
    
    if (!process.env.DATABASE_URL) {
      console.log('\nCannot continue without DATABASE_URL');
      process.exit(1);
    }
  }
  
  // Test database connection
  log.section('STEP 2: Database Connection Test');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });
  
  try {
    const { rows } = await pool.query('SELECT NOW() as time, version() as version');
    log.success(`Connected to database at ${rows[0].time}`);
    log.info(`PostgreSQL ${rows[0].version.split(' ')[1]}`);
  } catch (error) {
    log.error(`Database connection failed: ${error.message}`);
    console.log('\nTroubleshooting:');
    console.log('1. Check DATABASE_URL is correct');
    console.log('2. Ensure database is running');
    console.log('3. Check network connectivity');
    process.exit(1);
  }
  
  // Fix sessions
  log.section('STEP 3: Fixing Session Table');
  
  try {
    // Drop and recreate session table
    await pool.query('DROP TABLE IF EXISTS session CASCADE');
    log.info('Dropped old session table');
    
    await pool.query(`
      CREATE TABLE session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        PRIMARY KEY (sid)
      );
      CREATE INDEX IDX_session_expire ON session(expire);
    `);
    log.success('Session table recreated');
    
    // Test it
    await pool.query(
      'INSERT INTO session (sid, sess, expire) VALUES ($1, $2, $3)',
      ['test-' + Date.now(), '{}', new Date(Date.now() + 3600000)]
    );
    log.success('Session table is working');
    
  } catch (error) {
    log.error(`Session fix failed: ${error.message}`);
  }
  
  // Fix lessons
  log.section('STEP 4: Restoring Lessons');
  
  try {
    // Check if script exists
    const fixLessonsPath = path.join(__dirname, 'fix-lessons.js');
    if (fs.existsSync(fixLessonsPath)) {
      log.info('Running lesson restoration script...');
      await runCommand('node', [fixLessonsPath]);
    } else {
      // Inline lesson fix
      log.info('Creating default lessons...');
      
      const grades = [7, 8];
      for (const grade of grades) {
        const lessons = [
          { title: `Grade ${grade} Introduction`, unit: 1, order: 1 },
          { title: 'Number Systems', unit: 1, order: 2 },
          { title: 'Basic Operations', unit: 1, order: 3 },
          { title: 'Fractions', unit: 1, order: 4 },
          { title: 'Algebra Basics', unit: 2, order: 1 }
        ];
        
        for (const lesson of lessons) {
          const slug = `${grade}-${lesson.unit}-${lesson.order}`;
          await pool.query(
            `INSERT INTO lessons (slug, grade, unit, lesson_order, title, is_public)
             VALUES ($1, $2, $3, $4, $5, true)
             ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title`,
            [slug, grade, lesson.unit, lesson.order, lesson.title]
          );
        }
      }
      
      const { rows } = await pool.query('SELECT COUNT(*) as count FROM lessons');
      log.success(`Created ${rows[0].count} lessons`);
    }
  } catch (error) {
    log.error(`Lesson restoration failed: ${error.message}`);
  }
  
  // Clean up database
  log.section('STEP 5: Database Cleanup');
  
  const cleanupQueries = [
    { name: 'Orphaned progress events', query: 'DELETE FROM progress_events WHERE user_email IS NULL' },
    { name: 'Old error logs', query: "DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '30 days'" },
    { name: 'Expired sessions', query: 'DELETE FROM session WHERE expire < NOW()' }
  ];
  
  for (const cleanup of cleanupQueries) {
    try {
      const result = await pool.query(cleanup.query);
      if (result.rowCount > 0) {
        log.success(`${cleanup.name}: cleaned ${result.rowCount} records`);
      }
    } catch (err) {
      // Table might not exist
      if (!err.message.includes('does not exist')) {
        log.warning(`${cleanup.name}: ${err.message}`);
      }
    }
  }
  
  // Create missing tables
  log.section('STEP 6: Ensuring All Tables Exist');
  
  const tables = [
    'lessons', 'classes', 'enrollments', 'teacher_classes',
    'assignments', 'assessments', 'question_banks', 'questions',
    'assessment_attempts', 'progress', 'progress_events'
  ];
  
  for (const table of tables) {
    const { rows } = await pool.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      )`,
      [table]
    );
    
    if (rows[0].exists) {
      log.success(`Table '${table}' exists`);
    } else {
      log.warning(`Table '${table}' is missing`);
    }
  }
  
  // Update environment variables
  log.section('STEP 7: Recommended Environment Variables');
  
  console.log('\nAdd these to Railway for better performance:\n');
  console.log('RATE_LIMIT_MAX=500');
  console.log('AUTH_RATE_LIMIT_MAX=50');
  console.log('SESSION_TIMEOUT=604800000');
  console.log('SESSION_NAME=qla_sid');
  console.log('NODE_ENV=production');
  console.log('PGSSL=disable');
  
  // Final verification
  log.section('STEP 8: Final Verification');
  
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM lessons) as lessons,
        (SELECT COUNT(*) FROM classes) as classes,
        (SELECT COUNT(*) FROM session) as sessions,
        pg_size_pretty(pg_database_size(current_database())) as db_size
    `);
    
    const s = stats.rows[0];
    console.log('\n📊 Database Status:');
    console.log(`   Lessons: ${s.lessons}`);
    console.log(`   Classes: ${s.classes}`);
    console.log(`   Sessions: ${s.sessions}`);
    console.log(`   Database size: ${s.db_size}`);
    
    if (parseInt(s.lessons) === 0) {
      log.warning('No lessons found - you may need to create some');
    }
    
  } catch (error) {
    log.error(`Verification failed: ${error.message}`);
  }
  
  await pool.end();
  
  // Summary
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║                   ✨ Repair Complete!                     ║
║                                                            ║
║  Next Steps:                                               ║
║  1. Update environment variables in Railway               ║
║  2. Restart your application                              ║
║  3. Clear browser cookies                                 ║
║  4. Try logging in again                                  ║
║                                                            ║
║  If issues persist:                                       ║
║  - Check Railway logs for errors                          ║
║  - Verify OAuth callback URL matches your domain          ║
║  - Ensure teachers/admins are in environment variables    ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
}

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!\n');
  console.error('Usage:');
  console.error('  DATABASE_URL=your_database_url node scripts/fix-all.js\n');
  console.error('Or set it in your .env file');
  process.exit(1);
}

// Run the complete fix
fixAll().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
