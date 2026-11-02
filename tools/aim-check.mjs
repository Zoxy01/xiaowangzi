/**
 * 检查每章「玩家一进来能看到什么」：把可交互点投影到 NDC，
 * 看它们是否真的落在画面内（|x|,|y| <= 1）。
 *   node tools/aim-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9700 + Math.floor(Math.random() * 80);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-aim-${Date.now()}`, '--no-first-run',
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
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') {
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
await send('Page.navigate', { url: BASE });
await sleep(2600);
await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
await sleep(2600);
await ev(`document.getElementById('boot-start').click()`);
await sleep(1400);

let bad = 0;
for (const c of ['b612', 'king', 'vanity', 'bar', 'merchant', 'lamp', 'geo', 'earth']) {
  await ev(`(() => { const p = document.querySelector('.planet[data-id="${c}"]'); p.click(); p.click(); })()`);
  await sleep(4500);
  await ev(`(() => { const ch = window.__game.chapter; if (ch) { ch.dialogue.stop(); ch.busy = false; } })()`);
  await sleep(600);
  // 无头环境下 rAF 可能停摆（paused / 循环超时），这里主动推进 60 帧，
  // 让相机 lerp 收敛，测的才是「玩家真正会看到什么」。
  await ev(`(() => {
    const g = window.__game;
    g.paused = false;
    const ch = g.chapter;
    if (ch) for (let i = 0; i < 60; i++) ch.update(0.016);
  })()`);
  const r = await ev(`(() => {
    const ch = window.__game.chapter;
    if (!ch) return { error: 'no chapter' };
    const cam = ch.camera;
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const out = ch.interactables.slice(0, 5).map((it) => {
      const v = it.pos.clone().project(cam);
      return { id: it.id, x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(3), ok: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1 };
    });
    const visible = out.filter((o) => o.ok).length;
    const w = ch.walker;
    return { chapter: ch.game.chapterId, visible, total: out.length, targets: out,
      camYaw: +w.camYaw.toFixed(2), camPitch: +w.camPitch.toFixed(2),
      walkerLen: +w.position.length().toFixed(2), camPosLen: +cam.position.length().toFixed(2),
      dist: +ch.interactables[0].pos.distanceTo(w.position).toFixed(2) };
  })()`);
  if (r.error) {
    console.log(`✗ ${c}: ${r.error}`);
    bad++;
  } else {
    const mark = r.visible > 0 ? '✓' : '✗';
    if (r.visible === 0) bad++;
    console.log(`${mark} ${r.chapter.padEnd(9)} 画面内交互点 ${r.visible}/${r.total}  yaw=${r.camYaw} wLen=${r.walkerLen} cLen=${r.camPosLen} dist=${r.dist} ${JSON.stringify(r.targets.map((t) => `${t.id}(${t.x},${t.y},z${t.z})`))}`);
  }
  await ev(`(() => { const g = window.__game; if (g.chapter) g.returnToMap(); })()`);
  await sleep(800);
}

console.log(bad === 0 ? '\n✓ 每章开局都能看到可互动的东西' : `\n✗ ${bad} 章开局看不到任何可互动目标`);
ws.close();
proc.kill();
process.exit(bad === 0 ? 0 : 1);
