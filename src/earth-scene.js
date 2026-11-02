/**
 * 第八章 地球：全部场景与建模代码。
 * 一条 214 米长的沙路横穿星球，从落地点一直走到坠机处；
 * 沿途依次是蛇、小花、雪山、玫瑰园、狐狸、车站与火车、麦田与稻草人、
 * 卖药片的商摊、水井、飞机。尺度按「漫长旅途」设计，不是一圈小景。
 *
 * 坐标系（placeByRoute）：物体的局部 +X 沿路方向，+Z 朝向小径，
 * 所以所有模型都按「正面朝 +Z」来搭。
 */
import * as THREE from 'three';
import { makeRock, placeOnSphere } from './world.js';

export const R = 100.0;

/** 路线方向：沿赤道前进 distance 米，side 为横向偏移（米，正为路线右侧）。 */
export function routeDir(distance, side = 0) {
  const angle = distance / R;
  const forward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  return forward.multiplyScalar(Math.cos(side / R)).add(new THREE.Vector3(0, Math.sin(side / R), 0)).normalize();
}

/** 把物体立在路线旁并朝向小径。 */
export function placeByRoute(obj, distance, side, radius = R) {
  const n = routeDir(distance, side);
  const a = distance / radius;
  const t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
  t.addScaledVector(n, -t.dot(n)).normalize();
  const z = new THREE.Vector3().crossVectors(t, n);
  if (side < 0) { t.negate(); z.negate(); }
  obj.position.copy(n).multiplyScalar(radius);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, n, z));
  return n;
}

/** 整条旅途的坐标表（米）。改这里就能整体挪动某个事件区。 */
export const EARTH = {
  start: { d: 0, s: 0 },
  snake: { d: 13, s: 1.6 },
  flower: { d: 29, s: -2.0 },
  mountain: { d: 48, s: -46, h: 26 },
  echo: { d: 47, s: -2.2 },
  garden: { d: 74, s: -14, w: 34, l: 24 },
  gardenGate: { d: 74, s: -1.9 },
  fox: { d: 106, s: 2.0 },
  station: { d: 132, s: -8.8 },
  platform: { d: 134, s: -4.6 },
  train: { d: 131, s: -8.6 },
  wheat: { d: 152, s: -30, w: 34, l: 26 },
  scarecrow: { d: 150, s: -26 },
  merchant: { d: 168, s: 3.4 },
  well: { d: 192, s: -3.2 },
  plane: { d: 214, s: 4.2 },
  pilot: { d: 214.6, s: 6.4 },
};

// ---------------------------------------------------------------- 基础工具

const MATS = new Map();
/** 材质缓存：同一颜色/粗糙度只建一份，章节释放时统一 dispose。 */
export function M(color, roughness = 0.92, metalness = 0, extra) {
  const key = `${color}|${roughness}|${metalness}|${extra ? JSON.stringify(extra) : ''}`;
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, ...(extra || {}) });
    MATS.set(key, m);
  }
  return m;
}

/** 自发光材质（灯、窗、岩浆等），单独存，避免和普通材质混淆。 */
export function E(color, intensity = 1, opacity = 1) {
  const key = `e:${color}|${intensity}|${opacity}`;
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: 0.6, metalness: 0,
      emissive: new THREE.Color(color).multiplyScalar(intensity),
      emissiveIntensity: 1,
      transparent: opacity < 1, opacity,
      flatShading: true,
    });
    MATS.set(key, m);
  }
  return m;
}

export function B(parent, size, pos, material, ry = 0, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.y = ry;
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  parent.add(mesh);
  return mesh;
}

export function C(parent, rTop, rBot, h, seg, pos, material, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  parent.add(mesh);
  return mesh;
}

export function S(parent, r, pos, material, scale = [1, 1, 1], detail = 0) {
  const geo = detail ? new THREE.IcosahedronGeometry(r, detail) : new THREE.SphereGeometry(r, 8, 6);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 批量实例：items = [{ p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz], c:color }] */
export function inst(parent, geometry, material, items, shadow = false) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  const useColor = items.some((it) => it.c != null);
  if (useColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 3), 3);
  const col = new THREE.Color();
  items.forEach((it, i) => {
    if (it.m) {
      mesh.setMatrixAt(i, it.m);
    } else {
      dummy.position.set(it.p[0], it.p[1], it.p[2]);
      const r = it.r || [0, 0, 0];
      dummy.rotation.set(r[0], r[1], r[2]);
      const s = it.s || [1, 1, 1];
      dummy.scale.set(s[0], s[1], s[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    if (useColor) {
      col.set(it.c == null ? 0xffffff : it.c);
      mesh.instanceColor.setXYZ(i, col.r, col.g, col.b);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (useColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  mesh.frustumCulled = false; // 实例跨很大范围，包围盒不准
  parent.add(mesh);
  return mesh;
}

/** 确定性随机（同一 seed 每次布局一致，方便回归测试）。 */
export function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 在路线两侧撒点，返回 [{ d, s }]。 */
export function scatter(random, count, dMin, dMax, sMin, sMax) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({ d: dMin + random() * (dMax - dMin), s: sMin + random() * (sMax - sMin) });
  }
  return list;
}

// ---------------------------------------------------------------- 球面贴地工具

/** 球面上的一小块曲面（圆盘），比平面圆盘贴地，不会在边缘悬空。 */
export function capMesh(dir, radiusMeters, color, lift = 0.012) {
  const angle = Math.min(1.3, radiusMeters / R);
  const geo = new THREE.SphereGeometry(R + lift, 30, 9, 0, Math.PI * 2, 0, angle);
  const mesh = new THREE.Mesh(geo, M(color, 1));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  mesh.receiveShadow = true;
  return mesh;
}

/** frameAt 的一件：位置 + 朝向 + 缩放，用于实例化。 */
export function FS(F, lx, ly, lz, sx = 1, sy = 1, sz = 1, ry = 0) {
  const m = F.mat(lx, ly, lz, ry);
  if (sx !== 1 || sy !== 1 || sz !== 1) m.multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
  return m;
}

/** 实例化材质：颜色交给 instanceColor，基色必须为白。 */
export function IM(roughness = 0.92, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness, flatShading: true });
}

/**
 * 以路线上的 (centerD, centerS) 为原点，建立一个「沿球面」的局部坐标系：
 * lx 沿路方向、lz 横向（正为朝小径）、ly 为离地高度（米）。
 * 所有大型建筑都通过它逐件摆放，保证每一件都立在地面上而不是切平面里。
 */
export function frameAt(centerD, centerS) {
  const n = routeDir(centerD, centerS);
  const a = centerD / R;
  const t = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
  t.addScaledVector(n, -t.dot(n)).normalize();
  const zAxis = new THREE.Vector3().crossVectors(t, n).normalize();
  if (centerS < 0) { t.negate(); zAxis.negate(); }
  const Y = new THREE.Vector3(0, 1, 0);
  const api = {
    n: n.clone(),
    X: t.clone(),
    Z: zAxis.clone(),
    dir(lx, lz) {
      return n.clone().addScaledVector(t, lx / R).addScaledVector(zAxis, lz / R).normalize();
    },
    quat(lx, lz, ry = 0) {
      const up = api.dir(lx, lz);
      const zz = zAxis.clone().addScaledVector(up, -zAxis.dot(up)).normalize();
      const xx = new THREE.Vector3().crossVectors(up, zz).normalize(); // 右手系：X × Y = Z
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, up, zz));
      if (ry) q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, ry));
      return q;
    },
    mat(lx, ly, lz, ry = 0) {
      const up = api.dir(lx, lz);
      return new THREE.Matrix4().compose(up.multiplyScalar(R + ly), api.quat(lx, lz, ry), new THREE.Vector3(1, 1, 1));
    },
    place(obj, lx, ly, lz, ry = 0) {
      api.mat(lx, ly, lz, ry).decompose(obj.position, obj.quaternion, obj.scale);
      return obj;
    },
  };
  return api;
}

// ---------------------------------------------------------------- 地面与路

