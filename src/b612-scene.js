/**
 * B-612 的场景美术（只给第一章用，其他星球仍用 world.js 的通用件）。
 *
 * 参考图定调：一颗绿色草甸小行星 —— 草地、野花、苔石、土路、木栅栏围着的玫瑰、
 * 石座上的玻璃罩、爬藤工具棚、蓝色泉水池、望日落的椅子、石圈里的毯子、
 * 几株猴面包树幼苗、三座火山（两座活的冒烟），边缘露出岩壁，下方是云海。
 *
 * 约定：
 *   - b612HeightAt(dir) 返回「离基准球面 R 的米数」，可正可负；建网格、摆件、行走共用它
 *   - 摆件用 placeOnSphere(obj, dir, b612HeightAt(dir), R)
 *   - 这章的地面是草，不是沙：顶点色里没有大面积沙黄
 */
import * as THREE from 'three';
import { R } from './world.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- 方向
const dirOf = (az, lat) =>
  new THREE.Vector3(
    Math.cos((lat * Math.PI) / 180) * Math.cos((az * Math.PI) / 180),
    Math.sin((lat * Math.PI) / 180),
    Math.cos((lat * Math.PI) / 180) * Math.sin((az * Math.PI) / 180)
  ).normalize();

/** 各地点方向：章节逻辑、地形、小径共用同一份，避免对不上。 */
export const B612 = {
  spawn: dirOf(-60, -5),
  rose: dirOf(-35, -18),
  shed: dirOf(60, -38),
  can: dirOf(66, -40),
  spring: dirOf(120, -12),
  chair: dirOf(-120, 22),
  nook: dirOf(-152, -2),
  volcanoes: [
    { dir: dirOf(150, 32), scale: 1.0, alive: true },
    { dir: dirOf(196, 6), scale: 0.78, alive: true },
    { dir: dirOf(228, 44), scale: 0.56, alive: false },
  ],
};

/** 玫瑰边上的石座（放玻璃罩），离玫瑰 0.55 m */
export const GLOBE_DIR = (() => {
  const n = B612.rose.clone();
  const t = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
  return n.clone().addScaledVector(t, 0.55 / R).normalize();
})();

/** 玫瑰背后的木栅栏朝向（比玫瑰更靠「上坡」一点） */
export const FENCE_DIR = (() => {
  const n = B612.rose.clone();
  const up = new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3().crossVectors(up, n).normalize();
  return n.clone().addScaledVector(t, -0.9 / R).normalize();
})();

// ---------------------------------------------------------------- 地形高度
const FLATS = [
  { dir: B612.rose, w: 0.075, h: 0.02 },
  { dir: B612.shed, w: 0.09, h: 0.0 },
  { dir: B612.can, w: 0.045, h: 0.0 },
  { dir: B612.spring, w: 0.085, h: -0.01 },
  { dir: B612.chair, w: 0.07, h: 0.03 },
  { dir: B612.nook, w: 0.06, h: 0.01 },
];

const _n = new THREE.Vector3();

/** 地表相对 R 的高度（米）。同一个函数既用于建网格，也用于摆件和行走。 */
export function b612HeightAt(dir) {
  _n.copy(dir).normalize();
  const x = _n.x, y = _n.y, z = _n.z;
  // 三层正弦叠加：缓坡 + 草丘 + 细碎起伏，全部在 ±0.12 m 内，走起来不会绊脚
  let h =
    Math.sin(x * 2.1 + 1.7) * Math.cos(z * 1.9 - 0.6) * 0.5 +
    Math.sin(y * 3.1 + x * 1.3) * 0.3 +
    Math.sin(z * 5.3 - y * 2.4) * 0.12;
  h *= 0.12;
  for (const f of FLATS) {
    const ang = Math.acos(THREE.MathUtils.clamp(_n.dot(f.dir), -1, 1));
    if (ang < f.w) {
      const t = 1 - ang / f.w;
      h += (f.h - h) * (t * t * (3 - 2 * t));
    }
  }
  return h;
}

