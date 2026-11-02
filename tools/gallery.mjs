/**
 * 交付截图：iPhone 视口下地图 + 8 章各一张。
 *   node tools/gallery.mjs
 * 产物在 test-shots/gallery/。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const OUT = 'test-shots/gallery';
mkdirSync(OUT, { recursive: true });

const CHROME = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9200 + Math.floor(Math.random() * 150);
const profile = `D:\\zoxyprofile\\xwz\\.tmp\\edge-gal-${Date.now()}`;
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, '--no-first-run',
  '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 150; i++) {
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
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(s.data, 'base64');
  writeFileSync(`${OUT}/${name}.png`, buf);
  console.log(`  ${name}.png  ${Math.round(buf.length / 1024)} KB`);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: BASE });
await sleep(2600);
await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2600);
await shot('00-boot');
await ev(`document.getElementById('boot-start').click()`);
await sleep(1600);
await shot('01-map');

const order = ['b612', 'king', 'vanity', 'bar', 'merchant', 'lamp', 'geo', 'earth'];
for (const c of order) {
  await ev(`(() => { const p = document.querySelector('.planet[data-id="${c}"]'); p.click(); p.click(); })()`);
  await sleep(4600);
  // 关掉开场对话，露出干净的场景
  await ev(`(() => { const ch = window.__game.chapter; if (ch) { ch.dialogue.stop(); ch.busy = false; } })()`);
  await sleep(700);
  await shot(`02-${c}`);
  await ev(`(() => { const g = window.__game; if (g.chapter) g.returnToMap(); })()`);
  await sleep(900);
}

ws.close();
proc.kill();
console.log('完成');
