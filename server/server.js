#!/usr/bin/env node
/* server.js — zero-dependency HTTP server: generates, caches, and serves flash cards */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3456;
const CACHE_FILE = path.join(__dirname, 'card-cache.json');
const STATIC_ROOT = path.resolve(__dirname, '..');

// ── Cache ──
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')); } catch (_) { /* start fresh */ }

function saveCache() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)); } catch (_) {}
}

function cacheKey(topic, difficulty) {
  return `${topic}:${difficulty}`;
}

// ── Card generation via opencode CLI ──
function generateCard(topic, difficulty, callback) {
  const script = path.join(__dirname, 'generate-card.js');
  const child = spawn(process.execPath, [script, topic, String(difficulty)], {
    timeout: 90000,
    cwd: __dirname
  });

  let stdout = '', stderr = '';
  child.stdout.on('data', d => stdout += d);
  child.stderr.on('data', d => stderr += d);

  child.on('close', (code) => {
    if (code !== 0) return callback(new Error(stderr || `exit code ${code}`));
    try {
      const card = JSON.parse(stdout);
      callback(null, card);
    } catch (e) {
      callback(new Error(`JSON parse error: ${e.message}\nstdout: ${stdout.substring(0, 500)}`));
    }
  });

  child.on('error', (err) => callback(err));
}

// ── Request handler ──
function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/api/generate') {
    const topic = (url.searchParams.get('topic') || 'caching').toLowerCase().replace(/\s+/g, '-');
    const difficulty = parseInt(url.searchParams.get('difficulty')) || 3;
    const key = cacheKey(topic, difficulty);

    // check cache
    if (cache[key]) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ cached: true, card: cache[key] }));
    }

    // generate
    generateCard(topic, difficulty, (err, card) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
      cache[key] = card;
      saveCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cached: false, card }));
    });

  } else if (pathname === '/api/cache-stats') {
    const topics = {};
    for (const k of Object.keys(cache)) {
      const [t] = k.split(':');
      topics[t] = (topics[t] || 0) + 1;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total: Object.keys(cache).length, byTopic: topics }));

  } else if (pathname === '/api/prefetch' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { topic, difficulty } = JSON.parse(body);
        const key = cacheKey(topic, difficulty);
        if (cache[key]) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, cached: true }));
        }
        generateCard(topic, difficulty, (err, card) => {
          if (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: err.message }));
          }
          cache[key] = card;
          saveCache();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, cached: false }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid body' }));
      }
    });

  } else if (pathname === '/api/feedback' && req.method === 'POST') {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Feedback is only available in the deployed app' }));

  } else {
    // serve static files for the PWA
    const filePath = path.join(STATIC_ROOT, pathname === '/' ? 'index.html' : pathname);
    const ext = path.extname(filePath);
    const mimeMap = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
      '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
    };

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`⚡ Flashcard server running at http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/generate?topic=caching&difficulty=3`);
});
