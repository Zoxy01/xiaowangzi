/**
 * 星球场景构建：程序化几何 + 星空 + 光照。
 * 约定：整个星球系统挂在 {rotAxis} 组里，让星球缓慢自转，
 * 玩家靠「反向自转」保持在原地（原站 B612TimeOfDay 的思路）。
 */
import * as THREE from 'three';

export const R = 6.0; // B-612 星球半径（世界单位）
// 交互距离收紧系数：各章配置的 radius 是旧版「- 星球半径」后的数值（1.35–1.8），
// 等于放宽了 5–6 m；改为真实距离后用 INTERACT_REACH 把阈值拉紧，需要靠近到跟前才能互动。
// 0.78 → 配置 1.25–2.2 对应 0.97–1.7 m：站在物件跟前就出提示，不用贴脸。
export const INTERACT_REACH = 0.78;

function noise(x, y, z) {
  return (
    Math.sin(x * 1.7 + Math.cos(y * 2.3)) * 0.5 +
    Math.sin(y * 2.1 + Math.cos(z * 1.9)) * 0.5
  );
}

/** 星球本体：顶点做径向扰动，得到「小坡」而不是完美球；顶点色做柔光渐变 */
export function makePlanet({ radius = R, color = 0x8a7a4a, detail = 40, bump = 0.045, tint = 0.24 } = {}) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(color);
  const light = base.clone().lerp(new THREE.Color(0xfff0d2), 0.42);
  const dark = base.clone().lerp(new THREE.Color(0x241d14), 0.34);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise(v.x * 0.6, v.y * 0.6, v.z * 0.6);
    // 第二层大尺度噪声：让地表有大块明暗，而不是均匀一片
    const patch = noise(v.x * 0.22 + 5.1, v.y * 0.22 - 2.7, v.z * 0.22 + 1.3);
    v.multiplyScalar(1 + n * bump);
    pos.setXYZ(i, v.x, v.y, v.z);
    const up = v.clone().normalize().y; // 上下半球轻微渐亮
    const k = 0.5 + n * 0.55 + patch * 0.3 + up * 0.08;
    c.copy(dark).lerp(base, THREE.MathUtils.clamp(k, 0, 1));
    c.lerp(light, THREE.MathUtils.clamp((k - 0.62) * tint * 3, 0, 0.55));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: false,
    emissive: base.clone().multiplyScalar(0.16),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** 把物体放到球面上：dir 为归一化方向，height 为离表面高度 */
export function placeOnSphere(obj, dir, height = 0, radius = R) {
  const n = dir.clone().normalize();
  obj.position.copy(n).multiplyScalar(radius + height);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  return obj;
}

/** 球面上的方向（方位角 az，纬度 lat） */
export function sphereDir(az, lat) {
  const cl = Math.cos(lat);
  return new THREE.Vector3(cl * Math.cos(az), Math.sin(lat), cl * Math.sin(az)).normalize();
}

// ------------------------------------------------------------- 火山
export function makeVolcano(scale = 1) {
  const g = new THREE.Group();

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.52 * scale, 0.62 * scale, 9, 3),
    new THREE.MeshStandardMaterial({ color: 0x6d5a41, roughness: 1, flatShading: true })
  );
  cone.position.y = 0.31 * scale;
  cone.castShadow = true;
  cone.receiveShadow = true;
  g.add(cone);

  // 火山口发光（活的火山才亮）
  const magma = new THREE.Mesh(
    new THREE.CircleGeometry(0.14 * scale, 10),
    new THREE.MeshBasicMaterial({ color: 0xff7a3c })
  );
  magma.rotation.x = -Math.PI / 2;
  magma.position.y = 0.615 * scale;
  g.add(magma);

  g.userData.magma = magma;
  return g;
}

