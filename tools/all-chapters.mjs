/**
 * 全 8 章端到端回归：逐章进入 → 走完所有交互 → 确认记录到 visited。
 *   node tools/all-chapters.mjs
 * 每章独立进程，避免状态串味。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const CHAPTERS = ['b612', 'king', 'vanity', 'bar', 'merchant', 'lamp', 'geo', 'earth'];
const CHROME = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(chapter) {
  const port = 9700 + Math.floor(Math.random() * 200);
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=D:\\zoxyprofile\\xwz\\.tmp\\edge-all-${chapter}`,
      '--no-first-run',
      '--window-size=393,852',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let target;
  for (let i = 0; i < 100; i++) {
    await sleep(200);
    try {
      const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = l.find((t) => t.type === 'page');
      if (target) break;
    } catch {}
  }
  if (!target) {
    proc.kill();
    return { chapter, ok: false, reason: '浏览器没起来' };
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m.result);
      pend.delete(m.id);
    } else if (m.method === 'Runtime.exceptionThrown') {
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
    const r = await send('Runtime.evaluate', {
      expression: x,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/' });
    await sleep(2400);
    await ev(`localStorage.removeItem('lp.progress'); location.reload()`);
    await sleep(2400);
    await ev(`document.getElementById('boot-start').click()`);
    await sleep(1000);
    await ev(`(() => { const p = document.querySelector('.planet[data-id="${chapter}"]'); p.click(); p.click(); })()`);
    await sleep(4200);

    const entered = await ev(`!!window.__game.chapter`);
    if (!entered) return { chapter, ok: false, reason: '章节没打开', errors };

    const drain = async () => {
      let quiet = 0;
      for (let i = 0; i < 60; i++) {
        const st = await ev(`(() => {
          const c = window.__game.chapter;
          if (!c) return { gone: true };
          // 动画期间先别推进对话（B-612 的日落），否则会把「坐下」之后的对白抢掉
          if (c.sunAnim) return { anim: true };
          if (c.dialogue.isActive) c.dialogue._finish();
          return { active: c.dialogue.isActive, busy: c.busy };
        })()`);
        if (st.gone) return true;
        if (st.anim) return false;
        if (!st.active && !st.busy) {
          // 连续两次安静才算真的安静，避免回调里又起了新对话
          if (++quiet >= 2) return false;
        } else quiet = 0;
        await sleep(120);
      }
      return false;
    };

    const acts = [];
    // B-612 有 stage 门槛和一段 6.5 秒的日落动画，交互顺序是固定的脚本，
    // 靠通用「找最近交互点」驱动会在动画期间误判。这里直接走它自己的事件方法，
    // 走的仍然是真实代码路径（不需要任何测试专用钩子）。
    const B612 = [
      ['_talkToRose', 'roseTalk'],
      ['_takeCan', 'can'],
      ['_fillCan', 'spring'],
      ['_waterRose', 'rose'],
      ['_sitAndWatchSunset', 'chair'],
    ];
    const scripted = chapter === 'b612' ? B612 : null;
    let scriptIdx = 0;

    for (let round = 0; round < 24; round++) {
      // 章节正在播动画（B-612 日落 6.5s），等它结束再继续
      const anim = await ev(`(() => { const c = window.__game.chapter; return c ? !!c.sunAnim : false; })()`);
      if (anim) {
        for (let i = 0; i < 24; i++) {
          await sleep(500);
          const still = await ev(`(() => { const c = window.__game.chapter; return c ? !!c.sunAnim : false; })()`);
          if (!still) break;
        }
        continue;
      }
      if (await drain()) break; // 已回地图

      if (scripted) {
        if (scriptIdx >= scripted.length) {
          // 脚本走完，等它自己收尾
          if (await drain()) break;
          await sleep(600);
          const gone = await ev(`!window.__game.chapter`);
          if (gone) break;
          continue;
        }
        const [method, label] = scripted[scriptIdx++];
        await ev(`(() => { const c = window.__game.chapter; c.busy = false; if (typeof c['${method}'] === 'function') c['${method}'](); })()`);
        acts.push(label);
        await sleep(700);
        continue;
      }
      const near = await ev(`(() => {
        const c = window.__game.chapter;
        if (!c) return null;
        if (c.dialogue.isActive) return { waiting: true };
        const cands = c.interactables
          .filter(i => !i.enabled || i.enabled())
          .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
        const seen = c.__seen || (c.__seen = new Set());
        const ordered = [...cands].sort((a, b) => {
          const sa = seen.has(a.id) ? 1 : 0, sb = seen.has(b.id) ? 1 : 0;
          return sa - sb || (a.priority ?? 3) - (b.priority ?? 3);
        });
        for (const it of ordered) {
          c.walker.position.copy(it.pos.clone().normalize().multiplyScalar(c.radius + 0.02));
          c.walker.sync(true);
          c._updateInteraction();
          if (c.nearest) { seen.add(c.nearest.id); return { id: c.nearest.id }; }
        }
        return null;
      })()`);
      if (!near || near.waiting) break;
      acts.push(near.id);
      await ev(`window.__game.chapter.interact()`);
      await sleep(420);
    }

    await drain();
    // B-612 结尾有一段 6.5 秒的日落动画，必须等它跑完再判定
    for (let i = 0; i < 24; i++) {
      const done = await ev(`(() => {
        const g = window.__game;
        if (!g.chapter) return true;
        return false;
      })()`);
      if (done) break;
      await sleep(500);
    }
    await sleep(1200);
    const res = await ev(`(() => {
      const g = window.__game;
      return { visited: g.progress.visited, mapVisible: !document.getElementById('map').hidden };
    })()`);
    return {
      chapter,
      ok: res.visited.includes(chapter),
      actions: acts,
      visited: res.visited,
      backToMap: res.mapVisible,
      errors,
      detail: await ev(`(() => {
        const c = window.__game.chapter;
        if (!c) return null;
        return { stage: c.stage, done: [...c.goalsDone], done6: !!c.sunsetDone, anim: !!c.sunAnim,
                 inter: c.interactables.map(i => i.id + (i.enabled && !i.enabled() ? '(off)' : '')),
                 nearest: c.nearest ? c.nearest.id : null, busy: c.busy };
      })()`),
    };
  } finally {
    try { ws.close(); } catch {}
    proc.kill();
  }
}

let failed = 0;
for (const c of CHAPTERS) {
  const r = await runOne(c);
  const mark = r.ok ? '✓' : '✗';
  if (!r.ok) failed++;
  console.log(
    `${mark} ${c.padEnd(9)} 交互=${(r.actions || []).length}  visited=${JSON.stringify(r.visited || [])}  ` +
      `回地图=${r.backToMap ?? '-'}  错误=${(r.errors || []).length}`
  );
  if (r.reason) console.log(`    ${r.reason}`);
  if (r.actions) console.log(`    动作: ${r.actions.join(' → ')}`);
  if (r.detail) console.log(`    终态: ${JSON.stringify(r.detail)}`);
  if (r.errors && r.errors.length) console.log('    ', r.errors[0]?.split('\n')[0]);
}

console.log(failed ? `\n${failed} 章未通过` : '\n全部 8 章通关');
process.exit(failed ? 1 : 0);
