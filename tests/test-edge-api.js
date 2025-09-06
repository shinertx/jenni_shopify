// Basic integration smoke tests for Express endpoints
import assert from 'node:assert';
import 'dotenv/config';
import http from 'node:http';

// Assumes server already running (e.g., npm run dev in another terminal)
const BASE = process.env.TEST_BASE || 'http://localhost:4000';

async function j(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, raw: text }; }
}

async function run() {
  const health = await j('/_health');
  assert.equal(health.status, 200, 'health status');
  assert(health.json.ok === true, 'health ok flag');

  const snippet = await j('/edge/snippet');
  assert.equal(snippet.status, 200, 'snippet status');
  assert(snippet.json.ok, 'snippet ok');
  assert(/<script/.test(snippet.json.loader), 'loader script present');

  const resolveResp = await j('/edge/resolve', { method: 'POST', body: JSON.stringify({ zip: '10001', fingerprint: { title: 'Test Shoe', brand: 'BrandX' } }) });
  assert.equal(resolveResp.status, 200, 'resolve status');
  assert('eligible' in resolveResp.json, 'resolve body shape');

  const preview = await j('/edge/preview', { method: 'POST', body: JSON.stringify({ url: 'https://example.com', zip: '10001' }) });
  assert.equal(preview.status, 200, 'preview status');
  assert('ok' in preview.json, 'preview ok');

  console.log('✅ API smoke tests passed');
}

run().catch(err => { console.error('❌ Test failure', err); process.exit(1); });