// ---------------------------------------------------------------- 小径
/** 出生点 → 玫瑰 → 工具棚 → 泉眼 → 椅子，按大圆弧插值成一串方向。 */
function buildPath() {
  const legs = [
    [B612.spawn, B612.rose, 10],
    [B612.rose, B612.shed, 14],
    [B612.shed, B612.can, 3],
    [B612.can, B612.spring, 16],
    [B612.spring, B612.chair, 22],
  ];
  const pts = [];
  for (const [a, b, n] of legs) {
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3().copy(a).lerp(b, i / n).normalize());
  }
  pts.push(B612.chair.clone());
  return pts;
}
const PATH = buildPath();
const PATH_COS = Math.cos(0.038); // 小径半宽约 R*0.038 ≈ 23 cm

function onPath(n, cos = PATH_COS) {
  for (let i = 0; i < PATH.length; i++) if (n.dot(PATH[i]) > cos) return true;
  return false;
}

// ---------------------------------------------------------------- 星球
const GRASS = new THREE.Color(0x7fa34d);
const GRASS_LIGHT = new THREE.Color(0xa8c56a);
const GRASS_DRY = new THREE.Color(0xb0aa62);
const MOSS = new THREE.Color(0x4f6e3a);
const DIRT = new THREE.Color(0xb5885a);
const DIRT_DARK = new THREE.Color(0x96703f);
const STONE = new THREE.Color(0x8b8174);
const STONE_DARK = new THREE.Color(0x5f554b);

function colorAt(n, h) {
  const c = new THREE.Color();
  // 草甸：三档绿交替，加一点点干草
  const g1 = Math.sin(n.x * 5.1 + n.z * 3.7) * 0.5 + Math.sin(n.y * 6.3 - n.x * 2.9) * 0.5;
  const g2 = Math.sin(n.z * 9.1 + n.y * 4.3) * 0.5 + 0.5;
  c.copy(GRASS).lerp(GRASS_LIGHT, THREE.MathUtils.clamp(g1 * 0.9 + 0.35, 0, 1) * 0.75);
  c.lerp(GRASS_DRY, Math.max(0, g2 - 0.62) * 0.5);
  // 泉眼附近更湿更深的苔色
  const dSpring = Math.acos(THREE.MathUtils.clamp(n.dot(B612.spring), -1, 1));
  if (dSpring < 0.16) c.lerp(MOSS, (1 - dSpring / 0.16) * 0.7);
  // 高处露出的岩石
  if (h > 0.055) c.lerp(STONE, Math.min(0.75, (h - 0.055) * 9));
  // 星球下半部：浮岛的岩壁
  if (n.y < -0.35) c.lerp(STONE_DARK, Math.min(0.9, (-0.35 - n.y) * 1.9));
  // 土路：中间踩实、两边过渡
  if (onPath(n)) c.lerp(DIRT, 0.82);
  else if (onPath(n, Math.cos(0.06))) c.lerp(DIRT_DARK, 0.35);
  return c;
}

/**
 * 星球本体：草甸起伏 + 顶点色 + 一层极淡的大气边光。
 * @returns {THREE.Group}  group.userData.planet 是地形网格
 */
export function makeB612Planet() {
  const group = new THREE.Group();
  // 用 SphereGeometry 而不是 Icosahedron：它是带索引的，computeVertexNormals 后是
  // 平滑法线（草甸要柔和的明暗过渡，不能有棱面）。
  const geo = new THREE.SphereGeometry(R, 160, 120);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  const col = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    const h = b612HeightAt(n);
    pos.setXYZ(i, n.x * (R + h), n.y * (R + h), n.z * (R + h));
    col.copy(colorAt(n, h));
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const planet = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 })
  );
  planet.receiveShadow = true;
  planet.castShadow = true;
  group.add(planet);

  // 浮岛底部：几块倒挂的岩锥，从星球边缘看下去像一座被拔起来的小岛
  const underMat = new THREE.MeshStandardMaterial({ color: 0x5b5148, roughness: 1, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.4;
    const dir = new THREE.Vector3(Math.cos(a) * 0.55, -0.82, Math.sin(a) * 0.55).normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42 - (i % 3) * 0.08, 1.5 - (i % 2) * 0.5, 5), underMat);
    cone.position.copy(dir).multiplyScalar(R * 0.97);
    // 圆锥的尖（+Y）朝外/朝下，宽底贴着地表
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.castShadow = false;
    group.add(cone);
  }

  // 大气边光：BackSide 薄壳，只在轮廓处透出一点暖色
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.02, 40, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffd6a2,
      transparent: true,
      opacity: 0.05,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  rim.name = 'atmosphere';
  group.add(rim);

  group.userData.planet = planet;
  return group;
}

