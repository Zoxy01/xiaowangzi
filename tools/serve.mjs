/**
 * 零依赖静态服务器（开发用）。
 *   node tools/serve.mjs [port]
 * 默认 4173，监听 0.0.0.0，方便同一 Wi-Fi 下的 iPhone 直接访问。
 * 注意：本游戏不用 SharedArrayBuffer / 多线程，因此不需要 COOP/COEP 头；
 * 反而加上会让部分 Firefox 版本出问题，这里保持简单。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';

const rootDir = resolve(process.cwd(), 'dist');
const port = Number(process.argv[2] || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const p = normalize(join(root, decoded));
  return p.startsWith(root) ? p : null;
}

const server = createServer(async (req, res) => {
  try {
    let p = safeJoin(rootDir, req.url === '/' ? '/index.html' : req.url);
    if (!p) {
      res.writeHead(403).end('forbidden');
      return;
    }

    let st;
    try {
      st = await stat(p);
    } catch {
      // SPA 回退
      p = join(rootDir, 'index.html');
      st = await stat(p);
    }
    if (st.isDirectory()) {
      p = join(p, 'index.html');
      st = await stat(p);
    }

    const body = await readFile(p);
    const ext = extname(p).toLowerCase();
    const immutable = /\/assets\//.test(p) && ext !== '.html';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end('server error: ' + err.message);
  }
});

server.listen(port, '0.0.0.0', () => {
  const nets = networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    }
  }
  console.log(`serving ${rootDir}`);
  console.log(`  local:   http://127.0.0.1:${port}`);
  for (const ip of ips) console.log(`  network: http://${ip}:${port}   <- iPhone 用这个`);
});
