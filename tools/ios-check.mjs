/**
 * iOS 视口模拟验收：iPhone 尺寸 + 刘海安全区 + DPR3 + 触摸事件。
 *   node tools/ios-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9460 + Math.floor(Math.random() * 30);
const proc = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-ios',
    '--no-first-run',
    '--window-size=390,844',
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

// iPhone 14 Pro：393x852，DPR 3，刘海 + Home 条安全区
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
// 注入 iOS 安全区（等 documentElement 就绪：addScriptToEvaluateOnNewDocument 执行时机很早）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.documentElement.style;
      s.setProperty('--sat', '59px'); s.setProperty('--sab', '34px');
      s.setProperty('--sal', '0px'); s.setProperty('--sar', '0px');
    });
  `,
});

await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(3000);

const report = await ev(`(() => {
  const btn = document.getElementById('boot-start');
  const r = btn.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  // 所有可点元素的最小尺寸
  const targets = [...document.querySelectorAll('button:not([hidden]), .planet:not([hidden])')]
    .map(el => { const b = el.getBoundingClientRect(); return { id: el.id || el.className, w: Math.round(b.width), h: Math.round(b.height) }; })
    .filter(t => t.w > 0 || t.h > 0);
  const tooSmall = targets.filter(t => t.h > 0 && t.h < 44);
  return {
    isIOSClass: document.documentElement.classList.contains('ios'),
    innerSize: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    canvasAttr: [document.getElementById('scene').width, document.getElementById('scene').height],
    touchAction: getComputedStyle(document.body).touchAction,
    overflow: getComputedStyle(document.body).overflow,
    overscroll: getComputedStyle(document.documentElement).overscrollBehavior,
    startBtn: { w: Math.round(r.width), h: Math.round(r.height), fontSize: cs.fontSize },
    targetsUnder44: tooSmall,
    fontLoaded: document.fonts.check('400 20px LPSerif'),
    viewportMeta: document.querySelector('meta[name=viewport]').content,
    manifest: !!document.querySelector('link[rel=manifest]'),
  };
})()`);
console.log(JSON.stringify(report, null, 2));

// 触摸点击开始
const b = await ev(`(() => { const r = document.getElementById('boot-start').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
for (const type of ['touchStart', 'touchEnd']) {
  await send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchStart' ? [{ x: b[0], y: b[1] }] : [],
  });
  await sleep(120);
}
await sleep(1200);
console.log('点击后 地图可见:', await ev(`!document.getElementById('map').hidden`));

// 触摸进入 B-612
const pl = await ev(`(() => { const e = document.querySelector('.planet[data-id="b612"]'); const r = e.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()`);
for (const type of ['touchStart', 'touchEnd']) {
  await send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchStart' ? [{ x: pl[0], y: pl[1] }] : [] });
  await sleep(100);
}
await sleep(2500);
console.log('选中星球:', await ev(`document.getElementById('map-caption')?.textContent?.slice(0, 20)`));
for (const type of ['touchStart', 'touchEnd']) {
  await send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchStart' ? [{ x: pl[0], y: pl[1] }] : [] });
  await sleep(100);
}
await sleep(3500);
const inChap = await ev(`(() => { const g = window.__game; return { chapter: g.chapterId, fps: g.lastFps, canvas: [document.getElementById('scene').width, document.getElementById('scene').height] }; })()`);
console.log('进入章节:', JSON.stringify(inChap));

// 章节开场会播放对话（busy=true 时角色不能被摇杆移动），先让它结束
await ev(`(() => { const c = window.__game.chapter; if (c) { c.dialogue.stop(); c.busy = false; } })()`);
await sleep(400);

// 摇杆拖动。
// 注意：CDP 的 Input.dispatchTouchEvent / dispatchMouseEvent 不会可靠地合成
// pointerdown（摇杆监听的是 pointer 事件），直接用会得到「移动 0」的假阴性。
// 这里改为在页面内派发真实 PointerEvent —— 与应用实际走的是同一条代码路径。
await ev(`(() => { const s = document.getElementById('stick'); const r = s.getBoundingClientRect(); window.__stickAt = [r.x + r.width/2, r.y + r.height/2]; })()`);
const sp = await ev(`window.__stickAt`);
const before = await ev(`window.__game.chapter.walker.position.toArray()`);
const sx = String(sp[0]);
const sy = String(sp[1]);
await ev(
  `(() => {
  const s = document.getElementById('stick');
  const cx = ${sx}, cy = ${sy};
  const fire = (t, x, y, pid) => s.dispatchEvent(new PointerEvent(t, {
    pointerId: pid, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y,
  }));
  window.__stickUp = () => fire('pointerup', cx, cy - 44, 5);
  fire('pointerdown', cx, cy, 5);
  fire('pointermove', cx, cy - 44, 5);
})()`
);
await sleep(1500);
const during = await ev(`window.__game.chapter.walker.position.toArray()`);
await ev(`window.__stickUp()`);
const moved = Math.hypot(during[0] - before[0], during[1] - before[1], during[2] - before[2]);
console.log('摇杆移动距离:', moved.toFixed(2), 'm');

const r = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('test-shots/ios-portrait.png', Buffer.from(r.data, 'base64'));

// 横屏
await send('Emulation.setDeviceMetricsOverride', {
  width: 852, height: 393, deviceScaleFactor: 3, mobile: true,
  screenOrientation: { type: 'landscapePrimary', angle: 90 },
});
await sleep(1500);
const land = await ev(`(() => ({ size: [innerWidth, innerHeight], canvas: [document.getElementById('scene').width, document.getElementById('scene').height] }))()`);
console.log('横屏:', JSON.stringify(land));
const r2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('test-shots/ios-landscape.png', Buffer.from(r2.data, 'base64'));

console.log('运行时错误:', errors.length ? errors.slice(0, 5) : '无');
ws.close();
proc.kill();
process.exit(0);
