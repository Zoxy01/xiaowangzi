/**
 * 诊断：列出地球章里离球面最远的若干网格（找出悬空或陷地的零件）。
 *   node tools/earth-diag.mjs [部件名...]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const parts = process.argv.slice(2);
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 200);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  '--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-diag-' + Date.now(), '--no-first-run',
  '--window-size=393,852', 'about:blank',
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 130; i++) {
  await sleep(200);
  try {
    const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = l.find((t) => t.type === 'page');
    if (target) break;
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
};
await new Promise((r) => (ws.onopen = r));
const send = (m, p = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
  return new Promise((r) => pend.set(i, r));
};
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE });
await sleep(2600);
await ev(`localStorage.setItem('lp.progress', JSON.stringify({ visited: ['b612','king','vanity','bar','merchant','lamp','geo'], explored: {}, version: 2 })); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1400);
await ev(`(() => { const p = document.querySelector('.planet[data-id="earth"]'); p.click(); p.click(); })()`);
await sleep(4200);

const PROBE = `(() => {
  const g = window.__game, ch = g.chapter;
  g.paused = false; ch.dialogue.stop(); ch.busy = false;
  for (let i = 0; i < 90; i++) ch.update(1 / 60);
  const R = ch.radius;
  const V = ch.camera.position.constructor;
  const names = ${JSON.stringify(parts.length ? parts : ['garden', 'station', 'cart', 'train', 'plane', 'well'])};
  const out = {};
  for (const name of names) {
    const o = ch[name];
    if (!o) { out[name] = ['missing']; continue; }
    const rows = [];
    o.updateWorldMatrix(true, true);
    o.traverse((c) => {
      if (!(c.isMesh || c.isPoints || c.isSprite)) return;
      const geo = c.geometry;
      if (!geo || !geo.attributes || !geo.attributes.position) return;
      let lo = 1e9;
      let hi = -1e9;
      if (c.isInstancedMesh) {
        const arr = c.instanceMatrix.array;
        for (let i = 0; i < c.count; i += Math.max(1, Math.floor(c.count / 40))) {
          const e = i * 16;
          const p = new V(arr[e + 12], arr[e + 13], arr[e + 14]).applyMatrix4(c.matrixWorld);
          const r = p.length();
          if (r < lo) lo = r;
          if (r > hi) hi = r;
        }
      } else {
        // 直接采样顶点：长条形的曲面网格（例如沿赤道铺的小路）用包围盒角点会得出离谱的半径
        const attr = geo.attributes.position;
        const step = Math.max(1, Math.floor(attr.count / 400));
        for (let i = 0; i < attr.count; i += step) {
          const p = new V(attr.getX(i), attr.getY(i), attr.getZ(i)).applyMatrix4(c.matrixWorld);
          const r = p.length();
          if (r < lo) lo = r;
          if (r > hi) hi = r;
        }
        if (!geo.boundingBox) geo.computeBoundingBox();
      }
      const col = c.material && c.material.color ? c.material.color.getHexString() : '-';
      const bb2 = geo.boundingBox;
      const sz = bb2 ? [(bb2.max.x - bb2.min.x).toFixed(1), (bb2.max.y - bb2.min.y).toFixed(1), (bb2.max.z - bb2.min.z).toFixed(1)].join('x') : '?';
      rows.push({ g: geo.type, n: c.isInstancedMesh ? c.count : 1, lo: +(lo - R).toFixed(2), hi: +(hi - R).toFixed(2), col, sz });
    });
    rows.sort((a, b) => a.lo - b.lo);
    out[name] = rows.slice(0, 6).concat(rows.slice(-3));
  }
  return out;
})()`;

const data = await ev(PROBE);
for (const [name, rows] of Object.entries(data)) {
  console.log(`\n[${name}]`);
  for (const r of rows) console.log(`  ${r.g.padEnd(22)} n=${String(r.n).padStart(4)}  min=${String(r.lo).padStart(6)}  max=${String(r.hi).padStart(6)}  #${r.col}  ${r.sz}`);
}
ws.close();
proc.kill();
