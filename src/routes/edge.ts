import { Router } from "express";
import type { Request, Response } from "express";
import { checkEligibility } from "../core/eligibility.js";
import axios from 'axios';
import { appConfig } from "../config.js";
import { computeProfitGuard, etaMinutesForZip } from "../core/profitGuard.js";

export const edge = Router();

// Lightweight CORS for demo endpoints
edge.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

edge.post('/fingerprint', (req: Request, res: Response) => {
  const { url, fingerprint } = (req.body as any) || {};
  const { sku = null, gtin = null, title = null, brand = null } = fingerprint || {};
  res.json({ ok: true, url, title, brand, sku, gtin, fingerprint_ms: 10 });
});

edge.post('/match', (req: Request, res: Response) => {
  const { fingerprint } = (req.body as any) || {};
  const hasStrongId = !!(fingerprint?.gtin || fingerprint?.sku);
  const score = hasStrongId ? 0.95 : 0.78; // demo heuristic
  res.json({ matched: score > 0.7, matching_score: score, match_ms: 15 });
});

edge.get('/inventory', (req: Request, res: Response) => {
  const zip = String((req.query as any)?.zip || '10001');
  const nodes = zip.startsWith('94')
    ? [
        { id: 'store_sf_001', name: 'SoMa', etaMinutes: 75, distanceMiles: 2.1, stock: 6 },
        { id: 'store_sf_002', name: 'Mission', etaMinutes: 95, distanceMiles: 3.8, stock: 5 },
      ]
    : [
        { id: 'store_nyc_001', name: 'Downtown', etaMinutes: 90, distanceMiles: 3.2, stock: 7 },
        { id: 'store_nyc_002', name: 'Midtown', etaMinutes: 120, distanceMiles: 5.1, stock: 4 },
        { id: 'store_nyc_003', name: 'Uptown', etaMinutes: 150, distanceMiles: 7.4, stock: 2 },
      ];
  res.json({ node_count: nodes.length, nodes, inventory_ms: 20 });
});

edge.post('/resolve', async (req: Request, res: Response) => {
  try {
    const { zip = '10001', fingerprint } = (req.body as any) || {};
    const hasGtin = !!fingerprint?.gtin;
  const fingerprintQuality = scoreFingerprint(fingerprint);
  const matchMeta = deriveMatchMeta(fingerprint);

    // Nearby candidates to estimate courier + trust
    const query = String(fingerprint?.styleCode || fingerprint?.sku || fingerprint?.title || 'sneakers');
    const brand = String(fingerprint?.brand || '');
    const nodes = await placesNearby(zip, query, brand, fingerprint?.styleCode, false);
    const topNodes = nodes.slice(0, 5);
    const nodeCount = topNodes.length;
    const best = (topNodes[0] || nodes[0]) || {};
  const distance = Number.isFinite((best as any).distanceMiles) ? (best as any).distanceMiles : 4.0;
  const trustScore = Number.isFinite((best as any).score) ? (best as any).score : 0.6;

    // Eligibility via JENNi when GTIN available
    let eligible = false;
    let exactMatch = false;
    let etaMinutes: number | null = null;
    const match_method = hasGtin ? 'gtin' : (fingerprint?.styleCode ? 'styleCode' : (fingerprint?.sku ? 'sku' : 'text'));
    let localPrice: number | undefined = undefined;
    if (hasGtin) {
      try {
        const r = await checkEligibility({ gtin: fingerprint.gtin, zip, storeId: 'demo-store' });
        eligible = !!r.eligible;
        if (typeof (r as any).minPrice === 'number') localPrice = (r as any).minPrice;
        exactMatch = eligible;
      } catch {
        eligible = false;
      }
    } else {
      eligible = nodeCount > 0;
    }

    if (eligible) {
      etaMinutes = zip.startsWith('94') ? 80 : 110;
    }

  const matching_score = computeMatchConfidence(fingerprint);
    const pdpPrice = priceFromFingerprint(fingerprint);
    const salePrice = (typeof pdpPrice === 'number' ? pdpPrice : (typeof localPrice === 'number' ? localPrice : 80));
    const buyCost = (typeof localPrice === 'number' ? localPrice : undefined);
    const pg = computeProfitGuard({ price: salePrice, distanceMiles: distance, trustScore, buyCost });
    const pgPass = pg.pass;

    // Compute per-store ProfitGuard summaries
  const nodesWithEconomics = topNodes.map((n:any) => {
      const d = Number.isFinite(n.distanceMiles) ? n.distanceMiles : distance;
      const courierN = appConfig.profitGuard.courierBase + appConfig.profitGuard.courierPerMile * d;
      const trustN = Number.isFinite(n.score) ? n.score : trustScore;
      const landedCostN = (typeof buyCost === 'number' ? buyCost : (appConfig.profitGuard.cogsPct * salePrice));
      const feeN = appConfig.profitGuard.feePct * salePrice;
      const marginN = salePrice - landedCostN - feeN - courierN;
      const floor = Math.max(appConfig.profitGuard.floorAbs, appConfig.profitGuard.floorPct * salePrice);
      const passN = marginN >= floor && trustN >= appConfig.profitGuard.trustThreshold;
  return {
        ...n,
        courier_est: Number(courierN.toFixed(2)),
        margin: Number(marginN.toFixed(2)),
        floor: Number(floor.toFixed(2)),
        trustScore: Number(trustN.toFixed(2)),
        pgPass: passN,
      };
    });
    const anyPass = nodesWithEconomics.some((n:any) => n.pgPass);

    // Same-day check and decision engine
    const etaCutoffMin = appConfig.profitGuard.etaCutoffMin;
    const sameDay = (() => {
      try {
        if (!Number.isFinite(etaMinutes)) return false;
        const now = new Date();
        const eta = new Date(now.getTime() + (etaMinutes as number) * 60000);
        return now.toDateString() === eta.toDateString();
      } catch { return false; }
    })();
    const profitPass = pgPass;
    const trustPass = trustScore >= PG.trustThreshold;
    const distancePass = Number.isFinite(etaMinutes) ? (sameDay && (etaMinutes as number) <= etaCutoffMin) : false;
    let cta: 'arrives_today' | 'pickup_today' | 'fallback' = 'fallback';
    if (profitPass && trustPass && distancePass && eligible && (anyPass || pgPass)) {
      cta = 'arrives_today';
    } else if (!profitPass && trustPass && distancePass && nodesWithEconomics.length > 0) {
      cta = 'pickup_today';
    } else {
      cta = 'fallback';
    }
  let reason = profitPass ? (trustPass ? (distancePass ? 'ok' : 'too_far') : 'low_trust') : 'low_margin';
  if (!eligible) reason = nodeCount === 0 ? 'no_nearby_stores' : 'not_in_network';
  if (eligible && !anyPass && !pgPass) reason = 'economics_block';
  if (matching_score < 0.5) reason = 'low_match_confidence';

    const marginHeadroom = Number((pg.margin - pg.floor).toFixed(2));
    const suggestedIncentive = (pg.pass && marginHeadroom > Math.max(4, pg.floor * 0.4)) ? 'free_2day_shipping' : null;
    const waitlistOffered = !eligible && ['no_nearby_stores','not_in_network'].includes(reason);
    res.json({
      eligible: eligible && (anyPass || pgPass),
      sameDay,
      etaMinutes,
      matching_score,
      node_count: nodesWithEconomics.length,
      nodes: nodesWithEconomics,
      exactMatch,
      match_method,
      matchType: matchMeta.matchType,
      substitutionLevel: matchMeta.substitutionLevel,
      economics: {
        salePrice: Number(salePrice.toFixed ? salePrice.toFixed(2) : salePrice),
        buyCost: typeof buyCost === 'number' ? Number(buyCost.toFixed(2)) : Number((appConfig.profitGuard.cogsPct * salePrice).toFixed(2)),
        fee: pg.fee,
        courier: pg.courier_est,
        margin: pg.margin,
        floor: pg.floor,
        pass: pg.pass,
        trust: { score: Number(trustScore.toFixed(2)), threshold: appConfig.profitGuard.trustThreshold }
      },
      product: {
        title: fingerprint?.title || null,
        brand: fingerprint?.brand || null,
        sku: fingerprint?.sku || null,
        gtin: fingerprint?.gtin || null,
        styleCode: fingerprint?.styleCode || null,
        fingerprintQuality,
        matchConfidence: matching_score,
        matchType: matchMeta.matchType,
        substitutionLevel: matchMeta.substitutionLevel
      },
      decision: {
        cta,
        checks: {
          profit: profitPass ? 'pass' : 'hold',
          trust: trustPass ? 'pass' : 'hold',
          distance: distancePass ? 'pass' : 'hold',
        },
        reason,
      },
      profitGuard: { ...pg, trustThreshold: appConfig.profitGuard.trustThreshold, distanceMiles: Number(distance.toFixed(2)), etaCutoffMin, marginHeadroom, suggestedIncentive },
      resolve_ms: 40,
      availability: { available: eligible && (anyPass || pgPass), nearbyStores: nodeCount, reason },
      waitlistOffered,
      suggestedIncentive
    });
  } catch (e: any) {
    res.status(200).json({ eligible: false, error: e?.message || 'resolve_failed' });
  }
});