// ---------------------------------------------------------------- 材质小工具
function m(color, rough = 0.92, metal = 0, extra = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: rough,
    metalness: metal,
    flatShading: true,
    emissive: c.clone().multiplyScalar(extra.emissive ?? 0.14),
    ...extra,
  });
}

function add(g, geo, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- 火山
export function makeB612Volcano(scale = 1, alive = true) {
  const g = new THREE.Group();
  const rock = m(0x5a4c3e, 1);
  const rockDark = m(0x3d332a, 1);
  const rimMat = m(0x6d5a49, 1);

  // 层状剖面：底部外扩，往上收成火山口
  const pts = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    const rr = (0.56 - 0.44 * Math.pow(t, 0.72)) * scale;
    pts.push(new THREE.Vector2(Math.max(0.055, rr), t * 0.6 * scale));
  }
  const cone = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), rock);
  cone.castShadow = true;
  cone.receiveShadow = true;
  g.add(cone);

  // 山脊：沿坡面加几道折线，破掉「圆筒」感
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const ridge = add(g, new THREE.ConeGeometry(0.07 * scale, 0.5 * scale, 4), rockDark,
      Math.cos(a) * 0.26 * scale, 0.2 * scale, Math.sin(a) * 0.26 * scale);
    ridge.rotation.z = Math.cos(a) * 0.35;
    ridge.rotation.x = -Math.sin(a) * 0.35;
    ridge.scale.set(1, 1, 0.7);
  }

  // 火山口：环 + 岩浆
  const rim = add(g, new THREE.TorusGeometry(0.115 * scale, 0.026 * scale, 6, 18), rimMat, 0, 0.595 * scale, 0);
  rim.rotation.x = Math.PI / 2;
  const magma = new THREE.Mesh(
    new THREE.CircleGeometry(0.1 * scale, 16),
    new THREE.MeshBasicMaterial({ color: alive ? 0xff7a35 : 0x2c2620 })
  );
  magma.rotation.x = -Math.PI / 2;
  magma.position.y = 0.585 * scale;
  g.add(magma);
  magma.userData.pulse = Math.random() * TAU;

  // 活火山：顺着坡面流一小段熔岩
  if (alive) {
    const flow = add(g, new THREE.ConeGeometry(0.03 * scale, 0.3 * scale, 4),
      new THREE.MeshBasicMaterial({ color: 0xff8a3d }), 0.14 * scale, 0.42 * scale, 0.02);
    flow.rotation.z = -0.42;
    flow.scale.set(1, 1, 0.5);
    g.userData.flow = flow;
  }

  // 烟：一小团缓慢旋转的点
  const smokeGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(22 * 3);
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * TAU;
    const r = Math.random() * 0.07 * scale;
    sp[i * 3] = Math.cos(a) * r;
    sp[i * 3 + 1] = (0.6 + Math.random() * 0.55) * scale;
    sp[i * 3 + 2] = Math.sin(a) * r;
  }
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const smoke = new THREE.Points(
    smokeGeo,
    new THREE.PointsMaterial({
      color: 0xd6ccbf,
      size: 0.16 * scale,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    })
  );
  smoke.userData.spin = 0.1 + Math.random() * 0.12;
  g.add(smoke);

  g.userData.magma = magma;
  g.userData.smoke = smoke;
  g.userData.rim = rim;
  return g;
}

