/**
 * 复现「相机不跟随人物」。
 * A. 直线前进 —— 相机应保持固定距离跟随
 * B. 转视角 180° —— 相机应绕到角色另一侧
 * C. 侧移 —— 角色绕球走，相机应跟着走并保持角色在画面中央
 *   node tools/follow-check.mjs [章]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHAPTER = process.argv[2] || 'b612';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 60);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-fc-${Date.now()}`, '--no-first-run',
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
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(2600);
await ev("localStorage.removeItem('lp.progress'); location.reload()");
await sleep(2600);
await ev("document.getElementById('boot-start').click()");
await sleep(1400);
await ev(`(() => { const p = document.querySelector('.planet[data-id="${CHAPTER}"]'); p.click(); p.click(); })()`);
await sleep(4600);
await ev('(() => { const ch = window.__game.chapter; if (ch) { ch.dialogue.stop(); ch.busy = false; } })()');
await sleep(700);

const snap = `(() => {
  const ch = window.__game.chapter;
  const w = ch.walker.position, c = ch.camera.position;
  const cam = ch.camera;
  ch.root.updateWorldMatrix(true, false);
  const pm = ch.root.matrixWorld;
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  // walker.position 是 root 局部坐标，project() 需要世界坐标，先用 root.matrixWorld 变换。
  const head = w.clone().addScaledVector(ch.walker.up, 0.9).applyMatrix4(pm).project(cam);
  const feet = w.clone().applyMatrix4(pm).project(cam);
  return {
    walker: [+w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2)],
    camera: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
    camDist: +c.distanceTo(w).toFixed(2),
    yaw: +ch.walker.camYaw.toFixed(2),
    heading: +ch.walker.heading.toFixed(2),
    headNDC: [+head.x.toFixed(2), +head.y.toFixed(2)],
    feetNDC: [+feet.x.toFixed(2), +feet.y.toFixed(2)],
  };
})()`;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const setMove = (x, y) => ev(`(() => { const i = window.__game.input; i.move.x = ${x}; i.move.y = ${y}; })()`);

// A. 直线前进
const a0 = await ev(snap);
await setMove(0, 1);
await sleep(2200);
const a1 = await ev(snap);
await setMove(0, 0);
await sleep(700);
const a2 = await ev(snap);
console.log(`A 前进:   角色 ${dist(a0.walker, a1.walker).toFixed(2)} m / 相机 ${dist(a0.camera, a1.camera).toFixed(2)} m  距离 ${a0.camDist}→${a1.camDist}  角色画面 ${JSON.stringify(a1.headNDC)}`);

// B. 转视角 180°
await ev('(() => { window.__game.chapter.walker.camYaw += Math.PI; })()');
await sleep(1400);
const b1 = await ev(snap);
console.log(`B 转视角: 相机移动 ${dist(a2.camera, b1.camera).toFixed(2)} m  距离 ${b1.camDist}  角色画面 ${JSON.stringify(b1.headNDC)}  yaw ${a2.yaw}→${b1.yaw}`);

// C. 侧移 2.2 秒
const c0 = await ev(snap);
await setMove(1, 0);
await sleep(2200);
const c1 = await ev(snap);
await setMove(0, 0);
await sleep(700);
console.log(`C 侧移:   角色 ${dist(c0.walker, c1.walker).toFixed(2)} m / 相机 ${dist(c0.camera, c1.camera).toFixed(2)} m  距离 ${c0.camDist}→${c1.camDist}  角色画面 ${JSON.stringify(c1.headNDC)}  heading ${c0.heading}→${c1.heading} yaw ${c1.yaw}`);

ws.close();
proc.kill();