/** 地表色带：让 214 米的路上有「换了地方」的感觉。 */
export function makeGroundPatches() {
  const g = new THREE.Group();
  const bands = [
    { d: 16, s: 0, r: 26, c: 0xd9bd83 },
    { d: 44, s: -14, r: 30, c: 0xcdb27a },
    { d: 72, s: -14, r: 26, c: 0xc4b982 },
    { d: 104, s: 4, r: 26, c: 0xd6bb84 },
    { d: 134, s: -8, r: 26, c: 0xc9b47e },
    { d: 158, s: -26, r: 30, c: 0xd3b877 },
    { d: 186, s: 0, r: 26, c: 0xdcc08a },
    { d: 210, s: 6, r: 26, c: 0xd0b078 },
  ];
  for (const b of bands) {
    g.add(capMesh(routeDir(b.d, b.s), b.r, b.c, 0.006));
  }
  return g;
}

/** 小径的横向摆动（石板路与路标共用同一曲线）。 */
export function pathSide(d) {
  return Math.sin(d * 0.055) * 1.7 + Math.sin(d * 0.021 + 1.3) * 0.9;
}

/**
 * 小径：一整条贴着地面的沙土小路（不再是凸起的石板）。
 * 用沿路线采样的带状网格，宽度 1.6 m，比地面色带高 2 cm 避免 z-fighting；
 * 中间略深、两侧略浅，看起来像被踩实的一条路。
 */
export function makePath() {
  const g = new THREE.Group();
  const HALF = 0.8;          // 半宽（米）
  const STEP = 0.6;          // 采样步长（米）
  const LIFT = 0.02;         // 抬离地面，避免与地面色带打架
  const random = rng(5);
  const base = new THREE.Color(0xa98f66); // 踩实的土路：比四周沙地深一档，远看也认得出
  const pos = [];
  const col = [];
  const idx = [];
  const edgeLift = new THREE.Vector3();
  let row = 0;
  for (let d = 0; d <= 216.001; d += STEP) {
    const side = pathSide(d);
    const jitter = (random() - 0.5) * 0.12;            // 路面宽度轻微起伏
    const l = routeDir(d, side - HALF + jitter);
    const r = routeDir(d, side + HALF + jitter);
    const shade = 0.92 + Math.sin(d * 0.19) * 0.05 + (random() - 0.5) * 0.04;
    for (const n of [l, r]) {
      edgeLift.copy(n).multiplyScalar(R + LIFT);
      pos.push(edgeLift.x, edgeLift.y, edgeLift.z);
      col.push(base.r * shade, base.g * shade, base.b * shade);
    }
    if (row > 0) {
      const a = (row - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    row++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  // 绕序修正：球面上的带状网格如果整体绕反了，会被背面剔除——路就「消失」了。
  // 按三角形质心处的几何法线与向外的径向比较，整体反过来（不改单点法线，否则会撕裂）。
  const a1 = new THREE.Vector3(), b1 = new THREE.Vector3(), c1 = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrmT = new THREE.Vector3();
  let inward = 0;
  const tri = idx.length / 3;
  for (let t = 0; t < tri; t++) {
    const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
    a1.set(pos[i0], pos[i0 + 1], pos[i0 + 2]);
    b1.set(pos[i1], pos[i1 + 1], pos[i1 + 2]);
    c1.set(pos[i2], pos[i2 + 1], pos[i2 + 2]);
    ab.subVectors(b1, a1); ac.subVectors(c1, a1);
    nrmT.crossVectors(ab, ac);
    const center = a1.clone().add(b1).add(c1).normalize();
    if (nrmT.dot(center) < 0) inward++;
  }
  if (inward > tri / 2) {
    for (let t = 0; t < tri; t++) {
      const tmp = idx[t * 3 + 1];
      idx[t * 3 + 1] = idx[t * 3 + 2];
      idx[t * 3 + 2] = tmp;
    }
    geo.setIndex(idx);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.97, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const ribbon = new THREE.Mesh(geo, mat);
  ribbon.receiveShadow = true;
  g.add(ribbon);

  // 路两旁的细碎砾石，只做质感，不挡路
  const chips = [];
  for (let d = 0.8; d < 216; d += 1.1) {
    if (random() > 0.55) continue;
    const side = pathSide(d) + (random() > 0.5 ? 1 : -1) * (1.1 + random() * 1.1);
    const cn = routeDir(d + random() * 0.8 - 0.4, side);
    chips.push({
      p: [cn.x * R, cn.y * R, cn.z * R],
      r: [random() * 3, random() * 3, random() * 3],
      s: [0.07 + random() * 0.1, 0.05, 0.07 + random() * 0.1],
    });
  }
  const chipGeo = new THREE.DodecahedronGeometry(1, 0);
  inst(g, chipGeo, new THREE.MeshStandardMaterial({ color: 0xa79572, roughness: 1, flatShading: true }), chips, false);
  return g;
}

/** 沿路的石堆路标（每 17 米一堆），强化「走了很久」。 */
export function makeCairns() {
  const g = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const items = [];
  for (let d = 18; d < 210; d += 17) {
    const wobble = Math.sin(d * 0.055) * 1.7 + Math.sin(d * 0.021 + 1.3) * 0.9;
    const side = wobble + (d % 34 < 17 ? 1.5 : -1.5);
    const n = routeDir(d, side);
    const base = new THREE.Vector3(n.x * R, n.y * R, n.z * R);
    const up = n;
    for (let i = 0; i < 4; i++) {
      const s = 0.34 - i * 0.06;
      items.push({
        p: [base.x + up.x * (s * 0.6 + i * 0.24), base.y + up.y * (s * 0.6 + i * 0.24), base.z + up.z * (s * 0.6 + i * 0.24)],
        r: [i * 0.7, i * 1.1, i * 0.4],
        s: [s, s * 0.62, s * 0.9],
      });
    }
  }
  inst(g, geo, new THREE.MeshStandardMaterial({ color: 0x9d8b64, roughness: 1, flatShading: true }), items, true);
  return g;
}

/** 段式木栅栏：只在几段路上出现，避免全程雷同。 */
export function makeRopeFence() {
  const g = new THREE.Group();
  const postMat = M(0x7d6242);
  const ropeMat = M(0xbb9a63);
  const spans = [[22, 40, -4.2], [62, 66, 3.6], [96, 104, -3.4], [176, 186, 3.4]];
  for (const [d0, d1, side] of spans) {
    const step = 2.4;
    for (let d = d0; d <= d1; d += step) {
      const n = routeDir(d, side);
      const post = C(g, 0.06, 0.07, 0.9, 5, [n.x * R, n.y * R + 0.45, n.z * R], postMat, false);
      const up = n;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      post.quaternion.copy(q);
      if (d + step <= d1) {
        const n2 = routeDir(d + step, side);
        const a = new THREE.Vector3(n.x * R, n.y * R + 0.72, n.z * R);
        const b = new THREE.Vector3(n2.x * R, n2.y * R + 0.72, n2.z * R);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = a.distanceTo(b);
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 4), ropeMat);
        rope.position.copy(mid);
        rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.add(rope);
      }
    }
  }
  return g;
}

/** 散落岩石：大块放在远处做剪影，小块点缀路边。 */
export function makeRockField() {
  const g = new THREE.Group();
  const random = rng(77);
  const near = scatter(random, 46, 2, 212, -6.5, 6.5).filter((p) => Math.abs(p.s) > 2.4);
  for (const p of near) {
    const rock = makeRock(0.42 + random() * 0.5);
    placeOnSphere(rock, routeDir(p.d, p.s), -0.05, R);
    rock.rotation.y = random() * 6.28;
    g.add(rock);
  }
  const far = scatter(random, 26, 10, 220, -70, -22);
  for (const p of far) {
    const rock = makeRock(2.2 + random() * 3.4);
    placeOnSphere(rock, routeDir(p.d, p.s), -0.3, R);
    rock.rotation.y = random() * 6.28;
    g.add(rock);
  }
  const farRight = scatter(random, 16, 10, 220, 26, 70);
  for (const p of farRight) {
    const rock = makeRock(1.8 + random() * 2.6);
    placeOnSphere(rock, routeDir(p.d, p.s), -0.3, R);
    g.add(rock);
  }
  return g;
}

/** 沙丘：贴地的扁球，让平坦的星球有点起伏感。 */
export function makeDunes() {
  const g = new THREE.Group();
  const random = rng(31);
  const duneMat = M(0xd3b57e, 1);
  const list = scatter(random, 30, 6, 214, -60, -8).concat(scatter(random, 18, 6, 214, 12, 58));
  for (const p of list) {
    const n = routeDir(p.d, p.s);
    const dune = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), duneMat);
    const w = 3.5 + random() * 6;
    dune.scale.set(w, 0.5 + random() * 0.9, w * (0.6 + random() * 0.5));
    dune.position.set(n.x * R, n.y * R - 0.15, n.z * R);
    dune.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    dune.receiveShadow = true;
    g.add(dune);
  }
  return g;
}

