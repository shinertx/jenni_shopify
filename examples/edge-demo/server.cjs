/* Mock demo API server for JENNi Edge overlay */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;
app.use(express.json());
app.use(express.static(__dirname));

// Simple logger
app.use((req, _res, next) => { console.log(`${req.method} ${req.url}`); next(); });

// Fingerprint: echo back some parsed hints
app.post('/fingerprint', (req, res) => {
  const { url, fingerprint } = req.body || {};
  res.json({
    ok: true,
    url,
    title: fingerprint?.title,
    sku: fingerprint?.sku || null,
    gtin: fingerprint?.gtin || null,
    brand: fingerprint?.brand || null,
    fingerprint_ms: 12,
  });
});

// Match: pretend we matched catalog → returns a score
app.post('/match', (req, res) => {
  const score = 0.92;
  res.json({ matched: score > 0.7, matching_score: score, match_ms: 18 });
});

// Inventory: return nearby nodes based on ZIP prefix
app.get('/inventory', (req, res) => {
  const zip = String(req.query.zip || '10001');
  const nodes = [
    { id: 'store_nyc_001', name: 'Downtown', etaMinutes: 90, distanceMiles: 3.2, stock: 7 },
    { id: 'store_nyc_002', name: 'Midtown', etaMinutes: 120, distanceMiles: 5.1, stock: 4 },
    { id: 'store_nyc_003', name: 'Uptown', etaMinutes: 150, distanceMiles: 7.4, stock: 2 },
  ];
  const bay = [
    { id: 'store_sf_001', name: 'SoMa', etaMinutes: 75, distanceMiles: 2.1, stock: 6 },
    { id: 'store_sf_002', name: 'Mission', etaMinutes: 95, distanceMiles: 3.8, stock: 5 },
  ];
  const data = zip.startsWith('94') ? bay : nodes;
  res.json({ node_count: data.length, nodes: data, inventory_ms: 22 });
});

// Resolve orchestration: combines match + inventory + simple ProfitGuard
app.post('/resolve', (req, res) => {
  const { zip = '10001' } = req.body || {};
  const score = 0.93;
  const node_count = zip.startsWith('00') ? 0 : (zip.startsWith('94') ? 2 : 3);
  const eligible = node_count > 0 && score > 0.7;
  const etaMinutes = eligible ? (zip.startsWith('94') ? 80 : 110) : null;
  const profitGuardHit = false;
  res.json({
    eligible,
    etaMinutes,
    matching_score: score,
    node_count,
    profitGuardHit,
    resolve_ms: 42,
  });
});

// Export: stub a report
app.post('/export', (_req, res) => {
  res.json({ ok: true, url: 'https://example.com/export/demo.csv' });
});

// Test-order: simulate a courier order
app.post('/test-order', (_req, res) => {
  res.json({ ok: true, orderId: `TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, trackingUrl: 'https://example.com/tracking/ABC123' });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`Edge demo running at http://localhost:${PORT}`));

