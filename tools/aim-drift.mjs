/**
 * 诊断：角色是否被「星球自转」带走而相机没跟上。
 * 关键点：avatar 挂在 this.root 下，而 root 每帧 rotation.y += spinSpeed*dt，
 * 但相机是场景外的独立对象（世界坐标）。若如此，角色世界位置会随自转漂移，
 * 相机只跟着「局部坐标」，于是角色会慢慢滑出画面。
 *   node tools/aim-drift.mjs [章] [秒]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHAPTER = process.argv[2] || 'b612';
const SECONDS = Number(process.argv[3] || 12);
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 60);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-dr-${Date.now()}`, '--no-first-run',
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
await sleep(600);

const probe = `(() => {
  const ch = window.__game.chapter;
  const cam = ch.camera;
  const avatar = ch.walker.avatar;
  const V3 = cam.position.constructor;
  ch.scene.updateMatrixWorld(true);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const world = avatar.getWorldPosition(new V3());
  const head = world.clone().project(cam);
  const camWorld = cam.getWorldPosition(new V3());
  return {
    rootEuler: [+ch.root.rotation.x.toFixed(3), +ch.root.rotation.y.toFixed(3), +ch.root.rotation.z.toFixed(3)],
    rootScale: +ch.root.scale.x.toFixed(2),
    camParent: ch.camera.parent ? 'child' : 'world',
    avatarParentIsRoot: ch.walker.avatar.parent === ch.root,
    camDistLocal: +cam.position.distanceTo(ch.walker.position).toFixed(2),
    avatarWorld: [+world.x.toFixed(2), +world.y.toFixed(2), +world.z.toFixed(2)],
    camPos: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    camWorldPos: [+camWorld.x.toFixed(2), +camWorld.y.toFixed(2), +camWorld.z.toFixed(2)],
    worldNDC: [+head.x.toFixed(2), +head.y.toFixed(2)],
    worldCamDist: +camWorld.distanceTo(world).toFixed(2),
  };
})()`;

const r0 = await ev(probe);
console.log(`t=0s  `, JSON.stringify(r0));
for (let i = 1; i <= 4; i++) {
  await sleep((SECONDS * 1000) / 4);
  const r = await ev(probe);
  console.log(`t=${((SECONDS * i) / 4).toFixed(0)}s `, JSON.stringify(r));
}

ws.close();
proc.kill();