/** 干枯灌木与枯树，点缀旅途。 */
export function makeDryBrush() {
  const g = new THREE.Group();
  const random = rng(43);
  const twigMat = M(0x8a7350);
  const bushItems = [];
  for (const p of scatter(random, 60, 4, 214, -50, -8).concat(scatter(random, 40, 4, 214, 8, 46))) {
    const n = routeDir(p.d, p.s);
    const s = 0.3 + random() * 0.5;
    for (let i = 0; i < 5; i++) {
      const a = random() * 6.28;
      bushItems.push({
        p: [n.x * R + Math.cos(a) * s * 0.35, n.y * R + 0.12 + random() * 0.3, n.z * R + Math.sin(a) * s * 0.35],
        r: [0.5 + random() * 0.7, a, 0.4 + random() * 0.8],
        s: [s * 0.9, s * 0.24, s * 0.9],
        c: random() > 0.5 ? 0x8f7b53 : 0x9c8259,
      });
    }
  }
  inst(g, new THREE.ConeGeometry(1, 1, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, vertexColors: false }), bushItems, false);

  // 枯树：主干 + 三四根歪枝
  const bare = [[36, -9], [88, 12], [120, -8], [164, 10], [198, -12]];
  for (const [d, s] of bare) {
    const tree = new THREE.Group();
    const h = 3.4 + random() * 1.6;
    C(tree, 0.12, 0.28, h, 6, [0, h / 2, 0], twigMat, true);
    for (let i = 0; i < 4; i++) {
      const a = random() * 6.28;
      const bh = h * (0.5 + random() * 0.4);
      const branch = C(tree, 0.05, 0.1, 1.6 + random(), 5, [Math.cos(a) * 0.5, bh, Math.sin(a) * 0.5], twigMat, false);
      branch.rotation.set(0.6 + random() * 0.5, a, 0.5 + random() * 0.6);
    }
    placeOnSphere(tree, routeDir(d, s), 0, R);
    g.add(tree);
  }
  return g;
}

/** 棕榈：井边的绿洲感。 */
export function makePalmTree(height = 4.2, lean = 0.16) {
  const g = new THREE.Group();
  const trunkMat = M(0x8d7448);
  const leafMat = M(0x6f8f45, 0.95);
  const trunk = C(g, 0.14, 0.26, height, 6, [0, height / 2, 0], trunkMat);
  trunk.rotation.z = lean;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.3, 4), leafMat);
    leaf.position.set(Math.cos(a) * 0.75, height - 0.1, Math.sin(a) * 0.75);
    leaf.rotation.set(Math.PI / 2 - 0.55, -a, 0);
    leaf.castShadow = true;
    g.add(leaf);
  }
  S(g, 0.18, [0, height - 0.16, 0], M(0x7d6b3f), [1, 0.6, 1]);
  return g;
}

// ---------------------------------------------------------------- 道具模型

/** 蛇：盘在砂岩上的金色蛇，抬头。 */
export function makeSnake() {
  const g = new THREE.Group();
  const rock = makeRock(1.15);
  rock.scale.set(1.5, 0.75, 1.3);
  rock.position.y = 0.1;
  g.add(rock);
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8c25a, roughness: 0.35, metalness: 0.55, flatShading: true });
  // 盘绕的曲线
  const pts = [];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const a = t * Math.PI * 3.2;
    const r = 0.72 - t * 0.42;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.28 + t * 0.16, Math.sin(a) * r));
  }
  const body = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.075, 6, false), gold);
  body.castShadow = true;
  g.add(body);
  const neck = C(g, 0.055, 0.075, 0.42, 6, [0.35, 0.68, 0.1], gold);
  neck.rotation.set(-0.35, 0, -0.5);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), gold);
  head.scale.set(1.5, 0.85, 1);
  head.position.set(0.52, 0.86, 0.24);
  head.castShadow = true;
  g.add(head);
  const eyeMat = M(0x2a1c10, 0.4);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), eyeMat);
    eye.position.set(0.58, 0.9, 0.24 + sx * 0.05);
    g.add(eye);
  }
  const tongue = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.16, 4), M(0xb2453f));
  tongue.position.set(0.66, 0.85, 0.24);
  tongue.rotation.z = Math.PI / 2;
  g.add(tongue);
  return g;
}

/** 三瓣小花：原著里那朵「人没有根」的花。 */
export function makeThreePetalFlower() {
  const g = new THREE.Group();
  const stemMat = M(0x5f7f3c);
  C(g, 0.018, 0.026, 0.4, 5, [0, 0.2, 0], stemMat, false);
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.7, emissive: 0x332f26, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), petalMat);
    petal.scale.set(1, 0.5, 1.35);
    petal.position.set(Math.cos(a) * 0.09, 0.43, Math.sin(a) * 0.09);
    petal.rotation.set(0.5, -a, 0);
    petal.castShadow = true;
    g.add(petal);
  }
  S(g, 0.05, [0, 0.42, 0], M(0xe6c766), [1, 0.8, 1]);
  for (const sx of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), stemMat);
    leaf.scale.set(0.5, 0.12, 1);
    leaf.position.set(sx * 0.12, 0.16, 0);
    leaf.rotation.z = sx * 0.5;
    g.add(leaf);
  }
  // 脚边三块碎石与干草
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28 + 0.6;
    const peb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07 + i * 0.02, 0), M(0x9f8c66));
    peb.position.set(Math.cos(a) * 0.22, 0.04, Math.sin(a) * 0.22);
    g.add(peb);
  }
  return g;
}

/** 雪山：旅途的地标，26 米高，山顶积雪。 */
export function makeMountain(height = 26) {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a8c72, roughness: 0.98, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f2, roughness: 0.7, emissive: 0x2b3340, flatShading: true });
  const random = rng(9);

  const pts = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * height;
    const r = (1 - t) * (1 - t) * 15 + 1.2 + Math.sin(i * 2.3) * 1.5;
    pts.push(new THREE.Vector2(Math.max(0.6, r), y));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 11), rockMat);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // 山脊：几块斜插的岩板
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const y = height * (0.35 + random() * 0.4);
    const r = (1 - y / height) * 11;
    const ridge = new THREE.Mesh(new THREE.ConeGeometry(1.6 + random() * 1.4, 7 + random() * 5, 4), rockMat);
    ridge.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    ridge.rotation.set(random() * 0.5, a, 0.5 + random() * 0.4);
    ridge.castShadow = true;
    g.add(ridge);
  }

  // 雪帽
  const snowPts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const y = height * (0.66 + t * 0.34);
    const r = (1 - (y / height)) * (1 - (y / height)) * 15 + 1.2 + Math.sin(i * 2.1) * 1.1;
    snowPts.push(new THREE.Vector2(Math.max(0.5, r), y));
  }
  const cap = new THREE.Mesh(new THREE.LatheGeometry(snowPts, 11), snowMat);
  cap.castShadow = true;
  g.add(cap);

  // 山脚碎石
  for (let i = 0; i < 5; i++) {
    const a = random() * Math.PI * 2;
    const rock = makeRock(1.4 + random() * 1.6);
    rock.position.set(Math.cos(a) * 15, -0.2, Math.sin(a) * 15);
    g.add(rock);
  }
  return g;
}