// ------------------------------------------------------------- 玫瑰
export function makeRose() {
  const g = new THREE.Group();

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.024, 0.46, 6),
    new THREE.MeshStandardMaterial({ color: 0x3d6b3a, roughness: 0.9 })
  );
  stem.position.y = 0.23;
  stem.castShadow = true;
  g.add(stem);

  // 叶子
  for (const [i, sx] of [0, 1].entries()) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 7, 5),
      new THREE.MeshStandardMaterial({ color: 0x4a7d43, roughness: 0.9, flatShading: true })
    );
    leaf.scale.set(1, 0.28, 0.55);
    leaf.position.set(sx ? 0.07 : -0.07, 0.16 + i * 0.1, 0);
    leaf.rotation.z = sx ? -0.5 : 0.5;
    leaf.castShadow = true;
    g.add(leaf);
  }

  // 花冠：几层花瓣
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xc8324b, roughness: 0.72, flatShading: true });
  const flower = new THREE.Group();
  flower.position.y = 0.47;
  for (let ring = 0; ring < 3; ring++) {
    const n = 5 + ring * 2;
    const rr = 0.052 + ring * 0.018;
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(rr, 6, 4), petalMat);
      const a = (i / n) * Math.PI * 2 + ring * 0.4;
      p.scale.set(1, 1.35, 0.5);
      p.position.set(Math.cos(a) * rr * 0.85, ring * 0.012, Math.sin(a) * rr * 0.85);
      p.rotation.y = -a;
      p.rotation.x = -0.45 + ring * 0.2;
      p.castShadow = true;
      flower.add(p);
    }
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x8e1f33, roughness: 0.8 })
  );
  core.position.y = 0.03;
  flower.add(core);
  g.add(flower);

  // 四根刺
  const thornMat = new THREE.MeshStandardMaterial({ color: 0x2e5230, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const th = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.04, 4), thornMat);
    const a = (i / 4) * Math.PI * 2;
    th.position.set(Math.cos(a) * 0.022, 0.12 + i * 0.06, Math.sin(a) * 0.022);
    th.rotation.z = -Math.cos(a) * 1.4;
    th.rotation.x = Math.sin(a) * 1.4;
    g.add(th);
  }

  g.userData.flower = flower;
  return g;
}

// ------------------------------------------------------------- 玻璃罩
export function makeGlassGlobe() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshPhysicalMaterial({
      color: 0xcfe4ff,
      transparent: true,
      opacity: 0.16,
      roughness: 0.08,
      metalness: 0,
      transmission: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  dome.position.y = 0.5;
  g.add(dome);
  return g;
}

// ------------------------------------------------------------- 椅子
export function makeChair() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.88, flatShading: true });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.26), wood);
  seat.position.y = 0.19;
  seat.castShadow = true;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.035), wood);
  back.position.set(0, 0.31, -0.115);
  back.castShadow = true;
  g.add(back);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.19, 5), wood);
    leg.position.set(sx * 0.1, 0.095, sz * 0.1);
    g.add(leg);
  }
  return g;
}

// ------------------------------------------------------------- 水壶
export function makeWateringCan() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.45, metalness: 0.65 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.11, 10), metal);
  body.position.y = 0.055;
  body.castShadow = true;
  g.add(body);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.13, 6), metal);
  spout.position.set(0.075, 0.08, 0);
  spout.rotation.z = -0.85;
  g.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI), metal);
  handle.position.set(-0.03, 0.115, 0);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  return g;
}

// ------------------------------------------------------------- 工具棚
export function makeShed() {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a6d4a, roughness: 0.95, flatShading: true });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.36, 0.4), wallMat);
  box.position.y = 0.18;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);
  // 门
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.24, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x5f7a52, roughness: 0.9 })
  );
  door.position.set(0, 0.15, 0.205);
  g.add(door);
  // 斜屋顶
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.16, 4), new THREE.MeshStandardMaterial({ color: 0x6b4a35, roughness: 1, flatShading: true }));
  roof.position.y = 0.44;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  return g;
}

