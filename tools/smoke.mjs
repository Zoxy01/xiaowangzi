/**
 * 冒烟测试：用无头 Chromium（Edge）打开构建产物，走完整个游玩流程。
 * 用法：node tools/smoke.mjs [url]
 * 覆盖：启动 → 地图 → 进入 B-612 → 走动 → 交互 → 日落 → 回到地图 → 切语言
 * 任何 console.error / pageerror 都会让测试失败。
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);

if (!CHROME) {
  console.error('没找到 Edge/Chrome');
  process.exit(2);
}

const url = process.argv[2] || 'http://127.0.0.1:4173/';

// ---- 极简 CDP 客户端
class CDP {
  constructor(wsUrl) {
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(wsUrl);
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error('EVAL: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }
  async shot(path) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    const buf = Buffer.from(r.data, 'base64');
    writeFileSync(path, buf);
    // 立刻做一次「是不是空白」的粗检：PNG 小于 3KB 基本就是纯色
    if (buf.length < 3000) {
      throw new Error(`截图 ${path} 只有 ${buf.length} 字节，疑似空白画面`);
    }
    return path;
  }
  close() {
    this.ws.close();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 启动浏览器
const userDir = mkdtempSync(join(tmpdir(), 'lp-smoke-'));
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDir}`,
    '--window-size=390,844',
    '--hide-scrollbars',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false }
);

let cdp;
try {
  // 等调试端点就绪
  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch {
      /* 还没起来 */
    }
  }
  if (!target) throw new Error('浏览器调试端口没起来');

  cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;

  const errors = [];
  const logs = [];
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  // 必须自己 await，否则 Promise 永不 resolve（之前截图静默失败的原因）
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 2,
    mobile: true,
  });
  cdp.ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      logs.push(m.params.type + ': ' + text);
      if (m.params.type === 'error') errors.push('CONSOLE: ' + text);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push('LOG: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  });

  // ---- 视口模拟 iPhone 14 Pro
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  console.log('打开', url);
  await cdp.send('Page.navigate', { url });
  await sleep(2500);

  const step = (name) => console.log('  ✓', name);

  // 1. 首屏
  const bootVisible = await cdp.eval(`!document.getElementById('boot').classList.contains('hidden')`);
  if (!bootVisible) throw new Error('首屏没有显示');
  step('首屏渲染');

  const glInfo = await cdp.eval(`(() => {
    const g = window.__game;
    if (!g) return { ok: false };
    const ctx = g.renderer.getContext();
    return { ok: true, ver: ctx.getParameter(ctx.VERSION), renderer: ctx.getParameter(ctx.RENDERER) };
  })()`);
  console.log('    WebGL:', JSON.stringify(glInfo));

  await cdp.shot('D:/zoxyprofile/xwz/web/test-shots/01-boot.png');

  // 2. 点击开始
  await cdp.eval(`document.getElementById('boot-start').click()`);
  await sleep(1400);
  const mapVisible = await cdp.eval(`!document.getElementById('map').classList.contains('hidden')`);
  if (!mapVisible) throw new Error('点击开始后地图没有出现');
  const planetCount = await cdp.eval(`document.querySelectorAll('.planet').length`);
  if (planetCount !== 8) throw new Error('地图星球数量应为 8，实际 ' + planetCount);
  step(`旅程地图打开，${planetCount} 颗星球`);

  // 星球图片是否真的加载了
  const imgState = await cdp.eval(`(() => {
    const imgs = [...document.querySelectorAll('.planet img')];
    return imgs.map(i => ({ ok: i.complete && i.naturalWidth > 0, src: i.src.split('/').pop() }));
  })()`);
  const badImgs = imgState.filter((i) => !i.ok);
  if (badImgs.length) throw new Error('星球缩略图加载失败: ' + JSON.stringify(badImgs));
  step('8 张星球缩略图全部加载');

  await sleep(600);
  await cdp.shot('D:/zoxyprofile/xwz/web/test-shots/02-map.png');

  // 3. 点未建造的星球 → 应提示建造中
  await cdp.eval(`document.querySelector('.planet[data-id="king"]').click()`);
  await sleep(350);
  const caption = await cdp.eval(`document.getElementById('map-caption').textContent`);
  if (!caption.includes('建造')) throw new Error('未建造星球提示不对: ' + caption);
  step('未实现星球提示：' + caption.slice(0, 28));

  // 4. 进入 B-612
  await cdp.eval(`document.querySelector('.planet[data-id="b612"]').click()`);
  await sleep(150);
  await cdp.eval(`document.querySelector('.planet[data-id="b612"]').click()`);
  await sleep(900);
  const chapterCard = await cdp.eval(`!document.getElementById('chapter-card').classList.contains('hidden')`);
  step('章节卡显示: ' + chapterCard);
  await cdp.shot('D:/zoxyprofile/xwz/web/test-shots/03-chapter-card.png');

  await sleep(2200);
  const inChapter = await cdp.eval(`!!(window.__game.chapter)`);
  if (!inChapter) throw new Error('章节没有加载');
  step('B-612 场景已加载');

  // 5. 走动：模拟摇杆输入
  await cdp.eval(`(() => {
    const g = window.__game;
    g.chapter.busy = false;
    g.chapter.dialogue.stop();
    g.input.move.x = 0.0; g.input.move.y = 1.0;
  })()`);
  const before = await cdp.eval(`window.__game.chapter.walker.position.toArray()`);
  await sleep(1200);
  const after = await cdp.eval(`window.__game.chapter.walker.position.toArray()`);
  await cdp.eval(`window.__game.input.move.x = 0; window.__game.input.move.y = 0;`);
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
  if (moved < 0.4) throw new Error('角色没有移动，位移 ' + moved.toFixed(3));
  step(`球面行走生效（位移 ${moved.toFixed(2)} 单位）`);

  const radiusDrift = await cdp.eval(`Math.abs(window.__game.chapter.walker.position.length() - 6.02)`);
  if (radiusDrift > 0.35) throw new Error('角色没有贴地，离球面 ' + radiusDrift.toFixed(3));
  step('贴地正常（离球面 ' + radiusDrift.toFixed(3) + '）');

  const fps = await cdp.eval(`(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); };
    requestAnimationFrame(f);
  }))()`);
  console.log('    软件渲染 FPS:', fps, '(SwiftShader，真机会高得多)');

  // 6. 交互链：直接调用章节方法验证
  await cdp.eval(`(() => {
    const c = window.__game.chapter;
    c.talkCalled = true;
    c.carried = false; c.can.visible = true;
  })()`);
  // 传送到玫瑰旁并触发交谈
  await cdp.eval(`(() => {
    const c = window.__game.chapter;
    const w = c.walker;
    w.position.copy(c.roseDir.clone().multiplyScalar(6.02));
    w.sync(true);
    c._updateInteraction();
  })()`);
  await sleep(400);
  const promptText = await cdp.eval(`document.getElementById('prompt-label').textContent`);
  step('靠近玫瑰出现提示: 「' + promptText + '」');

  await cdp.eval(`window.__game.chapter.interact()`);
  await sleep(900);
  const dlgVisible = await cdp.eval(`document.getElementById('dialogue').classList.contains('show') || !document.getElementById('dialogue').classList.contains('hidden')`);
  const dlgText = await cdp.eval(`document.getElementById('dlg-line').textContent`);
  if (!dlgVisible) throw new Error('对话面板没有出现');
  step('对话触发: 「' + dlgText.slice(0, 18) + '…」');
  await cdp.shot('D:/zoxyprofile/xwz/web/test-shots/04-dialogue.png');

  // 7. 跳到最后：触发日落与章节完成
  await cdp.eval(`(() => {
    const c = window.__game.chapter;
    c.dialogue.stop();
    c.busy = false;
    c._sunset();
  })()`);
  await sleep(1800);
  const sunMoving = await cdp.eval(`window.__game.chapter.sunAngle`);
  step('日落动画推进，太阳高度角 ' + sunMoving.toFixed(3));
  await cdp.shot('D:/zoxyprofile/xwz/web/test-shots/05-sunset.png');

  await sleep(7000);
  const visited = await cdp.eval(`window.__game.progress.visited`);
  step('访问记录: ' + JSON.stringify(visited));

  // 8. 切语言
  await cdp.eval(`document.getElementById('set-lang').value='en'; document.getElementById('set-lang').dispatchEvent(new Event('change'))`);
  await sleep(400);
  const langTitle = await cdp.eval(`document.querySelector('.map-header h2').textContent`);
  step('切到英文: ' + langTitle);

  await cdp.eval(`document.getElementById('set-lang').value='zh'; document.getElementById('set-lang').dispatchEvent(new Event('change'))`);

  await cdp.shot('D:/zoxyprofile/xwz/web/test-shots/06-final.png');

  // ---- 内存与错误
  const mem = await cdp.eval(`(() => {
    const p = performance.memory;
    return p ? { used: Math.round(p.usedJSHeapSize/1048576), total: Math.round(p.totalJSHeapSize/1048576) } : null;
  })()`);
  console.log('\nJS 堆:', mem ? mem.used + ' MB / ' + mem.total + ' MB' : '不可用');

  if (errors.length) {
    console.log('\n✗ 发现 ' + errors.length + ' 条错误:');
    for (const e of errors.slice(0, 20)) console.log('  ', e.slice(0, 400));
    process.exitCode = 1;
  } else {
    console.log('\n✓ 无 console 错误、无未捕获异常');
  }
  console.log('✓ 冒烟测试通过');
} catch (e) {
  console.error('\n✗ 测试失败:', e.message);
  process.exitCode = 1;
} finally {
  try {
    cdp?.close();
  } catch {}
  try {
    proc.kill();
  } catch {}
}
