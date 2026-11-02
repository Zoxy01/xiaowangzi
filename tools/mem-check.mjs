/**
 * 内存回归：反复进出同一章，确认章节切换不泄漏。
 *
 * iPhone 的 Safari 对单页内存很敏感，章节切换如果漏放资源，
 * 玩几章就会因为内存压力被系统杀掉。这个脚本用 CDP 反复
 * 「进章节 → 回地图 → 强制 GC」，采样 usedJSHeapSize 与
 * renderer 登记的几何体/贴图数量，任一指标线性增长即判失败。
 *
 * 用法：
 *   node tools/mem-check.mjs             # 默认 earth，16 轮
 *   node tools/mem-check.mjs geo 20
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHAPTER = process.argv[2] || 'earth';
const ROUNDS = Number(process.argv[3] || 16);
const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';

const CHROME = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!CHROME) {
  console.error('找不到 Edge/Chrome');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 200);
const profile = `D:\\zoxyprofile\\xwz\\.tmp\\edge-mem-${CHAPTER}-${Date.now()}`;
const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--enable-precise-memory-info', // 让 performance.memory 有真实数值
  '--window-size=393,852',
  'about:blank',
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 150; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch {}
}
if (!target) {
  console.error('无法连接到浏览器调试端口');
  proc.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pending.set(i, r));
};
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
};
const gc = async () => {
  await send('HeapProfiler.enable');
  await send('HeapProfiler.collectGarbage');
  await sleep(350);
  // 第二次：清掉第一次 GC 期间产生的临时对象
  await send('HeapProfiler.collectGarbage');
  await sleep(450);
};
const heap = () => ev(`Math.round(performance.memory.usedJSHeapSize / 1048576 * 100) / 100`);

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 393, height: 852, deviceScaleFactor: 3, mobile: true,
});
await send('Page.navigate', { url: BASE });
await sleep(2600);
await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1300);

const enterChapter = async () => {
  const ok = await ev(`(() => {
    const p = document.querySelector('.planet[data-id="${CHAPTER}"]');
    if (!p) return false;
    p.click(); p.click();
    return true;
  })()`);
  if (!ok) throw new Error(`地图上找不到星球 ${CHAPTER}`);
  await sleep(4200);
};
const backToMap = async () => {
  await ev(`(() => { const g = window.__game; if (g.chapter) g.returnToMap(); })()`);
  await sleep(1200);
};

const samples = [];
for (let r = 1; r <= ROUNDS; r++) {
  await enterChapter();
  await backToMap();
  await gc();
  const used = await heap();
  const mem = await ev(`(() => {
    const g = window.__game;
    return { geometries: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures,
      programs: (g.renderer.info.programs || []).length };
  })()`);
  samples.push({ round: r, used, ...mem });
  console.log(`第 ${r} 轮 GC 后: ${used} MB  几何体=${mem.geometries} 贴图=${mem.textures} 着色器=${mem.programs}`);
}

const first = samples[0];
const last = samples[samples.length - 1];
const growth = Math.round((last.used - first.used) * 100) / 100;
const perRound = Math.round((growth / Math.max(1, ROUNDS - 1)) * 100) / 100;
const gpuLeak = last.geometries > 0 || last.textures > 0;

console.log('');
console.log(`堆增长 ${growth} MB / ${ROUNDS} 轮（每轮 ${perRound} MB）`);
console.log(`残留几何体 ${last.geometries} 个、贴图 ${last.textures} 张`);

const heapLeak = growth > 8;
if (heapLeak) console.log('✗ 堆内存线性增长，章节切换存在泄漏');
else console.log('✓ 堆内存稳定（每轮 < 1 MB 属正常堆波动）');
if (gpuLeak) console.log('✗ 几何体/贴图未释放干净');
else console.log('✓ GPU 资源已全部释放');

ws.close();
proc.kill();
process.exit(heapLeak || gpuLeak ? 1 : 0);