// ---------------------------------------------------------------- 玫瑰
export function makeB612Rose() {
  const g = new THREE.Group();
  const green = m(0x3f6f3c, 0.95);
  const greenLight = m(0x5c8a4c, 0.95);

  // 微微弯的茎
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.01, 0.16, 0.006),
    new THREE.Vector3(-0.006, 0.32, 0.003),
    new THREE.Vector3(0, 0.46, 0),
  ]);
  add(g, new THREE.TubeGeometry(curve, 10, 0.017, 6, false), green);

  // 三片叶子：扁球压成叶片，带一点弧度
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4;
    const leaf = add(g, new THREE.SphereGeometry(0.075, 8, 6), i === 1 ? greenLight : green,
      Math.cos(a) * 0.07, 0.17 + i * 0.085, Math.sin(a) * 0.07);
    leaf.scale.set(1, 0.1, 0.42);
    leaf.rotation.y = -a;
    leaf.rotation.z = 0.42;
  }

  // 花冠：四层，外深内亮
  const flower = new THREE.Group();
  flower.position.y = 0.47;
  const rings = [
    { n: 6, r: 0.07, tilt: 1.16, col: 0x9c1a2e, y: 0.0, size: 0.06 },
    { n: 6, r: 0.054, tilt: 0.86, col: 0xbe2843, y: 0.022, size: 0.055 },
    { n: 5, r: 0.037, tilt: 0.6, col: 0xd63c56, y: 0.04, size: 0.048 },
    { n: 4, r: 0.023, tilt: 0.36, col: 0xea6a80, y: 0.054, size: 0.04 },
  ];
  for (const ring of rings) {
    const mat = m(ring.col, 0.72, 0, { emissive: 0.18 });
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * TAU + ring.y * 9;
      const p = add(flower, new THREE.SphereGeometry(ring.size, 7, 5, 0, TAU, 0, Math.PI * 0.62), mat,
        Math.cos(a) * ring.r, ring.y, Math.sin(a) * ring.r);
      p.scale.set(1, 0.34, 0.78);
      p.rotation.y = -a;
      p.rotation.x = -ring.tilt;
      p.rotation.z = 0.1;
    }
  }
  const core = add(flower, new THREE.SphereGeometry(0.026, 8, 6), m(0x7c1526, 0.8), 0, 0.055, 0);
  core.scale.y = 0.7;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const sep = add(flower, new THREE.ConeGeometry(0.02, 0.075, 4), greenLight, Math.cos(a) * 0.045, -0.02, Math.sin(a) * 0.045);
    sep.rotation.z = Math.cos(a) * 0.5;
    sep.rotation.x = -Math.sin(a) * 0.5;
  }
  g.add(flower);
  g.userData.flower = flower;

  // 刺
  const thornMat = m(0x2c4a2c, 1);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.9;
    const th = add(g, new THREE.ConeGeometry(0.008, 0.035, 4), thornMat, Math.cos(a) * 0.02, 0.1 + i * 0.06, Math.sin(a) * 0.02);
    th.rotation.z = -Math.cos(a) * 1.5;
    th.rotation.x = Math.sin(a) * 1.5;
  }

  // 脚下一小撮土 + 草
  add(g, new THREE.CylinderGeometry(0.11, 0.13, 0.03, 12), m(0x6b4f38, 1), 0, 0.008, 0).scale.y = 0.6;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const h = 0.08 + (i % 3) * 0.03;
    const b = add(g, new THREE.ConeGeometry(0.007, h, 3), i % 2 ? green : greenLight,
      Math.cos(a) * 0.13, h / 2, Math.sin(a) * 0.13);
    b.rotation.z = Math.cos(a) * 0.3;
    b.rotation.x = -Math.sin(a) * 0.3;
    b.castShadow = false;
  }
  return g;
}

// ---------------------------------------------------------------- 玻璃罩
export function makeB612Globe() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 20, 14, 0, TAU, 0, Math.PI * 0.62),
    new THREE.MeshPhysicalMaterial({
      color: 0xdff0ff,
      transparent: true,
      opacity: 0.17,
      roughness: 0.04,
      metalness: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    })
  );
  // _liftGlobe() 会淡出 children[0]，所以 dome 必须是第一个子节点
  dome.position.y = 0.62;
  g.add(dome);

  const rim = add(g, new THREE.TorusGeometry(0.228, 0.009, 6, 22), m(0xb08a4e, 0.35, 0.8), 0, 0.625, 0);
  rim.rotation.x = Math.PI / 2;
  return g;
}

