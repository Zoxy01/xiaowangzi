/**
 * 「光遇」式的柔光美术工具箱。
 *
 * 参考方向（Sky: Children of the Light）：
 *   · 天空是三层柔和渐变 + 地平线雾光，太阳是一团没有硬边的大光晕；
 *   · 地面上有成片的高光草叶与零星野花，靠法线方向生长，远看是一片发光的绒毯；
 *   · 空气里永远飘着缓慢上升的暖色光尘，给画面「呼吸感」；
 *   · 没有硬阴影的对比，靠补光与自发光把角色从背景里拉出来。
 *
 * 这里只放「八章通用」的东西，具体星球的建筑仍在各章 / b612-scene.js 里。
 * 所有贴图都是程序化 canvas 生成的（零外部资源，iOS 包体不增加）。
 */
import * as THREE from 'three';

const TAU = Math.PI * 2;

/**
 * 每章一套柔光调色。night / dusk / day 是「天顶 → 天中 → 地平线」三段色，
 * 顺序与 world.js 的 makeSkyDome 一致（topColor / midColor / botColor）。
 */
export const PALETTES = {
  b612: {
    night: [0x18244a, 0x2e4270, 0x6e5f86],
    dusk: [0x7d8fd0, 0xf0b3ae, 0xffd9a6],
    day: [0x78c0ea, 0xd8ecf2, 0xffe8c6],
    glow: 0xffe6bb,
    haze: 0xfff2dc,
    fog: 0xd9d8c6,
  },
  king: {
    night: [0x1c2547, 0x3a3a6b, 0x7a6284],
    dusk: [0x8c7fc4, 0xe6aebc, 0xffd2a8],
    day: [0x8ec9ee, 0xe4e2ef, 0xffe6bd],
    glow: 0xffe9c4,
    haze: 0xfff4e2,
    fog: 0xd6d3c6,
  },
  vanity: {
    night: [0x241f47, 0x453a6e, 0x7d5f88],
    dusk: [0xa87fc4, 0xf2b0c8, 0xffd6b6],
    day: [0xb8a4e8, 0xf0dcec, 0xffe3c8],
    glow: 0xffdcec,
    haze: 0xffeff6,
    fog: 0xe0d2d8,
  },
  bar: {
    night: [0x101a35, 0x1f2c53, 0x4a4468],
    dusk: [0x5c6a9c, 0xb98aa0, 0xe0b48e],
    day: [0x7fa9d8, 0xc8daea, 0xf0dcb8],
    glow: 0xffd2a0,
    haze: 0xf2dfc8,
    fog: 0x9a9aac,
  },
  merchant: {
    night: [0x16223f, 0x2c3d62, 0x5e5a80],
    dusk: [0x6f92c0, 0xdcaab0, 0xffd6a2],
    day: [0x86c6e6, 0xd6ecec, 0xffe9c2],
    glow: 0xffe4b2,
    haze: 0xfff3de,
    fog: 0xcfd6c8,
  },
  lamp: {
    night: [0x111c3a, 0x22335c, 0x4c5478],
    dusk: [0x4f5f96, 0xa98ab2, 0xe0b490],
    day: [0x79a7d6, 0xc4d6e8, 0xf2dcb6],
    glow: 0xffd9a6,
    haze: 0xf6e6ce,
    fog: 0x8f9ab0,
  },
  geo: {
    night: [0x1a2544, 0x334569, 0x6a6584],
    dusk: [0x7b8fb8, 0xd8b0b8, 0xf8d6ae],
    day: [0x9ccae8, 0xddecef, 0xf6e7c8],
    glow: 0xffeccb,
    haze: 0xfdf5e6,
    fog: 0xd4d6cc,
  },
  earth: {
    night: [0x1c2440, 0x3a4260, 0x745e70],
    dusk: [0x9a86b8, 0xf0a89c, 0xffcf96],
    day: [0x9ed2ec, 0xf2e2cc, 0xffe2b0],
    glow: 0xffd9a0,
    haze: 0xfff0d6,
    fog: 0xe3d2b2,
  },
};

/** 当前章节的调色（未指定时用 B-612 的） */
export function paletteOf(name) {
  return PALETTES[name] || PALETTES.b612;
}

// ---------------------------------------------------------------- 贴图

let _glowTex = null;

