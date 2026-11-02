/**
 * 检查每章的「柔光层」是否生效：太阳光晕、光柱、光尘、草、野花。
 * 顺便采样画面的天顶/地平/地面三段色，确认没有被雾光洗成一片。
 *   node tools/art-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BASE = process.env.LP_BASE || 'http://127.0.0.1:4173/';
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9900 + Math.floor(Math.random() * 80);
const proc = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=D:\\\\zoxyprofile\\\\xwz\\\\.tmp\\\\edge-art-${Date.now()}`, '--no-first-run',
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
  const art = ch.art;
  if (!art) return { error: '没有柔光层（ch.art 为空）' };
  const count = (o) => { let n = 0; o && o.traverse && o.traverse((c) => { if (c.isMesh || c.isPoints || c.isSprite) n++; }); return n; };
  const inst = (m) => (m && m.isInstancedMesh ? m.count : 0);
  const sky = ch.sky && ch.sky.userData.uniforms;
  return {
    halo: !!art.halo,
    shafts: art.shafts ? art.shafts.children.length : 0,
    motes: art.motes ? art.motes.geometry.attributes.position.count : 0,
    grass: inst(art.grass),
    flowers: art.flowers ? inst(art.flowers.children && art.flowers.children[0]) * 2 : 0,
    haloOpacity: art.halo ? +art.halo.material.opacity.toFixed(2) : 0,
    skyTop: sky ? '#' + sky.topColor.value.getHexString() : null,
    skyMid: sky ? '#' + sky.midColor.value.getHexString() : null,
    skyBot: sky ? '#' + sky.botColor.value.getHexString() : null,
    haze: sky && sky.hazeAmount ? +sky.hazeAmount.value.toFixed(2) : null,
    fx: !!ch.fx,
    palette: ch.paletteName,
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
  const ok = r.halo && r.motes > 60 && r.skyTop && r.fx;
  if (!ok) bad++;
  console.log(
    `${c.padEnd(9)} ${ok ? '✓' : '✗'} ${String(r.palette).padEnd(9)} 光柱${String(r.shafts).padStart(2)} 光尘${String(r.motes).padStart(3)} 草${String(r.grass).padStart(4)} 花${String(r.flowers).padStart(3)} 光晕${r.haloOpacity} 雾${r.haze} 天${r.skyTop}/${r.skyMid}/${r.skyBot}`
  );
  await ev(`(() => { const g = window.__game; g.returnToMap && g.returnToMap(); })()`);
  await sleep(900);
}
console.log(errors.length ? `运行时报错 ${errors.length}: ${errors[0]}` : '运行时报错 0');
console.log(bad ? `✗ ${bad} 项异常` : '✓ 八章柔光层全部生效');
ws.close();
proc.kill();
process.exit(bad ? 1 : 0);
