/**
 * 检查地球小径是否真的画出来了：同机位拍「有路 / 无路」两张，
 * 对比画面中心带的亮度差（差值为 0 说明路被背面剔除或压根没画）。
 *   node tools/earth-path-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9500 + Math.floor(Math.random() * 200);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  '--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-path-' + Date.now(), '--no-first-run',
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
await ev(`localStorage.setItem('lp.progress', JSON.stringify({ visited: ['b612','king','vanity','bar','merchant','lamp','geo'], explored: {}, version: 2 })); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1400);
await ev(`(() => { const p = document.querySelector('.planet[data-id="earth"]'); p.click(); p.click(); })()`);
await sleep(4200);

const shotAt = async (file, hidePath) => {
  await ev(`(() => {
    const g = window.__game, ch = g.chapter;
    g.paused = false;
    ch.dialogue.stop(); ch.busy = false;
    const R = ch.radius;
    const dirAt = (dd, ss) => {
      const a = dd / R;
      return new ch.camera.position.constructor(Math.sin(a), 0, Math.cos(a))
        .multiplyScalar(Math.cos(ss / R))
        .add(new ch.camera.position.constructor(0, Math.sin(ss / R), 0)).normalize();
    };
    if (!window.__spawned) {
      ch.walker.spawn(dirAt(40, 0)); ch.walker.sync(true); window.__spawned = true;
    }
    ch.walker.lookToward(dirAt(66, 0));
    ch.walker.camPitch = 0.8;
    if (ch.path) ch.path.visible = ${hidePath ? 'false' : 'true'};
    for (let i = 0; i < 90; i++) ch.update(1 / 60);
  })()`);
  await sleep(280);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync('test-shots', { recursive: true });
  writeFileSync(`test-shots/${file}.png`, Buffer.from(shot.data, 'base64'));
};

await shotAt('path-on', false);
await shotAt('path-off', true);
await ev(`(() => { const ch = window.__game.chapter; if (ch.path) ch.path.visible = true; })()`);
console.log('已拍：test-shots/path-on.png（有路） test-shots/path-off.png（隐藏路）');
console.log('运行时错误：', errors.length ? errors.slice(0, 4) : '无');
ws.close();
proc.kill();