// ------------------------------------------------------------- 泉眼
export function makeSpring() {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6257, roughness: 1, flatShading: true });
  const basin = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 6, 12), rockMat);
  basin.rotation.x = Math.PI / 2;
  basin.position.y = 0.05;
  basin.castShadow = true;
  g.add(basin);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.15, 14),
    new THREE.MeshStandardMaterial({ color: 0x4a7f9e, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.9 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.055;
  g.add(water);
  g.userData.water = water;
  return g;
}

// ------------------------------------------------------------- 草
export function makeGrassPatch() {
  const g = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x5c7a42, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  const N = 26;
  const geo = new THREE.ConeGeometry(0.012, 0.1, 3);
  const inst = new THREE.InstancedMesh(geo, bladeMat, N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.55;
    p.set(Math.cos(a) * r, 0.045 + Math.random() * 0.02, Math.sin(a) * r);
    q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.5, Math.random() * 6.28, (Math.random() - 0.5) * 0.5));
    const h = 0.7 + Math.random() * 0.8;
    s.set(1, h, 1);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.castShadow = true;
  g.add(inst);
  return g;
}

// ------------------------------------------------------------- 星球道具（第二～八章共用）

/** 王座：高背椅 + 坐垫 + 扶手 */
export function makeThrone() {
  const g = new THREE.Group();
  const velvet = new THREE.MeshStandardMaterial({ color: 0x7a1f2e, roughness: 0.92, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.42, metalness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9, flatShading: true });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.36), velvet);
  seat.position.y = 0.24;
  seat.castShadow = true;
  g.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.06), velvet);
  back.position.set(0, 0.52, -0.15);
  back.castShadow = true;
  g.add(back);

  // 椅背金边
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 18, Math.PI), gold);
  trim.position.set(0, 0.74, -0.15);
  g.add(trim);

  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), wood);
    arm.position.set(sx * 0.19, 0.32, -0.02);
    g.add(arm);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 6), wood);
    post.position.set(sx * 0.19, 0.13, 0.14);
    g.add(post);
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.24, 6), wood);
    leg.position.set(sx * 0.15, 0.12, sz * 0.13);
    g.add(leg);
  }
  g.userData.seatY = 0.27;
  return g;
}

/** 国王的斗篷（挂在王座后面的大红布） */
export function makeCape() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8c1d2c,
    roughness: 0.95,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.34, 1.0);
  shape.lineTo(-0.34, 1.0);
  shape.lineTo(-0.5, 0);
  const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  cloth.castShadow = true;
  g.add(cloth);
  return g;
}

/** 路灯：灯柱 + 灯罩 + 光晕（点灯人星球） */
export function makeStreetLamp() {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.5 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.06, 10), iron);
  base.position.y = 0.03;
  g.add(base);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.72, 8), iron);
  post.position.y = 0.4;
  post.castShadow = true;
  g.add(post);

  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI / 2), iron);
  arm.position.set(0.06, 0.76, 0);
  arm.rotation.z = Math.PI;
  g.add(arm);

  // 灯罩
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.062, 0.078, 0.14, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffe6b0,
      emissive: 0xffb347,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.85,
      roughness: 0.3,
    })
  );
  glass.position.set(0.12, 0.72, 0);
  g.add(glass);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.05, 8), iron);
  cap.position.set(0.12, 0.815, 0);
  g.add(cap);

  // 光晕
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.16, depthWrite: false })
  );
  halo.position.copy(glass.position);
  g.add(halo);

  g.userData.glass = glass;
  g.userData.halo = halo;
  g.userData.light = new THREE.PointLight(0xffb347, 1.2, 3.2, 2);
  g.userData.light.position.copy(glass.position);
  g.add(g.userData.light);
  return g;
}

/** 酒桶/柜台（酒鬼星球） */
export function makeBarrel() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.92, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.55, metalness: 0.6 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.34, 12), wood);
  body.position.y = 0.17;
  body.castShadow = true;
  g.add(body);
  for (const y of [0.08, 0.27]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.01, 5, 16), iron);
    hoop.position.y = y;
    hoop.rotation.x = Math.PI / 2;
    g.add(hoop);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.02, 12), wood);
  top.position.y = 0.35;
  g.add(top);
  return g;
}