/** 一枝玫瑰（近景用，花瓣分层）。 */
export function makeRose(bloomColor = 0xd8384f, scale = 1) {
  const g = new THREE.Group();
  const stemMat = M(0x4f6f38);
  const leafMat = M(0x5c7f3f, 0.95);
  const petalMat = new THREE.MeshStandardMaterial({
    color: bloomColor, roughness: 0.62, emissive: new THREE.Color(bloomColor).multiplyScalar(0.18), flatShading: true,
  });
  const stem = C(g, 0.022, 0.032, 1.05, 5, [0, 0.52, 0], stemMat, false);
  stem.rotation.z = 0.05;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28 + 0.8;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), leafMat);
    leaf.scale.set(0.55, 0.16, 1.2);
    leaf.position.set(Math.cos(a) * 0.14, 0.36 + i * 0.2, Math.sin(a) * 0.14);
    leaf.rotation.set(0.35, -a, 0.2);
    g.add(leaf);
  }
  // 花萼
  const sepals = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 5), leafMat);
  sepals.position.y = 1.0;
  g.add(sepals);
  // 花瓣：三层，越外越大、越平
  for (let layer = 0; layer < 3; layer++) {
    const n = 4 + layer;
    const rad = 0.1 - layer * 0.018;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + layer * 0.5;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(rad, 7, 5), petalMat);
      petal.scale.set(1, 0.5 + layer * 0.12, 1.35);
      petal.position.set(Math.cos(a) * rad * 0.7, 1.06 + layer * 0.03, Math.sin(a) * rad * 0.7);
      petal.rotation.set(0.55 - layer * 0.2, -a, 0);
      petal.castShadow = true;
      g.add(petal);
    }
  }
  S(g, 0.05, [0, 1.1, 0], M(0xe0b93f), [1, 0.7, 1]);
  g.scale.setScalar(scale);
  return g;
}

/**
 * 玫瑰园：整段旅途的视觉高潮。
 * 34 × 24 米的围合式花园：石墙、拱门、十字石径、中央喷泉、
 * 24 个花圃（约 900 株玫瑰）、后方的爬满玫瑰的凉架、六盏灯、两条石凳。
 */
