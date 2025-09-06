const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL==='disable'?false:{ rejectUnauthorized:false } });

(async ()=>{
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
  for (const f of files){
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!sql.trim()) continue;
    try { await pool.query(sql); console.log('✅', f); } catch(e){ console.error('❌', f, e.message); process.exit(1); }
  }
  await pool.end();
})();