/** 放玻璃罩的石座：底座 + 台面 + 一点苔痕 */
export function makeB612Pedestal() {
  const g = new THREE.Group();
  const stone = m(0x8e8678, 0.95);
  const stoneDark = m(0x6f675b, 0.95);
  add(g, new THREE.CylinderGeometry(0.16, 0.19, 0.05, 10), stoneDark, 0, 0.025, 0);
  add(g, new THREE.CylinderGeometry(0.13, 0.145, 0.16, 10), stone, 0, 0.13, 0);
  add(g, new THREE.CylinderGeometry(0.17, 0.16, 0.035, 10), stone, 0, 0.22, 0);
  // 苔
  for (let i = 0; i < 3; i++) {
    const a = i * 2.2;
    const mo = add(g, new THREE.SphereGeometry(0.045, 6, 4), m(0x5d7a3f, 0.95), Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14);
    mo.scale.set(1, 0.5, 1);
  }
  return g;
}

// ---------------------------------------------------------------- 木栅栏（玫瑰背后）
export function makeB612Fence() {
  const g = new THREE.Group();
  const wood = m(0x8a6a46, 0.95);
  const woodDark = m(0x6d5134, 0.95);
  // 竖板：做成一段矮篱，围着玫瑰后方
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * 1.15;
    const h = 0.34 + Math.sin(i * 1.7) * 0.03;
    const p = add(g, new THREE.BoxGeometry(0.075, h, 0.03), i % 2 ? wood : woodDark, t, h / 2, 0);
    p.rotation.z = Math.sin(i * 2.3) * 0.03;
  }
  // 两道横撑
  for (const y of [0.12, 0.26]) {
    const r = add(g, new THREE.BoxGeometry(1.2, 0.035, 0.022), woodDark, 0, y, -0.03);
    r.castShadow = true;
  }
  return g;
}

// ---------------------------------------------------------------- 工具棚
export function makeB612Shed() {
  const g = new THREE.Group();
  const wood = m(0x8a6544, 0.95);
  const woodDark = m(0x64482f, 0.95);
  const roof = m(0x5c4231, 0.98);
  const doorMat = m(0x54704c, 0.9);
  const vine = m(0x5d8244, 0.95);

  add(g, new THREE.BoxGeometry(0.5, 0.4, 0.42), wood, 0, 0.2, 0);
  for (let i = 0; i < 5; i++) {
    const x = -0.19 + i * 0.095;
    add(g, new THREE.BoxGeometry(0.012, 0.38, 0.008), woodDark, x, 0.2, 0.213);
    add(g, new THREE.BoxGeometry(0.012, 0.38, 0.008), woodDark, x, 0.2, -0.213);
  }
  // 门 + 门框 + 把手
  add(g, new THREE.BoxGeometry(0.17, 0.29, 0.02), doorMat, -0.03, 0.15, 0.215);
  add(g, new THREE.BoxGeometry(0.2, 0.32, 0.008), woodDark, -0.03, 0.15, 0.207);
  add(g, new THREE.SphereGeometry(0.012, 6, 5), m(0xd8b45a, 0.4, 0.7), 0.04, 0.145, 0.228);
  // 小窗（暖光）
  const pane = add(g, new THREE.BoxGeometry(0.11, 0.09, 0.01), m(0xffd9a0, 0.5, 0, { emissive: 0.9 }), 0.14, 0.27, 0.216);
  pane.castShadow = false;
  add(g, new THREE.BoxGeometry(0.13, 0.012, 0.012), woodDark, 0.14, 0.32, 0.22);
  add(g, new THREE.BoxGeometry(0.012, 0.11, 0.012), woodDark, 0.14, 0.27, 0.22);
  // 单坡屋顶（参考图是斜的一整片）+ 出檐
  const r = add(g, new THREE.BoxGeometry(0.62, 0.035, 0.52), roof, 0.01, 0.44, 0.02);
  r.rotation.x = 0.16;
  add(g, new THREE.BoxGeometry(0.64, 0.03, 0.06), woodDark, 0.01, 0.465, 0.27).rotation.x = 0.16;
  // 爬藤：几颗小绿球贴着墙角往上
  for (let i = 0; i < 7; i++) {
    const x = 0.23 + Math.sin(i * 1.9) * 0.03;
    const y = 0.06 + i * 0.055;
    const v = add(g, new THREE.SphereGeometry(0.035, 6, 5), vine, x, y, 0.2 + Math.cos(i * 1.3) * 0.03);
    v.scale.set(1, 0.8, 0.7);
    v.castShadow = false;
  }
  return g;
}

