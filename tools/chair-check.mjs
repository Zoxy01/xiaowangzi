/**
 * 检查 B-612 的椅子是否「正」：本地 +Y 应等于地表法线，本地 +Z 应朝向日落方向。
 *   node tools/chair-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9800 + Math.floor(Math.random() * 80);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-chair-${Date.now()}`, '--no-first-run',
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
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
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
await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1400);
await ev(`(() => { const p = document.querySelector('.planet[data-id="b612"]'); p.click(); p.click(); })()`);
await sleep(4200);
await ev(`(() => { const ch = window.__game.chapter; if (ch) { ch.dialogue.stop(); ch.busy = false; } })()`);
await sleep(400);

const r = await ev(`(() => {
  const ch = window.__game.chapter;
  const V = ch.walker.position.constructor;
  const Q = ch.chair.quaternion.constructor;
  const n = ch.chairDir.clone().normalize();
  const sun = ch.sunDir.clone();
  const tSun = sun.addScaledVector(n, -sun.dot(n)).normalize();
  const up = new V(0, 1, 0).applyQuaternion(ch.chair.quaternion);
  const fwd = new V(0, 0, 1).applyQuaternion(ch.chair.quaternion);
  const right = new V(1, 0, 0).applyQuaternion(ch.chair.quaternion);
  const cross = new V().crossVectors(up, fwd);
  return {
    upDotNormal: +up.dot(n).toFixed(3),
    fwdDotSun: +fwd.dot(tSun).toFixed(3),
    handed: +cross.dot(right).toFixed(3),
    det: +ch.chair.matrixWorld.determinant().toFixed(3),
    scale: [ch.chair.scale.x, ch.chair.scale.y, ch.chair.scale.z].map((v) => +v.toFixed(3)),
    ground: +(ch.chair.position.length() - ch.radius).toFixed(3),
  };
})()`);

console.log(JSON.stringify(r, null, 1));
const ok = r.upDotNormal > 0.999 && r.fwdDotSun > 0.98 && r.handed > 0.98 && r.det > 0 && Math.abs(r.ground) < 0.05;
console.log(errors.length ? `运行时报错 ${errors.length}: ${errors[0]}` : '运行时报错 0');
console.log(ok ? '✓ 椅子是正的，椅面朝日落' : '✗ 椅子仍然不正');
ws.close();
proc.kill();
process.exit(ok ? 0 : 1);
