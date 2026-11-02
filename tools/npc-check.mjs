/**
 * 检查每章的 NPC 是否真的存在、在地面上、并且在画面里。
 *   node tools/npc-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9900 + Math.floor(Math.random() * 80);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-npc-${Date.now()}`, '--no-first-run',
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

const PROBE = `(() => {
  const g = window.__game;
  const ch = g.chapter;
  if (!ch) return { error: 'no chapter' };
  const V = ch.walker.position.constructor;
  ch.root.updateWorldMatrix(true, true);
  const cam = ch.camera;
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const out = [];
  ch.root.traverse((o) => {
    const d = o.userData && o.userData.npc;
    if (!d) return;
    let meshes = 0;
    o.traverse((c) => { if (c.isMesh) meshes++; });
    const p = new V(); o.getWorldPosition(p);
    const R = ch.radius;
    const ground = p.length() - R;
    const head = new V(0, 0.95 * (o.scale.x || 1), 0).applyQuaternion(o.quaternion).add(p);
    const ndc = head.clone().project(cam);
    out.push({
      meshes,
      ground: +ground.toFixed(3),
      ndc: [+ndc.x.toFixed(2), +ndc.y.toFixed(2)],
      dist: +p.distanceTo(ch.walker.position).toFixed(2),
    });
  });
  const wp = new V(); (ch.avatar.root || ch.avatar).getWorldPosition(wp);
  const wndc = wp.project(cam);
  const props = (ch.interactables || []).map((it) => {
    const q = it.pos.clone().applyMatrix4(ch.root.matrixWorld).project(cam);
    return [it.id, +q.x.toFixed(2), +q.y.toFixed(2)];
  });
  return {
    found: out.length, list: out, props,
    pitch: +ch.walker.camPitch.toFixed(2),
    walkerNDC: [+wndc.x.toFixed(2), +wndc.y.toFixed(2)],
    camDist: +ch.camera.position.distanceTo(ch.walker.position).toFixed(2),
  };
})()`;

let bad = 0;
for (const c of ['b612', 'king', 'vanity', 'bar', 'merchant', 'lamp', 'geo', 'earth']) {
  await ev(`(() => { const p = document.querySelector('.planet[data-id="${c}"]'); p.click(); p.click(); })()`);
  await sleep(4200);
  await ev(`(() => { const g = window.__game; g.paused = false; const ch = g.chapter; if (ch) { ch.dialogue.stop(); ch.busy = false; for (let i = 0; i < 90; i++) ch.update(1 / 60); } })()`);
  await sleep(500);
  const r = await ev(PROBE);
  if (r.error) { console.log(`${c.padEnd(9)} ✗ ${r.error}`); bad++; continue; }
  if (!r.found) {
    console.log(`${c.padEnd(9)} – 无 NPC（该章未安排）`);
    continue;
  }
  for (const n of r.list) {
    const onScreen = Math.abs(n.ndc[0]) <= 1 && Math.abs(n.ndc[1]) <= 1;
    const far = c === 'earth' && n.dist > 15; // 地球的两个 NPC 在路线远处，出生点看不到是正常的
    const ok = n.meshes > 6 && Math.abs(n.ground) < 0.35 && (onScreen || far);
    if (!ok) bad++;
    console.log(`${c.padEnd(9)} ${ok ? '✓' : '✗'} 网格${String(n.meshes).padStart(3)}  离地${n.ground}  屏幕[${n.ndc}]  距玩家${n.dist}m`);
  }
  console.log(`${''.padEnd(9)}   pitch=${r.pitch} camDist=${r.camDist} walkerNDC=[${r.walkerNDC}] props=${JSON.stringify(r.props)}`);
  await ev(`(() => { const g = window.__game; g.returnToMap && g.returnToMap(); })()`);
  await sleep(900);
}
console.log(errors.length ? `运行时报错 ${errors.length}: ${errors[0]}` : '运行时报错 0');
console.log(bad ? `✗ ${bad} 项异常` : '✓ NPC 全部正常');
ws.close();
proc.kill();
process.exit(bad ? 1 : 0);