/** 酒瓶（空瓶/满瓶通用） */
export function makeBottle(color = 0x2c5b3a) {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.78,
    transmission: 0.4,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.15, 10), glass);
  body.position.y = 0.075;
  body.castShadow = true;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.038, 0.09, 8), glass);
  neck.position.y = 0.19;
  g.add(neck);
  const cork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.019, 0.022, 8),
    new THREE.MeshStandardMaterial({ color: 0xc8a165, roughness: 1 })
  );
  cork.position.y = 0.245;
  g.add(cork);
  return g;
}

/** 账本/票据堆（商人星球） */
export function makeLedger() {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 1, flatShading: true });
  const cover = new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.9, flatShading: true });
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.34), cover);
  book.position.y = 0.018;
  book.castShadow = true;
  g.add(book);
  for (let i = 0; i < 6; i++) {
    const page = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.004, 0.32), paper);
    page.position.set(0, 0.038 + i * 0.004, 0);
    page.rotation.y = (Math.random() - 0.5) * 0.04;
    g.add(page);
  }
  return g;
}

/** 望远镜（地理学家星球） */
export function makeTelescope() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3a, roughness: 0.35, metalness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9, flatShading: true });

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.4, 12), brass);
  tube.rotation.z = -0.9;
  tube.position.set(0, 0.26, 0);
  tube.castShadow = true;
  g.add(tube);

  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), wood);
    leg.position.set(sx * 0.08, 0.16, 0);
    leg.rotation.z = sx * 0.22;
    g.add(leg);
  }
  const leg3 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), wood);
  leg3.position.set(0, 0.16, 0.09);
  leg3.rotation.x = -0.24;
  g.add(leg3);
  return g;
}

/** 沙漠里的石头（地球） */
export function makeRock(scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 1, flatShading: true });
  const geo = new THREE.IcosahedronGeometry(0.2 * scale, 0);
  const rock = new THREE.Mesh(geo, mat);
  rock.position.y = 0.12 * scale;
  rock.scale.set(1, 0.7, 1.15);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  g.add(rock);
  return g;
}

/** 星空中的小光点（爱虚荣者星球的「掌声」视觉） */
export function makeSparkles(count = 14, radius = 0.5, color = 0xffe9a8) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * Math.PI - Math.PI / 2;
    const r = radius * (0.6 + Math.random() * 0.5);
    pos[i * 3] = Math.cos(e) * Math.cos(a) * r;
    pos[i * 3 + 1] = Math.abs(Math.sin(e)) * r * 1.2 + 0.3;
    pos[i * 3 + 2] = Math.cos(e) * Math.sin(a) * r;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size: 0.06,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.base = pos.slice();
  return pts;
}

// ------------------------------------------------------------- 星空
export function makeStars(count = 2600, radius = 380) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // 球壳均匀采样
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const d = radius * (0.85 + Math.random() * 0.3);
    pos[i * 3] = Math.cos(a) * r * d;
    pos[i * 3 + 1] = u * d;
    pos[i * 3 + 2] = Math.sin(a) * r * d;
    sizes[i] = 0.6 + Math.random() * 2.2;
    // 冷白 / 暖金 混合
    c.setHSL(0.09 + Math.random() * 0.06, 0.15 + Math.random() * 0.35, 0.72 + Math.random() * 0.25);
    if (Math.random() < 0.3) c.setHSL(0.58, 0.25, 0.85);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -900; // 画在天空背景之上
  return points;
}