export function makeRoseGarden(centerD, centerS, width = 34, depth = 24) {
  const g = new THREE.Group();
  const F = frameAt(centerD, centerS);
  const random = rng(1234);
  const stone = M(0xa89a7d);
  const stoneDark = M(0x8d8067);
  const woodMat = M(0x8a6b46);
  const roseColors = [0xd8384f, 0xe2698a, 0xf2b6c4, 0xf7e6d8, 0xc22f52, 0xf09a6b];
  const hw = width / 2;
  const hd = depth / 2;

  // 砂砾地面：一块贴地的球面圆盘
  g.add(capMesh(F.n, Math.max(width, depth) * 0.76, 0xcfc0a0, 0.022));

  // 十字石径（分段，跟着球面走）
  const pathItems = [];
  for (let x = -hw + 1.2; x <= hw - 1.2; x += 1.5) pathItems.push({ m: FS(F, x, 0.045, 0, 1.5, 1, 2.8), c: 0xbfae8d });
  for (let z = -hd + 1.2; z <= hd - 1.2; z += 1.5) pathItems.push({ m: FS(F, 0, 0.05, z, 3.0, 1, 1.5), c: 0xbfae8d });
  for (let z = hd - 3.4; z <= hd - 0.6; z += 1.4) pathItems.push({ m: FS(F, 0, 0.05, z, 3.2, 1, 1.4), c: 0xc4b394 });
  inst(g, new THREE.BoxGeometry(1, 0.02, 1), IM(1), pathItems, false);

  // 围墙：两层砌块，前墙留 6.4 米门洞
  const wallItems = [];
  const blockGeo = new THREE.BoxGeometry(1.15, 0.52, 0.5);
  for (let row = 0; row < 2; row++) {
    for (let x = -hw; x <= hw; x += 1.2) {
      if (Math.abs(x) > 3.4) {
        wallItems.push({ m: FS(F, x, 0.26 + row * 0.52, hd, 1, 1, 1), c: random() > 0.5 ? 0xa89a7d : 0x9d8f73 });
      }
      wallItems.push({ m: FS(F, x, 0.26 + row * 0.52, -hd, 1, 1, 1), c: random() > 0.5 ? 0xa89a7d : 0x9d8f73 });
    }
    for (let z = -hd + 1.2; z < hd - 0.6; z += 1.2) {
      wallItems.push({ m: FS(F, -hw, 0.26 + row * 0.52, z, 1, 1, 1, Math.PI / 2), c: random() > 0.5 ? 0xa89a7d : 0x9d8f73 });
      wallItems.push({ m: FS(F, hw, 0.26 + row * 0.52, z, 1, 1, 1, Math.PI / 2), c: random() > 0.5 ? 0xa89a7d : 0x9d8f73 });
    }
  }
  // 压顶
  for (let x = -hw; x <= hw; x += 1.2) {
    if (Math.abs(x) > 3.4) wallItems.push({ m: FS(F, x, 1.18, hd, 1.05, 0.5, 1.32), c: 0x8d8067 });
    wallItems.push({ m: FS(F, x, 1.18, -hd, 1.05, 0.5, 1.32), c: 0x8d8067 });
  }
  for (let z = -hd + 1.2; z < hd - 0.6; z += 1.2) {
    wallItems.push({ m: FS(F, -hw, 1.18, z, 1.05, 0.5, 1.32, Math.PI / 2), c: 0x8d8067 });
    wallItems.push({ m: FS(F, hw, 1.18, z, 1.05, 0.5, 1.32, Math.PI / 2), c: 0x8d8067 });
  }
  inst(g, blockGeo, IM(0.98), wallItems, true);

  // 四角方柱
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pil = new THREE.Group();
      B(pil, [0.95, 1.9, 0.95], [0, 0.95, 0], stone);
      B(pil, [1.2, 0.2, 1.2], [0, 1.98, 0], stoneDark);
      S(pil, 0.32, [0, 2.24, 0], stoneDark, [1, 0.9, 1]);
      F.place(pil, sx * hw, 0, sz * hd);
      g.add(pil);
    }
  }

  // 大门：门柱 + 半圆拱 + 拱顶石
  const gate = new THREE.Group();
  for (const sx of [-1, 1]) {
    B(gate, [1.15, 4.1, 1.15], [sx * 3.2, 2.05, 0], stone);
    B(gate, [1.5, 0.24, 1.5], [sx * 3.2, 4.22, 0], stoneDark);
    S(gate, 0.3, [sx * 3.2, 4.6, 0], stoneDark, [1, 0.9, 1]);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.34, 8, 24, Math.PI), stoneDark);
  arch.position.set(0, 4.32, 0);
  arch.castShadow = true;
  gate.add(arch);
  B(gate, [0.62, 0.92, 0.72], [0, 7.42, 0], stone);
  F.place(gate, 0, 0, hd);
  g.add(gate);

  // 拱门上与门柱上的爬藤玫瑰
  const vineItems = [];
  for (let i = 0; i < 120; i++) {
    const a = Math.PI * (i / 119);
    const rr = 3.2 + (random() - 0.5) * 0.4;
    vineItems.push({
      m: FS(F, Math.cos(a) * rr, 4.32 + Math.sin(a) * rr, hd + (random() - 0.5) * 0.6, 0.22, 0.16, 0.22),
      c: random() > 0.45 ? roseColors[(i * 3) % roseColors.length] : 0x527a3d,
    });
  }
  // 沿围墙顶的爬藤
  for (let x = -hw; x <= hw; x += 0.9) {
    if (Math.abs(x) < 3.6) continue;
    vineItems.push({ m: FS(F, x + (random() - 0.5) * 0.4, 1.2 + random() * 0.7, hd + (random() - 0.5) * 0.4, 0.2, 0.16, 0.2), c: random() > 0.5 ? roseColors[Math.floor(random() * 6)] : 0x527a3d });
  }
  for (let z = -hd; z <= hd; z += 0.9) {
    for (const sx of [-1, 1]) {
      vineItems.push({ m: FS(F, sx * hw + (random() - 0.5) * 0.4, 1.2 + random() * 0.7, z, 0.2, 0.16, 0.2), c: random() > 0.5 ? roseColors[Math.floor(random() * 6)] : 0x527a3d });
    }
  }
  inst(g, new THREE.IcosahedronGeometry(1, 0), IM(0.8), vineItems, false);

  // 24 个花圃：石边 + 土床 + 玫瑰（全部实例化）
  const beds = [];
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 0, 1]) {
      if (sx === 0 && sz === 0) continue;
      beds.push({ x: sx * 9.4, z: sz * 7.4 });
    }
  }
  const bedW = 5.2;
  const bedD = 3.6;
  const borderItems = [];
  const soilItems = [];
  const bushItems = [];
  const bloomItems = [];
  for (const bed of beds) {
    borderItems.push({ m: FS(F, bed.x, 0.11, bed.z - bedD / 2, bedW + 0.3, 0.22, 0.22), c: 0x8d8067 });
    borderItems.push({ m: FS(F, bed.x, 0.11, bed.z + bedD / 2, bedW + 0.3, 0.22, 0.22), c: 0x8d8067 });
    borderItems.push({ m: FS(F, bed.x - bedW / 2, 0.11, bed.z, 0.22, 0.22, bedD + 0.3), c: 0x8d8067 });
    borderItems.push({ m: FS(F, bed.x + bedW / 2, 0.11, bed.z, 0.22, 0.22, bedD + 0.3), c: 0x8d8067 });
    soilItems.push({ m: FS(F, bed.x, 0.02, bed.z, bedW / 2, 0.34, bedD / 2), c: 0x6b5238 });
    const n = 18;
    for (let i = 0; i < n; i++) {
      const lx = bed.x + (random() - 0.5) * (bedW - 0.8);
      const lz = bed.z + (random() - 0.5) * (bedD - 0.8);
      const h = 0.55 + random() * 0.45;
      bushItems.push({ m: FS(F, lx, 0.16 + h * 0.3, lz, 0.44 + random() * 0.22, h * 0.55, 0.44 + random() * 0.22), c: random() > 0.5 ? 0x527a3d : 0x5d8745 });
      const heads = 2 + Math.floor(random() * 2);
      for (let k = 0; k < heads; k++) {
        const s = 0.12 + random() * 0.06;
        bloomItems.push({
          m: FS(F, lx + (random() - 0.5) * 0.6, 0.34 + h * 0.55 + random() * 0.22, lz + (random() - 0.5) * 0.6, s, s * 0.9, s),
          c: roseColors[Math.floor(random() * roseColors.length)],
        });
      }
    }
  }
  inst(g, new THREE.BoxGeometry(1, 1, 1), IM(0.98), borderItems, false);
  inst(g, new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), IM(1), soilItems, false);
  inst(g, new THREE.IcosahedronGeometry(1, 1), IM(0.85), bushItems, false);
  inst(g, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, emissive: 0x2a1418, flatShading: true }), bloomItems, false);

  // 中央喷泉
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.7, 0.7, 18), stone);
  basin.position.y = 0.35;
  basin.castShadow = true;
  basin.receiveShadow = true;
  fountain.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.25, 20), new THREE.MeshStandardMaterial({ color: 0x8fc9d8, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.62;
  fountain.add(water);
  C(fountain, 0.22, 0.44, 1.6, 8, [0, 1.0, 0], stone);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.75, 0.22, 14), stoneDark);
  top.position.y = 1.85;
  fountain.add(top);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 0.72, 5), new THREE.MeshStandardMaterial({ color: 0xdff2f6, transparent: true, opacity: 0.55, roughness: 0.2 }));
    jet.position.set(Math.cos(a) * 0.55, 1.55, Math.sin(a) * 0.55);
    fountain.add(jet);
  }
  F.place(fountain, 0, 0, 0);
  g.add(fountain);

  // 后方凉架
  const pergola = new THREE.Group();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) C(pergola, 0.14, 0.18, 2.6, 6, [sx * 3.2, 1.3, sz * 1.6], woodMat);
  }
  for (const sz of [-1, 1]) B(pergola, [7.2, 0.14, 0.2], [0, 2.7, sz * 1.6], woodMat, 0, false);
  for (let i = -3; i <= 3; i++) B(pergola, [0.12, 0.1, 3.6], [i * 1.05, 2.82, 0], woodMat, 0, false);
  const pergolaRoses = [];
  for (let i = 0; i < 70; i++) {
    pergolaRoses.push({
      p: [(random() - 0.5) * 6.6, 2.5 + random() * 0.45, (random() - 0.5) * 3.2],
      r: [random() * 3, random() * 3, random() * 3],
      s: [0.17, 0.12, 0.17],
      c: random() > 0.4 ? roseColors[Math.floor(random() * roseColors.length)] : 0x527a3d,
    });
  }
  inst(pergola, new THREE.IcosahedronGeometry(1, 0), IM(0.8), pergolaRoses, false);
  F.place(pergola, 0, 0, -hd + 3.4);
  g.add(pergola);

  // 六盏园灯
  const lampPosts = [];
  const lampGlobes = [];
  for (const [x, z] of [[-3.8, 6.6], [3.8, 6.6], [-3.8, -2.4], [3.8, -2.4], [-3.8, -8.6], [3.8, -8.6]]) {
    lampPosts.push({ m: FS(F, x, 0.95, z, 1, 1, 1), c: 0x8d8067 });
    lampGlobes.push({ m: FS(F, x, 2.02, z, 1, 1, 1) });
  }
  inst(g, new THREE.CylinderGeometry(0.07, 0.1, 1.9, 6), IM(0.9), lampPosts, false);
  inst(g, new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd89a, emissive: 0xffb25c, emissiveIntensity: 1.4, roughness: 0.5 }), lampGlobes, false);

  // 两条石凳
  for (const [x, z] of [[-7.4, 6.4], [7.4, -6.4]]) {
    const bench = new THREE.Group();
    B(bench, [2.2, 0.14, 0.54], [0, 0.46, 0], stone);
    for (const sx of [-1, 1]) B(bench, [0.2, 0.46, 0.48], [sx * 0.85, 0.23, 0], stoneDark);
    B(bench, [2.2, 0.42, 0.12], [0, 0.72, -0.26], stone);
    F.place(bench, x, 0, z);
    g.add(bench);
  }

  // 门口六株精雕玫瑰（进园第一眼）
  const hero = [];
  for (let i = 0; i < 6; i++) {
    const lx = -6.2 + i * 2.5;
    const rose = makeRose(roseColors[i % roseColors.length], 1.2 + (i % 3) * 0.12, 2);
    F.place(rose, lx, 0.26, hd - 1.8 - (i % 2) * 1.2, random() * 6.28);
    g.add(rose);
    hero.push(rose);
  }

  g.userData.hero = hero;
  g.userData.fountain = fountain;
  g.userData.bloomCount = bloomItems.length + vineItems.filter((v) => v.c !== 0x527a3d).length;
  g.userData.arch = arch;
  return g;
}

/** 狐狸：原著里教「驯养」的那只。 */
export function makeFox() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xd9863f, roughness: 0.85, emissive: 0x2a1a0c, flatShading: true });
  const lightFur = new THREE.MeshStandardMaterial({ color: 0xf2e2cf, roughness: 0.85, flatShading: true });
  const dark = M(0x2a1f18, 0.6);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 5, 8), fur);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.4, 0);
  body.castShadow = true;
  g.add(body);
  S(g, 0.2, [0.14, 0.42, 0], lightFur, [1, 0.85, 0.9]);

  // 头
  const head = new THREE.Group();
  head.position.set(0.44, 0.6, 0);
  S(head, 0.19, [0, 0, 0], fur, [1, 0.95, 1]);
  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 6), lightFur);
  muzzle.rotation.z = -Math.PI / 2;
  muzzle.position.set(0.2, -0.03, 0);
  head.add(muzzle);
  S(head, 0.03, [0.32, -0.04, 0], dark);
  for (const sz of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 4), fur);
    ear.position.set(-0.03, 0.19, sz * 0.1);
    ear.rotation.set(sz * 0.2, 0, -0.1);
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 4), dark);
    eye.position.set(0.14, 0.04, sz * 0.08);
    head.add(eye);
  }
  g.add(head);
  g.userData.head = head;

  // 四条腿
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      C(g, 0.05, 0.06, 0.34, 5, [sx * 0.24, 0.17, sz * 0.12], fur, true);
    }
  }

  // 尾巴：白尖，可摇摆
  const tail = new THREE.Group();
  tail.position.set(-0.38, 0.5, 0);
  const tailMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.52, 5, 7), fur);
  tailMesh.rotation.z = 0.9;
  tailMesh.position.set(-0.18, 0.12, 0);
  tailMesh.castShadow = true;
  tail.add(tailMesh);
  S(tail, 0.11, [-0.44, 0.42, 0], lightFur);
  tail.rotation.z = 0.72;
  g.add(tail);
  g.userData.tail = tail;
  return g;
}

