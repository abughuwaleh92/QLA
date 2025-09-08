// scripts/run-migrations.js - Enhanced migration runner
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrations() {
  console.log('🔄 Starting database migrations...');
  
  // Use Railway's DATABASE_URL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });

  try {
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
    }

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📋 Found ${files.length} migration files`);

    for (const file of files) {
      // Check if migration was already executed
      const { rows } = await pool.query(
        'SELECT 1 FROM migrations WHERE filename = $1',
        [file]
      );

      if (rows.length > 0) {
        console.log(`⏭️  Skipped (already executed): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      if (!sql.trim()) {
        console.log(`⏭️  Skipped (empty): ${file}`);
        continue;
      }

      try {
        console.log(`🔧 Executing: ${file}`);
        
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
        console.log(`✅ Completed: ${file}`);
        
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`❌ Failed: ${file}`);
        console.error(`   Error: ${error.message}`);
        
        // Don't fail the entire process for non-critical errors
        if (!file.includes('interactive')) {
          throw error;
        } else {
          console.log('   ⚠️  Continuing despite error (non-critical migration)');
        }
      }
    }

    console.log('✅ All migrations completed');
    
  } catch (error) {
    console.error('❌ Migration process failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations().catch(console.error);
}

module.exports = { runMigrations };
