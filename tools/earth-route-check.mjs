import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9600 + Math.floor(Math.random() * 80);
const profile = `D:\\zoxyprofile\\xwz\\.tmp\\edge-earth-route-${Date.now()}`;
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--window-size=393,852', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let target;
for (let i = 0; i < 120; i++) {
  await sleep(200);
  try {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = pages.find((page) => page.type === 'page');
    if (target) break;
  } catch {}
}
if (!target) { proc.kill(); throw new Error('CDP page not found'); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
};
await new Promise((resolve) => { ws.onopen = resolve; });
const send = (method, params = {}) => {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
};
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7, radiusX: 5, radiusY: 5, force: 1 }] });
const dragHold = async (x, y, endY, ms) => {
  await touch('touchStart', x, y);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', x, y + (endY - y) * i / 8); await sleep(16); }
  const until = Date.now() + ms;
  while (Date.now() < until) { await touch('touchMove', x, endY); await sleep(60); }
  await touch('touchEnd');
};

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
  await sleep(2600);
  await evaluate("localStorage.removeItem('lp.progress'); location.reload()");
  await sleep(2600);
  await evaluate("document.getElementById('boot-start').click()");
  await sleep(1300);
  await evaluate("(() => { const p = document.querySelector('.planet[data-id=earth]'); p.click(); p.click(); })()");
  await sleep(4500);
  await evaluate('window.__game.paused = false');
  for (let i = 0; i < 40 && await evaluate('window.__game.chapter.busy'); i++) { await touch('touchStart', 196, 760); await sleep(40); await touch('touchEnd'); await sleep(350); }
  const before = await evaluate(`(() => {
    const c = window.__game.chapter, r = document.getElementById('stick').getBoundingClientRect();
    return { stick: [r.left+r.width/2,r.top+r.height/2], nearest: c.nearest?.id, targets: c.interactables.map(i=>[i.id,+i.pos.distanceTo(c.walker.position).toFixed(2)]), speed: c.walker.speed };
  })()`);
  const x = before.stick[0], y = before.stick[1];
  const observed = [];
  // 每帧记录沿途出现过的 nearest（采样间隔 4m 会漏掉 ~1m 的触发区）
  await evaluate(`(() => { window.__seen = []; const tick = () => { const n = window.__game.chapter?.nearest?.id; if (n && window.__seen[window.__seen.length-1] !== n) window.__seen.push(n); requestAnimationFrame(tick); }; tick(); })()`);
  for (let i = 0; i < 5; i++) {
    await dragHold(x, y, y - 44, 1600);
    await sleep(200);
    observed.push(await evaluate(`(() => { const c=window.__game.chapter; return {near:c.nearest?.id, d:c.nearest?+c.walker.position.distanceTo(c.nearest.pos).toFixed(2):null, pos:c.walker.position.toArray().map(v=>+v.toFixed(2))}; })()`));
  }
  const seen = await evaluate('window.__seen');
  console.log(JSON.stringify({ before, observed }, null, 2));
  console.log('沿途触发顺序:', seen.join(' → '));
} finally {
  ws.close();
  proc.kill();
}
