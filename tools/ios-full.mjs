/**
 * iOS 视口下的整站验收：
 *  - 地图上 8 颗星球全部可进入（built 标记来自章节注册表）
 *  - 触摸目标尺寸、安全区、DPR、manifest
 *  - 逐章进入并测量 JS 堆内存（预算 60 MB/章）
 *   node tools/ios-full.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9980 + Math.floor(Math.random() * 15);
const proc = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-iosfull',
    '--no-first-run',
    '--window-size=393,852',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let target;
for (let i = 0; i < 100; i++) {
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
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m.result);
    pend.delete(m.id);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    const desc = d.exception?.description || d.text;
    // 只统计游戏自身的异常：浏览器扩展（消息通道断开等）也会出现在这里，
    // 但它跟页面代码无关，混进来会掩盖真正的问题。
    const fromApp = (d.url || '').startsWith('http://127.0.0.1:4173') ||
      (d.stackTrace?.callFrames || []).some((f) => (f.url || '').startsWith('http://127.0.0.1:4173'));
    if (fromApp || !/Could not establish connection/.test(desc)) errors.push(desc);
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
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(2600);
await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1300);

// 1) 地图：8 颗星球都应可点
const mapState = await ev(`(() => {
  const els = [...document.querySelectorAll('.planet')];
  return {
    count: els.length,
    ids: els.map(e => e.dataset.id),
    locked: els.filter(e => e.classList.contains('is-locked')).map(e => e.dataset.id),
  };
})()`);
console.log('地图星球:', JSON.stringify(mapState));

// 2) 触摸目标 / 安全区 / manifest
const a11y = await ev(`(() => {
  const small = [];
  document.querySelectorAll('button,[role="button"]').forEach(b => {
    const r = b.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
      small.push((b.id || b.className || b.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  });
  return {
    targetsUnder44: small,
    manifest: !!document.querySelector('link[rel=manifest]'),
    appleIcon: !!document.querySelector('link[rel=apple-touch-icon]'),
    viewportFitCover: (document.querySelector('meta[name=viewport]')?.content || '').includes('cover'),
  };
})()`);
console.log('可访问性:', JSON.stringify(a11y));

// 3) 逐章进入，测堆内存
// 采样前必须强制 GC：否则量到的是上一章残留的未回收垃圾，而不是真实占用。
const order = ['b612', 'king', 'vanity', 'bar', 'merchant', 'lamp', 'geo', 'earth'];
const mem = {};
await send('HeapProfiler.enable');
for (const c of order) {
  await ev(`(() => { const p = document.querySelector('.planet[data-id="${c}"]'); p.click(); p.click(); })()`);
  await sleep(4300);
  await send('HeapProfiler.collectGarbage');
  await sleep(300);
  await send('HeapProfiler.collectGarbage');
  await sleep(400);
  const m = await ev(`(() => {
    const g = window.__game;
    const h = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null;
    return {
      chapter: g.chapterId,
      heapMB: h,
      fps: g.lastFps,
      geometries: g.renderer.info.memory.geometries,
      textures: g.renderer.info.memory.textures,
    };
  })()`);
  mem[c] = m;
  // 退出回地图（直接调用，等价于点「离开」）
  await ev(`(() => { const g = window.__game; if (g.chapter) g.returnToMap(); })()`);
  await sleep(900);
}
console.log('逐章内存:', JSON.stringify(mem, null, 0));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('test-shots/ios-map-all.png', Buffer.from(shot.data, 'base64'));

const maxHeap = Math.max(...Object.values(mem).map((m) => m.heapMB || 0));
console.log('最大单章堆内存:', maxHeap, 'MB （预算 60 MB）');
console.log('运行时错误:', errors.length ? errors.slice(0, 3) : '无');

ws.close();
proc.kill();
process.exit(errors.length || a11y.targetsUnder44.length || mapState.locked.length ? 1 : 0);
