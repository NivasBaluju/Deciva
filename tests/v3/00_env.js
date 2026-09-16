// V3 CERTIFICATION — Environment & Database Discovery
// TEMPORARY test artifact — do not deploy
'use strict';
require('dotenv').config();
const os = require('os');
const { execSync } = require('child_process');
const db = require('../../server/db');

function checkEnv(key, dangerDefaults) {
  const val = process.env[key];
  if (!val) return key + ': NOT SET';
  if (dangerDefaults[key] && val === dangerDefaults[key]) return key + ': DEFAULTED (INSECURE)';
  return key + ': SET';
}

async function main() {
  console.log('=== V3 ENVIRONMENT DISCOVERY ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('OS:', os.type(), os.release(), os.arch());
  console.log('Node:', process.version);
  try { console.log('npm:', execSync('npm --version', { encoding: 'utf8' }).trim()); } catch(e) { console.log('npm: ERROR'); }
  try { console.log('Python:', execSync('python --version 2>&1', { encoding: 'utf8' }).trim()); } catch(e) { console.log('Python: NOT FOUND'); }

  console.log('\n--- ENVIRONMENT VARIABLES ---');
  const DANGER = {
    JWT_SECRET: 'dev_insecure_secret_change_me',
    ENCRYPTION_KEY: 'deciva-secret-encryption-key-32-bytes!!',
    INTERNAL_SERVICE_KEY: 'deciva-internal-service-secret-key-default'
  };
  const keys = ['PORT','NODE_ENV','DATABASE_URL','JWT_SECRET','ENCRYPTION_KEY','GEMINI_API_KEY',
    'EMAIL_USER','EMAIL_PASS','SMTP_USER','SMTP_PASS','SMTP_HOST','SMTP_PORT',
    'CLIENT_URL','INTERNAL_SERVICE_KEY','AI_MICROSERVICE_URL','RSA_PRIVATE_KEY','RSA_PUBLIC_KEY',
    'ADMIN_EMAILS','ANTHROPIC_API_KEY'];
  for (const k of keys) console.log(checkEnv(k, DANGER));
  console.log('AI_MICROSERVICE_URL effective:', process.env.AI_MICROSERVICE_URL || 'http://127.0.0.1:5001 (DEFAULT)');

  console.log('\n--- DATABASE STATE ---');
  try {
    const r = await db.query('SELECT current_database() as db, version() as ver, NOW() as ts');
    console.log('DB name:', r.rows[0].db);
    console.log('PG version:', r.rows[0].ver.split(',')[0]);
    console.log('Server time:', r.rows[0].ts);
    const tableQ = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    console.log('Tables (' + tableQ.rows.length + '):', tableQ.rows.map(r => r.tablename).join(', '));
    const counts = [
      ['users', 'SELECT count(*) as c FROM users'],
      ['documents', 'SELECT count(*) as c FROM documents'],
      ['audit_blocks', 'SELECT count(*) as c FROM blockchain_audit'],
      ['sessions', 'SELECT count(*) as c FROM sessions'],
      ['migrations', 'SELECT count(*) as c FROM schema_migrations']
    ];
    for (const [name, q] of counts) {
      try { const r2 = await db.query(q); console.log(name + ':', r2.rows[0].c); }
      catch(e) { console.log(name + ': TABLE NOT FOUND'); }
    }
  } catch(e) {
    console.log('DB ERROR:', e.message);
  }

  console.log('\n--- FLASK MICROSERVICE PROBE ---');
  try {
    const url = (process.env.AI_MICROSERVICE_URL || 'http://127.0.0.1:5001');
    const res = await fetch(url + '/api/health', { signal: AbortSignal.timeout(3000) });
    const body = await res.json();
    console.log('Flask status:', res.status, JSON.stringify(body));
  } catch(e) {
    console.log('Flask: UNREACHABLE -', e.message);
  }

  process.exit(0);
}
main();
