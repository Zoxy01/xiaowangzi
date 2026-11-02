/**
 * 验证地球的结局：飞行员对话结束后，真的能沿着石路「走」回落地点，
 * 触发「回到落下来的地方」并把章节算作通关。
 *   node tools/earth-ending-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

setTimeout(() => { console.log('✗ 超时退出'); process.exit(1); }, 220000);

const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9550 + Math.floor(Math.random() * 60);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-earth-end-${Date.now()}`,
  '--no-first-run', '--window-size=393,852', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 120; i++) {
  await sleep(200);
  try {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = pages.find((p) => p.type === 'page');
    if (target) break;
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pending.set(i, r));
};
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const touch = (type, x, y) => send('Input.dispatchTouchEvent', {
  type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7, radiusX: 5, radiusY: 5, force: 1 }],
});
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
  await ev("localStorage.removeItem('lp.progress'); location.reload()");
  await sleep(2600);
  await ev("document.getElementById('boot-start').click()");
  await sleep(1300);
  await ev("(() => { const p = document.querySelector('.planet[data-id=earth]'); p.click(); p.click(); })()");
  await sleep(4500);
  await ev('window.__game.paused = false');

  const drain = async () => {
    for (let i = 0; i < 40; i++) {
      const st = await ev(`(() => {
        const c = window.__game.chapter;
        if (!c) return { gone: true };
        if (c.dialogue.isActive) c.dialogue._finish();
        return { active: c.dialogue.isActive, busy: c.busy };
      })()`);
      if (st.gone) return true;
      if (!st.active && !st.busy) return false;
      await sleep(80);
    }
    return false;
  };
  await drain();

  // 直接走到飞行员跟前触发（真实交互路径），跳过前面 10 段只为节省时间
  const start = await ev(`(() => {
    const c = window.__game.chapter;
    const it = c.interactables.find(i => i.id === 'pilot');
    c.busy = false;
    c.walker.position.copy(it.pos.clone().normalize().multiplyScalar(c.radius + 0.02));
    c.walker.sync(true);
    c._updateInteraction();
    const id = c.nearest && c.nearest.id;
    c.interact();
    return { id, dist: +c.walker.position.distanceTo(it.pos).toFixed(2) };
  })()`);
  console.log('在飞行员处触发:', JSON.stringify(start));
  await drain();
  await sleep(400);

  const afterPilot = await ev(`(() => {
    const c = window.__game.chapter;
    const home = c.interactables.find(i => i.id === 'home');
    const gi = c.goals.findIndex((g, i) => !c.goalsDone.has(i));
    return {
      interactables: c.interactables.map(i => i.id),
      hasHome: !!home,
      beacon: !!c.homeBeacon,
      goalText: gi >= 0 ? c.goals[gi] : null,
      distToHome: home ? +c.walker.position.distanceTo(home.pos).toFixed(1) : null,
    };
  })()`);
  console.log('飞行员之后:', JSON.stringify(afterPilot));

  // 转身，沿石路走回去。这里用固定步长推进章节（等价于按住摇杆不放）：
  // 真实触摸到前进的链路已由 tools/touch-real.mjs 8/8 覆盖，无头环境下 rAF 会被节流，
  // 所以直接把 600 帧等效按键喂给 update()，测的是「这段路走不走得到」。
  await ev(`(() => {
    const c = window.__game.chapter;
    const home = c.interactables.find(i => i.id === 'home');
    c.walker.lookToward(home.pos);
    c.game.input.move.x = 0; c.game.input.move.y = 1;
  })()`);
  let reached = false;
  let last = null;
  for (let i = 0; i < 40 && !reached; i++) {
    last = await ev(`(() => {
      const c = window.__game.chapter;
      if (!c) return { gone: true };
      for (let k = 0; k < 30; k++) c.update(1 / 60);
      c.game.input.move.x = 0; c.game.input.move.y = 1;
      const home = c.interactables.find(i => i.id === 'home');
      return { near: c.nearest?.id ?? null, d: home ? +c.walker.position.distanceTo(home.pos).toFixed(2) : null };
    })()`);
    if (last.near === 'home') reached = true;
  }
  await ev('window.__game.chapter.game.input.move.x = 0; window.__game.chapter.game.input.move.y = 0');
  console.log('往回走:', JSON.stringify(last), reached ? '→ 出现提示' : '→ 没走到');
  if (!reached) { console.log(JSON.stringify(errors)); proc.kill(); process.exit(1); }

  const promptShown = await ev(`(() => { const p = document.getElementById('prompt'); return { shown: !p.hidden, label: document.getElementById('prompt-label').textContent }; })()`);
  console.log('提示:', JSON.stringify(promptShown));
  await ev(`(() => { const c = window.__game.chapter; c.busy = false; c.interact(); })()`);
  await sleep(500);
  await drain();
  await sleep(700);
  const done = await ev(`(() => ({ onMap: !window.__game.chapter, visited: JSON.parse(localStorage.getItem('lp.progress') || '{}').visited || null }))()`);
  console.log('结束后:', JSON.stringify(done));
  console.log(errors.length ? `运行时报错 ${errors.length}: ${errors[0]}` : '运行时报错 0');
  const ok = afterPilot.hasHome && afterPilot.beacon && promptShown.shown && promptShown.label.includes('落下来') && done.onMap && (done.visited || []).includes('earth');
  console.log(ok ? '✓ 结局可以靠走回去完成' : '✗ 结局有问题');
  ws.close();
  proc.kill();
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.log('✗', err.message);
  ws.close();
  proc.kill();
  process.exit(1);
}
