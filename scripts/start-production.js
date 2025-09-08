// scripts/start-production.js - Production startup script
const { spawn } = require('child_process');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`)
};

async function checkDatabase() {
  log.info('Checking database connection...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });

  try {
    const result = await pool.query('SELECT NOW()');
    log.success(`Database connected at ${result.rows[0].now}`);
    await pool.end();
    return true;
  } catch (error) {
    log.error(`Database connection failed: ${error.message}`);
    await pool.end();
    return false;
  }
}

async function runMigrations() {
  log.info('Running database migrations...');
  
  return new Promise((resolve, reject) => {
    const migrate = spawn('node', ['scripts/run-migrations.js'], {
      stdio: 'inherit',
      env: process.env
    });

    migrate.on('close', (code) => {
      if (code === 0) {
        log.success('Migrations completed successfully');
        resolve();
      } else {
        log.error(`Migrations failed with code ${code}`);
        reject(new Error('Migration failed'));
      }
    });

    migrate.on('error', (err) => {
      log.error(`Failed to start migration process: ${err.message}`);
      reject(err);
    });
  });
}

async function checkEnvironment() {
  log.info('Checking environment variables...');
  
  const required = [
    'DATABASE_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'OAUTH_CALLBACK_URL',
    'COOKIE_SECRET',
    'ALLOWED_GOOGLE_DOMAIN'
  ];

  const missing = [];
  const warnings = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Check for default/insecure values
  if (process.env.COOKIE_SECRET === 'your-64-character-secure-random-string-here-change-this') {
    warnings.push('COOKIE_SECRET is using default value - please change for security!');
  }

  if (process.env.NODE_ENV !== 'production') {
    warnings.push(`NODE_ENV is '${process.env.NODE_ENV}' - should be 'production' for Railway`);
  }

  // Check optional but recommended
  if (!process.env.TEACHER_EMAILS) {
    warnings.push('TEACHER_EMAILS not set - no teachers will have elevated access');
  }

  if (!process.env.ADMIN_EMAILS) {
    warnings.push('ADMIN_EMAILS not set - no admins will have full access');
  }

  // Report findings
  if (missing.length > 0) {
    log.error(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }

  warnings.forEach(w => log.warning(w));

  log.success('Environment variables configured');
  return true;
}

async function createRequiredDirectories() {
  log.info('Creating required directories...');
  
  const dirs = [
    'uploads',
    'uploads/videos',
    'uploads/lesson-videos',
    'logs',
    'temp'
  ];

  for (const dir of dirs) {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      log.success(`Created directory: ${dir}`);
    }
  }
}

async function startServer() {
  log.info('Starting main server...');
  
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['server.js'], {
      stdio: 'inherit',
      env: process.env
    });

    server.on('error', (err) => {
      log.error(`Failed to start server: ${err.message}`);
      reject(err);
    });

    // Server doesn't normally exit, so we don't wait for 'close'
    // Just give it a moment to crash if it's going to
    setTimeout(() => {
      log.success('Server process started');
      resolve();
    }, 2000);
  });
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         QLA Mathematics Platform - Production Startup      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Check environment
    const envOk = await checkEnvironment();
    if (!envOk && process.env.NODE_ENV === 'production') {
      log.error('Environment check failed. Please configure all required variables.');
      process.exit(1);
    }

    // 2. Create directories
    await createRequiredDirectories();

    // 3. Check database
    let dbConnected = false;
    let retries = 0;
    const maxRetries = 10;

    while (!dbConnected && retries < maxRetries) {
      dbConnected = await checkDatabase();
      if (!dbConnected) {
        retries++;
        log.warning(`Database connection attempt ${retries}/${maxRetries} failed. Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (!dbConnected) {
      log.error('Could not connect to database after multiple attempts');
      process.exit(1);
    }

    // 4. Run migrations
    try {
      await runMigrations();
    } catch (error) {
      log.warning('Migration issues detected, but continuing...');
    }

    // 5. Start server
    await startServer();

    log.success('Platform initialization complete!');
    console.log('\n🚀 QLA Mathematics Platform is running in production mode\n');

  } catch (error) {
    log.error(`Startup failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Handle termination signals
process.on('SIGTERM', () => {
  log.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start the application
main().catch(error => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
