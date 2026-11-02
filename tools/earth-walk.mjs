/**
 * 沿沙路一直往前走，记录沿途依次出现的交互点，确认 216 米旅途上
 * 每个事件都能在路边被遇见（不是必须离开路才能碰到）。
 *   node tools/earth-walk.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9600 + Math.floor(Math.random() * 200);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  '--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-walk-' + Date.now(), '--no-first-run',
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

const RESULT = await ev(`(() => {
  const g = window.__game, ch = g.chapter;
  g.paused = false;
  ch.dialogue.stop();
  ch.busy = false;
  const seen = [];
  const at = [];
  let frames = 0;
  // 沿赤道一直向前走（相机朝向已由 lookToward 对齐 +X）
  g.input.move.y = 1;
  for (let i = 0; i < 9000; i++) {
    ch.update(1 / 60);
    frames++;
    const n = ch.nearest && ch.nearest.id;
    if (n && seen[seen.length - 1] !== n) {
      seen.push(n);
      at.push({ id: n, t: +(frames / 60).toFixed(1), pos: ch.walker.position.toArray().map((v) => +v.toFixed(1)) });
    }
    if (ch.nearest) { g.input.move.y = 1; } // 触发提示时继续走
    if (seen.includes('pilot')) break;
  }
  // 结尾：飞行员对话后只留 home（在身后 12 米），往回走应当看见提示
  let homeFrames = 0, homeNearest = null;
  if (seen.includes('pilot')) {
    // 触发飞行员对话（结尾会注册 home），把逐字打字全部推进到结束
    ch.interact();
    for (let i = 0; i < 600 && ch.busy; i++) { ch.dialogue.advance(); ch.update(1 / 60); }
    g.input.move.y = -1;
    for (let i = 0; i < 900; i++) {
      ch.update(1 / 60);
      homeFrames++;
      if (ch.nearest && ch.nearest.id === 'home') { homeNearest = ch.nearest.id; break; }
    }
    g.input.move.y = 0;
  }
  const goalText = document.getElementById('hud-goal-text')?.textContent || '';
  return { seen, at, goalText, frames, homeFrames, homeNearest, travelled: +ch.walker.position.length().toFixed(0) };
})()`);

console.log('行走帧数：', RESULT.frames, '（', (RESULT.frames / 60).toFixed(0), '秒 ）');
console.log('沿途触发顺序：', RESULT.seen.join(' → '));
for (const r of RESULT.at) console.log(`  ${r.t}s  ${r.id}  at ${r.pos.join(',')}`);
console.log('任务栏：', RESULT.goalText);
const want = ['snake', 'flower', 'echo', 'garden', 'fox', 'station', 'merchant', 'well', 'pilot'];
const missing = want.filter((w) => !RESULT.seen.includes(w));
console.log(missing.length ? `✗ 沿途漏掉：${missing.join(', ')}` : '✓ 九个事件区沿路都能遇到');
console.log('往回走找回家路标：', RESULT.homeNearest ? `✓ ${RESULT.homeFrames} 帧后出现 home` : `✗ 未找到（${RESULT.homeFrames} 帧）`);
console.log('运行时错误：', errors.length ? errors.slice(0, 3) : '无');
ws.close();
proc.kill();