edge.post('/export', (_req: Request, res: Response) => {
  const snippet = `<script src="https://cdn.example.com/jenni/edge.js" defer></script>\n<script>JenniEdge.init({ tenant:'demo', zip:'10001', apiBase:'https://api.example.com/edge' })</script>`;
  res.json({ ok: true, snippet, templateUrl: 'https://cdn.example.com/jenni/gtm-template.json' });
});

edge.post('/test-order', (_req: Request, res: Response) => {
  res.json({ ok: true, orderId: `TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}` });
});

// Installer helpers: serve friendly routes for static pages

// Magic-link demo: server eligibility proxy for URL+ZIP -> concise quote
edge.get('/eligible', async (req: Request, res: Response) => {
  try {
          const debug = String((req.query as any)?.debug || '') === '1';
          const detail = debug || String((req.query as any)?.detail || '') === '1';
          const started = Date.now();
          const url = String((req.query as any)?.url || '');
          const zip = String((req.query as any)?.zip || '');
          if (!/^https?:\/\//i.test(url)) return res.status(400).json({ eligible: false, error: 'invalid_url' });
          if (!/^[0-9A-Za-z\-\s]{3,10}$/.test(zip)) return res.status(400).json({ eligible: false, error: 'invalid_zip' });
          const safeUrl = new URL(url);
          if (/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/.test(safeUrl.hostname)) {
            return res.status(400).json({ eligible: false, error: 'blocked_host' });
          }
          const timeout = Number(process.env.PREVIEW_FETCH_TIMEOUT_MS || 6000);
          let html: string = '';
          let fetchAttempts: Array<{ua: string; ok: boolean; err?: string; bytes?: number}> = [];
          // Attempt 1: custom UA
          try {
            const ua1 = 'JenniTryGo/1.0 (+https://jenni-demo)';
            const r = await axios.get(safeUrl.toString(), { timeout, maxContentLength: 2097152, responseType: 'text', headers: { 'User-Agent': ua1, 'Accept': 'text/html,*/*' } });
            html = typeof r.data === 'string' ? r.data : '';
            if (html.length > 600000) html = html.slice(0,600000); // truncate huge SPA bundles
            fetchAttempts.push({ ua: ua1, ok: true, bytes: html.length });
          } catch (e:any) {
            fetchAttempts.push({ ua: 'JenniTryGo/1.0', ok: false, err: e?.message });
          }
          // Fallback attempt if first failed or produced suspiciously small HTML
          if (!html || html.length < 400) {
            try {
              const ua2 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
              const r2 = await axios.get(safeUrl.toString(), { timeout: Math.min(timeout, 5000), maxContentLength: 2097152, responseType: 'text', headers: { 'User-Agent': ua2, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' } });
              let h2 = typeof r2.data === 'string' ? r2.data : '';
              if (h2.length > 600000) h2 = h2.slice(0,600000);
              if (h2.length > html.length) html = h2;
              fetchAttempts.push({ ua: 'ChromeLike', ok: true, bytes: h2.length });
            } catch (e:any) {
              fetchAttempts.push({ ua: 'ChromeLike', ok: false, err: e?.message });
            }
          }
          if (!html) {
            return res.status(200).json({ eligible: false, error: 'fetch_failed', detail: fetchAttempts, debug });
          }
          const fingerprint = parseProductHtml(html, safeUrl.toString());
          // URL-derived style code fallback (e.g., IF1673-103) if missing
          if (!fingerprint.styleCode) {
            const m = safeUrl.pathname.match(/([A-Z0-9]{4,}-[0-9]{3})/i); if (m) fingerprint.styleCode = m[1];
          }
          // Brand fallback from host
          if (!fingerprint.brand) {
            if (/nike\.com$/i.test(safeUrl.hostname) || /\.nike\.com$/i.test(safeUrl.hostname)) fingerprint.brand = 'Nike';
          }
          const resolved = await internalResolveLike(zip, fingerprint);
          const pg = resolved?.profitGuard || {} as any;
          const eta_minutes = Number.isFinite(resolved?.etaMinutes) ? Math.round(resolved.etaMinutes as number) : null;
          const arrives_by = (() => {
            if (!Number.isFinite(eta_minutes)) return null;
            const mins = eta_minutes as number;
            const now = new Date();
            const eta = new Date(now.getTime() + mins*60000);
            return eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          })();
          const priceNum = Number(pg?.price || 0);
          const total = Number((priceNum + (Number(pg?.fee || 0))).toFixed(2));
          const net_margin = priceNum > 0 ? Number(((pg?.margin || 0) / priceNum).toFixed(2)) : 0;
          const margin_floor = priceNum > 0 ? Number(((pg?.floor || 0) / priceNum).toFixed(2)) : 0;
          const quote_id = `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
          const matchMeta = deriveMatchMeta(fingerprint);
          const marginHeadroom = Number(((pg?.margin || 0) - (pg?.floor || 0)).toFixed(2));
          const suggestedIncentive = (pg?.pass && marginHeadroom > Math.max(4, (pg?.floor || 0) * 0.4)) ? 'free_2day_shipping' : null;
          const waitlistOffered = !resolved?.eligible;
          const baseResp: any = {
            eligible: !!resolved?.eligible,
            quote_id,
            eta_minutes,
            total,
            currency: 'USD',
            net_margin,
            margin_floor,
            display: { arrives_by, fee: Number(pg?.fee || 0), item_price: priceNum },
            matchType: matchMeta.matchType,
            substitutionLevel: matchMeta.substitutionLevel,
            fingerprintQuality: scoreFingerprint(fingerprint),
            suggestedIncentive,
            waitlistOffered,
            ms: Date.now() - started
          };
          if (detail) {
            baseResp.detail = {
              fetchAttempts,
              fingerprint,
              profitGuard: pg,
              marginHeadroom,
              reason: (resolved as any)?.availability?.reason || (resolved as any)?.reason || null
            };
          }
          res.json(baseResp);
  } catch (e:any) {
    res.status(200).json({ eligible: false, error: e?.message || 'eligible_failed' });
  }
});

// Reverse geocode to ZIP (best-effort)
edge.get('/geo/rev', async (req: Request, res: Response) => {
  try {
    const lat = Number((req.query as any)?.lat);
    const lng = Number((req.query as any)?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'invalid_coords' });
    const key = process.env.GOOGLE_MAPS_API_KEY || '';
    if (key) {
      try {
        const r = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', { params: { latlng: `${lat},${lng}`, key } });
        const results = Array.isArray(r.data?.results) ? r.data.results : [];
        for (const rr of results) {
          const comps = rr?.address_components || [];
          const pc = comps.find((c:any) => Array.isArray(c.types) && c.types.includes('postal_code'));
          if (pc?.short_name) return res.json({ zip: pc.short_name });
        }
      } catch {}
    }
    // Simple fallback by region
    const approxSF = lat > 37 && lat < 38 && lng > -123 && lng < -121;
    const approxNY = lat > 40 && lat < 41 && lng > -75 && lng < -72;
    return res.json({ zip: approxSF ? '94105' : (approxNY ? '10001' : '10001') });
  } catch (e:any) {
    res.status(200).json({ zip: '10001', error: e?.message || 'geo_failed' });
  }
});

// Embed loader: single-tag snippet reads data-jenni-* and boots client

// Detect target platform from a product URL to auto-route the demo flow
edge.get('/detect', async (req: Request, res: Response) => {
  try {
    const url = String((req.query as any)?.url || '');
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ platform: 'unknown', error: 'invalid_url' });
    const safe = new URL(url);
    // Fast hostname hints
    const host = safe.hostname.toLowerCase();
    if (host.endsWith('.myshopify.com')) {
      return res.json({ platform: 'shopify', shop: host });
    }
    const timeout = Number(process.env.PREVIEW_FETCH_TIMEOUT_MS || 6000);
    let html = '';
    try {
      const r = await axios.get(safe.toString(), { timeout: Math.min(timeout, 3500), maxContentLength: 256000, headers: { 'User-Agent': 'JenniDetect/1.0', 'Accept': 'text/html,*/*' } });
      html = typeof r.data === 'string' ? r.data : '';
      const hdrs = r.headers || {} as any;
      const shopIdLike = hdrs['x-shopid'] || hdrs['x-shopify-stage'] || '';
      if (shopIdLike) return res.json({ platform: 'shopify', shop: host });
    } catch {}
    // HTML heuristics
    try {
      const h = html.toLowerCase();
      if (h.includes('cdn.shopify.com') || h.includes('shopify') || h.includes('window.shopify')) {
        // We don't know the myshopify subdomain; route to GTM installer instead of OAuth
        return res.json({ platform: 'gtm' });
      }
      // If the page has a GTM container, we can suggest GTM path
      if (h.includes('googletagmanager.com/gtm.js')) {
        return res.json({ platform: 'gtm' });
      }
    } catch {}
    return res.json({ platform: 'unknown' });
  } catch (e: any) {
    res.status(200).json({ platform: 'unknown', error: e?.message || 'detect_failed' });
  }
});

// Hosted Preview Overlay (server-rendered) for quick demos without bookmarklet
edge.get('/preview-overlay', async (req: Request, res: Response) => {
  try {
    const url = String((req.query as any)?.url || '');
    const zip = String((req.query as any)?.zip || '10001');
    if (!/^https?:\/\//i.test(url)) return res.status(400).send('invalid_url');
    const safeUrl = new URL(url);
    const timeout = Number(process.env.PREVIEW_FETCH_TIMEOUT_MS || 6000);
    let htmlSrc = '';
    try {
      const r = await axios.get(safeUrl.toString(), { timeout, maxContentLength: 512000, headers: { 'User-Agent': 'JenniOverlay/1.0', 'Accept': 'text/html,*/*' } });
      htmlSrc = typeof r.data === 'string' ? r.data : '';
    } catch {
      return res.status(200).send('Failed to fetch product page');
    }
    const fp = parseProductHtml(htmlSrc, safeUrl.toString());
    const resolved = await internalResolveLike(zip, fp);
    const pg: any = resolved?.profitGuard || {};
    const nodes: any[] = Array.isArray((resolved as any)?.nodes) ? (resolved as any).nodes : [];
    const etaTxt = (() => {
      const mins = Number.isFinite((resolved as any)?.etaMinutes) ? Math.round((resolved as any).etaMinutes) : null;
      if (!mins) return 'today';
      const now = new Date(); const eta = new Date(now.getTime() + mins*60000);
      return eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    })();
    const esc = (s: any) => (s==null ? '' : String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string)));
  const matchMeta = deriveMatchMeta(fp);
  const page = `<!DOCTYPE html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jenni Preview Overlay</title>
    <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#f1f5f9;color:#0f172a}
    .wrap{max-width:860px;margin:26px auto;padding:0 16px}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 4px 10px rgba(0,0,0,.06);padding:18px 18px}
    .title{font-weight:700;font-size:18px}
    .muted{color:#64748b}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .nodes .n{border:1px solid #eef2f7;border-radius:10px;padding:10px;margin:6px 0}
  .pill{display:inline-block;background:${resolved?.eligible?'#16a34a':'#6b7280'};color:#fff;padding:4px 10px;border-radius:999px;font-size:12px;margin-right:6px}
  .badge{display:inline-block;background:#0f172a;color:#fff;padding:2px 8px;border-radius:6px;font-size:11px;margin:4px 4px 0 0}
  .incent{display:inline-block;background:#2563eb;color:#fff;padding:3px 10px;border-radius:999px;font-size:12px;margin-left:8px}
    </style>
    <div class="wrap">
      <div class="card">
        <div class="title">${resolved?.eligible ? 'Get it Today' : 'Preview'}</div>
    <div class="muted" style="margin-top:6px">${esc(fp?.title)||'Product'} • ZIP ${esc(zip)} • ${resolved?.eligible?`Arrives by ${esc(etaTxt)}`:'Not eligible today'}</div>
    <div style="margin-top:6px">Fingerprint: <span class="badge">${matchMeta.matchType}</span><span class="badge">Q ${(scoreFingerprint(fp)).toFixed(2)}</span>${pg?.suggestedIncentive?`<span class="incent">${pg.suggestedIncentive.replace(/_/g,' ')}</span>`:''}</div>
    <div style="margin-top:10px">PDP $${Math.round(pg?.price||0)} → Buy $${Math.round(pg?.buy_cost||pg?.landed_cost||0)} + Courier $${Math.round(pg?.courier_est||0)} + Fee $${Math.round(pg?.fee||0)} = Profit $${Math.round(pg?.margin||0)}</div>
        <div class="nodes" style="margin-top:12px">
          ${(nodes.slice(0,3)).map(n=>`<div class="n"><div><strong>${esc(n.name||'Store')}</strong> • ${Math.round(n.distanceMiles||0)} mi • ~${Math.round(n.etaMinutes||0)}m ${n.pgPass?'<span class="pill">Pass</span>':'<span class="pill" style="background:#92400e">Hold</span>'}</div><div class="muted">Profit $${Math.round(n.margin||0)}</div></div>`).join('')}
        </div>
        <div style="margin-top:12px"><a href="/edge/test-order" target="_blank"><button>Checkout with Jenni</button></a></div>
      </div>
    </div>`;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(page);
  } catch (e:any) {
    res.status(200).send('overlay_failed');
  }
});

// Geocode ZIP using Google (if key present); otherwise fallback for demo
async function geocodeZip(zip: string): Promise<{ lat: number; lng: number }> {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  const mapsTimeout = Number(process.env.MAPS_HTTP_TIMEOUT_MS || 2500);
  if (key) {
    try {
      const resp = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { address: zip, key }, timeout: mapsTimeout
      });
      const loc = resp.data?.results?.[0]?.geometry?.location;
      if (loc) return { lat: loc.lat, lng: loc.lng };
    } catch {}
  }
  // Simple fallbacks for common demo zips
  if (zip.startsWith('94')) return { lat: 37.789, lng: -122.401 }; // SF
  return { lat: 40.7505, lng: -73.9934 }; // NYC Midtown
}

function haversine(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number {
  const toRad = (d:number)=>d*Math.PI/180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

// ProfitGuard defaults (tunable via env)
const PG = {
  floorAbs: Number(process.env.PROFIT_FLOOR_ABS || 8),
  floorPct: Number(process.env.PROFIT_FLOOR_PCT || 0.12),
  feePct: Number(process.env.PROFIT_FEE_PCT || 0.08),
  cogsPct: Number(process.env.DEFAULT_COGS_PCT || 0.6),
  courierBase: Number(process.env.COURIER_BASE || 7),
  courierPerMile: Number(process.env.COURIER_PER_MILE || 1.2),
  trustThreshold: Number(process.env.TRUST_THRESHOLD || 0.5),
  etaCutoffMin: Number(process.env.ETA_CUTOFF_MIN || 720), // minutes within same-day window
};

function priceFromFingerprint(fp: any): number | undefined {
  try {
    const offers = fp?.ld?.offers;
    if (!offers) return undefined;
    const coerce = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
    const fromObj = (o: any): number | undefined => {
      if (!o || typeof o !== 'object') return undefined;
      return coerce(o.price) ?? coerce(o.lowPrice) ?? coerce(o.highPrice) ?? coerce(o?.priceSpecification?.price);
    };
    if (Array.isArray(offers)) {
      // Prefer the lowest valid price among offers
      const vals = offers.map((o:any)=> fromObj(o)).filter((n: any)=> typeof n === 'number') as number[];
      if (vals.length) return Math.min(...vals);
      const p0 = coerce(offers[0]);
      if (typeof p0 === 'number') return p0;
      return undefined;
    }
    return fromObj(offers);
  } catch {
    return undefined;
  }
}

// Query nearby stores using Google Places Text Search when available
async function placesNearby(zip: string, q: string, brand?: string, styleCode?: string, probe: boolean = false) {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  const center = await geocodeZip(zip);
  if (key) {
    try {
      const mapsTimeout = Number(process.env.MAPS_HTTP_TIMEOUT_MS || 2500);
      const queries: Array<{url: string; params: Record<string,string>}> = [];
      const radius = '20000'; // ~20km
      const bias = { location: `${center.lat},${center.lng}`, radius };
      const brandWord = (brand || '').toString().trim();
      const qWord = (q || '').toString().trim();

      // 1) Text search with style code + brand (strongest)
      if (styleCode && brandWord) {
        queries.push({ url: 'https://maps.googleapis.com/maps/api/place/textsearch/json', params: { query: `${brandWord} ${styleCode} retailer`, key, region: 'us', ...bias } });
      }
      // 2) Text search with brand and product term
      if (brandWord && qWord) {
        queries.push({ url: 'https://maps.googleapis.com/maps/api/place/textsearch/json', params: { query: `${brandWord} store`, key, region: 'us', ...bias } });
      }
      // 3) Nearby shoe stores with brand bias
      queries.push({ url: 'https://maps.googleapis.com/maps/api/place/nearbysearch/json', params: { location: `${center.lat},${center.lng}`, radius, type: 'shoe_store', keyword: brandWord || 'sneakers', key } });

      // Fetch and merge results
      const byId: Record<string, any> = {};
      for (const qd of queries) {
        const resp = await axios.get(qd.url, { params: qd.params, timeout: mapsTimeout });
        const arr = Array.isArray(resp.data?.results) ? resp.data.results : [];
        for (const r of arr) {
          if (!r.place_id) continue;
          if (!byId[r.place_id]) byId[r.place_id] = r;
        }
      }

      // Optional: fetch details for top candidates to get website for scoring
      const ids = Object.keys(byId).slice(0, probe ? 6 : 4);
      const details: Record<string, any> = {};
      for (const id of ids) {
        try {
          const det = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', { params: { place_id: id, key, fields: 'place_id,website,name,types,geometry,formatted_address' }, timeout: mapsTimeout });
          details[id] = det.data?.result || {};
        } catch {}
      }

      const websiteProbeResults: Record<string, { productMatch?: boolean; productUrl?: string }> = {};
      if (probe && (styleCode || q)) {
        // Lightly probe candidate websites to see if style code / sku appears and attempt to extract product page URL
        const codeNeedle = String(styleCode || '').toUpperCase();
        const skuNeedle = String(q || '').toUpperCase();
        const candidates = ids.map(id => ({ id, website: details[id]?.website })).filter(x => !!x.website).slice(0, 5);
        await Promise.all(candidates.map(async ({ id, website }) => {
          try {
            const resp = await axios.get(website, {
              timeout: 2800,
              maxContentLength: 512000,
              headers: { 'User-Agent': 'JenniDemoBot/1.1 (+https://example.com)' }
            });
            const html: string = (typeof resp.data === 'string') ? resp.data : '';
            const up = html.toUpperCase();
            const found = (codeNeedle && up.includes(codeNeedle)) || (skuNeedle && up.includes(skuNeedle));
            let productUrl: string | undefined = undefined;
            if (found) {
              try {
                const linkRegex = /<a[^>]+href=["']([^"'#?]+[^"']?)["'][^>]*>(.*?)<\/a>/gi;
                let m: RegExpExecArray | null;
                while ((m = linkRegex.exec(html))) {
                  const href = m[1];
                  const text = (m[2] || '').toUpperCase();
                  const targetNeedle = codeNeedle || skuNeedle;
                  if (targetNeedle && (text.includes(targetNeedle) || href.toUpperCase().includes(targetNeedle))) {
                    const abs = new URL(href, website).toString();
                    // Basic filter: skip root and non-product placeholders
                    if (abs.length > website.length + 1) { productUrl = abs; break; }
                  }
                }
              } catch {}
            }
            websiteProbeResults[id] = { productMatch: !!found, productUrl };
          } catch {
            websiteProbeResults[id] = { productMatch: false };
          }
        }));
      }

      const scoreName = (name: string, brandWord: string) => {
        const n = (name || '').toLowerCase();
        const b = (brandWord || '').toLowerCase();
        if (!b) return 0;
        if (n.includes(b)) return 0.5;
        return 0;
      };

  const items = Object.values(byId).map((r: any) => {
        const loc = r.geometry?.location || { lat: center.lat, lng: center.lng };
        const distanceMiles = haversine(center, loc);
        const etaMinutes = Math.max(30, Math.round((distanceMiles/20)*60 + 30));
        const det = details[r.place_id] || {};
        const types: string[] = (det.types || r.types || []) as any;
        const hasShoeType = Array.isArray(types) && types.includes('shoe_store');
        const hasClothing = Array.isArray(types) && types.includes('clothing_store');
        const website: string = det.website || '';
        const brandBoost = scoreName(r.name, brandWord) + (website && brandWord && website.toLowerCase().includes(brandWord.toLowerCase()) ? 0.1 : 0);
        const typeBoost = (hasShoeType ? 0.2 : 0) + (hasClothing ? 0.1 : 0);
        const distanceBoost = Math.max(0, 0.2 - Math.min(distanceMiles, 20) * (0.2/20));
        const probeHit = websiteProbeResults[r.place_id]?.productMatch ? 0.25 : 0;
        const score = Math.min(0.99, 0.3 + brandBoost + typeBoost + distanceBoost + probeHit);
        return {
          id: r.place_id,
          name: r.name,
          address: r.formatted_address,
          website: det.website || '',
          productUrl: websiteProbeResults[r.place_id]?.productUrl || '',
          distanceMiles,
          etaMinutes,
          stock: Math.max(1, Math.round(8 - distanceMiles)),
          score: Number(score.toFixed(2)),
          productMatch: !!websiteProbeResults[r.place_id]?.productMatch
        };
      })
      .sort((a:any,b:any)=> b.score - a.score || a.distanceMiles - b.distanceMiles)
      .slice(0, 20);

      return items;
    } catch {}
  }
  // Fallback demo list near the geocoded center
  const demo = [
    { id: 'demo_a', name: 'Downtown Sneaker Co', lat: center.lat+0.02, lng: center.lng-0.01, website: 'https://example.com/downtown' },
    { id: 'demo_b', name: 'City Sports Outfitters', lat: center.lat-0.03, lng: center.lng+0.015, website: 'https://example.com/citysports' },
    { id: 'demo_c', name: 'Uptown Active', lat: center.lat+0.05, lng: center.lng+0.02, website: 'https://example.com/uptown' },
  ];
  return demo.map(d => {
    const loc = { lat: d.lat, lng: d.lng };
    const distanceMiles = haversine(center, loc);
    const etaMinutes = Math.max(30, Math.round((distanceMiles/20)*60 + 30));
  return { id: d.id, name: d.name, distanceMiles, etaMinutes, stock: Math.max(1, Math.round(8 - distanceMiles)), website: d.website, productUrl: '' };
  });
}

// Return nearby store candidates for a given product query and ZIP
edge.get('/places', async (req: Request, res: Response) => {
  try {
    const zip = String((req.query as any)?.zip || '10001');
    const q = String((req.query as any)?.q || 'sneakers');
    const brand = String((req.query as any)?.brand || '');
    const sc = String((req.query as any)?.sc || '');
    const probe = String((req.query as any)?.probe || '') === '1' || String((req.query as any)?.probe || '').toLowerCase() === 'true';
    const items = await placesNearby(zip, q, brand, sc, probe);
    const top = items.slice(0, 5);
    res.json({ node_count: top.length, nodes: top });
  } catch (e: any) {
    res.status(200).json({ node_count: 0, nodes: [], error: e?.message || 'places_failed' });
  }
});

// Serve the demo client (edge.js) via same origin
edge.get('/client.js', async (_req: Request, res: Response) => {
  try {
    const { readFile } = await import('fs/promises');
    const { resolve } = await import('path');
    const p = resolve(process.cwd(), 'examples/edge-demo/edge.js');
    const js = await readFile(p, 'utf8');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.send(js);
  } catch {
    res.status(404).send('// edge client not found');
  }
});

// Lightweight loader so anyone can drop a single <script> tag with data attributes.
// Example:
// <script src="https://YOUR_TUNNEL_DOMAIN/edge/loader.js" data-jenni-tenant="demo" data-jenni-zip="10001" data-jenni-position="bottom-right" async></script>
// Query params (?tenant=demo&zip=10001) also work as a fallback default.
edge.get('/loader.js', (req: Request, res: Response) => {
  try {
    const tenantRaw = String((req.query as any)?.tenant || 'demo');
    const zipRaw = String((req.query as any)?.zip || '10001');
    const tenant = tenantRaw.replace(/[^a-z0-9_-]/ig, '') || 'demo';
    const zip = zipRaw.replace(/[^0-9]/g, '').slice(0, 10) || '10001';
    const script = `!function(){try{var cs=document.currentScript;var apiOrigin=new URL(cs.src).origin;var tenant=cs&&cs.getAttribute('data-jenni-tenant')||'${tenant}';var zip=cs&&cs.getAttribute('data-jenni-zip')||'${zip}';var position=cs&&cs.getAttribute('data-jenni-position')||'bottom-right';var forceMock=cs&&cs.getAttribute('data-jenni-mock')==='1';var s=document.createElement('script');s.src=apiOrigin+'/edge/client.js';s.defer=true;s.onload=function(){if(window.JenniEdge&&window.JenniEdge.init){window.JenniEdge.init({tenant:tenant,zip:zip,position:position,apiBase:apiOrigin+'/edge',forceMock:forceMock}); if(cs&&cs.getAttribute('data-jenni-open')==='1'){try{window.JenniEdge.openPanel();}catch(e){}}}};document.head.appendChild(s);}catch(e){console.error('Jenni loader failed',e);}}();`;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(script);
  } catch (e) {
    res.status(500).send('// loader generation failed');
  }
});

// Embedded single-request variant: bundles client code so only one <script> tag is needed.
// Usage:
// <script src="https://TUNNEL/edge/embed.js" data-jenni-tenant="demo" data-jenni-zip="10001" data-jenni-open="1" async></script>
edge.get('/embed.js', async (req: Request, res: Response) => {
  try {
    const { readFile } = await import('fs/promises');
    const { resolve } = await import('path');
    const tenantRaw = String((req.query as any)?.tenant || 'demo');
    const zipRaw = String((req.query as any)?.zip || '10001');
    const tenant = tenantRaw.replace(/[^a-z0-9_-]/ig, '') || 'demo';
    const zip = zipRaw.replace(/[^0-9]/g, '').slice(0,10) || '10001';
    const edgePath = resolve(process.cwd(), 'examples/edge-demo/edge.js');
    let core = await readFile(edgePath, 'utf8');
    // Ensure it doesn't early-set config that we override; we simply run init after load.
    const script = `(()=>{try{var cs=document.currentScript;var ORIGIN=new URL(cs.src).origin;var tenant=(cs&&cs.getAttribute('data-jenni-tenant'))||'${tenant}';var zip=(cs&&cs.getAttribute('data-jenni-zip'))||'${zip}';var position=(cs&&cs.getAttribute('data-jenni-position'))||'bottom-right';var forceMock=(cs&&cs.getAttribute('data-jenni-mock')==='1');var autoOpen=(cs&&cs.getAttribute('data-jenni-open')==='1');}\ncatch(e){console.error('Jenni embed parse err',e);}/* core start */\n${core}\n/* core end */\ntry{if(window.JenniEdge&&window.JenniEdge.init){window.JenniEdge.init({tenant:tenant,zip:zip,position:position,apiBase:ORIGIN+'/edge',forceMock:forceMock}); if(autoOpen){setTimeout(()=>{try{window.JenniEdge.openPanel();}catch(_){}} ,150);}}}catch(e){console.error('Jenni init failed',e);} })();`;
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(script);
  } catch (e) {
    res.status(500).send('// embed generation failed');
  }
});

// Simple JSON API to fetch a ready-made snippet programmatically
edge.get('/snippet', (req: Request, res: Response) => {
  const tenantRaw = String((req.query as any)?.tenant || 'demo');
  const zipRaw = String((req.query as any)?.zip || '10001');
  const tenant = tenantRaw.replace(/[^a-z0-9_-]/ig, '') || 'demo';
  const zip = zipRaw.replace(/[^0-9]/g, '').slice(0,10) || '10001';
  const base = `${req.protocol}://${req.get('host')}`;
  const loader = `<script src="${base}/edge/loader.js" data-jenni-tenant="${tenant}" data-jenni-zip="${zip}" async></script>`;
  const embed = `<script src="${base}/edge/embed.js" data-jenni-tenant="${tenant}" data-jenni-zip="${zip}" async></script>`;
  res.json({ ok: true, tenant, zip, loader, embed });
});

// Friendly non-technical installer page.
edge.get('/install', async (_req: Request, res: Response) => {
  try {
    const { readFile } = await import('fs/promises');
    const { resolve } = await import('path');
    const p = resolve(process.cwd(), 'public/edge/install.html');
    const html = await readFile(p, 'utf8');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(404).send('Installer not found');
  }
});

// --- Simple server-side product URL preview (non-technical) ---
// Parses a remote product page (best-effort), extracts basic fingerprint and runs resolve logic.
edge.post('/preview', async (req: Request, res: Response) => {
  try {
    const { url = '', zip = '10001' } = (req.body as any) || {};
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ ok: false, error: 'invalid_url' });
    }
    const safeUrl = new URL(url);
    // Basic host allowlist pattern: disallow internal ips
    if (/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/.test(safeUrl.hostname)) {
      return res.status(400).json({ ok: false, error: 'blocked_host' });
    }
    const timeout = Number(process.env.PREVIEW_FETCH_TIMEOUT_MS || 6000);
    let html: string = '';
    try {
      try {
        const r = await axios.get(safeUrl.toString(), { timeout, maxContentLength: 512000, headers: { 'User-Agent': 'JenniPreview/1.0', 'Accept': 'text/html,*/*' } });
        html = typeof r.data === 'string' ? r.data : '';
      } catch {
        const r2 = await axios.get(safeUrl.toString(), { timeout: Math.min(timeout, 3500), maxContentLength: 256000, headers: { 'User-Agent': 'JenniPreview/1.0' } });
        html = typeof r2.data === 'string' ? r2.data : '';
      }
    } catch (e: any) {
      return res.status(200).json({ ok: true, fetched: false, error: 'fetch_failed', detail: e?.message });
    }
    const fingerprint = parseProductHtml(html, safeUrl.toString());
    const resolved = await internalResolveLike(zip, fingerprint);
    const fingerprintQuality = scoreFingerprint(fingerprint);
    const matchConfidence = computeMatchConfidence(fingerprint);
    const reason = !resolved.eligible ? (resolved.node_count === 0 ? 'no_nearby_stores' : (fingerprintQuality < 0.4 ? 'weak_product_fingerprint' : 'not_in_network')) : 'ok';
    res.json({
      ok: true,
      fetched: true,
      url: safeUrl.toString(),
      fingerprint,
      product: {
        title: fingerprint.title,
        brand: fingerprint.brand,
        sku: fingerprint.sku,
        gtin: fingerprint.gtin,
        styleCode: fingerprint.styleCode,
        fingerprintQuality,
        matchConfidence
      },
      availability: { available: resolved.eligible, nearbyStores: resolved.node_count, reason },
      ...resolved
    });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: e?.message || 'preview_failed' });
  }
});

// Public simple play page for non-technical founders: paste URL + ZIP
edge.get('/play', async (_req: Request, res: Response) => {
  try {
    const { readFile } = await import('fs/promises');
    const { resolve } = await import('path');
    const p = resolve(process.cwd(), 'public/edge/play.html');
    const html = await readFile(p, 'utf8');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(404).send('Play page not found');
  }
});

// Minimal internal resolve-like logic reused by preview (extract from /resolve without Express req/res noise)
async function internalResolveLike(zip: string, fingerprint: any){
  const hasGtin = !!fingerprint?.gtin;
  const query = String(fingerprint?.styleCode || fingerprint?.sku || fingerprint?.title || 'sneakers');
  const brand = String(fingerprint?.brand || '');
  const nodes = await placesNearby(zip, query, brand, fingerprint?.styleCode, false);
  const topNodes = nodes.slice(0,5);
  const best: any = (topNodes[0] || nodes[0]) || {};
  const distance = Number.isFinite(best.distanceMiles) ? best.distanceMiles : 4.0;
  const trustScore = Number.isFinite(best.score) ? best.score : 0.6;
  let eligible=false, exactMatch=false, etaMinutes: number | null = null, localPrice: number | undefined = undefined;
  const match_method = hasGtin ? 'gtin' : (fingerprint?.styleCode ? 'styleCode' : (fingerprint?.sku ? 'sku':'text'));
  if (hasGtin) {
    try {
      const r = await checkEligibility({ gtin: fingerprint.gtin, zip, storeId: 'demo-store' });
      eligible = !!r.eligible; exactMatch = eligible; if (typeof (r as any).minPrice === 'number') localPrice = (r as any).minPrice;
    } catch { eligible=false; }
  } else { eligible = topNodes.length>0; }
  if (eligible) etaMinutes = zip.startsWith('94') ? 80 : 110;
  const matching_score = computeMatchConfidence(fingerprint);
  const pdpPrice = priceFromFingerprint(fingerprint);
  const price = (typeof pdpPrice === 'number' ? pdpPrice : (typeof localPrice === 'number' ? localPrice : 80));
  const buyCost = (typeof localPrice === 'number' ? localPrice : undefined);
  const courier_est = PG.courierBase + PG.courierPerMile * distance;
  const fee = PG.feePct * price; const landed_cost = (typeof buyCost === 'number' ? buyCost : PG.cogsPct * price); const floor = Math.max(PG.floorAbs, PG.floorPct * price);
  const margin = price - landed_cost - fee - courier_est;
  const pgPass = margin >= floor && trustScore >= PG.trustThreshold;
  const nodesWithEconomics = topNodes.map((n:any) => {
    const d = Number.isFinite(n.distanceMiles) ? n.distanceMiles : distance;
    const courierN = PG.courierBase + PG.courierPerMile * d;
    const trustN = Number.isFinite(n.score) ? n.score : trustScore;
    const marginN = price - landed_cost - fee - courierN;
    const passN = marginN >= floor && trustN >= PG.trustThreshold;
    return { ...n, courier_est: Number(courierN.toFixed(2)), margin: Number(marginN.toFixed(2)), floor: Number(floor.toFixed(2)), trustScore: Number(trustN.toFixed(2)), pgPass: passN };
  });
  const anyPass = nodesWithEconomics.some((n:any)=>n.pgPass);
  return { eligible: eligible && (anyPass || pgPass), etaMinutes, matching_score, node_count: nodesWithEconomics.length, nodes: nodesWithEconomics, exactMatch, match_method, economics: { salePrice: Number(price.toFixed ? price.toFixed(2) : price), buyCost: Number((typeof buyCost === 'number' ? buyCost : (PG.cogsPct * price)).toFixed(2)), fee: Number(fee.toFixed(2)), courier: Number(courier_est.toFixed(2)), margin: Number(margin.toFixed(2)), floor: Number(floor.toFixed(2)), pass: pgPass, trust: { score: Number(trustScore.toFixed(2)), threshold: PG.trustThreshold } }, profitGuard: { pass: pgPass, price, landed_cost, fee, courier_est, margin: Number(margin.toFixed(2)), floor: Number(floor.toFixed(2)), trustScore: Number(trustScore.toFixed(2)), distanceMiles: Number(distance.toFixed(2)) } };
}

// Basic HTML product parsing (best-effort, non-executing):
function parseProductHtml(html: string, url: string){
  const out: any = { url, title: null, brand: null, sku: null, gtin: null, styleCode: null };
  try {
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*>/i);
    if (og) { const m = og[0].match(/content=["']([^"']+)["']/i); if (m) out.title = m[1]; }
    if (!out.title){ const t = html.match(/<title>([^<]{3,120})<\/title>/i); if (t) out.title = t[1]; }
    const sku = html.match(/"sku"\s*:\s*"([^"]{3,60})"/i); if (sku) out.sku = sku[1];
    const gtin = html.match(/"(gtin13|gtin|gtin14)"\s*:\s*"([0-9]{8,14})"/i); if (gtin) out.gtin = gtin[2];
    const brand = html.match(/"brand"\s*:\s*("([^"]{2,60})"|\{[^}]*"name"\s*:\s*"([^"]{2,60})"[^}]*\})/i);
    if (brand){ out.brand = brand[2] || brand[3] || null; }
    const style = html.match(/([A-Z0-9]{4,}-[0-9]{3})/); if (style) out.styleCode = style[1];
    // Attempt minimal JSON-LD scan for price
    const ldBlocks = html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
    for (const blk of ldBlocks){
      try { const jsonTxt = blk.replace(/^[^>]*>/,'').replace(/<\/script>$/,''); const obj = JSON.parse(jsonTxt); const arr = Array.isArray(obj)?obj:[obj];
        for (const node of arr){
          const type = (node['@type']||'').toString().toLowerCase();
            if (type.includes('product')){
              out.ld = node; out.title = out.title || node.name || null; out.gtin = out.gtin || node.gtin13 || node.gtin || null; out.sku = out.sku || node.sku || null;
              if (node.brand){ out.brand = out.brand || (typeof node.brand==='string'?node.brand: (node.brand.name||null)); }
            }
        }
      } catch {}
    }
  } catch {}
  return out;
}

