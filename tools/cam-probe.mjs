/**
 * 诊断：相机是否真的在看着角色（世界空间）。
 * 输出 expectCamWorld（root 矩阵 × 相机局部位置）与实测值的差、观察点 NDC、角色 NDC。
 *   node tools/cam-probe.mjs [章]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHAPTER = process.argv[2] || 'b612';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9460 + Math.floor(Math.random() * 60);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-cp-${Date.now()}`, '--no-first-run',
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
await sleep(800);

const probe = `(() => {
  const ch = window.__game.chapter;
  const cam = ch.camera;
  const w = ch.walker;
  const V3 = cam.position.constructor;
  ch.scene.updateMatrixWorld(true);
  cam.updateWorldMatrix(true, true);
  cam.updateProjectionMatrix();
  const camWorld = cam.getWorldPosition(new V3());
  const expectCam = cam.position.clone().applyMatrix4(ch.root.matrixWorld);
  const look = w.position.clone().addScaledVector(w.up, 1.07).applyMatrix4(ch.root.matrixWorld);
  const av = w.avatar.getWorldPosition(new V3());
  const lookNDC = look.clone().project(cam);
  const avNDC = av.clone().project(cam);
  const walkWorld = w.position.clone().applyMatrix4(ch.root.matrixWorld);
  const diff = av.clone().sub(walkWorld);
  return {
    avatarPos: [+w.avatar.position.x.toFixed(2), +w.avatar.position.y.toFixed(2), +w.avatar.position.z.toFixed(2)],
    walkerPos: [+w.position.x.toFixed(2), +w.position.y.toFixed(2), +w.position.z.toFixed(2)],
    diff: [+diff.x.toFixed(2), +diff.y.toFixed(2), +diff.z.toFixed(2)],
    camErr: +camWorld.distanceTo(expectCam).toFixed(3),
    camWorld: [+camWorld.x.toFixed(2), +camWorld.y.toFixed(2), +camWorld.z.toFixed(2)],
    expectCam: [+expectCam.x.toFixed(2), +expectCam.y.toFixed(2), +expectCam.z.toFixed(2)],
    avatarVsWalker: +av.distanceTo(w.position.clone().applyMatrix4(ch.root.matrixWorld)).toFixed(3),
    camToWalker: +camWorld.distanceTo(w.position.clone().applyMatrix4(ch.root.matrixWorld)).toFixed(2),
    lookNDC: [+lookNDC.x.toFixed(2), +lookNDC.y.toFixed(2)],
    avNDC: [+avNDC.x.toFixed(2), +avNDC.y.toFixed(2)],
    aspect: +cam.aspect.toFixed(2),
    fov: cam.fov,
  };
})()`;

console.log(JSON.stringify(await ev(probe), null, 1));
ws.close();
proc.kill();