// ---------------------------------------------------------------- 泉眼
export function makeB612Spring() {
  const g = new THREE.Group();
  const stone = m(0x9a938a, 0.95);
  const stoneDark = m(0x726b62, 0.95);
  const mossMat = m(0x5d7a3f, 0.95);

  // 池底与水面
  add(g, new THREE.CylinderGeometry(0.3, 0.27, 0.04, 18), stoneDark, 0, -0.005, 0);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.29, 24),
    new THREE.MeshStandardMaterial({
      color: 0x69b6c8,
      roughness: 0.06,
      metalness: 0.35,
      transparent: true,
      opacity: 0.9,
      emissive: new THREE.Color(0x1d4a55),
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.022;
  g.add(water);
  g.userData.water = water;

  // 同心涟漪
  for (let i = 1; i <= 3; i++) {
    const ring = add(g, new THREE.TorusGeometry(0.09 * i, 0.006, 4, 20),
      new THREE.MeshBasicMaterial({ color: 0xd8f2f7, transparent: true, opacity: 0.32 - i * 0.06 }), 0, 0.028, 0);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    ring.userData.ringIndex = i;
    if (!g.userData.rings) g.userData.rings = [];
    g.userData.rings.push(ring);
  }

  // 石砌池沿 + 苔
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r = add(g, new THREE.DodecahedronGeometry(0.08, 0), i % 3 ? stone : stoneDark,
      Math.cos(a) * 0.33, 0.03, Math.sin(a) * 0.33);
    r.scale.set(1.2, 0.7, 1);
    r.rotation.set(a, a * 0.7, 0);
    if (i % 4 === 0) {
      const mo = add(g, new THREE.SphereGeometry(0.055, 6, 4), mossMat, Math.cos(a) * 0.36, 0.075, Math.sin(a) * 0.36);
      mo.scale.set(1, 0.4, 1);
      mo.castShadow = false;
    }
  }

  // 睡莲叶
  for (let i = 0; i < 4; i++) {
    const a = i * 1.9 + 0.5;
    const pad = add(g, new THREE.CircleGeometry(0.045, 8), m(0x4f7a3a, 0.9), Math.cos(a) * 0.16, 0.026, Math.sin(a) * 0.16);
    pad.rotation.x = -Math.PI / 2;
    pad.castShadow = false;
  }

  // 顺坡流下去的小溪：一条浅色水面
  const stream = add(g, new THREE.PlaneGeometry(0.16, 0.7, 1, 4), new THREE.MeshStandardMaterial({
    color: 0x7fc4d2, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.75,
  }), 0, 0.012, -0.62);
  stream.rotation.x = -Math.PI / 2;
  stream.castShadow = false;
  g.userData.stream = stream;

  // 芦苇
  for (let i = 0; i < 6; i++) {
    const a = 1.9 + i * 0.42;
    const h = 0.2 + (i % 3) * 0.06;
    const reed = add(g, new THREE.CylinderGeometry(0.005, 0.007, h, 4), m(0x6d7d3f, 0.95),
      Math.cos(a) * 0.36, h / 2, Math.sin(a) * 0.36);
    reed.rotation.z = Math.cos(a) * 0.12;
    if (i % 2 === 0) add(g, new THREE.CapsuleGeometry(0.012, 0.05, 2, 4), m(0x7a5a34, 0.95), Math.cos(a) * 0.36, h + 0.02, Math.sin(a) * 0.36);
  }
  return g;
}

