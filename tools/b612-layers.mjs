/**
 * 排查画面里那块「奶白色」到底来自谁：逐个隐藏云海 / 大气壳 / 天空 / 浮空树，
 * 各截一张，交给 05-tools/color_grid.py 对比中段色。
 *   node tools/b612-layers.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const OUT = 'D:/zoxyprofile/xwz/web/test-shots';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9600 + Math.floor(Math.random() * 60);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-layers-${Date.now()}`,
  '--no-first-run', '--window-size=393,852', 'about:blank',
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
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
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
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const path = `${OUT}/layers-${name}.png`;
  writeFileSync(path, Buffer.from(r.data, 'base64'));
  console.log(path);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE });
await sleep(2500);
await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2500);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1500);
await ev(`(() => { const p = document.querySelector('.planet[data-id="b612"]'); p.click(); p.click(); })()`);
await sleep(3000);
await ev(`(() => {
  const g = window.__game; g.paused = false;
  const ch = g.chapter; ch.dialogue.stop(); ch.busy = false;
  for (let i = 0; i < 90; i++) ch.update(1/60);
})()`);
await sleep(500);

// 找到大气壳
const names = await ev(`(() => {
  const ch = window.__game.chapter;
  const out = [];
  ch.planet.children.forEach((c, i) => out.push([i, c.type, c.name, c.material ? c.material.type : '']));
  return out;
})()`);
console.log('planet children:', JSON.stringify(names));

await shot('base');
// 云海已移除（见 README 踩坑表），这里做成可选，避免脚本报错
await ev(`(() => { const ch = window.__game.chapter; if (ch.clouds) ch.clouds.visible = false; })()`);
await shot('noclouds');
await ev(`(() => {
  const ch = window.__game.chapter;
  if (ch.clouds) ch.clouds.visible = true;
  ch.planet.children.forEach((c) => { if (c.name === 'atmosphere') c.visible = false; });
})()`);
await shot('noatmo');
await ev(`(() => {
  const ch = window.__game.chapter;
  ch.planet.children.forEach((c) => { if (c.name === 'atmosphere') c.visible = true; });
  ch.sky.visible = false;
})()`);
await shot('nosky');
await ev(`(() => { const ch = window.__game.chapter; ch.sky.visible = true; })()`);

ws.close();
proc.kill();
process.exit(0);
