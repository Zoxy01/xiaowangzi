/**
 * 分阶段渲染验证（CDP + 长时间真实等待）。
 * 每一步都读取页面真实状态后再截图，确保截到的是对应阶段。
 *   node tools/stage-shots.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';

const CHROME = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);

const OUT = 'D:/zoxyprofile/xwz/web/test-shots';
mkdirSync(OUT, { recursive: true });

const port = 9300 + Math.floor(Math.random() * 90);
const proc = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-stage',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=393,852',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'inherit' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 80; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch {}
}
if (!target) {
  console.error('端口没起来');
  proc.kill();
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res } = pending.get(m.id);
    pending.delete(m.id);
    res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res) => pending.set(i, { res }));
};
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
  return r.data.length;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
await sleep(2500);

const state = async () =>
  ev(`(() => {
    const g = window.__game;
    const vis = (id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden'); };
    return {
      boot: vis('boot'), map: vis('map'), hud: vis('hud'), chapterCard: vis('chapter-card'),
      hasChapter: !!(g && g.chapter), chapterId: g && g.chapterId,
      cam: g && g.chapter ? g.chapter.camera.position.toArray().map(v=>+v.toFixed(2)) : null,
      walker: g && g.chapter ? g.chapter.walker.position.toArray().map(v=>+v.toFixed(2)) : null,
      fps: g ? g.lastFps : null,
    };
  })()`);

console.log('① 首屏', await state());
console.log('   shot bytes', (await shot('s1-boot')) / 1024 | 0, 'KB');

await ev(`document.getElementById('boot-start').click()`);
await sleep(1600);
console.log('② 地图', await state());
console.log('   shot bytes', ((await shot('s2-map')) / 1024) | 0, 'KB');

// 进入 B-612：选中 + 再点一次
await ev(`(() => { const p = document.querySelector('.planet[data-id="b612"]'); p.click(); p.click(); })()`);
await sleep(700);
console.log('③ 章节卡', await state());
await sleep(3000);
const st3 = await state();
console.log('④ 场景', st3);
console.log('   shot bytes', ((await shot('s3-scene')) / 1024) | 0, 'KB');

// 走动 + 转视角
await ev(`(() => {
  const g = window.__game;
  g.chapter.dialogue.stop();
  g.chapter.busy = false;
  g.input.move.y = 0.9; g.input.move.x = 0.25;
})()`);
await sleep(2600);
const st4 = await state();
await ev(`(() => { window.__game.input.move.y = 0; window.__game.input.move.x = 0; })()`);
console.log('⑤ 走动后', st4);
console.log('   shot bytes', ((await shot('s4-walk')) / 1024) | 0, 'KB');

// 传送到玫瑰旁触发对话
await ev(`(() => {
  const c = window.__game.chapter;
  c.walker.position.copy(c.roseDir.clone().multiplyScalar(6.02));
  c.walker.sync(true);
  c._updateInteraction();
})()`);
await sleep(500);
const prompt = await ev(`document.getElementById('prompt-label').textContent`);
await ev(`window.__game.chapter.interact()`);
await sleep(1400);
const dlg = await ev(`({ line: document.getElementById('dlg-line').textContent, speaker: document.getElementById('dlg-speaker').textContent })`);
console.log('⑥ 对话', prompt, '|', dlg);
console.log('   shot bytes', ((await shot('s5-dialogue')) / 1024) | 0, 'KB');

// 日落
await ev(`(() => { const c = window.__game.chapter; c.dialogue.stop(); c.busy = false; c._sunset(); })()`);
await sleep(3000);
const sun = await ev(`({ angle: +window.__game.chapter.sunAngle.toFixed(3), anim: !!window.__game.chapter.sunAnim })`);
console.log('⑦ 日落中', sun);
console.log('   shot bytes', ((await shot('s6-sunset')) / 1024) | 0, 'KB');

await sleep(6000);
console.log('⑧ 结束后', await state());
console.log('   shot bytes', ((await shot('s7-end')) / 1024) | 0, 'KB');

// 英文界面
await ev(`(() => { const s=document.getElementById('set-lang'); s.value='en'; s.dispatchEvent(new Event('change')); })()`);
await sleep(600);
console.log('⑨ 英文地图标题', await ev(`document.querySelector('.map-header h2').textContent`));
console.log('   shot bytes', ((await shot('s8-en')) / 1024) | 0, 'KB');

console.log('\n错误:', errors.length ? errors.slice(0, 8) : '无');
ws.close();
proc.kill();
process.exit(0);
