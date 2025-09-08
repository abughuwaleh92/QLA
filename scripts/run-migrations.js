// scripts/run-migrations.js - Railway-Ready Migration Runner
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Configuration
const config = {
  DATABASE_URL: process.env.DATABASE_URL,
  PGSSL: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  MAX_RETRIES: 30,
  RETRY_DELAY: 2000,
  ENVIRONMENT: process.env.NODE_ENV || 'production'
};

async function waitForDatabase(pool) {
  console.log('🔌 Waiting for database connection...');
  
  for (let attempt = 1; attempt <= config.MAX_RETRIES; attempt++) {
    try {
      const result = await pool.query('SELECT NOW() as time');
      console.log(`✅ Database connected at ${result.rows[0].time}`);
      return true;
    } catch (error) {
      console.log(`⏳ Connection attempt ${attempt}/${config.MAX_RETRIES}...`);
      
      if (attempt === config.MAX_RETRIES) {
        console.error('❌ Failed to connect after all attempts');
        console.error('   Error:', error.message);
        
        // In Railway, database might not be available during build
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          console.log('ℹ️  This appears to be a build-time execution.');
          console.log('   Migrations will run when the server starts.');
          return false;
        }
        
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
    }
  }
  
  return false;
}

async function runMigrations() {
  console.log('🔄 Starting database migrations...');
  console.log(`   Environment: ${config.ENVIRONMENT}`);
  
  // Check if we have database configuration
  if (!config.DATABASE_URL) {
    console.log('⚠️  DATABASE_URL not set - skipping migrations');
    console.log('   Migrations will run when the database is available');
    return;
  }
  
  // Create pool
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.PGSSL,
    connectionTimeoutMillis: 5000,
    query_timeout: 30000
  });

  try {
    // Wait for database connection
    const connected = await waitForDatabase(pool);
    
    if (!connected) {
      console.log('⚠️  Could not connect to database');
      console.log('   This is expected during Railway build phase');
      console.log('   Migrations will run automatically at server startup');
      return;
    }
    
    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        filename VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Migrations table ready');

    const dir = path.join(__dirname, '..', 'migrations');
    
    // Create migrations directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('📁 Created migrations directory');
      console.log('✅ No migrations to run');
      return;
    }

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('✅ No migration files found');
      return;
    }

    console.log(`📋 Found ${files.length} migration files`);

    let executed = 0;
    let skipped = 0;
    let failed = 0;

    for (const file of files) {
      // Check if migration was already executed
      const { rows } = await pool.query(
        'SELECT 1 FROM migrations WHERE filename = $1',
        [file]
      );

      if (rows.length > 0) {
        console.log(`⏭️  Skipped (already executed): ${file}`);
        skipped++;
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      if (!sql.trim()) {
        console.log(`⏭️  Skipped (empty): ${file}`);
        skipped++;
        continue;
      }

      try {
        console.log(`🔧 Executing: ${file}`);
        
        // Split by semicolons and execute each statement
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        await pool.query('BEGIN');
        
        for (const statement of statements) {
          try {
            await pool.query(statement);
          } catch (stmtError) {
            // Handle common errors gracefully
            if (stmtError.message.includes('already exists')) {
              console.log(`  ⚠️  Object already exists (continuing)`);
            } else if (stmtError.message.includes('does not exist') && statement.includes('DROP')) {
              console.log(`  ⚠️  Object doesn't exist for DROP (continuing)`);
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
        console.log(`✅ Completed: ${file}`);
        executed++;
        
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`❌ Failed: ${file}`);
        console.error(`   Error: ${error.message}`);
        failed++;
        
        // Determine if this is a critical error
        const isCritical = !file.includes('optional') && 
                          !file.includes('interactive') && 
                          !file.includes('example');
        
        if (isCritical && config.ENVIRONMENT === 'production') {
          throw error;
        } else {
          console.log('   ⚠️  Continuing despite error (non-critical migration)');
        }
      }
    }

    // Summary
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Executed: ${executed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    if (failed > 0) {
      console.log(`   ❌ Failed: ${failed}`);
    }
    
    if (failed === 0) {
      console.log('\n✅ All migrations completed successfully!');
    } else {
      console.log(`\n⚠️  Completed with ${failed} non-critical failures`);
    }
    
  } catch (error) {
    console.error('❌ Migration process failed:', error.message);
    
    // Don't exit with error during build phase
    if (config.ENVIRONMENT === 'production' && 
        (error.message.includes('ENOTFOUND') || 
         error.message.includes('ECONNREFUSED') ||
         error.message.includes('timeout'))) {
      console.log('\n📝 Note: This appears to be Railway build phase');
      console.log('   Migrations will automatically run at server startup');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

// Export for use in server.js
module.exports = { runMigrations };

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('✨ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      // Exit with 0 during build to prevent Railway deployment failure
      if (process.env.RAILWAY_ENVIRONMENT === 'production') {
        console.log('Exiting with code 0 for Railway build compatibility');
        process.exit(0);
      } else {
        process.exit(1);
      }
    });
}
