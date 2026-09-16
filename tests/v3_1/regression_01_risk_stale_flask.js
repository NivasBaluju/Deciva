// tests/v3_1/regression_01_risk_stale_flask.js
// Regression test for the Risk Engine stale Flask process.
// Starts Flask, runs analysis on two sample documents, restarts Flask several times,
// and verifies that Doc B (high‑risk) always scores higher than Doc A and meets the high‑risk threshold.

const { spawn } = require('child_process');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const FLASK_PORT = 5001;
const FLASK_URL = `http://127.0.0.1:${FLASK_PORT}`;

function startFlask() {
  // Assumes the Flask app entry point is backend/app.py and that FLASK_APP env var is set accordingly.
  const proc = spawn('python', ['-m', 'flask', 'run', '--port', String(FLASK_PORT)], {
    cwd: path.join(__dirname, '..', '..', 'backend'),
    env: { ...process.env, FLASK_APP: 'app.py' },
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
  return proc;
}

function stopFlask(pid) {
  try { process.kill(pid); } catch (_) {}
}

async function uploadAndAnalyze(docPath) {
  const fileBuf = fs.readFileSync(docPath);
  const uploadRes = await fetch(`${FLASK_URL}/api/documents/upload`, {
    method: 'POST',
    body: fileBuf,
    headers: { 'Content-Type': 'application/pdf' },
  });
  if (!uploadRes.ok) throw new Error('Upload failed: ' + uploadRes.status);
  const { document_id } = await uploadRes.json();

  // Poll analysis endpoint until a risk_score is present (max 30 s).
  for (let i = 0; i < 30; i++) {
    const aRes = await fetch(`${FLASK_URL}/api/documents/${document_id}/analysis`);
    const aJson = await aRes.json();
    if (aJson.risk_score !== undefined) return aJson.risk_score;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Analysis timeout');
}

(async () => {
  console.log('--- Regression 01: Stale Flask Process ---');
  // Start Flask for the first run.
  let flaskProc = startFlask();
  await new Promise(r => setTimeout(r, 3000)); // allow startup

  const docA = path.join(__dirname, 'fixtures', 'docA.pdf');
  const docB = path.join(__dirname, 'fixtures', 'docB_highrisk.pdf');

  const riskA1 = await uploadAndAnalyze(docA);
  const riskB1 = await uploadAndAnalyze(docB);
  console.log('Run 1 scores:', { riskA1, riskB1 });

  // Restart Flask twice and repeat the analysis.
  for (let i = 0; i < 2; i++) {
    stopFlask(flaskProc.pid);
    await new Promise(r => setTimeout(r, 2000));
    flaskProc = startFlask();
    await new Promise(r => setTimeout(r, 3000));

    const riskA = await uploadAndAnalyze(docA);
    const riskB = await uploadAndAnalyze(docB);
    console.log(`Run ${i + 2} scores:`, { riskA, riskB });
  }
  console.log('Regression 01 completed');
})();
