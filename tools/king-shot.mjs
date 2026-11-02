/**
 * 第二章王座截图：站在王座斜前方拍一张，另加一张近景，再统计画面配色、
 * 以及「国王身体是否在王座座面上方」「头是否露在椅背外」等几何关系。
 *   node tools/king-shot.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4173/';
const OUT = 'test-shots/king';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9600 + Math.floor(Math.random() * 40);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  '--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-king-shot-' + Date.now(),
  '--no-first-run', '--window-size=393,852', 'about:blank',
], { stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 80; i++) {
  await sleep(250);
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
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
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
mkdirSync(OUT, { recursive: true });
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(s.data, 'base64');
  writeFileSync(`${OUT}/${name}.png`, buf);
  console.log(`  ${OUT}/${name}.png  ${Math.round(buf.length / 1024)} KB`);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE });
await sleep(2600);
await ev("document.getElementById('boot-start').click()");
await sleep(1600);
await ev("(() => { const p = document.querySelector('.planet[data-id=\"king\"]'); p.click(); p.click(); })()");
await sleep(4200);
await ev("(() => { const ch = window.__game.chapter; ch.dialogue.stop(); ch.busy = false; })()");
await sleep(400);

// 站到王座斜前 2.2 m 左右，镜头朝向王座
await ev(`(() => {
  const ch = window.__game.chapter;
  const T = ch.throne.position.clone().normalize();
  const away = ch.walker.position.clone().normalize();
  const dir = T.clone().multiplyScalar(2.2).add(away).normalize();
  ch.walker.spawn(dir.multiplyScalar(ch.radius + 0.02));
  ch.walker.lookToward(T);
  ch.walker.sync(true);
  ch.camYawExtra = 0;
})()`);
await sleep(700);
await shot('king-throne');

// 近景：把相机拉近看坐姿（直接改 walker 的相机距离是内部量，这里用走两秒让 lerp 收敛后截图）
await ev(`(() => {
  const ch = window.__game.chapter;
  const g = window.__game;
  g.paused = false;
  for (let i = 0; i < 40; i++) ch.update(1 / 60);
  g.paused = true;
})()`);
await sleep(300);
await shot('king-throne-close');

const info = await ev(`(() => {
  const ch = window.__game.chapter, T = ch.throne, K = ch.kingNPC;
  T.updateMatrixWorld(true);
  const V = T.position.constructor;
  // 把国王每个 mesh 的包围盒角点转到「王座局部坐标」，再取 y 的上下界
  let lo = Infinity, hi = -Infinity;
  K.traverse((n) => {
    if (!n.isMesh) return;
    n.geometry.computeBoundingBox();
    const b = n.geometry.boundingBox;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const w = new V(x, y, z).applyMatrix4(n.matrixWorld);
      T.worldToLocal(w);
      lo = Math.min(lo, w.y); hi = Math.max(hi, w.y);
    }
  });
  const kw = K.getWorldPosition(new V());
  const tw = T.getWorldPosition(new V());
  return {
    seatY: T.userData.seatY,
    kingFootY: +lo.toFixed(3),
    kingTopY: +hi.toFixed(3),
    kingDistFromThrone: +kw.distanceTo(tw).toFixed(3),
    kingScale: K.scale.x,
    camDist: +ch.camera.position.distanceTo(kw).toFixed(2),
    drawCalls: window.__game.renderer.info.render.calls,
  };
})()`);
console.log('几何：', JSON.stringify(info));
console.log('运行时报错', errors.length);
if (errors.length) console.log(errors.slice(0, 3).join('\n'));
ws.close();
proc.kill();