// ---------------------------------------------------------------- 草丛 / 野花
export function makeB612Grass() {
  const g = new THREE.Group();
  const greens = [m(0x6d8b41, 0.95), m(0x8ea758, 0.95), m(0x5a6b36, 0.95)];
  const blades = 7 + Math.floor(Math.random() * 4);
  for (let i = 0; i < blades; i++) {
    const a = Math.random() * TAU;
    const rr = Math.random() * 0.09;
    const h = 0.1 + Math.random() * 0.1;
    const b = add(g, new THREE.ConeGeometry(0.008, h, 3), greens[i % 3],
      Math.cos(a) * rr, h / 2, Math.sin(a) * rr);
    b.rotation.z = Math.cos(a) * 0.28;
    b.rotation.x = -Math.sin(a) * 0.28;
    b.castShadow = false;
  }
  if (Math.random() < 0.45) {
    const a = Math.random() * TAU;
    const x = Math.cos(a) * 0.07, z = Math.sin(a) * 0.07;
    add(g, new THREE.CylinderGeometry(0.003, 0.003, 0.12, 3), greens[2], x, 0.06, z).castShadow = false;
    const petalCol = [0xf3ecdc, 0xf1c9d8, 0xe9d98a, 0xd9c8f0][Math.floor(Math.random() * 4)];
    for (let i = 0; i < 5; i++) {
      const p = add(g, new THREE.SphereGeometry(0.018, 5, 4), m(petalCol, 0.9), x, 0.12, z);
      p.scale.set(1, 0.35, 0.5);
      p.rotation.y = (i / 5) * TAU;
      p.position.x += Math.cos((i / 5) * TAU) * 0.016;
      p.position.z += Math.sin((i / 5) * TAU) * 0.016;
      p.castShadow = false;
    }
    add(g, new THREE.SphereGeometry(0.012, 6, 5), m(0xe8b83c, 0.8), x, 0.128, z).castShadow = false;
  }
  return g;
}

/** 苔石：低面数岩石 + 顶部苔盖，散布在草甸上 */
export function makeB612Boulder(scale = 1) {
  const g = new THREE.Group();
  const rock = m(0x8a8072, 1);
  const rockDark = m(0x6b6156, 1);
  const mossMat = m(0x5d7a3f, 0.98);
  const body = add(g, new THREE.DodecahedronGeometry(0.3 * scale, 0), rock, 0, 0.16 * scale, 0);
  body.scale.set(1.15, 0.8, 0.95);
  body.rotation.set(0.3, scale * 3.1, 0.15);
  const side = add(g, new THREE.DodecahedronGeometry(0.16 * scale, 0), rockDark, 0.24 * scale, 0.1 * scale, 0.06 * scale);
  side.scale.set(1, 0.8, 1);
  side.rotation.set(0.8, 1.2, 0.4);
  const cap = add(g, new THREE.SphereGeometry(0.3 * scale, 9, 6, 0, TAU, 0, Math.PI * 0.5), mossMat, 0, 0.24 * scale, 0);
  cap.scale.set(1.12, 0.42, 0.92);
  cap.castShadow = false;
  return g;
}