/** 车站：站台 + 石木结构的站房 + 时钟 + 长椅 + 三盏灯。 */
export function makeStation() {
  const g = new THREE.Group();
  const stone = M(0xa2947a);
  const stoneDark = M(0x887a62);
  const timber = M(0x7a5334);
  const roofMat = M(0x5b4a3f);
  const windowMat = E(0xffca7a, 1.1);
  const metal = M(0x4a4a4a, 0.5, 0.4);

  // 站台
  B(g, [12.4, 0.34, 3.2], [0, 0.17, 0], stone);
  B(g, [12.4, 0.1, 0.3], [0, 0.36, 1.6], stoneDark);
  for (let x = -5.8; x <= 5.8; x += 1.4) B(g, [0.24, 0.06, 3.2], [x, 0.36, 0], stoneDark, 0, false);

  // 站房（正面朝 +Z）
  const house = new THREE.Group();
  house.position.set(0, 0.34, -4.2);
  B(house, [8.4, 1.1, 5.2], [0, 0.55, 0], stone);
  B(house, [8.0, 2.4, 4.8], [0, 2.3, 0], timber);
  // 木饰横条
  for (const y of [1.4, 2.5, 3.3]) B(house, [8.05, 0.12, 4.85], [0, y, 0], M(0x6a472d), 0, false);
  // 山墙（三角）
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 2.75, 1.7, 3), timber);
  gable.rotation.y = Math.PI / 6;
  gable.position.set(0, 4.35, 0);
  gable.castShadow = true;
  house.add(gable);
  // 屋顶两面
  for (const sx of [-1, 1]) {
    const roof = B(house, [5.0, 0.16, 5.6], [sx * 2.1, 4.05, 0], roofMat);
    roof.rotation.z = sx * 0.62;
  }
  B(house, [0.3, 0.3, 5.6], [0, 4.86, 0], stoneDark, 0, false);
  // 时钟
  const clock = new THREE.Group();
  clock.position.set(0, 4.3, 2.42);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 18), M(0xf1e9d4, 0.6));
  face.rotation.x = Math.PI / 2;
  clock.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 6, 20), metal);
  clock.add(rim);
  const hourHand = B(clock, [0.05, 0.34, 0.04], [0, 0.12, 0.07], metal, 0, false);
  hourHand.rotation.z = 0.4;
  const minuteHand = B(clock, [0.04, 0.5, 0.04], [0.1, 0.2, 0.09], metal, 0, false);
  minuteHand.rotation.z = -1.1;
  house.add(clock);
  clock.children.forEach((c) => { c.castShadow = false; });
  // 门与窗
  B(house, [1.3, 2.1, 0.14], [0, 1.05, 2.42], M(0x4d3421), 0, false);
  B(house, [0.16, 0.16, 0.16], [0.4, 1.05, 2.52], M(0xd4b463), 0, false);
  for (const sx of [-1, 1]) {
    B(house, [1.5, 1.2, 0.12], [sx * 2.5, 2.5, 2.42], windowMat, 0, false);
    B(house, [1.6, 0.12, 0.16], [sx * 2.5, 1.86, 2.46], timber, 0, false);
    B(house, [0.1, 1.3, 0.16], [sx * 2.5, 2.5, 2.46], timber, 0, false);
  }
  // 烟囱
  B(house, [0.7, 1.8, 0.7], [2.6, 4.6, -0.8], stoneDark);
  B(house, [0.9, 0.18, 0.9], [2.6, 5.5, -0.8], stone);
  g.add(house);

  // 站牌（无字：两块木牌 + 铁架）
  for (const sx of [-1, 1]) C(g, 0.06, 0.06, 2.2, 6, [sx * 1.9, 1.1, 2.1], metal);
  B(g, [4.2, 0.8, 0.12], [0, 2.0, 2.1], M(0xe7dcc2, 0.7));
  B(g, [4.3, 0.1, 0.14], [0, 2.44, 2.1], metal, 0, false);

  // 长椅（两把）
  for (const sx of [-1, 1]) {
    const bench = new THREE.Group();
    bench.position.set(sx * 3.5, 0.34, 0.7);
    for (const bx of [-0.75, 0.75]) B(bench, [0.12, 0.44, 0.5], [bx, 0.22, 0], metal, 0, false);
    B(bench, [1.9, 0.1, 0.5], [0, 0.46, 0], woodBench());
    B(bench, [1.9, 0.4, 0.09], [0, 0.7, -0.2], woodBench());
    g.add(bench);
  }

  // 三盏站台灯
  for (const x of [-5.2, 0, 5.2]) {
    C(g, 0.07, 0.11, 2.7, 6, [x, 1.35, 0.2], metal);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), E(0xffd79a, 1.7));
    head.position.set(x, 2.78, 0.2);
    g.add(head);
    B(g, [0.4, 0.08, 0.4], [x, 2.98, 0.2], metal, 0, false);
  }

  // 行李与木箱
  B(g, [1.0, 0.7, 0.7], [-6.2, 0.7, -1.6], M(0x8a6a42));
  B(g, [0.7, 0.5, 0.5], [6.4, 0.6, -1.4], M(0x7c5d3a));
  S(g, 0.24, [6.4, 1.0, -1.4], M(0x9c7c4e), [1, 0.9, 1]);

  g.userData.clock = clock;
  return g;
}

function woodBench() {
  return M(0x8c6a44);
}

/** 火车：车头 + 煤水车 + 两节车厢，静止停在铁轨上。 */
export function makeTrain() {
  const black = M(0x2f3336, 0.55, 0.25);
  const red = M(0x8b3a35, 0.7);
  const green = M(0x3f5b46, 0.65);
  const brass = M(0xc9a24d, 0.35, 0.7);
  const steel = M(0x6e7377, 0.5, 0.5);
  const windowMat = E(0xffd79a, 1.0);
  const wheelMat = M(0x33373a, 0.6, 0.3);
  const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.16, 12);

  function addWheels(group, xs, r = 0.44) {
    for (const x of xs) {
      for (const sz of [-0.72, 0.72]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, r, sz);
        group.add(w);
      }
    }
  }

  // 车头（局部 +X 为前进方向）
  const loco = new THREE.Group();
  B(loco, [7.2, 0.3, 2.4], [0, 0.62, 0], black);
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 4.6, 14), black);
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(0.9, 1.5, 0);
  boiler.castShadow = true;
  loco.add(boiler);
  for (const x of [0.1, 1.5, 2.9]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.06, 5, 16), brass);
    band.rotation.y = Math.PI / 2;
    band.position.set(x, 1.5, 0);
    loco.add(band);
  }
  C(loco, 0.26, 0.42, 1.0, 10, [2.6, 2.6, 0], black);
  C(loco, 0.5, 0.4, 0.18, 10, [2.6, 3.12, 0], brass);
  S(loco, 0.42, [1.3, 2.42, 0], M(0x2b2f32), [1, 0.9, 1]);
  S(loco, 0.3, [2.0, 2.3, 0], M(0x2b2f32), [1, 0.95, 1]);
  B(loco, [2.2, 1.9, 2.5], [-2.2, 1.9, 0], red);
  B(loco, [2.3, 0.14, 2.65], [-2.2, 2.9, 0], black, 0, false);
  for (const sz of [-1, 1]) B(loco, [1.0, 0.8, 0.08], [-2.2, 2.35, sz * 1.27], windowMat, 0, false);
  B(loco, [0.08, 0.8, 1.0], [-1.12, 2.35, 0], windowMat, 0, false);
  const cow = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.9, 1.1, 3), black);
  cow.rotation.z = -Math.PI / 2;
  cow.position.set(3.55, 0.55, 0);
  loco.add(cow);
  S(loco, 0.19, [3.3, 2.1, 0], E(0xffe6b0, 2.0));
  for (const sz of [-0.8, 0.8]) {
    const buf = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 8), steel);
    buf.rotation.z = Math.PI / 2;
    buf.position.set(3.75, 0.85, sz);
    loco.add(buf);
  }
  addWheels(loco, [-1.6, -0.4, 0.8]);

  // 煤水车
  const tender = new THREE.Group();
  B(tender, [3.2, 2.0, 2.3], [0, 1.35, 0], green);
  B(tender, [3.3, 0.14, 2.45], [0, 2.4, 0], black, 0, false);
  B(tender, [2.8, 0.4, 1.9], [0, 2.55, 0], M(0x23272a), 0, false);
  for (const sz of [-0.9, 0.9]) B(tender, [3.22, 0.1, 0.1], [0, 1.75, sz], brass, 0, false);
  addWheels(tender, [-1.0, 1.0]);

  // 两节车厢
  const cars = [];
  for (const idx of [0, 1]) {
    const car = new THREE.Group();
    B(car, [7.0, 0.32, 2.4], [0, 0.66, 0], black);
    B(car, [6.8, 2.0, 2.4], [0, 1.85, 0], idx ? red : green);
    B(car, [7.1, 0.2, 2.55], [0, 2.95, 0], M(0x3a2f28), 0, false);
    for (let i = 0; i < 5; i++) {
      for (const sz of [-1, 1]) {
        B(car, [0.85, 0.75, 0.06], [-2.4 + i * 1.2, 2.2, sz * 1.21], windowMat, 0, false);
      }
    }
    B(car, [1.1, 1.7, 0.08], [3.35, 1.6, 0], M(0x3a2f28), 0, false);
    addWheels(car, [-2.3, 2.3], 0.4);
    cars.push(car);
  }

  return { loco, tender, cars };
}

