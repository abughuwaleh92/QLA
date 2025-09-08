#!/usr/bin/env node
// scripts/fix-sessions.js - Fix session table and clean up database
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
});

async function fixSessions() {
  console.log('🔧 Session Table Repair Script');
  console.log('================================\n');
  
  try {
    // Test connection
    console.log('📡 Connecting to database...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected\n');
    
    // Check current session table status
    console.log('🔍 Checking current session table...');
    const { rows: tables } = await pool.query(`
      SELECT table_name, 
             pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
      FROM information_schema.tables 
      WHERE table_name = 'session'
    `);
    
    if (tables.length > 0) {
      console.log(`   Found session table, size: ${tables[0].size}`);
      
      // Check for corruption
      try {
        const { rows: sessions } = await pool.query(
          'SELECT COUNT(*) as count FROM session WHERE expire > NOW()'
        );
        console.log(`   Active sessions: ${sessions[0].count}`);
      } catch (err) {
        console.log('   ⚠️ Table appears corrupted:', err.message);
      }
    } else {
      console.log('   No session table found');
    }
    
    // Backup existing sessions if any
    console.log('\n📦 Creating backup...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session_backup AS 
      SELECT * FROM session 
      WHERE expire > NOW()
    `).catch(() => {
      console.log('   No valid sessions to backup');
    });
    
    // Drop and recreate
    console.log('\n🔨 Rebuilding session table...');
    await pool.query('BEGIN');
    
    try {
      // Drop existing table and indexes
      await pool.query('DROP TABLE IF EXISTS session CASCADE');
      console.log('   Dropped old session table');
      
      // Create new session table with proper structure
      await pool.query(`
        CREATE TABLE session (
          sid VARCHAR NOT NULL COLLATE "default",
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        )
      `);
      console.log('   Created new session table');
      
      // Add primary key
      await pool.query('ALTER TABLE session ADD PRIMARY KEY (sid)');
      console.log('   Added primary key');
      
      // Create index for cleanup
      await pool.query('CREATE INDEX IDX_session_expire ON session(expire)');
      console.log('   Created expire index');
      
      // Set proper permissions
      await pool.query(`
        GRANT ALL ON TABLE session TO CURRENT_USER;
      `).catch(() => {}); // Ignore if can't grant
      
      await pool.query('COMMIT');
      console.log('✅ Session table rebuilt successfully\n');
      
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
    
    // Clean up orphaned records
    console.log('🧹 Cleaning up orphaned records...');
    
    const cleanupQueries = [
      {
        name: 'Progress events with null users',
        query: 'DELETE FROM progress_events WHERE user_email IS NULL'
      },
      {
        name: 'Assessment attempts with null users',
        query: 'DELETE FROM assessment_attempts WHERE user_email IS NULL'
      },
      {
        name: 'Old error logs (>30 days)',
        query: "DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '30 days'"
      },
      {
        name: 'Expired notifications (>90 days)',
        query: "DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days' AND read = true"
      }
    ];
    
    for (const cleanup of cleanupQueries) {
      try {
        const result = await pool.query(cleanup.query);
        if (result.rowCount > 0) {
          console.log(`   ✅ ${cleanup.name}: cleaned ${result.rowCount} records`);
        }
      } catch (err) {
        // Table might not exist, that's okay
        if (!err.message.includes('does not exist')) {
          console.log(`   ⚠️ ${cleanup.name}: ${err.message}`);
        }
      }
    }
    
    // Create users table if missing
    console.log('\n📋 Ensuring users table exists...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'student',
        google_id VARCHAR(255),
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);
    console.log('✅ Users table ready');
    
    // Verify everything is working
    console.log('\n🔬 Verifying fix...');
    
    // Test session table
    const testSession = {
      sid: 'test-' + Date.now(),
      sess: JSON.stringify({ cookie: { expires: new Date(Date.now() + 3600000) } }),
      expire: new Date(Date.now() + 3600000)
    };
    
    await pool.query(
      'INSERT INTO session (sid, sess, expire) VALUES ($1, $2, $3)',
      [testSession.sid, testSession.sess, testSession.expire]
    );
    
    const { rows: verify } = await pool.query(
      'SELECT * FROM session WHERE sid = $1',
      [testSession.sid]
    );
    
    if (verify.length > 0) {
      console.log('✅ Session table is working correctly');
      // Clean up test
      await pool.query('DELETE FROM session WHERE sid = $1', [testSession.sid]);
    } else {
      console.log('⚠️ Session table test failed');
    }
    
    // Show summary
    console.log('\n📊 Database Summary:');
    const summary = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM lessons) as lessons,
        (SELECT COUNT(*) FROM classes) as classes,
        (SELECT COUNT(*) FROM session) as sessions,
        (SELECT COUNT(*) FROM users) as users,
        (SELECT pg_size_pretty(pg_database_size(current_database()))) as db_size
    `);
    
    const stats = summary.rows[0];
    console.log(`   Lessons: ${stats.lessons}`);
    console.log(`   Classes: ${stats.classes}`);
    console.log(`   Sessions: ${stats.sessions}`);
    console.log(`   Users: ${stats.users || 0}`);
    console.log(`   Database size: ${stats.db_size}`);
    
    console.log('\n✨ Session fix completed successfully!');
    console.log('   You can now restart your application.\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify DATABASE_URL is set correctly');
    console.error('2. Check if database is accessible');
    console.error('3. Ensure you have proper permissions');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set!');
    console.error('\nUsage:');
    console.error('  DATABASE_URL=your_database_url node scripts/fix-sessions.js');
    process.exit(1);
  }
  
  fixSessions().catch(console.error);
}

module.exports = { fixSessions };