/** 野花：一个 InstancedMesh 铺满草甸（白 / 粉 / 黄 / 紫） */
export function makeB612Flowers(count = 260, seed = 11) {
  const geo = new THREE.IcosahedronGeometry(0.028, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const palette = [0xf7f2e4, 0xf3c3d4, 0xe8d27a, 0xcdb8ef, 0xf0a9b8];
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    // 撒在整颗星球上，但避开火山脚与泉眼水面
    let dir = null;
    for (let tries = 0; tries < 12; tries++) {
      const d = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (d.lengthSq() < 1e-4) continue;
      d.normalize();
      if (d.y < -0.55) d.y = -d.y; // 下半部不长花
      let blocked = Math.acos(THREE.MathUtils.clamp(d.dot(B612.spring), -1, 1)) < 0.1;
      for (const v of B612.volcanoes) {
        if (Math.acos(THREE.MathUtils.clamp(d.dot(v.dir), -1, 1)) < 0.13) blocked = true;
      }
      if (!blocked) {
        dir = d;
        break;
      }
    }
    if (!dir) dir = new THREE.Vector3(0, 1, 0);
    dummy.position.copy(dir).multiplyScalar(R + b612HeightAt(dir) + 0.02);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    dummy.rotateY(rnd() * TAU);
    const sc = 0.7 + rnd() * 0.8;
    dummy.scale.set(sc, sc * 0.55, sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.setHex(palette[Math.floor(rnd() * palette.length)]);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

// ---------------------------------------------------------------- 石圈与毯子（休息角）
export function makeB612Nook() {
  const g = new THREE.Group();
  const stone = m(0x8e8678, 0.95);
  const stoneDark = m(0x6f675b, 0.95);
  const mossMat = m(0x5d7a3f, 0.95);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const r = add(g, new THREE.DodecahedronGeometry(0.1, 0), i % 2 ? stone : stoneDark,
      Math.cos(a) * 0.42, 0.04, Math.sin(a) * 0.42);
    r.scale.set(1.15, 0.72, 1);
    r.rotation.set(a, a * 0.8, 0);
    if (i % 3 === 0) {
      const mo = add(g, new THREE.SphereGeometry(0.07, 6, 4), mossMat, Math.cos(a) * 0.46, 0.09, Math.sin(a) * 0.46);
      mo.scale.set(1, 0.4, 1);
      mo.castShadow = false;
    }
  }
  // 毯子 + 枕头：软软的一块
  const blanket = add(g, new THREE.BoxGeometry(0.34, 0.02, 0.46), m(0xe8d9bf, 0.95), 0, 0.012, 0);
  blanket.rotation.y = 0.2;
  const stripe = add(g, new THREE.BoxGeometry(0.34, 0.004, 0.06), m(0xb9705e, 0.95), 0, 0.024, 0.1);
  stripe.rotation.y = 0.2;
  const pillow = add(g, new THREE.SphereGeometry(0.1, 9, 6), m(0xf2e8d6, 0.98), 0, 0.03, -0.2);
  pillow.scale.set(1.15, 0.35, 0.7);
  pillow.castShadow = false;
  return g;
}

// ---------------------------------------------------------------- 猴面包树幼苗
export function makeBaobabSprout() {
  const g = new THREE.Group();
  const green = m(0x5c8a4c, 0.95);
  // 参考图里是「小萝卜一样」的球根 + 两片叶
  const bulb = add(g, new THREE.SphereGeometry(0.045, 7, 5), m(0x8a7a4a, 0.95), 0, 0.035, 0);
  bulb.scale.set(1, 0.85, 1);
  add(g, new THREE.CylinderGeometry(0.008, 0.012, 0.08, 4), m(0x6b7a3a, 0.95), 0, 0.1, 0);
  for (const s of [-1, 1]) {
    const leaf = add(g, new THREE.SphereGeometry(0.045, 7, 5), green, s * 0.04, 0.15, 0);
    leaf.scale.set(1.1, 0.16, 0.72);
    leaf.rotation.z = s * 0.55;
    leaf.castShadow = false;
  }
  return g;
}

// ---------------------------------------------------------------- 碎石（实例化）
export function makeB612Pebbles(count = 110, seed = 7) {
  const geo = new THREE.DodecahedronGeometry(0.032, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    const p = PATH[Math.floor(rnd() * PATH.length)];
    const side = new THREE.Vector3().crossVectors(p, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const off = (0.22 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1);
    const dir = p.clone().addScaledVector(side, off / R).normalize();
    dummy.position.copy(dir).multiplyScalar(R + b612HeightAt(dir) + 0.008);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    dummy.rotateY(rnd() * TAU);
    const sc = 0.5 + rnd() * 0.9;
    dummy.scale.set(sc, sc * 0.55, sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.setHSL(0.1, 0.1 + rnd() * 0.08, 0.4 + rnd() * 0.14);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

// ---------------------------------------------------------------- 萤火（夜晚的暖光点）
export function makeB612Fireflies(count = 30) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const base = [];
  let s = 3;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    const anchor = i % 2 ? B612.rose : B612.spring;
    const d = anchor.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.07)).normalize();
    const r = R + 0.14 + rnd() * 0.36;
    const p = d.multiplyScalar(r);
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    base.push({ p: p.clone(), ph: rnd() * TAU, sp: 0.3 + rnd() * 0.5 });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffe2a0,
    size: 0.055,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  pts.userData.base = base;
  return pts;
}
