/**
 * 交付截图：iPhone 视口下地图 + 8 章各一张。
 *   node tools/gallery.mjs
 * 产物在 test-shots/gallery/。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const OUT = 'test-shots/avatar';
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

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE });
await sleep(2600);
await ev("document.getElementById('boot-start').click()");
await sleep(1600);
for (const c of ['king', 'b612']) {
  await ev("(() => { const p = document.querySelector('.planet[data-id=\"" + c + "\"]'); p.click(); p.click(); })()");
  await sleep(4600);
  await ev("(() => { const ch = window.__game.chapter; ch.dialogue.stop(); ch.busy = false; })()");
  await sleep(500);
  for (const [name, ex, ey, ez] of [['front', 0, 0.75, 1.5], ['side', 1.4, 0.7, 0.3], ['back', -0.3, 0.8, -1.5]]) {
    await ev(`(() => { const g = window.__game, ch = g.chapter, cam = ch.camera;
      g.paused = true; cancelAnimationFrame(g._raf);
      const a = ch.avatar.root; a.updateMatrixWorld(true);
      const V = a.position.constructor;
      const head = a.localToWorld(new V(0, 0.5, 0));
      const eye = a.localToWorld(new V(${ex}, ${ey}, ${ez}));
      cam.parent.updateMatrixWorld(true);
      cam.position.copy(cam.parent.worldToLocal(eye.clone()));
      cam.up.copy(cam.parent.worldToLocal(a.localToWorld(new V(0, 5, 0))).sub(cam.position).normalize());
      cam.lookAt(head); cam.updateMatrixWorld(true);
      const r = g.renderer; r.autoClear = true; r.render(ch.scene, cam);
    })()`);
    await sleep(300);
    await shot(c + '-' + name);
  }
  await ev("(() => { const g = window.__game; g.paused = false; g.returnToMap(); })()");
  await sleep(900);
}
ws.close(); proc.kill(); console.log('完成');
