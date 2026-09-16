'use strict';
const db = require('../../server/db');
const { calculateCalibratedDocumentRisk } = require('../../server/utils/aiEngine');

async function run() {
  const r1 = await db.query(
    "SELECT id, original_name, risk_score, extracted_text FROM documents WHERE original_name LIKE $1 ORDER BY created_at DESC LIMIT 3",
    ['%doc_b%']
  );

  let rows = r1.rows;

  if (!rows.length) {
    const r2 = await db.query(
      "SELECT id, original_name, risk_score, extracted_text FROM documents WHERE extracted_text ILIKE $1 ORDER BY created_at DESC LIMIT 3",
      ['%unlimited%']
    );
    rows = r2.rows;
  }

  console.log('Found', rows.length, 'high-risk docs');

  for (const row of rows) {
    console.log('\n--- Doc:', row.id.substring(0,8), '|', row.original_name);
    console.log('  DB risk_score (stored):', row.risk_score);
    console.log('  extracted_text length:', row.extracted_text ? row.extracted_text.length : 'NULL/EMPTY');
    if (row.extracted_text) {
      console.log('  extracted_text:', row.extracted_text.substring(0, 200));
      const computed = calculateCalibratedDocumentRisk(row.extracted_text);
      console.log('  Node-computed score:', computed.score, '|', computed.level);
      console.log('  Node factors:', computed.factors.map(f => f.riskType + ':' + f.riskPoints).join(', '));
    }
    // Check Flask directly
    try {
      const flaskRes = await fetch('http://127.0.0.1:5001/api/documents/' + row.id + '/analysis', {
        headers: { 'x-internal-service-key': process.env.INTERNAL_SERVICE_KEY || 'deciva-internal-service-secret-key-default' },
        signal: AbortSignal.timeout(10000)
      });
      if (flaskRes.ok) {
        const fd = await flaskRes.json();
        console.log('  Flask riskScore:', fd.riskScore, '| risk.score:', fd.risk && fd.risk.score);
        console.log('  Flask riskLevel:', fd.riskLevel);
      } else {
        console.log('  Flask HTTP error:', flaskRes.status);
      }
    } catch(e) {
      console.log('  Flask error:', e.message);
    }
  }

  // Also find doc A
  const ra = await db.query(
    "SELECT id, original_name, risk_score, extracted_text FROM documents WHERE original_name LIKE $1 ORDER BY created_at DESC LIMIT 1",
    ['%doc_a%']
  );
  if (ra.rows.length) {
    const rowA = ra.rows[0];
    console.log('\n--- Doc A:', rowA.id.substring(0,8), '|', rowA.original_name);
    console.log('  DB risk_score:', rowA.risk_score);
    if (rowA.extracted_text) {
      const cA = calculateCalibratedDocumentRisk(rowA.extracted_text);
      console.log('  Node-computed score:', cA.score, '|', cA.level);
    }
    try {
      const flaskA = await fetch('http://127.0.0.1:5001/api/documents/' + rowA.id + '/analysis', {
        headers: { 'x-internal-service-key': process.env.INTERNAL_SERVICE_KEY || 'deciva-internal-service-secret-key-default' },
        signal: AbortSignal.timeout(10000)
      });
      if (flaskA.ok) {
        const fd = await flaskA.json();
        console.log('  Flask riskScore:', fd.riskScore, '| risk.score:', fd.risk && fd.risk.score);
      }
    } catch(e) { console.log('  Flask error:', e.message); }
  }

  process.exit(0);
}
run().catch(e => { console.error('ERR:', e.message); process.exit(1); });