/** 麦田：一大片金色麦子（实例化），风吹过时有一点点起伏。 */
export function makeWheatField(centerD, centerS, width = 34, depth = 26, count = 1400) {
  const g = new THREE.Group();
  const F = frameAt(centerD, centerS);
  const random = rng(404);
  const culms = [];
  const heads = [];
  const rows = Math.round(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const cx = i % rows;
    const cz = Math.floor(i / rows);
    const lx = -width / 2 + (cx / rows) * width + (random() - 0.5) * 0.5;
    const lz = -depth / 2 + (cz / rows) * depth + (random() - 0.5) * 0.5;
    const h = 0.85 + random() * 0.55;
    culms.push({ m: FS(F, lx, h / 2, lz, 1, h, 1), c: random() > 0.5 ? 0xd8b45c : 0xc7a34c });
    heads.push({ m: FS(F, lx, h + 0.12, lz, 1, 1, 1), c: random() > 0.5 ? 0xe6c974 : 0xd4b162 });
  }
  inst(g, new THREE.CylinderGeometry(0.014, 0.024, 1, 3), IM(0.95), culms, false);
  inst(g, new THREE.ConeGeometry(0.055, 0.36, 4), IM(0.9), heads, false);
  // 田埂
  const ridges = [];
  for (let x = -width / 2; x <= width / 2; x += 3.4) ridges.push({ m: FS(F, x, 0.06, 0, 0.3, 1, depth), c: 0xa98f63 });
  inst(g, new THREE.BoxGeometry(1, 0.14, 1), IM(1), ridges, false);
  return g;
}

/** 稻草人：麦田中间那个歪着的家伙。 */
export function makeScarecrow() {
  const g = new THREE.Group();
  const wood = M(0x7b5c3a);
  const cloth = M(0x9a6b4a);
  const hatMat = M(0x6d5433);
  C(g, 0.07, 0.09, 2.2, 6, [0, 1.1, 0], wood);
  B(g, [1.5, 0.12, 0.12], [0, 1.72, 0], wood);
  // 身体（麻袋）
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 0.95, 8), cloth);
  body.position.set(0, 1.35, 0);
  body.castShadow = true;
  g.add(body);
  // 补丁
  B(g, [0.2, 0.2, 0.04], [0.1, 1.3, 0.28], M(0x7d5236), 0, false);
  // 手臂布
  for (const sx of [-1, 1]) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.55, 6), cloth);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(sx * 0.55, 1.66, 0);
    g.add(sleeve);
  }
  // 头与帽
  S(g, 0.21, [0, 2.0, 0], M(0xd9c39a), [1, 1.1, 1]);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 10), hatMat);
  brim.position.set(0, 2.14, 0);
  g.add(brim);
  C(g, 0.16, 0.22, 0.26, 8, [0, 2.27, 0], hatMat);
  // 眼睛
  for (const sx of [-1, 1]) S(g, 0.03, [sx * 0.08, 2.02, 0.19], M(0x2a2118));
  return g;
}

/** 商贩摊：红白条纹遮阳棚、柜台、货架与小秤。 */
export function makeMerchantStall() {
  const g = new THREE.Group();
  const wood = M(0x8a6440);
  const woodDark = M(0x6b4a2e);
  const cream = M(0xf0e4cd, 0.85);
  const red = M(0xa8382f, 0.8);
  const tin = M(0x8d8f8a, 0.5, 0.4);

  // 四根柱子
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) C(g, 0.08, 0.1, 2.6, 6, [sx * 1.9, 1.3, sz * 1.1], wood);
  }
  // 条纹遮阳棚：一块块交替色的斜板
  const awn = new THREE.Group();
  awn.position.set(0, 2.62, 0);
  awn.rotation.x = -0.18;
  for (let i = 0; i < 12; i++) {
    B(awn, [0.44, 0.06, 3.0], [-2.42 + i * 0.44, 0, 0], i % 2 ? red : cream, 0, false);
  }
  // 前后垂边
  for (let i = 0; i < 12; i++) {
    B(g, [0.44, 0.34, 0.05], [-2.42 + i * 0.44, 2.4, 1.5], i % 2 ? red : cream, 0, false);
  }
  g.add(awn);
  B(g, [4.9, 0.1, 3.1], [0, 2.32, 0], wood, 0, false);

  // 柜台
  B(g, [4.2, 0.9, 1.2], [0, 0.45, 0.7], wood);
  B(g, [4.4, 0.1, 1.35], [0, 0.95, 0.7], woodDark);
  // 货架
  for (let i = 0; i < 2; i++) {
    B(g, [3.6, 0.08, 0.6], [0, 1.5 + i * 0.5, -0.5], wood, 0, false);
    B(g, [3.6, 0.08, 0.6], [0, 1.5 + i * 0.5, 0.6], wood, 0, false);
  }
  // 罐子与瓶：实例化小圆柱
  const jars = [];
  const jarColors = [0xd9c07a, 0x9fb7a6, 0xd6a08a, 0xb9a6c8, 0xe0d3ae];
  for (let i = 0; i < 26; i++) {
    const shelf = i % 3;
    const y = shelf === 0 ? 1.06 : 1.56 + (shelf - 1) * 0.5;
    const z = shelf === 0 ? 0.78 : (i % 2 ? 0.6 : -0.5);
    const h = 0.14 + (i % 4) * 0.05;
    jars.push({ p: [-1.6 + (i % 8) * 0.45, y + h / 2, z], s: [1, h / 0.18, 1], c: jarColors[i % jarColors.length] });
  }
  inst(g, new THREE.CylinderGeometry(0.09, 0.1, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true }), jars, false);

  // 托盘上的橙色药片（原著那瓶止渴药）
  const pills = [];
  const random = rng(88);
  for (let i = 0; i < 22; i++) {
    pills.push({ p: [(random() - 0.5) * 0.9, 1.03, 0.55 + (random() - 0.5) * 0.4], s: [1, 0.5, 1], c: random() > 0.5 ? 0xe08a4a : 0xf0b070 });
  }
  inst(g, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true }), pills, false);

  // 木箱与麻袋
  B(g, [0.9, 0.7, 0.8], [-2.6, 0.35, 0.9], woodDark);
  B(g, [0.9, 0.7, 0.8], [-2.6, 1.05, 0.9], wood);
  const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.9, 8), M(0xb59b71));
  sack.position.set(2.6, 0.45, 0.9);
  g.add(sack);
  // 吊秤
  C(g, 0.02, 0.02, 0.5, 4, [1.7, 2.2, 1.2], tin, false);
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10), tin);
  pan.position.set(1.7, 1.9, 1.2);
  g.add(pan);
  // 招牌
  B(g, [1.6, 0.5, 0.08], [0, 2.96, 1.5], woodDark, 0, false);
  return g;
}

