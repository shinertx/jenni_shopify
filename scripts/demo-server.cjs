/* Simple demo server (CommonJS): serves /test-store and proxies JENNi API to avoid CORS */
const express = require('express');
const path = require('path');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = process.env.PORT || 3000;
const API_TARGET = process.env.JENNI_API_HOST || 'http://35.209.65.82:8082';

const app = express();
app.use(cors());
app.use(express.json());

// Proxy JENNi API under same origin
app.use(
  '/api/sku-graph',
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    logLevel: 'debug',
    xfwd: true,
    onProxyReq(proxyReq) {
      if (!proxyReq.getHeader('Content-Type')) {
        proxyReq.setHeader('Content-Type', 'application/json');
      }
    },
  })
);

// Health
app.get('/_health', (req, res) => res.json({ ok: true, api: API_TARGET }));

// Serve static demo store
const staticDir = path.join(__dirname, '..', 'test-store');
app.use(express.static(staticDir));

app.listen(PORT, () => {
  console.log(`Demo server running at http://localhost:${PORT}`);
  console.log(`Serving static from ${staticDir}`);
  console.log(`Proxying JENNi API to ${API_TARGET}`);
});
