/**
 * 旅程地图 v2 验收：星空 canvas、航线、星球状态、底卡、徽章册、任务栏。
 *   node tools/map-check.mjs
 * 输出关键指标 + test-shots/map.png
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9500 + Math.floor(Math.random() * 40);
const profile = 'D:\\zoxyprofile\\xwz\\.tmp\\edge-map-' + Date.now();
const proc = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--hide-scrollbars',
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
    const d = m.params.exceptionDetails;
    errors.push(d.exception?.description || d.text);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (m, p = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
  return new Promise((r) => pend.set(i, r));
};
const ev = async (x) => {
  const r = await send('Runtime.evaluate', {
    expression: x,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 393,
  height: 852,
  deviceScaleFactor: 3,
  mobile: true,
  screenOrientation: { type: 'portraitPrimary', angle: 0 },
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setUserAgentOverride', {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(3200);

// 点开始
const b = await ev(`(() => { const r = document.getElementById('boot-start').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b[0], y: b[1] }] });
await sleep(120);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(1400);

const mapState = await ev(`(() => {
  const m = document.getElementById('map');
  const planets = [...document.querySelectorAll('.planet')];
  const base = document.getElementById('route-base').getAttribute('d') || '';
  const lit = document.getElementById('route-lit').getAttribute('d') || '';
  const cv = document.getElementById('map-stars');
  // 星空 canvas 是否真的画了东西：统计非透明像素
  let painted = 0;
  try {
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 6) painted++;
  } catch (e) { painted = -1; }
  const card = document.getElementById('map-card');
  return {
    open: !m.hidden,
    mapRect: [Math.round(m.clientWidth), Math.round(m.clientHeight)],
    planets: planets.length,
    sizes: planets.slice(0, 3).map((p) => Math.round(p.getBoundingClientRect().width)),
    nextTag: planets.filter((p) => p.classList.contains('is-next')).map((p) => p.dataset.id),
    locked: planets.filter((p) => p.classList.contains('is-locked')).length,
    routeBaseLen: base.length,
    routeLitLen: lit.length,
    starsCanvas: [cv.width, cv.height],
    starsInked: painted,
    progress: document.getElementById('map-progress').textContent,
    meter: document.getElementById('map-meter-fill').style.width,
    cardVisible: card.classList.contains('show'),
    badgeBtn: !!document.getElementById('map-badges'),
    targets: [...document.querySelectorAll('#map button, .planet')]
      .map((el) => Math.round(el.getBoundingClientRect().height))
      .filter((h) => h > 0).sort((a, b) => a - b)[0],
  };
})()`);
console.log('地图状态:', JSON.stringify(mapState, null, 2));

// 徽章册
await ev(`document.getElementById('map-badges').click()`);
await sleep(420);
const badges = await ev(`(() => {
  const p = document.getElementById('map-badges-panel');
  const items = [...document.querySelectorAll('.badge-item')];
  return {
    open: !p.hidden,
    count: items.length,
    names: items.map((i) => i.querySelector('b').textContent),
    earned: items.filter((i) => i.classList.contains('is-earned')).length,
    imgOk: items.every((i) => i.querySelector('img').naturalWidth > 0),
  };
})()`);
console.log('徽章册:', JSON.stringify(badges));
await ev(`document.getElementById('badges-close').click()`);
await sleep(300);
console.log('关闭徽章后隐藏:', await ev(`document.getElementById('map-badges-panel').hidden`));

// 选中第一颗星球：底卡、按钮
const tapPlanet = async (cid) => {
  const pt = await ev(`(() => { const e = document.querySelector('.planet[data-id="${cid}"]'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt[0], y: pt[1] }] });
  await sleep(110);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(600);
  return pt;
};
const pt = await tapPlanet('b612');
const card = await ev(`(() => {
  const c = document.getElementById('map-card');
  const act = document.getElementById('map-act');
  return {
    shown: c.classList.contains('show'),
    caption: document.getElementById('map-caption').textContent,
    meta: document.getElementById('map-caption').querySelector('em')?.textContent,
    actVisible: !act.hidden,
    actText: act.textContent,
    actHeight: Math.round(act.getBoundingClientRect().height),
    selected: document.querySelector('.planet[data-id="b612"]').classList.contains('is-sel'),
  };
})()`);
console.log('星球底卡:', JSON.stringify(card, null, 2));

mkdirSync('test-shots', { recursive: true });
const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs');
fs.writeFileSync('test-shots/map.png', Buffer.from(shot.data, 'base64'));

// 进入章节：任务栏副标题 + 当前目标提示行
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt[0], y: pt[1] }] });
await sleep(110);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(4200);

const inChap = await ev(`(() => {
  const g = window.__game;
  const sub = document.getElementById('goals-sub');
  const chip = document.getElementById('hud-goal-text');
  const hint = document.querySelector('#goals-list li.goal-hint');
  return {
    chapter: g.chapterId,
    goalsSub: sub ? sub.textContent : null,
    chip: chip ? chip.textContent : null,
    hint: hint ? hint.textContent : null,
    hintVisible: hint ? getComputedStyle(hint).display !== 'none' : false,
    toastEl: !!document.getElementById('toast'),
    fxPool: !!(g.chapter && g.chapter.fx),
  };
})()`);
console.log('章节内任务栏:', JSON.stringify(inChap, null, 2));

// 走到目标旁：特效与发现提示
// 入场对话期间 busy 会挡住交互探测，先收掉对话再手动推进若干帧
const near = await ev(`(() => {
  const c = window.__game.chapter;
  c.dialogue.stop();
  c.busy = false;
  const it = c.interactables.find((i) => i.id === 'roseTalk');
  c.walker.spawn(it.pos.clone().normalize());
  c.walker.sync(true);
  for (let i = 0; i < 40; i++) c.update(1 / 60);
  return true;
})()`);
await sleep(400);
const disc = await ev(`(() => {
  const c = window.__game.chapter;
  return {
    spawned: ${near},
    nearest: c.nearest ? c.nearest.id : null,
    seen: [...(c.seen || [])],
    explored: window.__game.exploredCount('b612'),
    fxItems: c.fx ? c.fx.items.length : -1,
    focusBias: c.walker.focusBias,
  };
})()`);
console.log('发现/特效:', JSON.stringify(disc));

console.log('运行时错误:', errors.length ? errors : '无');
proc.kill();
process.exit(errors.length ? 1 : 0);
