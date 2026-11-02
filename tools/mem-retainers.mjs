/**
 * 进出章节 N 次后拍堆快照，找出仍存活的章节实例，打印从它往上的引用链（谁拿着它）。
 *   node tools/mem-retainers.mjs earth 2
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHAPTER = process.argv[2] || 'earth';
const ROUNDS = Number(process.argv[3] || 2);
const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9700 + Math.floor(Math.random() * 200);
const profile = `D:\\zoxyprofile\\xwz\\.tmp\\edge-ret-${Date.now()}`;
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--window-size=393,852', 'about:blank'], { stdio: 'ignore' });

let target;
for (let i = 0; i < 150 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let chunks = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'HeapProfiler.addHeapSnapshotChunk') { chunks.push(m.params.chunk); return; }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)); };
const ev = async (expression) => {
  const m = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
  return m.result.result.value;
};

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: BASE });
await sleep(2600);
await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1300);
const ctorName = await (async () => {
  await ev(`(() => { const p = document.querySelector('.planet[data-id="${CHAPTER}"]'); p.click(); p.click(); })()`);
  await sleep(4000);
  const n = await ev(`window.__game.chapter.constructor.name`);
  await ev(`window.__game.returnToMap()`); await sleep(1000);
  return n;
})();
for (let r = 1; r < ROUNDS; r++) {
  await ev(`(() => { const p = document.querySelector('.planet[data-id="${CHAPTER}"]'); p.click(); p.click(); })()`);
  await sleep(4000);
  await ev(`window.__game.returnToMap()`); await sleep(1000);
}
await send('HeapProfiler.enable');
await send('HeapProfiler.collectGarbage');
await sleep(500);
chunks = [];
await send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
ws.close();
proc.kill();

const snap = JSON.parse(chunks.join(''));
const m = snap.snapshot.meta;
const NF = m.node_fields.length, EF = m.edge_fields.length;
const nTypes = m.node_types[0], eTypes = m.edge_types[0];
const nodes = snap.nodes, edges = snap.edges, strings = snap.strings;
const iType = m.node_fields.indexOf('type'), iName = m.node_fields.indexOf('name'), iEC = m.node_fields.indexOf('edge_count');
const eType = m.edge_fields.indexOf('type'), eName = m.edge_fields.indexOf('name_or_index'), eTo = m.edge_fields.indexOf('to_node');
const count = nodes.length / NF;
// 反向边
const rev = Array.from({ length: count }, () => []);
let e = 0;
for (let n = 0; n < count; n++) {
  const ec = nodes[n * NF + iEC];
  for (let k = 0; k < ec; k++, e += EF) {
    const to = edges[e + eTo] / NF;
    const t = eTypes[edges[e + eType]];
    if (t === 'weak') continue;
    const nm = (t === 'element' || t === 'hidden') ? `[${edges[e + eName]}]` : strings[edges[e + eName]];
    rev[to].push({ from: n, name: nm, t });
  }
}
const nodeName = (n) => strings[nodes[n * NF + iName]];
const nodeType = (n) => nTypes[nodes[n * NF + iType]];
const hits = [];
for (let n = 0; n < count; n++) if (nodeType(n) === 'object' && nodeName(n) === ctorName) hits.push(n);
console.log(`构造名 ${ctorName}，存活实例 ${hits.length}`);
// 对每个实例做 BFS 到根，打印最短一条引用链
for (const h of hits.slice(0, 3)) {
  const prev = new Map([[h, null]]);
  const q = [h];
  let root = -1;
  while (q.length) {
    const n = q.shift();
    if (nodeType(n) === 'synthetic' || n === 0) { root = n; break; }
    for (const r of rev[n]) {
      if (prev.has(r.from)) continue;
      prev.set(r.from, { to: n, name: r.name, t: r.t });
      q.push(r.from);
    }
  }
  const chain = [];
  let cur = root;
  while (cur !== -1 && prev.get(cur)) { const p = prev.get(cur); chain.push(`${nodeType(cur)}:${nodeName(cur).slice(0, 50)} --${p.t}:${String(p.name).slice(0, 40)}-->`); cur = p.to; }
  console.log(`\n实例 #${h} 引用链（根 → 实例）：`);
  for (const c of chain) console.log('  ' + c);
  console.log('  ' + ctorName);
}
process.exit(0);
