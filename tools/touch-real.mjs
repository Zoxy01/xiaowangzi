/**
 * 用 CDP 原生触摸（经过浏览器命中测试）复现玩家真实操作：
 *  1. 交互按钮能否被点中（elementFromPoint）
 *  2. 摇杆上推/右推 → 角色在屏幕上朝上/朝右走
 *  3. 右滑视角 → 画面向右转（角色原来在屏幕右侧的物体移向中央，即世界向左移）
 *  4. 走动过程中角色始终在画面中央附近（相机跟随）
 *   node tools/touch-real.mjs [章]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHAPTER = process.argv[2] || 'king';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 60);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-tr-${Date.now()}`, '--no-first-run',
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
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
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
  return r.result?.value;
};
const touch = (type, x, y) => send('Input.dispatchTouchEvent', {
  type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
});
async function drag(x0, y0, x1, y1, holdMs = 0, steps = 10) {
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
    await sleep(16);
  }
  const t0 = Date.now();
  while (Date.now() - t0 < holdMs) { await touch('touchMove', x1, y1); await sleep(50); }
  await touch('touchEnd');
}
async function tap(x, y) { await touch('touchStart', x, y); await sleep(40); await touch('touchEnd'); }

// 页面内：角色（世界坐标）投影到屏幕像素；以及相机朝向
const SNAP = `(() => {
  const g = window.__game, ch = g.chapter, cam = ch.camera;
  ch.root.updateWorldMatrix(true, true); cam.updateWorldMatrix(true, false);
  const V3 = cam.position.constructor;
  const p = ch.avatar.root.getWorldPosition(new V3());
  const head = p.clone().add(ch.walker.up.clone().transformDirection(ch.root.matrixWorld).multiplyScalar(0.6));
  const n = head.clone().project(cam);
  const cw = cam.getWorldPosition(new V3());
  const dir = cam.getWorldDirection(new V3());
  return { px: [(n.x + 1) / 2 * innerWidth, (1 - n.y) / 2 * innerHeight], ndc: [n.x, n.y],
    world: [p.x, p.y, p.z], dir: [dir.x, dir.y, dir.z], camDist: cw.distanceTo(p),
    yaw: ch.walker.camYaw, pitch: ch.walker.camPitch, busy: ch.busy, move: [g.input?.move?.x ?? null, g.input?.move?.y ?? null],
    avParent: ch.avatar.root.parent === ch.root, camParent: cam.parent === ch.root,
    walkerW: ch.walker.position.clone().applyMatrix4(ch.root.matrixWorld).toArray().map(v => +v.toFixed(2)),
    avLocal: ch.avatar.root.position.toArray().map(v => +v.toFixed(2)), wLocal: ch.walker.position.toArray().map(v => +v.toFixed(2)),
    camLocal: cam.position.toArray().map(v => +v.toFixed(2)), paused: g.paused, fps: g.lastFps };
})()`;
const r2 = (a) => a.map((v) => +v.toFixed(2));

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(2600);
await ev("localStorage.removeItem('lp.progress'); location.reload()");
await sleep(2800);
await ev("document.getElementById('boot-start').click()");
await sleep(1400);
await ev(`(() => { const p = document.querySelector('.planet[data-id="${CHAPTER}"]'); p.click(); p.click(); })()`);
await sleep(4600);
await ev('window.__game.paused = false');

// 开场对话：用真实点击推进，直到 busy=false
for (let i = 0; i < 40; i++) {
  const busy = await ev('window.__game.chapter.busy');
  if (!busy) break;
  await tap(196, 760);
  await sleep(350);
}
await sleep(600);

const results = [];
const check = (name, ok, info) => { results.push({ name, ok, info }); console.log(`${ok ? '✓' : '✗'} ${name} — ${info}`); };

// ---------- 1. 交互按钮命中
const promptInfo = await ev(`(() => {
  const ch = window.__game.chapter;
  const it = ch.interactables.find(i => !i.enabled || i.enabled());
  const V3 = ch.camera.position.constructor;
  // 把角色放到交互点旁边，让按钮出现
  ch.walker.spawn(it.pos.clone().normalize());
  ch._updateInteraction();
  return it.id;
})()`);
await sleep(700);
const hit = await ev(`(() => {
  const b = document.getElementById('prompt');
  const r = b.getBoundingClientRect();
  const pts = [[r.left + r.width*0.2, r.top + r.height/2],[r.left + r.width/2, r.top + r.height/2],[r.left + r.width*0.8, r.top + r.height/2]];
  return { rect: [r.left, r.top, r.width, r.height].map(Math.round), visible: !b.hidden,
    hits: pts.map(([x,y]) => { const e = document.elementFromPoint(x,y); return e ? (e.id || e.className) : null; }), cx: r.left + r.width/2, cy: r.top + r.height/2 };
})()`);
const stageBefore = await ev('JSON.stringify([...window.__game.chapter.goalsDone])');
await tap(hit.cx, hit.cy);
await sleep(500);
const afterTap = await ev('({ busy: window.__game.chapter.busy, dlg: !document.getElementById("dialogue").hidden })');
check('交互按钮可点中', hit.hits.every((h) => h === 'prompt' || h === 'prompt-key' || h === 'prompt-label') && afterTap.dlg,
  `目标=${promptInfo} 矩形=${JSON.stringify(hit.rect)} 命中=${JSON.stringify(hit.hits)} 点后对话=${afterTap.dlg} goals前=${stageBefore}`);
for (let i = 0; i < 40; i++) {
  if (!(await ev('window.__game.chapter.busy'))) break;
  await tap(196, 760); await sleep(350);
}
await sleep(500);

// 摇杆中心
const stick = await ev(`(() => { const r = document.getElementById('stick').getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2, document.elementFromPoint(r.left + r.width/2, r.top + r.height/2)?.id]; })()`);

// ---------- 2. 摇杆上推
let s0 = await ev(SNAP);
await drag(stick[0], stick[1], stick[0], stick[1] - 44, 1200);
await sleep(80);
let s1 = await ev(SNAP);
// 角色世界位移投影到相机屏幕：取 s0 时刻相机看，比较移动前后同一相机下的屏幕位置——用前后世界点在“当前”相机下投影
const projBoth = (a, b) => `(() => {
  const ch = window.__game.chapter, cam = ch.camera, V3 = cam.position.constructor;
  const A = new V3(${a.world}).project(cam), B = new V3(${b.world}).project(cam);
  return [B.x - A.x, B.y - A.y];
})()`;
let d; // 后续右推用例复用
const walked = Math.hypot(s1.world[0] - s0.world[0], s1.world[1] - s0.world[1], s1.world[2] - s0.world[2]);
// 旧位置可能已落到“移动后相机”身后（投影翻转），所以改用起步时的相机朝向判断：
// 位移在旧相机视线方向上的分量占比 > 0.7 才算“远离相机”。
const delta = [0, 1, 2].map((i) => s1.world[i] - s0.world[i]);
const along = (delta[0] * s0.dir[0] + delta[1] * s0.dir[1] + delta[2] * s0.dir[2]) / Math.max(walked, 1e-6);
check('摇杆上推 → 角色远离相机（屏幕上方）', walked > 0.5 && along > 0.7,
  `摇杆中心命中=${stick[2]} 走了 ${walked.toFixed(2)}m 沿起步视线占比 ${along.toFixed(2)}（>0.7 为远离相机）`);
check('上推后相机跟随：角色仍在画面中央', Math.abs(s1.ndc[0]) < 0.3 && s1.ndc[1] > -0.8 && s1.ndc[1] < 0.4,
  `头部 NDC ${JSON.stringify(r2(s1.ndc))} 相机距 ${s1.camDist.toFixed(2)} ${JSON.stringify({a:s1.avParent,c:s1.camParent,av:s1.avLocal,w:s1.wLocal,cam:s1.camLocal,p:s1.paused,fps:s1.fps})}`);

// ---------- 3. 摇杆右推
s0 = await ev(SNAP);
await drag(stick[0], stick[1], stick[0] + 44, stick[1], 900);
await sleep(80);
s1 = await ev(SNAP);
d = await ev(projBoth(s0, s1));
check('摇杆右推 → 角色往屏幕右走', d[0] > 0.02, `屏幕位移 ${JSON.stringify(r2(d))}（x>0 为向右）`);
await sleep(900);
s1 = await ev(SNAP);
check('右推后相机跟随：角色仍在画面中央', Math.abs(s1.ndc[0]) < 0.3 && s1.ndc[1] > -0.8 && s1.ndc[1] < 0.4,
  `头部 NDC ${JSON.stringify(r2(s1.ndc))} 相机距 ${s1.camDist.toFixed(2)} ${JSON.stringify({a:s1.avParent,c:s1.camParent,av:s1.avLocal,w:s1.wLocal,cam:s1.camLocal,p:s1.paused,fps:s1.fps})}`);

// ---------- 4. 视角右滑：画面应向右转 → 相机朝向绕 up 向右（右手系 dir 转向原来的屏幕右）
const camRightBefore = await ev(`(() => { const cam = window.__game.chapter.camera; const V3 = cam.position.constructor;
  const e = cam.matrixWorld.elements; return [e[0], e[1], e[2]]; })()`);
s0 = await ev(SNAP);
await drag(300, 420, 370, 420, 0, 12);
await sleep(700);
s1 = await ev(SNAP);
const dot = s1.dir[0] * camRightBefore[0] + s1.dir[1] * camRightBefore[1] + s1.dir[2] * camRightBefore[2];
check('视角右滑 → 镜头向右转', dot > 0.05, `新朝向·旧屏幕右 = ${dot.toFixed(3)}（>0 为向右转） yaw ${s0.yaw.toFixed(2)}→${s1.yaw.toFixed(2)}`);

// ---------- 5. 视角上滑：镜头抬头（朝上看 → 朝向·up 增大）
s0 = await ev(SNAP);
const upW = await ev(`(() => { const ch = window.__game.chapter; return ch.walker.up.clone().transformDirection(ch.root.matrixWorld).toArray(); })()`);
await drag(300, 480, 300, 400, 0, 12);
await sleep(700);
s1 = await ev(SNAP);
const u0 = s0.dir[0] * upW[0] + s0.dir[1] * upW[1] + s0.dir[2] * upW[2];
const u1 = s1.dir[0] * upW[0] + s1.dir[1] * upW[1] + s1.dir[2] * upW[2];
check('视角上滑 → 镜头抬头', u1 > u0 + 0.02, `朝向·up ${u0.toFixed(3)}→${u1.toFixed(3)} pitch ${s0.pitch.toFixed(2)}→${s1.pitch.toFixed(2)}`);

check('运行时无错误', errors.length === 0, errors.slice(0, 3).join(' | ') || '无');

const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} 通过`);
ws.close();
proc.kill();
process.exit(fail ? 1 : 0);
