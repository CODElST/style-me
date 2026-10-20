#!/usr/bin/env node
// StyleMe lookup proxy — a tiny stateless relay between the app and Google
// Cloud Vision (webDetection).
//
// Why this exists: the app never talks to a cloud vision provider directly,
// so the provider API key never ships inside the app. The app sends ONE
// downscaled, cropped garment photo (base64 JPEG) and receives back links:
//
//     POST /lookup   { image: "<base64>" }
//         ->  { pages: [{ title, url, source, thumb }], entities: ["..."] }
//
//     GET  /health   -> { ok: true, keyConfigured: <bool> }
//
// Privacy contract:
//   - Nothing is logged, cached or written to disk. The photo is forwarded
//     to Google once and then dropped.
//   - The Google key is read from the environment, never from code.
//   - No user accounts, no analytics, no cookies. CORS is open because the
//     proxy holds no state worth protecting; rate limiting is per-IP.
//   - Results are plain URLs: the app stores (and the user visits) links on
//     the original sites. No images or article text are ever copied.

'use strict';

// Tiny .env loader (KEY=VALUE lines) so `node server.js` just works with a
// local .env file, no dependencies. Environment variables already set win.
try {
  const fs = require('node:fs');
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
} catch {
  // no .env file — fine, variables can come from the environment
}

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 8787);
const MAX_BODY_BYTES = 6 * 1024 * 1024; // ~8MB JPEG base64 → generous 6MB cap
const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // requests per window per client IP

// ----------------------------------------------------------------- utilities

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(json);
}

function hostOf(iframeUrl) {
  try {
    return new URL(iframeUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

function httpsPostJson(urlString, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const payload = Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            res.destroy();
            reject(new Error('provider response too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            // fall through with null parsed
          }
          resolve({ status: res.statusCode || 0, body: parsed, text });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('provider timeout'));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

// --------------------------------------------------- per-IP rate limiting

/** ip -> array of hit timestamps inside the current window; kept in memory only */
const hits = new Map();

function overRateLimit(ip) {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  const list = (hits.get(ip) || []).filter((t) => t > cutoff);
  if (list.length >= RATE_MAX) {
    hits.set(ip, list);
    return true;
  }
  list.push(Date.now());
  hits.set(ip, list);
  return false;
}

const pruner = setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, list] of hits) {
    if (!list.some((t) => t > cutoff)) hits.delete(ip);
  }
}, RATE_WINDOW_MS);
pruner.unref();

// ------------------------------------------------------------ vision lookup

const FASHION_JUNK = /^(shop|shopstyle|pinterest|instagram|facebook|flickr|wordpress\.com)$/;

async function visionWebDetect(imageBase64) {
  const key = process.env.GOOGLE_VISION_API_KEY || '';
  if (!key) {
    return { status: 503, error: 'Lookup service is not configured with a provider key yet.' };
  }

  const request = {
    requests: [
      {
        image: { content: imageBase64 },
        features: [{ type: 'WEB_DETECTION', maxResults: 15 }],
      },
    ],
  };

  let provider;
  try {
    provider = await httpsPostJson(`${VISION_URL}?key=${encodeURIComponent(key)}`, request, 12_000);
  } catch (err) {
    return { status: 502, error: `Could not reach the vision provider (${err.message}).` };
  }

  if (provider.status !== 200) {
    const detail = (provider.body && provider.body[0] && provider.body[0].message) || 'provider error';
    return { status: 502, error: `Vision provider said: ${detail}` };
  }

  const webDetection =
    provider.body &&
    provider.body.responses &&
    provider.body.responses[0] &&
    provider.body.responses[0].webDetection;

  if (!webDetection) return { status: 502, error: 'Vision provider returned no web detection.' };

  const seen = new Set();
  const pages = [];

  const pushPage = (title, url) => {
    if (!url || seen.has(url) || pages.length >= 12) return;
    seen.add(url);
    let host = hostOf(url);
    if (FASHION_JUNK.test(host)) return; // drop aggregator noise up front
    pages.push({
      title: (title || 'Untitled result').split('|')[0].trim() || 'Untitled result',
      url,
      source: host,
      thumb: url, // hotlinked reference, not a copied image
    });
  };

  for (const p of webDetection.pagesWithMatchingImages || []) {
    pushPage(p.pageTitle, p.imageUrl);
  }
  for (const p of (webDetection.fullMatchingImages || []).slice(0, 4)) {
    pushPage('Matching image', p.url);
  }
  for (const p of (webDetection.visuallySimilarImages || []).slice(0, 4)) {
    pushPage('Visually similar', p.url);
  }

  const entities = (webDetection.webEntities || [])
    .filter((e) => e.description)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((e) => e.description)
    .slice(0, 6);

  return { status: 200, pages, entities };
}

// -------------------------------------------------------------------- server

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Per-IP rate limit applies to /lookup only; /health stays free.
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    sendJson(res, 200, {
      ok: true,
      service: 'styleme-lookup',
      keyConfigured: Boolean(process.env.GOOGLE_VISION_API_KEY),
    });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/lookup') {
    sendJson(res, 404, { error: 'Not found. This proxy only exposes POST /lookup and GET /health.' });
    return;
  }

  const ip = (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  if (overRateLimit(ip)) {
    sendJson(res, 429, { error: 'Too many lookups — try again in a minute.' });
    return;
  }

  if (!process.env.GOOGLE_VISION_API_KEY) {
    sendJson(res, 503, { error: 'Lookup service is not configured with a provider key yet.' });
    return;
  }

  const chunks = [];
  let size = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      aborted = true;
      sendJson(res, 413, { error: 'Photo too large for a lookup.' });
      return;
    }
    chunks.push(chunk);
  });

  req.on('error', () => {
    /* client hangup; nothing to log by contract */
  });

  req.on('end', () => {
    if (aborted) return;
    let imageBase64 = '';
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof parsed.image !== 'string' || parsed.image.length < 64) {
        sendJson(res, 400, { error: 'Body must be { image: "<base64 jpeg>" }.' });
        return;
      }
      imageBase64 = parsed.image.replace(/^data:image\/\w+;base64,/, '');
    } catch {
      sendJson(res, 400, { error: 'Body must be valid JSON with an image field.' });
      return;
    }

    visionWebDetect(imageBase64)
      .then((result) => {
        if (result.status === 200) {
          sendJson(res, 200, { pages: result.pages, entities: result.entities });
        } else {
          sendJson(res, result.status, { error: result.error });
        }
      })
      .catch(() => sendJson(res, 502, { error: 'Lookup failed unexpectedly.' }));
  });
});

server.listen(PORT, () => {
  if (!process.env.GOOGLE_VISION_API_KEY) {
    console.warn('[styleme] GOOGLE_VISION_API_KEY is not set — lookups will return 503.');
  }
  console.log(`[styleme] lookup proxy listening on http://0.0.0.0:${PORT} (stateless, no storage)`);
});
