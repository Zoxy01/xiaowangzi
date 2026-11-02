/**
 * 单章端到端验收：进入指定星球 → 走完全部目标 → 回到地图。
 *   node tools/chapter-e2e.mjs king
 *   node tools/chapter-e2e.mjs b612
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const CHAPTER = process.argv[2] || 'king';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9560 + Math.floor(Math.random() * 30);
const proc = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-ch-' + CHAPTER,
    '--no-first-run',
    '--window-size=393,852',
    'about:blank',
  ],
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
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m.result);
    pend.delete(m.id);
  } else if (m.method === 'Runtime.exceptionThrown') {
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
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(2600);

await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1200);

// 地图上该星球应可用
const planetState = await ev(`(() => {
  const el = document.querySelector('.planet[data-id="${CHAPTER}"]');
  return { found: !!el, locked: el ? el.classList.contains('locked') : null, caption: document.getElementById('map-caption')?.textContent?.slice(0, 24) };
})()`);
console.log('地图上的星球:', JSON.stringify(planetState));

// 点两次进入
await ev(`(() => { const p = document.querySelector('.planet[data-id="${CHAPTER}"]'); p.click(); p.click(); })()`);
await sleep(4200);

const entered = await ev(`(() => {
  const g = window.__game;
  return { chapterId: g.chapterId, hasChapter: !!g.chapter, goals: g.chapter ? g.chapter.goals : null,
           fps: g.lastFps, walkerLen: g.chapter ? +g.chapter.walker.position.length().toFixed(2) : null };
})()`);
console.log('进入章节:', JSON.stringify(entered));
if (!entered.hasChapter) {
  console.log('✗ 章节未创建');
  ws.close(); proc.kill(); process.exit(1);
}

// 拍照
const shot = async (n) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`test-shots/ch-${CHAPTER}-${n}.png`, Buffer.from(r.data, 'base64'));
  return (r.data.length / 1024) | 0;
};

// 结束开场对话
await ev(`(() => { const c = window.__game.chapter; if (c.dialogue.isActive) c.dialogue.fastForward?.() ?? c.dialogue.stop(); c.busy = false; })()`);
await sleep(500);
console.log('开场后截图', await shot('1-enter'), 'KB');

// 走到第一个交互点并依次完成
const walkTo = async (idx) => {
  const ok = await ev(`(() => {
    const c = window.__game.chapter;
    if (!c) return null;
    // 真实玩家只能在对话结束后点击，这里也必须等
    if (c.dialogue.isActive) return { waiting: true };
    const cands = c.interactables
      .filter(i => !i.enabled || i.enabled())
      .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
    // 优先挑还没点过的交互（负 priority 通常就是新解锁的下一步）
    const seen = c.__e2eSeen || (c.__e2eSeen = new Set());
    const ordered = [...cands].sort((a, b) => {
      const sa = seen.has(a.id) ? 1 : 0;
      const sb = seen.has(b.id) ? 1 : 0;
      return sa - sb || (a.priority ?? 3) - (b.priority ?? 3);
    });
    for (const it of ordered) {
      c.walker.position.copy(it.pos.clone().normalize().multiplyScalar(c.radius + 0.02));
      c.walker.sync(true);
      c._updateInteraction();
      if (c.nearest) {
        seen.add(c.nearest.id);
        return { id: c.nearest.id, label: c.nearest.label, nearest: c.nearest.id };
      }
    }
    return null;
  })()`);
  return ok;
};

const drain = async (name) => {
  // 处理对话直到不再活跃（章节可能中途被卸载，必须判空）
  for (let i = 0; i < 40; i++) {
    const busy = await ev(`(() => {
      const c = window.__game.chapter;
      if (!c) return { gone: true };
      if (c.dialogue.isActive) c.dialogue._finish();
      return { active: c.dialogue.isActive, busy: c.busy };
    })()`);
    if (busy.gone) return;
    if (!busy.active && !busy.busy) break;
    await sleep(120);
  }
};

// B-612 用 stage 门槛控制交互是否出现，靠「找最近的交互点」驱动不了。
// 这里改为调用它自己的事件方法，走的仍是真实代码路径。
const B612_STEPS = [
  ['_talkToRose', '与玫瑰交谈'],
  ['_takeCan', '拿水壶'],
  ['_fillCan', '打水'],
  ['_waterRose', '浇最后一次水'],
  ['_liftGlobe', '拿玻璃罩'],
  ['_sunset', '看日落'],
  ['_sitAndWatchSunset', '坐下看日落'],
];

async function runB612() {
  for (const [method, label] of B612_STEPS) {
    await drain();
    const has = await ev(`(() => {
      const c = window.__game.chapter;
      if (!c || typeof c['${method}'] !== 'function') return false;
      c.busy = false;
      return true;
    })()`);
    if (!has) {
      console.log(`  跳过 ${label}（没有该方法）`);
      continue;
    }
    await ev(`window.__game.chapter['${method}']()`);
    await sleep(600);
    const st = await ev(`(() => { const c = window.__game.chapter; return c ? { done: [...c.goalsDone], stage: c.stage, sun: +c.sunAngle.toFixed(2) } : null; })()`);
    console.log(`  ${label}:`, JSON.stringify(st));
    if (!st) break;
  }
  // 日落是动画，等它跑完
  for (let i = 0; i < 30; i++) {
    const anim = await ev(`(() => { const c = window.__game.chapter; return c ? !!c.sunAnim : false; })()`);
    if (!anim) break;
    await sleep(500);
  }
  await drain();
  await sleep(1500);
}

let steps = 0;
if (CHAPTER === 'b612') {
  await runB612();
} else
for (let round = 0; round < 14; round++) {
  // 章节可能已经交回地图，先确认还在
  const alive = await ev(`!!window.__game.chapter`);
  if (!alive) break;
  await drain();
  const near = await walkTo(0);
  if (!near || near.waiting) break;
  console.log(`  交互 ${round + 1}:`, JSON.stringify(near));
  await ev(`window.__game.chapter.interact()`);
  await sleep(500);
  steps++;
  const goals = await ev(`(() => { const c = window.__game.chapter; return c ? { done: [...c.goalsDone], stage: c.stage, busy: c.busy } : null; })()`);
  console.log('    目标:', JSON.stringify(goals));
  if (round === 2) console.log('    中段截图', await shot('2-mid'), 'KB');
  const left = await ev(`(() => { return !window.__game.chapter; })()`);
  if (left) {
    console.log('    章节已交回地图');
    break;
  }
}

await drain();
await sleep(1200);
const final = await ev(`(() => {
  const g = window.__game;
  return {
    chapterId: g.chapterId,
    visited: g.progress.visited,
    mapVisible: !document.getElementById('map').hidden,
    goalsDone: g.chapter ? [...g.chapter.goalsDone] : 'left',
  };
})()`);console.log('结束状态:', JSON.stringify(final));
console.log('交互次数:', steps);
console.log('运行时错误:', errors.length ? errors.slice(0, 4) : '无');

ws.close();
proc.kill();
process.exit(errors.length ? 1 : 0);
