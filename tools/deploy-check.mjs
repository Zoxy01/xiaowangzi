/**
 * 检查一个「已部署的线上地址」能否正常启动（默认就是服务器的 /xwz/）。
 * 会收集控制台异常、4xx/5xx 请求与失败请求，并截图。
 *   node tools/deploy-check.mjs
 *   LP_BASE=http://111.229.202.106/xwz/ node tools/deploy-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://111.229.202.106/xwz/';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9900 + Math.floor(Math.random() * 80);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-deploy-${Date.now()}`, '--no-first-run',
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
const badReqs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('console: ' + m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
  } else if (m.method === 'Network.responseReceived') {
    const { status, url } = m.params.response;
    if (status >= 400) badReqs.push(`${status} ${url}`);
  } else if (m.method === 'Network.loadingFailed') {
    badReqs.push(`FAILED ${m.params.errorText} ${m.params.requestId}`);
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
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: BASE });

// 线上是公网，首次要下载 app.js + three.js，等启动条走完最多 30 s
const t0 = Date.now();
let waited = 0;
while (waited < 30000) {
  await sleep(400);
  waited = Date.now() - t0;
  const pct = await ev(`(document.getElementById('boot-fill') || {}).style?.width || '0%'`).catch(() => '0%');
  if (parseInt(pct, 10) >= 100) break;
}
console.log(`启动耗时 ${(waited / 1000).toFixed(1)} s`);
const perf = await ev(`(() => performance.getEntriesByType('resource')
  .filter((r) => /\\.(?:js|css|woff2)$/.test(r.name))
  .map((r) => ({ f: r.name.split('/').pop(), ms: Math.round(r.duration), kb: Math.round((r.transferSize || 0) / 1024) })))()`);
console.log('资源', JSON.stringify(perf));

const state = await ev(`(() => {
  const g = window.__game;
  const boot = document.getElementById('boot');
  return {
    url: location.href,
    title: document.title,
    hasGame: !!g,
    paused: g ? g.paused : null,
    bootVisible: boot ? !boot.hidden && getComputedStyle(boot).display !== 'none' : null,
    bootBar: (document.getElementById('boot-fill') || {}).style?.width || null,
    planets: document.querySelectorAll('.planet[data-id]').length,
    manifest: !!document.querySelector('link[rel=manifest]'),
    dpr: window.devicePixelRatio,
    canvas: (() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; })(),
  };
})()`);
console.log('状态', JSON.stringify(state, null, 2));

// 走一遍：开始 → 地图 → 第一章
let flow = null;
try {
  await ev(`document.getElementById('boot-start')?.click()`);
  await sleep(1500);
  flow = await ev(`(() => ({ mapOpen: !!(window.__game && window.__game.map && window.__game.map.isOpen), planets: document.querySelectorAll('.planet[data-id]').length }))()`);
  await ev(`(() => { const p = document.querySelector('.planet[data-id="b612"]'); if (!p) throw new Error('地图上没有 b612 星球按钮'); p.click(); p.click(); })()`);
  await sleep(4500);
  flow.chapter = await ev(`(() => { const g = window.__game; if (!g.chapter) return null;
    g.paused = false; const ch = g.chapter;
    for (let i = 0; i < 60; i++) ch.update(1 / 60);
    return { id: g.chapterId, meshes: ch.meshes ? ch.meshes.length : null, goals: ch.goals ? ch.goals.length : null };
  })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync('test-shots/deploy.png', Buffer.from(shot.data, 'base64'));
  console.log('流程', JSON.stringify(flow));
  console.log('截图 test-shots/deploy.png');
} catch (e) {
  console.log('流程失败：', e.message);
}

console.log(`请求错误 ${badReqs.length} 条`, badReqs.slice(0, 8));
console.log(`运行时错误 ${errors.length} 条`, errors.slice(0, 5));
ws.close();
proc.kill();
process.exit(badReqs.length || errors.length || !state.hasGame ? 1 : 0);
