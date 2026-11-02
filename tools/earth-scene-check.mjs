/**
 * 检查地球章重构后的场景：规模统计 + 每个大件相对球面的高度（是否悬空/陷地）。
 * 顺便在几个关键地点截图。
 *   node tools/earth-scene-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9000 + Math.floor(Math.random() * 300);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  '--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-earth-' + Date.now(), '--no-first-run',
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

const PROBE = `(() => {
  const g = window.__game;
  const ch = g.chapter;
  if (!ch) return { error: 'no chapter' };
  g.paused = false;
  ch.dialogue.stop();
  ch.busy = false;
  for (let i = 0; i < 90; i++) ch.update(1 / 60);
  const R = ch.radius;
  const V = ch.camera.position.constructor;
  const parts = ['snake','flower','mountain','garden','fox','station','railway','train','wheat','scarecrow','cart','well','plane','merchantNPC','pilotNPC'];
  const items = [];
  for (const name of parts) {
    const o = ch[name];
    if (!o) { items.push({ name, missing: true }); continue; }
    let meshes = 0, tris = 0;
    let mMin = 1e9, mMax = -1e9, iMin = 1e9, iMax = -1e9;
    o.updateWorldMatrix(true, true);
    o.traverse((c) => {
      if (!(c.isMesh || c.isPoints || c.isSprite)) return;
      meshes++;
      const geo = c.geometry;
      if (!geo || !geo.attributes || !geo.attributes.position) return;
      const count = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      tris += c.isInstancedMesh ? count * c.count : count;
      if (c.isInstancedMesh) {
        const arr = c.instanceMatrix.array;
        for (let i = 0; i < c.count; i++) {
          const o2 = i * 16;
          const wp = new V(arr[o2 + 12], arr[o2 + 13], arr[o2 + 14]).applyMatrix4(c.matrixWorld);
          const r = wp.length();
          if (r < iMin) iMin = r;
          if (r > iMax) iMax = r;
        }
      } else {
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        for (let k = 0; k < 8; k++) {
          const p = new V(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(c.matrixWorld);
          const r = p.length();
          if (r < mMin) mMin = r;
          if (r > mMax) mMax = r;
        }
      }
    });
    items.push({
      name, meshes, tris: Math.round(tris),
      ground: mMin < 1e8 ? +(mMin - R).toFixed(2) : null,
      top: mMax > -1e8 ? +(mMax - R).toFixed(2) : null,
      instGround: iMin < 1e8 ? +(iMin - R).toFixed(2) : null,
      instTop: iMax > -1e8 ? +(iMax - R).toFixed(2) : null,
    });
  }
  const info = window.__game.renderer.info;
  return {
    parts: items,
    rootChildren: ch.root.children.length,
    tris: info.render.triangles,
    calls: info.render.calls,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    interact: ch.interactables.map((i) => i.id),
  };
})()`;

const stats = await ev(PROBE);
console.log('规模：tris=%s calls=%s geo=%s tex=%s rootChildren=%s',
  stats.tris, stats.calls, stats.geometries, stats.textures, stats.rootChildren);
console.log('交互点：', (stats.interact || []).join(' → '));
for (const p of stats.parts || []) {
  if (p.missing) { console.log(`  ? ${p.name} 缺失`); continue; }
  const bits = [`${p.name.padEnd(12)} mesh=${String(p.meshes).padStart(3)} tris=${String(p.tris).padStart(5)}`];
  if (p.ground !== null) bits.push(`实体 ${p.ground}～${p.top} m`);
  if (p.instGround !== null) bits.push(`实例 ${p.instGround}～${p.instTop} m`);
  console.log('  ' + bits.join('  '));
}

mkdirSync('test-shots', { recursive: true });
const shots = [
  ['earth-snake', 8, 13, 1.6],
  ['earth-garden', 62, 74, -14],
  ['earth-station', 126, 134, -6],
  ['earth-wheat', 142, 152, -30],
  ['earth-well', 184, 192, -3.2],
  ['earth-plane', 205, 214, 4.2],
  ['earth-path-down', 40, 66, 0, 0.8],
];
for (const [name, at, d, side, pitch] of shots) {
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
    ch.walker.spawn(dirAt(${at}, 0));
    ch.walker.sync(true);
    ch.walker.lookToward(dirAt(${d}, ${side}));
    ch.walker.camPitch = ${pitch === undefined ? -0.14 : pitch};
    for (let i = 0; i < 100; i++) ch.update(1 / 60);
  })()`);
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`test-shots/${name}.png`, Buffer.from(shot.data, 'base64'));
}
console.log('截图：', shots.map((s) => s[0]).join(' '));
console.log('运行时错误：', errors.length ? errors.slice(0, 4) : '无');
ws.close();
proc.kill();