function scoreFingerprint(fp: any): number {
  if (!fp) return 0;
  let score = 0;
  if (fp.gtin) score += 0.5;
  if (fp.sku) score += 0.2;
  if (fp.styleCode) score += 0.15;
  if (fp.brand) score += 0.1;
  if (fp.title) score += 0.05;
  return Math.min(1, score);
}

function computeMatchConfidence(fp: any): number {
  if (!fp) return 0.1;
  if (fp.gtin) return 0.99;
  if (fp.styleCode && fp.brand) return 0.9;
  if (fp.sku && fp.brand) return 0.85;
  if (fp.sku) return 0.75;
  if (fp.title && fp.brand) return 0.6;
  if (fp.title) return 0.5;
  return 0.3;
}

// Classify substitution level for visible product-led demo
function deriveMatchMeta(fp: any): { matchType: string; substitutionLevel: number } {
  if (!fp) return { matchType: 'unknown', substitutionLevel: 3 };
  if (fp.gtin) return { matchType: 'exact', substitutionLevel: 0 };
  if (fp.styleCode && fp.brand) return { matchType: 'style_variant', substitutionLevel: 1 };
  if (fp.sku && fp.brand) return { matchType: 'brand_variant', substitutionLevel: 1 };
  if (fp.brand && fp.title) return { matchType: 'brand_adjacent', substitutionLevel: 2 };
  if (fp.title) return { matchType: 'generic', substitutionLevel: 3 };
  return { matchType: 'unknown', substitutionLevel: 3 };
}