/** 一口石砌水井：轱辘、绳、木桶、井台石。 */
export function makeWell() {
  const g = new THREE.Group();
  const stone = M(0xa3937a);
  const stoneDark = M(0x85775f);
  const wood = M(0x7d5b39);
  const metal = M(0x5a5a58, 0.5, 0.4);

  // 井台
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.85, 14, 1, true), stone);
  ring.position.y = 0.42;
  ring.castShadow = true;
  ring.receiveShadow = true;
  g.add(ring);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.24, 1.42, 0.9, 14, 1, true), stoneDark);
  inner.position.y = 0.42;
  g.add(inner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.14, 6, 18), stone);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.86;
  g.add(rim);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.18, 14), new THREE.MeshStandardMaterial({ color: 0x4f8fa3, roughness: 0.15, metalness: 0.25 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.55;
  g.add(water);

  // 辘轳架
  for (const sz of [-1, 1]) {
    B(g, [0.18, 2.3, 0.18], [0, 1.9, sz * 1.35], wood);
  }
  B(g, [0.16, 0.16, 3.1], [0, 3.0, 0], wood, 0, false);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 10), wood);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(0, 2.6, 0);
  g.add(drum);
  // 摇柄
  const crank = B(g, [0.07, 0.07, 0.5], [0.3, 2.6, 1.35], metal, 0, false);
  crank.rotation.x = Math.PI / 2;
  B(g, [0.07, 0.07, 0.28], [0.3, 2.6, 1.72], metal, 0, false);
  // 绳与桶
  C(g, 0.012, 0.012, 1.7, 4, [0, 1.75, 0], M(0xcbb37d), false);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.34, 10, 1, true), wood);
  bucket.position.set(0, 0.9, 0);
  g.add(bucket);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 4, 12), metal);
  hoop.rotation.x = Math.PI / 2;
  hoop.position.set(0, 1.0, 0);
  g.add(hoop);
  // 井台周围的石板
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.28;
    const slab = B(g, [0.85, 0.07, 0.6], [Math.cos(a) * 2.1, 0.035, Math.sin(a) * 2.1], stoneDark, a, false);
    slab.receiveShadow = true;
  }
  g.userData.water = water;
  return g;
}

/** 双翼飞机：坠在沙里，螺旋桨歪着。 */
export function makePlane() {
  const g = new THREE.Group();
  const bodyMat = M(0xd8ad4e, 0.6, 0.25);
  const wingMat = M(0xe6cf8f, 0.65);
  const darkMat = M(0x4d4a44, 0.6, 0.3);
  const metal = M(0x8d8f8a, 0.45, 0.55);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4cf, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 });

  // 机身：前段粗、后段收细
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.22, 4.4, 10), bodyMat);
  fus.rotation.z = Math.PI / 2;
  fus.position.set(0, 1.25, 0);
  fus.castShadow = true;
  g.add(fus);
  // 机头整流罩
  S(g, 0.55, [2.2, 1.25, 0], bodyMat, [0.8, 1, 1]);
  // 座舱
  B(g, [0.9, 0.5, 0.8], [0.3, 1.5, 0], darkMat, 0, false);
  const windshield = B(g, [0.1, 0.36, 0.7], [0.78, 1.62, 0], glass, 0, false);
  windshield.rotation.z = -0.2;
  // 上翼
  B(g, [1.5, 0.14, 7.6], [-0.2, 2.15, 0], wingMat);
  for (const sz of [-1, 1]) B(g, [1.2, 0.1, 1.0], [-0.2, 2.15, sz * 3.95], wingMat, 0, false);
  // 下翼
  B(g, [1.3, 0.12, 6.4], [0.5, 0.95, 0], wingMat);
  // 支柱
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const strut = C(g, 0.04, 0.04, 1.2, 5, [0.3 + sx * 0.4, 1.55, sz * 2.6], metal, false);
      strut.rotation.x = sz * 0.12;
    }
  }
  // 尾翼
  B(g, [0.8, 0.1, 2.6], [-2.2, 1.5, 0], wingMat, 0, false);
  B(g, [0.1, 1.1, 1.3], [-2.3, 2.0, 0], wingMat, 0, false);
  // 螺旋桨（歪的）
  const prop = new THREE.Group();
  prop.position.set(2.8, 1.25, 0);
  prop.rotation.z = 0.35;
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.06), darkMat);
    blade.position.y = 0.5;
    blade.rotation.z = (i / 3) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.x = (i / 3) * Math.PI * 2;
    holder.add(blade);
    prop.add(holder);
  }
  S(prop, 0.16, [0, 0, 0], metal);
  g.add(prop);
  // 起落架
  for (const sz of [-1, 1]) {
    C(g, 0.05, 0.05, 0.9, 5, [1.1, 1.25, sz * 0.75], metal, false);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 6, 12), darkMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(1.1, 0.5, sz * 0.95);
    g.add(wheel);
  }
  // 尾轮
  S(g, 0.16, [-2.1, 0.28, 0], darkMat);
  // 沙堆：机头陷进沙里
  const sand = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, 6.28, 0, Math.PI / 2), M(0xd2b47c, 1));
  sand.scale.set(2.4, 0.42, 1.9);
  sand.position.set(2.2, -0.02, 0);
  sand.receiveShadow = true;
  g.add(sand);
  // 散落的工具
  B(g, [0.5, 0.22, 0.3], [1.6, 0.12, -1.3], metal, 0.4, false);
  B(g, [0.36, 0.3, 0.3], [0.9, 0.16, 1.5], M(0x8a6a42), -0.6, false);
  C(g, 0.09, 0.09, 0.3, 6, [2.4, 0.15, 1.1], M(0x6f7f8a), false);
  g.userData.prop = prop;
  return g;
}

/** 木牌路标：给旅途中段一点「方向感」。 */
export function makeSignpost(leftText = 0, angle = 0) {
  const g = new THREE.Group();
  const wood = M(0x7b5a37);
  C(g, 0.07, 0.09, 2.0, 6, [0, 1.0, 0], wood);
  for (let i = 0; i < 2; i++) {
    const board = B(g, [1.5, 0.26, 0.07], [i ? -0.55 : 0.55, 1.7 - i * 0.36, 0], M(0x9a7748), 0, false);
    board.rotation.y = (i ? -0.5 : 0.35) + angle;
  }
  B(g, [0.9, 0.1, 0.7], [0, 0.05, 0], M(0x8b7a5c), 0, false);
  return g;
}

/** 铺一段跟着球面弯的钢轨（道砟 + 枕木 + 两条钢轨）。 */
export function makeRailway(centerD, centerS, length = 46) {
  const g = new THREE.Group();
  const F = frameAt(centerD, centerS);
  const ballast = [];
  const sleepers = [];
  const rails = [];
  for (let x = -length / 2; x < length / 2; x += 1.6) {
    ballast.push({ m: FS(F, x + 0.8, 0.04, 0, 1.7, 1, 3.4), c: 0x8b7d63 });
    sleepers.push({ m: FS(F, x, 0.11, 0, 0.32, 1, 2.1), c: 0x6f5a41 });
    for (const sz of [-0.72, 0.72]) rails.push({ m: FS(F, x + 0.8, 0.18, sz, 1.62, 1, 1), c: 0x6e7377 });
  }
  inst(g, new THREE.BoxGeometry(1, 0.08, 1), IM(1), ballast, false);
  inst(g, new THREE.BoxGeometry(1, 0.1, 1), IM(0.9), sleepers, false);
  inst(g, new THREE.BoxGeometry(1, 0.1, 0.12), IM(0.5, 0.5), rails, false);
  return g;
}