/** 天空穹顶：渐变（黄昏/夜晚），随 sunElevation 插值
 *
 * 关键实现细节：这里**不能用 BackSide 的大球**。
 * 着色器把 position 当作视线方向用，但相机并不是永远在球心——
 * 相机贴在半径 7 的星球旁、球半径 600 时，背面的中心区域会被
 * 「前向剔除 + 深度」挡掉，结果画面大片变成清屏色（表现为全屏发黑）。
 * 改用屏幕空间全屏三角形：与相机位置无关，永远铺满背景。
 */
export function makeSkyDome() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );
  const uniforms = {
    topColor: { value: new THREE.Color(0x0a1030) },
    midColor: { value: new THREE.Color(0x2a2a55) },
    botColor: { value: new THREE.Color(0x6b4a4a) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    glowColor: { value: new THREE.Color(0xff9a5a) },
    glowAmount: { value: 0.6 },
    // 地平线雾光：让天空与地面接缝处有一层柔和的暖雾（光遇的标志性观感）
    hazeColor: { value: new THREE.Color(0xfff2dc) },
    hazeAmount: { value: 0.5 },
    // 球心方向（让渐变贴合「脚下的星球」）
    centerDir: { value: new THREE.Vector3(0, 0, -1) },
    // 相机的参考「上」方向：球面行走时它随角色脚下法线走，天空才会随抬头低头变化
    worldUp: { value: new THREE.Vector3(0, 1, 0) },
    // 相机矩阵：每帧由 Game 写入，用于还原真实视线方向
    camWorld: { value: new THREE.Matrix4() },
    camProjInv: { value: new THREE.Matrix4() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.FrontSide,
    depthWrite: false,
    depthTest: false,
    // 背景层用正交相机 + 全屏三角形，矩阵需要手动算出来传给 fragment
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform mat4 camWorld, camProjInv;
      uniform vec3 topColor, midColor, botColor, glowColor;
      uniform vec3 sunDir, centerDir, worldUp;
      uniform vec3 hazeColor;
      uniform float glowAmount, hazeAmount;
      varying vec2 vUv;

      void main() {
        // 由屏幕坐标反投影出真实世界视线方向
        // 关键：z 用 1.0（远平面），否则得到的是近平面上的点；
        // 且透视逆矩阵变换后要除以 w 才能回到视空间。
        vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
        vec4 eye = camProjInv * ndc;
        vec3 viewRay = normalize(eye.xyz / eye.w);
        vec3 dir = normalize((camWorld * vec4(viewRay, 0.0)).xyz);

        // 视觉上的天空渐变：以相机的「参考上方向」为准（worldUp 每帧由 Game 写入）。
        // 用球心方向会失效——球面行走时相机永远贴着地面看，
        // 视线与球心方向始终近似垂直，h 被钳在 0.5 附近，天空就变成一块纯色。
        // 区间按实际可视范围标定：相机 52° FOV、略俯视时 h 大致覆盖 0.42~0.88。
        float e = clamp(dot(dir, worldUp) * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(botColor, midColor, smoothstep(0.44, 0.62, e));
        col = mix(col, topColor, smoothstep(0.60, 0.86, e));

        float sun = max(0.0, dot(dir, normalize(sunDir)));
        col += glowColor * pow(sun, 26.0) * glowAmount;
        col += glowColor * pow(sun, 5.0) * 0.16 * glowAmount;
        // 更宽的一层太阳散射，避免太阳是个「硬边小点」
        col += glowColor * pow(sun, 2.2) * 0.055 * glowAmount;

        // 地平线雾光：e≈0.5 处最浓，向上向下迅速衰减。
        // 这层暖雾让天空与地面的接缝不再是一条生硬的线。
        float hz = exp(-abs(e - 0.5) * 15.0);
        col = mix(col, hazeColor, hz * hazeAmount * 0.5);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const quad = new THREE.Mesh(geo, mat);
  quad.frustumCulled = false;
  quad.renderOrder = -1000;
  quad.userData.uniforms = uniforms;
  // 作为「背景层」独立渲染：挂到场景外由 renderer.autoClear 控制
  quad.name = 'skydome';
  return quad;
}
