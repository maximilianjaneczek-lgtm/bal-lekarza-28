import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 4173);
const BASE_PATH = process.env.BASE_PATH ? ('/' + process.env.BASE_PATH.replace(/^\/+|\/+$/g, '')) : '';

function contentType(ext) {
  switch (ext.toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.ico': return 'image/x-icon';
    case '.woff2': return 'font/woff2';
    case '.woff': return 'font/woff';
    case '.ttf': return 'font/ttf';
    default: return 'application/octet-stream';
  }
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': contentType(ext), 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url, `http://${host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
      pathname = pathname.slice(BASE_PATH.length) || '/';
    }

    // Simple API placeholder: real backend may be required for full features
    if (pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'API not available in this deployment' }));
      return;
    }

    // Map SPA routes to index.html
    let filePath = path.join(PUBLIC_DIR, pathname);
    if (pathname === '/' || pathname === '') filePath = path.join(PUBLIC_DIR, 'index.html');

    // Prevent path traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // fallback to index.html for client-side routing
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Server error');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexData);
        });
        return;
      }

      sendFile(res, filePath);
    });
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}, basePath=${BASE_PATH || '/'} `);
});
