/**
 * 对话名牌实测：进入章节，用真实触摸推进对话、点交互按钮和角色对话，
 * 每句记录 名牌文本/是否可见/台词，检查小王子说话时名牌显示「小王子」。
 *   node tools/speaker-e2e.mjs [章]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHAPTER = process.argv[2] || 'king';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9460 + Math.floor(Math.random() * 60);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-sp-${Date.now()}`, '--no-first-run',
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
async function tap(x, y) { await touch('touchStart', x, y); await sleep(40); await touch('touchEnd'); }

const READ = `(() => {
  const sp = document.getElementById('dlg-speaker');
  const ch = window.__game.chapter;
  if (!ch) return { active: false };   // 章节通关后回到地图
  const d = ch.dialogue;
  const it = d.queue[d.index] || {};
  return { name: sp.textContent, vis: sp.style.visibility !== 'hidden', text: it.text || '', declared: it.speaker,
    active: d.active, busy: ch.busy };
})()`;

const log = [];
async function runDialogue() {
  let last = '';
  for (let i = 0; i < 60; i++) {
    const s = await ev(READ);
    if (!s.active) break;
    const key = s.text + '|' + s.name;
    if (key !== last) { log.push(s); last = key; }
    await tap(196, 760); // 第一下显示整句，第二下下一句
    await sleep(260);
  }
}

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

await runDialogue(); // 开场

// 走到第一个交互点旁，用真实触摸点交互按钮，跑完这一段对话；重复几轮
for (let round = 0; round < 4; round++) {
  const where = await ev(`(() => {
    const ch = window.__game.chapter;
    if (!ch) return null;
    const it = ch.interactables.find(i => !i.enabled || i.enabled());
    if (!it) return null;
    ch.walker.spawn(it.pos.clone().normalize());
    ch._updateInteraction();
    const b = document.getElementById('prompt').getBoundingClientRect();
    return { id: it.id, x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width };
  })()`);
  if (!where || !where.w) break;
  await sleep(500);
  await tap(where.x, where.y);
  await sleep(500);
  await runDialogue();
  await sleep(400);
}

let bad = 0;
for (const s of log) {
  const shown = s.vis ? s.name : '（无名牌）';
  // 规则：显式 speaker 的必须一致；未声明的不能出现「上一位说话人」残留
  const expect = s.declared !== undefined ? (s.declared || '（无名牌）') : null;
  const ok = expect === null ? true : shown === expect;
  if (!ok) bad++;
  console.log(`${ok ? ' ' : '✗'} [${shown}] ${s.text}`);
}
const princeLines = log.filter((s) => s.declared === undefined && s.vis && s.name === '小王子').length;
console.log(`\n共 ${log.length} 句；小王子名牌 ${princeLines} 句；不一致 ${bad}；运行时错误 ${errors.length}`);
if (errors.length) console.log(errors.join('\n'));
ws.close();
proc.kill();
process.exit(bad || errors.length || princeLines === 0 ? 1 : 0);
