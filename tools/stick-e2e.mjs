/**
 * 摇杆端到端验证：派发 pointer 事件 → input.move 变化 → 角色真的位移。
 *   node tools/stick-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9520 + Math.floor(Math.random() * 20);
const proc = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-e2e', '--no-first-run', '--window-size=393,852', 'about:blank'],
  { stdio: 'inherit' }
);
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
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m.result);
    pend.delete(m.id);
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
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(2500);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1000);
await ev(`(() => { const p = document.querySelector('.planet[data-id="b612"]'); p.click(); p.click(); })()`);
await sleep(4500);
await ev(`(() => { const c = window.__game.chapter; c.dialogue.stop(); c.busy = false; })()`);
await sleep(500);

// 按住摇杆向上推，保持 1.6 秒
const before = await ev(`window.__game.chapter.walker.position.toArray()`);
await ev(`(() => {
  const stick = document.getElementById('stick');
  const b = stick.getBoundingClientRect();
  const cx = b.x + b.width/2, cy = b.y + b.height/2;
  const fire = (type, x, y, id) => stick.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y,
  }));
  window.__stickCleanup = () => fire('pointerup', cx, cy - 40, 7);
  fire('pointerdown', cx, cy, 7);
  fire('pointermove', cx, cy - 44, 7);
})()`);
await sleep(1600);
const during = await ev(`({ move: { x: +window.__game.input.move.x.toFixed(2), y: +window.__game.input.move.y.toFixed(2) }, pos: window.__game.chapter.walker.position.toArray() })`);
await ev(`window.__stickCleanup()`);
await sleep(400);
const after = await ev(`({ move: { x: +window.__game.input.move.x.toFixed(2), y: +window.__game.input.move.y.toFixed(2) }, pos: window.__game.chapter.walker.position.toArray() })`);

const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
console.log('推动中 move=', JSON.stringify(during.move));
console.log('位移距离 =', d(before, during.pos).toFixed(2), 'm');
console.log('松手后 move=', JSON.stringify(after.move), '额外位移 =', d(during.pos, after.pos).toFixed(3), 'm');
console.log('仍在球面 =', Math.abs(Math.hypot(...after.pos) - 6.02).toFixed(3));

// 视角拖动（右侧 lookpad）
const camBefore = await ev(`window.__game.chapter.camera.position.toArray()`);
await ev(`(() => {
  const lp = document.getElementById('lookpad') || document.getElementById('scene');
  const b = lp.getBoundingClientRect();
  const fire = (type, x, y) => lp.dispatchEvent(new PointerEvent(type, {
    pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y,
  }));
  fire('pointerdown', b.x + b.width*0.7, b.y + b.height*0.5);
  fire('pointermove', b.x + b.width*0.7 + 120, b.y + b.height*0.5);
  fire('pointerup', b.x + b.width*0.7 + 120, b.y + b.height*0.5);
})()`);
await sleep(900);
const camAfter = await ev(`window.__game.chapter.camera.position.toArray()`);
console.log('转视角后相机移动 =', d(camBefore, camAfter).toFixed(2), 'm');

ws.close();
proc.kill();
process.exit(0);