/** 64×64 的径向柔光贴图（光尘 / 光晕 / 灯柱共用一张，必须打 shared 标记） */
export function glowTex() {
  if (_glowTex) return _glowTex;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,246,225,0.85)');
  g.addColorStop(0.55, 'rgba(255,230,190,0.32)');
  g.addColorStop(1, 'rgba(255,220,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  _glowTex = tex;
  return tex;
}

let _shaftTex = null;

/** 竖直渐变的「光柱」贴图：上窄下宽、上淡下浓，用来做地平线附近的体积光 */
export function shaftTex() {
  if (_shaftTex) return _shaftTex;
  const w = 32;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,240,210,0)');
  g.addColorStop(0.35, 'rgba(255,236,200,0.28)');
  g.addColorStop(0.75, 'rgba(255,228,180,0.55)');
  g.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 两侧收窄，避免出现方框边
  const side = ctx.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  _shaftTex = tex;
  return tex;
}

// ---------------------------------------------------------------- 天空元素

/**
 * 太阳光晕：贴在太阳方向上的大 sprite，柔边、加色混合。
 * 比「一个发光的球」更像光遇里那种被云层散开的光。
 */
export function makeSunHalo(sunDir, { color = 0xfff0cc, dist = 260, size = 170, opacity = 0.55 } = {}) {
  const mat = new THREE.SpriteMaterial({
    map: glowTex(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const s = new THREE.Sprite(mat);
  s.position.copy(sunDir).normalize().multiplyScalar(dist);
  s.scale.setScalar(size);
  s.renderOrder = -880;
  s.userData.baseOpacity = opacity;
  return s;
}

/**
 * 地平线附近的体积光柱：几片被太阳照亮的竖直光带。
 * 用 sprite（永远面向相机）而不是面片，避免转视角时看到「侧着的一张纸」。
 */
export function makeLightShafts(sunDir, { color = 0xffe6bc, count = 5, radius = 6, height = 26, opacity = 0.22 } = {}) {
  const g = new THREE.Group();
  const base = sunDir.clone().normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(base);
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(base, side).normalize();
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const spread = (t - 0.5) * 2; // -1..1
    const mat = new THREE.SpriteMaterial({
      map: shaftTex(),
      color,
      transparent: true,
      opacity: opacity * (0.55 + Math.random() * 0.45),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const s = new THREE.Sprite(mat);
    const pos = base
      .clone()
      .multiplyScalar(radius * 2.6)
      .addScaledVector(up, height * 0.24)
      .addScaledVector(side, spread * radius * 1.5);
    s.position.copy(pos);
    s.scale.set(radius * 0.75, height, 1);
    s.renderOrder = -870;
    s.userData.baseOpacity = mat.opacity;
    s.userData.phase = Math.random() * TAU;
    g.add(s);
  }
  return g;
}

// ---------------------------------------------------------------- 光尘

/**
 * 空气里的光尘：贴着星球表面往上飘的小光点。
 * 用 Points + 加色贴图，一次绘制调用，几百个也不贵。
 */
export function makeMotes({ radius = 6, count = 220, color = 0xffe9c2, lift = 2.6, size = 0.16 } = {}) {
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * TAU;
    const r = Math.sqrt(1 - u * u);
    const d = new THREE.Vector3(Math.cos(a) * r, u, Math.sin(a) * r).normalize();
    const h = radius + 0.15 + Math.random() * lift;
    base[i * 3] = d.x * h;
    base[i * 3 + 1] = d.y * h;
    base[i * 3 + 2] = d.z * h;
    pos[i * 3] = base[i * 3];
    pos[i * 3 + 1] = base[i * 3 + 1];
    pos[i * 3 + 2] = base[i * 3 + 2];
    phase[i] = Math.random() * TAU;
    speed[i] = 0.12 + Math.random() * 0.16;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: glowTex(),
    color,
    size,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.userData.base = base;
  points.userData.phase = phase;
  points.userData.speed = speed;
  points.userData.tick = (dt, time) => {
    const arr = points.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const ph = phase[i] + time * speed[i];
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];
      const lift2 = (Math.sin(ph) * 0.5 + 0.5) * 0.55;
      const sway = Math.cos(ph * 0.7) * 0.12;
      arr[i * 3] = bx + sway;
      arr[i * 3 + 1] = by + lift2;
      arr[i * 3 + 2] = bz + Math.sin(ph * 0.5) * 0.12;
    }
    points.geometry.attributes.position.needsUpdate = true;
    void dt;
  };
  return points;
}

// ---------------------------------------------------------------- 地表植物

function unitSpherePoint(rand) {
  const u = rand() * 2 - 1;
  const a = rand() * TAU;
  const r = Math.sqrt(1 - u * u);
  return new THREE.Vector3(Math.cos(a) * r, u, Math.sin(a) * r);
}

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** 交叉的两片草叶：每实例 4 个三角形，InstancedMesh 一次画完 */
function bladeGeometry(w = 0.05, h = 0.3) {
  const g = new THREE.BufferGeometry();
  const hw = w / 2;
  const verts = [];
  const idx = [];
  const push = (x, y, z) => {
    verts.push(x, y, z);
    return verts.length / 3 - 1;
  };
  for (let k = 0; k < 2; k++) {
    const ax = k === 0 ? 1 : 0;
    const az = k === 0 ? 0 : 1;
    const a = push(-hw * ax, 0, -hw * az);
    const b = push(hw * ax, 0, hw * az);
    const c = push(hw * ax * 0.35, h, hw * az * 0.35);
    const d = push(-hw * ax * 0.35, h, -hw * az * 0.35);
    idx.push(a, b, c, a, c, d);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 草叶带：沿球面铺一圈随机朝向的草。
 * @param {object} o
 * @param {number} o.radius 星球半径
 * @param {(v:THREE.Vector3)=>number} [o.heightAt] 地形高度
 * @param {number} [o.count] 实例数
 * @param {number[]} [o.colors] 三种渐变色，随机取
 */
/** 在球面上取点；给了 region 就只在某个球冠里撒（用来种「一小片绿洲」） */
function unitSpherePointIn(rand, center, capCos) {
  if (!center) return unitSpherePoint(rand);
  const z = capCos + rand() * (1 - capCos);
  const phi = rand() * TAU;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  // 以 center 为极点的局部基
  const up = center.clone().normalize();
  const a = Math.abs(up.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const t1 = new THREE.Vector3().crossVectors(a, up).normalize();
  const t2 = new THREE.Vector3().crossVectors(up, t1).normalize();
  return up
    .clone()
    .multiplyScalar(z)
    .addScaledVector(t1, Math.cos(phi) * r)
    .addScaledVector(t2, Math.sin(phi) * r)
    .normalize();
}

export function makeGrassField({
  radius = 6,
  heightAt = null,
  count = 700,
  seed = 21,
  colors = [0x9fcf6e, 0x7fbb5a, 0xc8dd8a],
  bladeH = 0.3,
  region = null,
} = {}) {
  const rand = seeded(seed);
  const capCos = region ? Math.cos(region.spread ?? 0.25) : 1;
  const geo = bladeGeometry(0.055, bladeH);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0x3f5f28),
    emissiveIntensity: 1.05,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const dir = unitSpherePointIn(rand, region && region.dir, capCos);
    const h = heightAt ? heightAt(dir) : 0;
    dummy.position.copy(dir).multiplyScalar(radius + h);
    q.setFromUnitVectors(up, dir);
    const yaw = new THREE.Quaternion().setFromAxisAngle(up, rand() * TAU);
    dummy.quaternion.copy(q).multiply(yaw);
    const s = 0.7 + rand() * 0.7;
    dummy.scale.set(s, s * (0.8 + rand() * 0.6), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    c.set(colors[Math.floor(rand() * colors.length)]);
    c.offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08);
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** 野花：细茎 + 花头，两套 InstancedMesh */
export function makeFlowerField({
  radius = 6,
  heightAt = null,
  count = 140,
  seed = 33,
  palette = [0xfff4e2, 0xffd9e6, 0xffe9a8, 0xd9c6ff],
  stemColor = 0x6f9a52,
  size = 1,
  region = null,
} = {}) {
  const rand = seeded(seed);
  const capCos = region ? Math.cos(region.spread ?? 0.25) : 1;
  const group = new THREE.Group();
  const stemGeo = bladeGeometry(0.018, 0.22);
  const stemMat = new THREE.MeshLambertMaterial({
    color: stemColor,
    emissive: new THREE.Color(stemColor).multiplyScalar(0.35),
    side: THREE.DoubleSide,
  });
  const headGeo = new THREE.IcosahedronGeometry(0.045, 0);
  const headMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.55,
  });
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
  const heads = new THREE.InstancedMesh(headGeo, headMat, count);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const dir = unitSpherePointIn(rand, region && region.dir, capCos);
    const h = heightAt ? heightAt(dir) : 0;
    const ground = dir.clone().multiplyScalar(radius + h);
    q.setFromUnitVectors(up, dir);
    const yaw = new THREE.Quaternion().setFromAxisAngle(up, rand() * TAU);
    const s = (0.75 + rand() * 0.7) * size;
    dummy.position.copy(ground);
    dummy.quaternion.copy(q).multiply(yaw);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    // 花头贴在茎顶
    dummy.position.copy(ground).addScaledVector(dir, 0.2 * s);
    dummy.scale.setScalar(s * (0.85 + rand() * 0.5));
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    c.set(palette[Math.floor(rand() * palette.length)]);
    heads.setColorAt(i, c);
  }
  stems.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  group.add(stems, heads);
  group.userData.count = count;
  return group;
}

// ---------------------------------------------------------------- 组装

/**
 * 给一颗星球铺上「柔光地表」：太阳光晕、体积光柱、光尘、草叶、野花。
 * 章节在 `_dressBiome()` 里调用一次即可。
 *
 * @param {object} chapter 章节实例（用到 root / radius / sunDir / clock）
 * @param {object} o
 * @param {string} [o.palette] PALETTES 的键
 * @param {number} [o.grass] 草叶数量；0 表示没有草地（沙漠 / 岩石星球）
 * @param {number} [o.flowers] 野花数量
 * @param {number} [o.motes] 光尘数量
 * @param {number} [o.shafts] 光柱数量
 */
export function dressPlanet(chapter, o = {}) {
  const pal = paletteOf(o.palette);
  const radius = chapter.radius;
  const heightAt =
    o.heightAt ||
    (chapter.walker && chapter.walker.heightAt ? (d) => chapter.walker.heightAt(d) : null);

  const art = {
    palette: pal,
    sunDir: chapter.sunDir.clone(),
    halo: makeSunHalo(chapter.sunDir, { color: pal.glow, dist: radius * 42, size: radius * 26 }),
    shafts: makeLightShafts(chapter.sunDir, {
      color: pal.glow,
      count: o.shafts ?? 5,
      radius,
      height: radius * 4.2,
      opacity: 0.2,
    }),
    motes: makeMotes({ radius, count: o.motes ?? 220, color: o.motesColor ?? pal.glow, lift: radius * 0.35 }),
    grass: null,
    flowers: null,
  };
  chapter.root.add(art.halo, art.shafts, art.motes);

  if (o.grass !== 0) {
    art.grass = makeGrassField({
      radius,
      heightAt,
      count: o.grass ?? Math.round(radius * 150),
      seed: o.seed ?? undefined,
      colors: o.grassColors,
      bladeH: o.bladeH,
    });
    chapter.root.add(art.grass);
  }
  if (o.flowers !== 0) {
    art.flowers = makeFlowerField({
      radius,
      heightAt,
      count: o.flowers ?? Math.round(radius * 26),
      seed: (o.seed || 33) + 7,
      palette: o.flowerColors,
      size: o.flowerSize,
    });
    chapter.root.add(art.flowers);
  }

  chapter.art = art;
  chapter._artTick = (dt, time) => {
    if (art.motes.userData.tick) art.motes.userData.tick(dt, time);
    // 光晕随太阳高度呼吸，日落时更大更暖
    const k = chapter._dayK ? chapter._dayK() : 1;
    const haloMat = art.halo.material;
    haloMat.opacity = art.halo.userData.baseOpacity * (0.75 + (1 - k) * 0.45);
    for (const s of art.shafts.children) {
      s.material.opacity = s.userData.baseOpacity * (0.35 + (1 - k) * 0.9) * (0.8 + Math.sin(time * 0.5 + s.userData.phase) * 0.2);
    }
  };
  return art;
}

/** 太阳方向变化时，把光晕与光柱重新摆到太阳那边 */
export function aimArt(chapter) {
  const art = chapter.art;
  if (!art) return;
  const dir = chapter.sunDir;
  art.halo.position.copy(dir).normalize().multiplyScalar(chapter.radius * 42);
  const base = dir.clone().normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(base);
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(base, side).normalize();
  const count = art.shafts.children.length;
  art.shafts.children.forEach((s, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const spread = (t - 0.5) * 2;
    s.position
      .copy(base)
      .multiplyScalar(chapter.radius * 2.6)
      .addScaledVector(up, chapter.radius * 0.9)
      .addScaledVector(side, spread * chapter.radius * 1.5);
  });
}
