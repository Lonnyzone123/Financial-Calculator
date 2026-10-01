/* S5AA R41 (task 6.5): a read-only static server on 127.0.0.1. "/" serves the source tree, "/r41/" this folder.
   Usage: node server.js <source tree> <port>. GET only; no directory listing; paths cannot leave either root. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.resolve(process.argv[2]);
const R41 = __dirname;
const PORT = Number(process.argv[3] || 8741);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  const url = decodeURIComponent(req.url.split('?')[0]);
  const [root, rel] = url.startsWith('/r41/') ? [R41, url.slice(5)] : [SRC, url.slice(1)];
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => console.log('serving', SRC, 'on http://127.0.0.1:' + PORT));
