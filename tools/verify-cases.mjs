/**
 * 无浏览器验证：直接跑真实模块（不依赖 DOM/WebGL 的部分）。
 * 相机与球面行走用真实的 PlanetWalker 代码，只是把 avatar 换成一个假的 Object3D 目标。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const R = 6.0;

// PlanetWalker 只用到 avatar.position / avatar.quaternion，用一个裸 Object3D 即可
async function makeWalker() {
  const { PlanetWalker } = await import('../src/planet-walker.js');
  const avatar = new THREE.Object3D();
  const w = new PlanetWalker(avatar, R, { standHeight: 0.02 });
  w.camDist = 4.2;
  return w;
}

test('球面行走：乱走 10 秒始终贴在球面上', async () => {
  const w = await makeWalker();
  const dt = 1 / 60;
  let worst = 0;
  for (let i = 0; i < 600; i++) {
    const a = i * 0.07;
    w.update(dt, { x: Math.cos(a), y: Math.sin(a) }, { x: 0, y: 0 }, false);
    worst = Math.max(worst, Math.abs(w.position.length() - (R + w.standHeight)));
  }
  assert.ok(worst < 1e-3, `离球面最远 ${worst}`);
  assert.ok(w.onGround, '应当在地面上');
});

test('球面行走：单步位移连续，不瞬移', async () => {
  const w = await makeWalker();
  const dt = 1 / 60;
  let prev = w.position.clone();
  let maxJump = 0;
  let total = 0;
  for (let i = 0; i < 900; i++) {
    w.update(dt, { x: 0, y: 1 }, { x: 0, y: 0 }, false);
    const d = w.position.distanceTo(prev);
    maxJump = Math.max(maxJump, d);
    total += d;
    prev = w.position.clone();
  }
  const expected = w.speed / 60;
  assert.ok(maxJump < expected * 2.2, `最大单步位移 ${maxJump.toFixed(4)} 超过预期 ${expected.toFixed(4)}`);
  assert.ok(total > 25, `总位移 ${total} 太小`);
});

test('球面行走：前进方向与相机朝向一致', async () => {
  const w = await makeWalker();
  const before = w.position.clone();
  const fwd = w.getCameraForward(new THREE.Vector3());
  w.update(1 / 60, { x: 0, y: 1 }, { x: 0, y: 0 }, false);
  const delta = w.position.clone().sub(before).normalize();
  const dot = delta.dot(fwd);
  assert.ok(dot > 0.9, `前进方向与相机夹角余弦 ${dot.toFixed(3)}`);
});

test('球面行走：站立时不下坠', async () => {
  const w = await makeWalker();
  for (let i = 0; i < 300; i++) w.update(1 / 60, { x: 0, y: 0 }, { x: 0, y: 0 }, false);
  assert.equal(w.velocityY, 0);
  assert.ok(Math.abs(w.position.length() - (R + w.standHeight)) < 1e-6);
});

test('球面行走：跳跃后能落回地面', async () => {
  const w = await makeWalker();
  w.update(1 / 60, { x: 0, y: 0 }, { x: 0, y: 0 }, true); // 起跳
  assert.ok(w.velocityY > 0, '起跳应有向上速度');
  let maxLen = 0;
  for (let i = 0; i < 240; i++) {
    w.update(1 / 60, { x: 0, y: 1 }, { x: 0, y: 0 }, false);
    maxLen = Math.max(maxLen, w.position.length());
    if (w.onGround && i > 5) break;
  }
  assert.ok(maxLen > R + 0.2, '应该真的跳起来了');
  assert.ok(w.onGround, '应该落回地面');
});

test('球面行走：绕到星球背面后法线与朝向仍然正确', async () => {
  const w = await makeWalker();
  for (let i = 0; i < 60 * 12; i++) w.update(1 / 60, { x: 0, y: 1 }, { x: 0, y: 0 }, false);
  const upDot = w.up.dot(w.position.clone().normalize());
  assert.ok(upDot > 0.999, `法线与位置不一致 ${upDot}`);
  const facing = w.getFacing(new THREE.Vector3());
  assert.ok(Math.abs(facing.dot(w.up)) < 0.05, `朝向不在切平面 ${facing.dot(w.up)}`);
});

test('相机：各种俯仰角下都不进入球体', async () => {
  const w = await makeWalker();
  const cam = new THREE.PerspectiveCamera(52, 1, 0.05, 1400);
  for (const pitch of [-0.35, -0.1, 0, 0.3, 0.5, 0.8, 1.05]) {
    for (const yaw of [0, 1.2, 3.0]) {
      w.camPitch = pitch;
      w.camYaw = yaw;
      w.updateCamera(cam, 1.0); // dt 很大 → 直接到位
      const r = cam.position.length();
      // 球面在 R=6，相机必须留在球外（留 0.25 余量给地表起伏 0.045 与近裁剪面）
      assert.ok(r > R + 0.25, `pitch=${pitch} yaw=${yaw} 相机在球内，半径 ${r.toFixed(3)}`);
      // 也不能贴脸：至少离角色 1.2
      assert.ok(cam.position.distanceTo(w.position) > 1.2, `pitch=${pitch} 相机距角色仅 ${cam.position.distanceTo(w.position).toFixed(3)}`);
    }
  }
});

test('相机：多帧收敛后仍稳定在球外', async () => {
  const w = await makeWalker();
  const cam = new THREE.PerspectiveCamera(52, 1, 0.05, 1400);
  w.camPitch = 1.05;
  let worst = Infinity;
  for (let i = 0; i < 120; i++) {
    w.update(1 / 60, { x: 0, y: 0.6 }, { x: 0.01, y: 0 }, false);
    w.updateCamera(cam, 1 / 60);
    worst = Math.min(worst, cam.position.length());
  }
  assert.ok(worst > R + 0.25, `最坏情况相机半径 ${worst.toFixed(3)}`);
});

test('对话逐字揭示：按时间推进，每字恰好揭示一次', () => {
  const text = '有一颗只比房子大一点的星球，上面住着一位小王子。';
  const total = [...text].length;
  let visible = 0;
  let timer = 0;
  const perChar = 62;
  const marks = [];
  for (let f = 0; f < 60 * 5; f++) {
    timer += (1 / 60) * 1000;
    const due = Math.min(total, Math.floor(timer / perChar));
    while (visible < due) {
      visible++;
      marks.push(f);
    }
    if (visible >= total) break;
  }
  assert.equal(visible, total);
  assert.equal(marks.length, total);
  for (let i = 1; i < marks.length; i++) assert.ok(marks[i] >= marks[i - 1]);
});

test('文案表：8 种语言、覆盖全部中文源句', async () => {
  const { readFileSync } = await import('node:fs');
  const table = JSON.parse(readFileSync('src/generated/strings.json', 'utf8'));
  const langs = Object.keys(table);
  assert.deepEqual(langs.sort(), ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'zh'].sort());
  const zh = Object.keys(table.zh);
  assert.ok(zh.length > 300, `中文源句只有 ${zh.length} 条`);
  for (const l of langs) {
    if (l === 'zh') continue;
    const missing = zh.filter((k) => !table[l][k]);
    assert.equal(missing.length, 0, `${l} 缺少 ${missing.length} 条`);
  }
  assert.equal(table.en['小王子'], 'The Little Prince');
  assert.equal(table.en['玫瑰花'], 'The Flower');
  assert.ok(table.ja['国王']);
  assert.ok(table.ko['星星。']);
});

test('星球数据：8 章齐全、地图坐标为归一化值', async () => {
  const { PLANETS, applyBuilt } = await import('../src/planets-data.js');
  applyBuilt(['b612', 'king']);
  assert.equal(PLANETS.length, 8);
  assert.deepEqual(
    PLANETS.map((p) => p.id),
    ['b612', 'king', 'vanity', 'bar', 'merchant', 'lamp', 'geo', 'earth']
  );
  for (const p of PLANETS) {
    assert.ok(p.x >= 0 && p.x <= 1, `${p.id} x 越界`);
    assert.ok(p.y >= 0 && p.y <= 1, `${p.id} y 越界`);
    assert.ok(p.name && p.intro && p.tagline, `${p.id} 文案缺失`);
  }
  const built = PLANETS.filter((p) => p.built);
  assert.ok(built.length >= 1, '至少要有一章可玩');
  assert.ok(
    built.every((p) => !p.built || p.id),
    '有星球缺 id'
  );
});

test('每颗星球的缩略图与字体都存在', async () => {
  const { existsSync } = await import('node:fs');
  const { PLANETS } = await import('../src/planets-data.js');
  for (const p of PLANETS) {
    assert.ok(existsSync(`public/assets/img/planets/${p.thumb}.webp`), `${p.id} 缺缩略图`);
  }
  assert.ok(existsSync('public/assets/img/ui/journey-map.webp'));
  for (const f of ['serif-400', 'serif-600', 'serif-400-italic']) {
    assert.ok(existsSync(`public/assets/fonts/${f}.woff2`), `缺字体 ${f}`);
  }
});

test('相机：俯视时角色仍完整落在画面内（曾经脚部掉出屏幕）', async () => {
  const w = await makeWalker();
  const cam = new THREE.PerspectiveCamera(52, 393 / 852, 0.05, 1400);
  cam.position.copy(w.position).addScaledVector(w.up, 3);
  const dt = 1 / 60;
  // 角色 NDC 由相机投影得出，和运行时一致
  for (const pitch of [-0.35, 0, 0.35, 0.7, 1.05]) {
    w.camPitch = pitch;
    for (let i = 0; i < 90; i++) w.updateCamera(cam, dt);
    cam.updateMatrixWorld();
    const feet = w.position.clone().project(cam);
    const head = w.position.clone().addScaledVector(w.up, 0.95).project(cam);
    assert.ok(
      feet.y > -1.0 && head.y < 1.0,
      `pitch=${pitch} 角色出画：脚 y=${feet.y.toFixed(2)} 头 y=${head.y.toFixed(2)}`
    );
    assert.ok(cam.position.length() > R + 0.25, `pitch=${pitch} 相机进球体`);
  }
});

test('相机：挂在倾斜+自转的 root 下仍然把角色留在画面中央', async () => {
  // 复现曾经的真实缺陷：角色在 root 局部坐标里，相机若留在世界坐标，
  // root 的静态倾斜（各章 0.05–0.2 rad）与自转会让角色真实位置偏出画面，
  // 而内部所有指标（本地 NDC）都显示「完美居中」，因此极难发现。
  const w = await makeWalker();
  const root = new THREE.Group();
  root.rotation.z = 0.16;
  root.add(w.avatar);
  const cam = new THREE.PerspectiveCamera(52, 393 / 852, 0.05, 1400);
  root.add(cam); // 关键：相机与角色同挂 root
  const dt = 1 / 60;
  for (const yaw of [0, 0.9, 2.4, 4.1]) {
    root.rotation.y = yaw;
    for (let i = 0; i < 60; i++) w.updateCamera(cam, dt);
    root.updateMatrixWorld(true);
    cam.updateMatrixWorld();
    const n = w.position.clone().applyMatrix4(root.matrixWorld).project(cam);
    assert.ok(
      Math.abs(n.x) < 0.25 && n.y > -0.75 && n.y < 0.15,
      `root.y=${yaw} 角色偏出画面：NDC (${n.x.toFixed(2)}, ${n.y.toFixed(2)})`
    );
    const camWorld = new THREE.Vector3();
    cam.getWorldPosition(camWorld);
    const d = camWorld.distanceTo(w.position.clone().applyMatrix4(root.matrixWorld));
    assert.ok(d > 1.2 && d < 6, `root.y=${yaw} 相机到角色距离异常 ${d.toFixed(2)}`);
  }
});

test('构建产物：所有引用都是相对当前目录，不出现 ../ 越界', async () => {
  const { readFileSync } = await import('node:fs');
  // dist 是平铺目录：CSS/JS/字体/图片都在同一层或 ./assets 下，
  // 一旦出现 "../" 就会 404（曾经 CSS 写成 ../app.css 导致整站无样式）
  const html = readFileSync('dist/index.html', 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, 'HTML 里没有找到任何引用');
  for (const r of refs) {
    assert.ok(!r.startsWith('/'), `绝对路径在子目录部署会失效：${r}`);
    assert.ok(!r.includes('..'), `出现越界相对路径：${r}`);
    assert.ok(!r.includes('/src/'), `未替换的开发路径：${r}`);
  }
  const exists = (await import('node:fs')).existsSync;
  for (const r of refs) {
    const p = 'dist/' + r.replace(/^\.\//, '');
    assert.ok(exists(p), `引用指向不存在的文件：${r}`);
  }
  const css = readFileSync('dist/app.css', 'utf8');
  for (const m of css.matchAll(/url\('([^']+)'\)/g)) {
    assert.ok(!m[1].includes('..'), `CSS 里出现越界路径：${m[1]}`);
    assert.ok(exists('dist/' + m[1].replace(/^\.\//, '')), `CSS 引用不存在：${m[1]}`);
  }
});

test('章节注册表：每个已注册星球都有对应章节类，且 built 标记一致', async () => {
  // 注意：不要 import chapters/index.js —— 它会连带引入 i18n.js 里的
  // `import strings from './generated/strings.json'`，而 Node 要求 JSON 必须带
  // `with { type: 'json' }` 属性，浏览器端不需要。所以这里改为静态扫源码，
  // 用最朴素的方式确认「注册表里列出的 id」与「planets-data 的 id」对得上。
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/chapters/index.js', 'utf8');
  const block = src.match(/CHAPTERS\s*=\s*\{([\s\S]*?)\}/);
  assert.ok(block, 'chapters/index.js 里找不到 CHAPTERS 定义');
  const ids = [...block[1].matchAll(/([a-z0-9_]+)\s*:/g)].map((m) => m[1]).filter((k) => k !== 'type');
  assert.ok(ids.length >= 1, '至少要有一章');

  const { PLANETS, applyBuilt } = await import('../src/planets-data.js');
  for (const id of ids) {
    assert.ok(
      PLANETS.some((p) => p.id === id),
      `注册表里的 ${id} 不在星球数据里`
    );
    assert.ok(
      readFileSync('src/chapters/index.js', 'utf8').includes('Chapter'),
      '注册表应引用章节类'
    );
  }
  applyBuilt(ids);
  for (const p of PLANETS) {
    assert.equal(p.built, ids.includes(p.id), `${p.id} 的 built 标记与注册表不一致`);
  }
});

test('星球道具：构造器都能创建出有效 Group', async () => {
  const w = await import('../src/world.js');
  const makers = [
    'makeThrone', 'makeCape', 'makeStreetLamp', 'makeBarrel', 'makeBottle',
    'makeLedger', 'makeTelescope', 'makeRock', 'makeSparkles',
    'makePlanet', 'makeVolcano', 'makeRose', 'makeGlassGlobe', 'makeChair',
    'makeWateringCan', 'makeShed', 'makeSpring', 'makeGrassPatch',
  ];
  for (const name of makers) {
    assert.equal(typeof w[name], 'function', `缺少 ${name}`);
    const obj = w[name]();
    assert.ok(obj && obj.isObject3D, `${name} 没有返回 Object3D`);
  }
});

test('资源预算：首屏 <= 8 MB', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else total += statSync(p).size;
    }
  };
  walk('dist/assets');
  for (const f of ['dist/app.js', 'dist/three.js', 'dist/app.css', 'dist/index.html']) {
    try {
      total += statSync(f).size;
    } catch {
      /* 可选文件 */
    }
  }
  const mb = total / 1048576;
  assert.ok(mb < 8, `首屏总大小 ${mb.toFixed(2)} MB 超过 8 MB 预算`);
  console.log(`    首屏实际 ${mb.toFixed(2)} MB`);
});
