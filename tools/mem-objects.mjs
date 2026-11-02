/**
 * 内存定位：反复进出某章后，统计仍存活的 Three.js 对象数量（Object3D / BufferGeometry / Material / 数组缓冲）。
 * 若某类数量随轮数线性增长，就是泄漏来源。
 *   node tools/mem-objects.mjs earth 6
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHAPTER = process.argv[2] || 'earth';
const ROUNDS = Number(process.argv[3] || 6);
const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9500 + Math.floor(Math.random() * 200);
const profile = `D:\\zoxyprofile\\xwz\\.tmp\\edge-memobj-${Date.now()}`;
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--enable-precise-memory-info', '--window-size=393,852', 'about:blank'], { stdio: 'ignore' });

let target;
for (let i = 0; i < 150 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)); };
const ev = async (expression) => {
  const m = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
  return m.result.result.value;
};
const gc = async () => { await send('HeapProfiler.enable'); await send('HeapProfiler.collectGarbage'); await sleep(300); await send('HeapProfiler.collectGarbage'); await sleep(300); };

// 用 queryObjects 统计以某个原型为原型链的存活对象个数
const count = async (protoExpr) => {
  // 必须用具名 objectGroup 并在用完后释放：queryObjects 返回的数组若留在默认组里，
  // DevTools 会一直持有它，被统计到的对象从此再也回收不了（测量本身制造泄漏）。
  const p = await send('Runtime.evaluate', { expression: protoExpr, objectGroup: 'memq' });
  const objectId = p.result?.result?.objectId;
  if (!objectId) return -1;
  const q = await send('Runtime.queryObjects', { prototypeObjectId: objectId, objectGroup: 'memq' });
  const arr = q.result.objects.objectId;
  const len = await send('Runtime.callFunctionOn', { objectId: arr, functionDeclaration: 'function(){return this.length}', returnByValue: true, objectGroup: 'memq' });
  await send('Runtime.releaseObjectGroup', { objectGroup: 'memq' });
  return len.result.result.value;
};

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: BASE });
await sleep(2600);
await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1300);
// 先进一次章，把原型保存到 window 上（退出后仍能拿到）
const enter = async () => {
  await ev(`(() => { const p = document.querySelector('.planet[data-id="${CHAPTER}"]'); p.click(); p.click(); })()`);
  await sleep(4000);
  const inside = await ev(`window.__game.chapterId`);
  if (inside !== CHAPTER) console.log(`  ! 未进入章节（chapterId=${inside}）`);
};
const leave = async () => { await ev(`window.__game.returnToMap()`); await sleep(1200); };
await enter();
await ev(`(() => { const ch = window.__game.chapter; let o = ch.root; while (Object.getPrototypeOf(Object.getPrototypeOf(o)).constructor.name !== 'Object' && Object.getPrototypeOf(o).constructor.name !== 'Object3D') o = Object.getPrototypeOf(o);
  const mesh = ch.root.getObjectByProperty('isMesh', true);
  window.__P = { obj3d: Object.getPrototypeOf(ch.root.constructor.prototype).constructor.name === 'Object3D' ? Object.getPrototypeOf(ch.root.constructor.prototype) : ch.root.constructor.prototype,
    geo: Object.getPrototypeOf(Object.getPrototypeOf(mesh.geometry)), mat: Object.getPrototypeOf(Object.getPrototypeOf(mesh.material)),
    vec3: Object.getPrototypeOf(ch.camera.position), f32: Float32Array.prototype, chapterProto: Object.getPrototypeOf(Object.getPrototypeOf(ch)), arr: Array.prototype, fn: Function.prototype, str: String.prototype };
  return Object.keys(window.__P); })()`);
await leave();

const kinds = ['obj3d', 'geo', 'mat', 'vec3', 'f32', 'chapterProto', 'arr', 'fn'];
for (let r = 0; r <= ROUNDS; r++) {
  if (r > 0) { await enter(); await leave(); }
  await gc();
  const row = { round: r, heap: await ev(`Math.round(performance.memory.usedJSHeapSize/1048576*100)/100`) };
  for (const k of kinds) row[k] = await count(`window.__P.${k}`);
  console.log(JSON.stringify(row));
}
ws.close();
proc.kill();
process.exit(0);
