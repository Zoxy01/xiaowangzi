/**
 * B-612 场景截图 + 结构探测。
 *   node tools/b612-shot.mjs
 * 输出：test-shots/b612-*.png（给 05-tools/ascii_preview.py 看结构）与控制台统计。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const OUT = 'D:/zoxyprofile/xwz/web/test-shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9500 + Math.floor(Math.random() * 80);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-b612-${Date.now()}`,
  '--no-first-run', '--window-size=393,852', 'about:blank',
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
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const path = `${OUT}/b612-${name}.png`;
  const buf = Buffer.from(r.data, 'base64');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, buf);
  console.log(`  shot ${path}  ${(buf.length / 1024).toFixed(0)} KB`);
  return path;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE });
await sleep(2600);
await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1600);

// 进入 B-612
await ev(`(() => { const p = document.querySelector('.planet[data-id="b612"]'); p.click(); p.click(); })()`);
await sleep(3200);
await ev(`(() => {
  const g = window.__game; g.paused = false;
  const ch = g.chapter;
  ch.dialogue.stop(); ch.busy = false;
  for (let i = 0; i < 120; i++) ch.update(1 / 60);
})()`);
await sleep(600);

const STATS = `(() => {
  const g = window.__game; const ch = g.chapter;
  const V = ch.walker.position.constructor;
  ch.root.updateWorldMatrix(true, true);
  const info = g.renderer.info;
  let meshes = 0, tris = 0, pts = 0;
  ch.scene.traverse((o) => {
    if (o.isMesh) { meshes++; const gg = o.geometry; tris += gg.index ? gg.index.count / 3 : (gg.attributes.position ? gg.attributes.position.count / 3 : 0); }
    if (o.isPoints) pts++;
  });
  const proj = (p) => { const q = p.clone().project(ch.camera); return [+q.x.toFixed(2), +q.y.toFixed(2)]; };
  const surface = (dir) => { const n = dir.clone().normalize(); return n.multiplyScalar(ch.radius); };
  const items = {};
  for (const [k, o] of Object.entries({ rose: ch.roseGroup, globe: ch.globeGroup, fence: ch.fence, pedestal: ch.pedestal, shed: ch.shed, spring: ch.spring, chair: ch.chair, nook: ch.nook, can: ch.can })) {
    if (!o) { items[k] = null; continue; }
    const w = new V(); o.getWorldPosition(w);
    items[k] = { ndc: proj(w), dist: +w.distanceTo(ch.walker.position).toFixed(2), ground: +(w.length() - ch.radius).toFixed(3) };
  }
  const hs = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const d = new V(Math.cos(a), 0.2, Math.sin(a)).normalize();
    hs.push(+(d.clone().multiplyScalar(ch.radius).length() - ch.radius).toFixed(3));
  }
  return {
    meshes, tris: Math.round(tris), points: pts,
    calls: info.render.calls, triangles: info.render.triangles,
    geometries: info.memory.geometries, textures: info.memory.textures,
    walkerGround: +(ch.walker.position.length() - ch.radius).toFixed(3),
    items, sampleR: hs,
    interactables: (ch.interactables || []).map((it) => it.id),
  };
})()`;

const stats = await ev(STATS);
console.log('场景统计：', JSON.stringify(stats, null, 1));
await shot('spawn');

// 绕着出生点转一圈，各拍一张，检查不同朝向都有内容
for (const [name, yaw, pitch] of [['west', 1.6, 0.28], ['south', 3.14, 0.3], ['east', 4.7, 0.26], ['high', 0.6, 0.85]]) {
  await ev(`(() => {
    const ch = window.__game.chapter;
    ch.walker.camYaw = ${yaw}; ch.walker.camPitch = ${pitch};
    for (let i = 0; i < 30; i++) ch.update(1 / 60);
  })()`);
  await sleep(260);
  await shot(name);
}

// 站在玫瑰前看花
await ev(`(() => {
  const ch = window.__game.chapter;
  const V = ch.walker.position.constructor;
  const n = ch.roseDir.clone().normalize();
  ch.walker.spawn(n.clone().addScaledVector(new V(0, 1, 0), 0.22).normalize());
  const rosePos = n.clone().multiplyScalar(ch.radius);
  ch.walker.lookToward(rosePos.sub(ch.walker.position));
  ch.walker.camDist = 2.6;
  ch.walker.camPitch = 0.12;
  for (let i = 0; i < 40; i++) ch.update(1 / 60);
})()`);
await sleep(300);
await shot('rose');

// 日落
await ev(`(() => {
  const ch = window.__game.chapter;
  const V = ch.walker.position.constructor;
  ch.sunAngle = -0.12; ch._applySun();
  const n = ch.roseDir.clone().normalize();
  ch.walker.spawn(n.clone().addScaledVector(new V(0, 1, 0), 0.3).normalize());
  ch.walker.lookToward(ch.sunDir.clone());
  ch.walker.camDist = 4.2;
  ch.walker.camPitch = 0.24;
  for (let i = 0; i < 40; i++) ch.update(1 / 60);
})()`);
await sleep(300);
await shot('sunset');

console.log(errors.length ? `运行时报错 ${errors.length}: ${errors[0]}` : '运行时报错 0');
ws.close();
proc.kill();
process.exit(0);
