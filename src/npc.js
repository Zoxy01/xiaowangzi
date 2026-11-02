/**
 * 程序化低面数 NPC：国王、爱虚荣者、酒鬼、商人、点灯人、地理学家、地球上的人。
 * 与小王子同风格（flatShading、圆头、短身），高度约 0.9。
 * 坐标约定：脚底在原点，+Y 向上，正面朝 +Z；放在 chapter.root 下（局部坐标）。
 */
import * as THREE from 'three';

function m(color, rough = 0.85, metal = 0) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c, roughness: rough, metalness: metal, flatShading: true,
    emissive: c.clone().multiplyScalar(0.22),
  });
}

function add(g, geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

/**
 * @param {object} o
 *  coat 外衣色, trim 镶边色, skin 肤色, hair 头发色, pants 裤子色,
 *  robe 长袍（盖住腿）, hat: 'crown'|'top'|'cap'|'beret'|'pilot'|null,
 *  hatColor, beard: 颜色或 null, nose 鼻子色（酒鬼红鼻子）, belly 胖肚子, scale
 */
export function makeNPC(o = {}) {
  const coat = m(o.coat ?? 0x55607a);
  const trim = m(o.trim ?? 0xd8c27a, 0.5, 0.2);
  const skin = m(o.skin ?? 0xeac3a0);
  const hair = m(o.hair ?? 0x5a4030);
  const pants = m(o.pants ?? 0x33302c);
  const dark = m(0x1e1a18);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // 腿 / 长袍
  if (o.robe) {
    add(body, new THREE.CylinderGeometry(0.17, 0.27, 0.42, 10), coat, 0, 0.21, 0);
    add(body, new THREE.CylinderGeometry(0.275, 0.28, 0.04, 10), trim, 0, 0.02, 0);
  } else {
    for (const s of [-1, 1]) {
      add(body, new THREE.CylinderGeometry(0.045, 0.05, 0.22, 6), pants, s * 0.065, 0.11, 0);
      add(body, new THREE.BoxGeometry(0.09, 0.05, 0.14), dark, s * 0.065, 0.025, 0.025);
    }
  }

  // 躯干
  const torsoR = o.belly ? 0.19 : 0.14;
  add(body, new THREE.CylinderGeometry(0.12, torsoR, 0.32, 10), coat, 0, 0.38, 0);
  if (o.belly) add(body, new THREE.SphereGeometry(0.17, 10, 8), coat, 0, 0.33, 0.04);
  add(body, new THREE.CylinderGeometry(torsoR + 0.005, torsoR + 0.005, 0.035, 10), trim, 0, 0.25, 0);
  // 纽扣
  for (let i = 0; i < 3; i++) add(body, new THREE.SphereGeometry(0.014, 5, 4), trim, 0, 0.3 + i * 0.07, torsoR - 0.01 + (o.belly ? 0.06 : 0));

  // 手臂
  for (const s of [-1, 1]) {
    const arm = add(body, new THREE.CapsuleGeometry(0.038, 0.2, 3, 6), coat, s * 0.16, 0.4, 0);
    arm.rotation.z = s * 0.25;
    add(body, new THREE.SphereGeometry(0.035, 6, 5), skin, s * 0.19, 0.27, 0.01);
  }

  // 头
  const head = new THREE.Group();
  head.position.y = 0.66;
  body.add(head);
  add(head, new THREE.IcosahedronGeometry(0.13, 1), skin, 0, 0, 0);
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.014, 5, 4), dark, s * 0.045, 0.015, 0.118);
  add(head, new THREE.SphereGeometry(0.024, 6, 5), o.nose != null ? m(o.nose) : skin, 0, -0.015, 0.128);
  // 头发：后脑一片
  const back = add(head, new THREE.SphereGeometry(0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.01, -0.012);
  back.rotation.x = -0.35;
  if (o.beard != null) {
    const beard = add(head, new THREE.ConeGeometry(0.1, 0.22, 8), m(o.beard), 0, -0.14, 0.06);
    beard.rotation.x = Math.PI + 0.25;
  }

  // 帽子
  const hc = m(o.hatColor ?? 0x2a2a30, 0.6, o.hat === 'crown' ? 0.6 : 0);
  if (o.hat === 'crown') {
    add(head, new THREE.CylinderGeometry(0.1, 0.1, 0.07, 10, 1, true), hc, 0, 0.13, 0).material.side = THREE.DoubleSide;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(head, new THREE.ConeGeometry(0.022, 0.06, 4), hc, Math.cos(a) * 0.095, 0.19, Math.sin(a) * 0.095);
    }
  } else if (o.hat === 'top') {
    add(head, new THREE.CylinderGeometry(0.19, 0.19, 0.02, 14), hc, 0, 0.1, 0);
    add(head, new THREE.CylinderGeometry(0.1, 0.11, 0.26, 12), hc, 0, 0.23, 0);
    add(head, new THREE.CylinderGeometry(0.112, 0.112, 0.04, 12), trim, 0, 0.13, 0);
  } else if (o.hat === 'cap') {
    add(head, new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), hc, 0, 0.03, 0);
    add(head, new THREE.BoxGeometry(0.16, 0.015, 0.09), hc, 0, 0.06, 0.13);
  } else if (o.hat === 'beret') {
    const b = add(head, new THREE.SphereGeometry(0.14, 10, 6), hc, 0.02, 0.1, -0.01);
    b.scale.set(1.05, 0.38, 1.05);
  } else if (o.hat === 'pilot') {
    add(head, new THREE.SphereGeometry(0.138, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), hc, 0, 0.015, 0);
    for (const s of [-1, 1]) add(head, new THREE.TorusGeometry(0.035, 0.012, 5, 10), trim, s * 0.045, 0.06, 0.11);
  }
  if (o.cape) {
    const cape = add(body, new THREE.CylinderGeometry(0.16, 0.34, 0.5, 12, 1, true, Math.PI * 0.6, Math.PI * 0.8), m(o.cape), 0, 0.3, 0);
    cape.material.side = THREE.DoubleSide;
    cape.rotation.y = Math.PI;
  }

  root.scale.setScalar(o.scale ?? 1);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _x = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v2 = new THREE.Vector3();

/** 把 NPC 立在球面上，面向 target（同一坐标系的点）。 */
export function placeNPC(npc, dir, radius, faceTo) {
  _up.copy(dir).normalize();
  npc.position.copy(_up).multiplyScalar(radius);
  faceNPC(npc, faceTo, 1);
}

/** 每帧调用：慢慢转向 target，并轻微呼吸起伏。 */
export function faceNPC(npc, target, k = 0.08, dt = 0) {
  _up.copy(npc.position).normalize();
  if (target) {
    _dir.copy(target).sub(npc.position);
    _dir.addScaledVector(_up, -_dir.dot(_up));
    if (_dir.lengthSq() > 1e-6) {
      _dir.normalize();
      _x.crossVectors(_up, _dir).normalize();
      _m.makeBasis(_x, _up, _dir);
      _q.setFromRotationMatrix(_m);
      npc.quaternion.slerp(_q, k);
    }
  }
  const d = npc.userData.npc;
  if (d && dt) {
    d.t += dt;
    d.body.scale.y = 1 + Math.sin(d.t * 2.1) * 0.015;
    d.head.rotation.z = Math.sin(d.t * 0.9) * 0.05;
  }
}

/**
 * 坐着的人只转头看人（身体固定在椅子上）。
 * target 用与 npc 同坐标系之外的**世界坐标**点；内部转成 npc 局部，绕 Y 夹在 ±0.75 rad。
 */
export function faceHeadOnly(npc, targetWorld, k = 0.08) {
  const d = npc.userData.npc;
  if (!d || !d.head) return;
  npc.updateWorldMatrix(true, false);
  _v2.copy(targetWorld);
  npc.worldToLocal(_v2);
  const want = Math.max(-0.75, Math.min(0.75, Math.atan2(_v2.x, _v2.z)));
  d.head.rotation.y += (want - d.head.rotation.y) * k;
}

/** 从 dir 沿球面偏移 dist 米得到新方向（side 用于选方向）。 */
export function besideDir(dir, radius, dist, angleDeg = 90) {
  const n = dir.clone().normalize();
  const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t = new THREE.Vector3().crossVectors(ref, n).normalize();
  t.applyAxisAngle(n, (angleDeg * Math.PI) / 180);
  return n.addScaledVector(t, dist / radius).normalize();
}

// ================================================================
// 六个有名有姓的角色：每颗星球一个人，外形与道具各自不同
// 共同约定：脚底在原点、+Y 向上、正面 +Z、userData.npc 供 faceNPC 呼吸
// ================================================================

/** 头 + 五官 + 后脑头发，返回 head 组（可再设 rotation.x 调姿态）。 */
function headGroup(body, y, skin, hair, dark, noseColor) {
  const head = new THREE.Group();
  head.position.y = y;
  body.add(head);
  add(head, new THREE.IcosahedronGeometry(0.13, 1), skin, 0, 0, 0);
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.014, 5, 4), dark, s * 0.045, 0.015, 0.118);
  add(head, new THREE.SphereGeometry(0.024, 6, 5), noseColor ? m(noseColor) : skin, 0, -0.015, 0.128);
  const back = add(head, new THREE.SphereGeometry(0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.01, -0.012);
  back.rotation.x = -0.35;
  return head;
}

/** 国王：高冠、貂皮披风、权杖、白胡子，比小王子高出一个头。 */
export function makeKingNPC(o = {}) {
  const seated = o.seated === true;
  const robe = m(0x8e2430), fur = m(0xf1e9dc, 0.95), gold = m(0xd8b23f, 0.35, 0.8);
  const skin = m(0xe8c39c), hair = m(0x8d7659), dark = m(0x1e1a18);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  if (seated) {
    // 坐姿：胯部正好落在王座座面（座面高 0.27），小腿垂在座前，袍子朝前摊开。
    // 这个分支的坐标就是「王座局部坐标」，所以 king.js 把它挂到 throne 下、位移≈0。
    for (const s of [-1, 1]) {
      // 大腿朝前、小腿垂下
      const thigh = add(body, new THREE.CapsuleGeometry(0.062, 0.13, 3, 8), robe, s * 0.09, 0.34, 0.1);
      thigh.rotation.x = Math.PI / 2;
      const shin = add(body, new THREE.CapsuleGeometry(0.05, 0.16, 3, 8), robe, s * 0.09, 0.16, 0.3);
      add(body, new THREE.BoxGeometry(0.1, 0.055, 0.17), dark, s * 0.09, 0.028, 0.335);
    }
    add(body, new THREE.CylinderGeometry(0.215, 0.32, 0.26, 12), robe, 0, 0.235, 0.02);
    add(body, new THREE.CylinderGeometry(0.325, 0.33, 0.045, 12), fur, 0, 0.105, 0.02);
    // 躯干（比站姿短一截，因为胯已经坐在座面上）
    add(body, new THREE.CylinderGeometry(0.13, 0.2, 0.26, 12), robe, 0, 0.49, 0.01);
    add(body, new THREE.CylinderGeometry(0.205, 0.205, 0.05, 12), gold, 0, 0.375, 0.01);
    for (const s of [-1, 1]) add(body, new THREE.SphereGeometry(0.05, 8, 6), gold, s * 0.16, 0.6, 0.03);
    // 左手搭在扶手上，右手扶着插在地上的权杖
    const armL = add(body, new THREE.CapsuleGeometry(0.045, 0.2, 3, 6), robe, -0.2, 0.47, 0.06);
    armL.rotation.z = -0.3; armL.rotation.x = -0.5;
    const armR = add(body, new THREE.CapsuleGeometry(0.045, 0.2, 3, 6), robe, 0.21, 0.46, 0.09);
    armR.rotation.z = 0.28; armR.rotation.x = -0.42;
    add(body, new THREE.SphereGeometry(0.04, 6, 5), skin, -0.245, 0.33, 0.15);
    add(body, new THREE.SphereGeometry(0.04, 6, 5), skin, 0.275, 0.35, 0.19);
    // 权杖拄在地上
    add(body, new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6), gold, 0.3, 0.31, 0.2);
    add(body, new THREE.SphereGeometry(0.038, 8, 6), gold, 0.3, 0.64, 0.2);
    add(body, new THREE.SphereGeometry(0.038, 8, 6), gold, 0.3, 0.68, 0.2);
  } else {
    add(body, new THREE.CylinderGeometry(0.19, 0.33, 0.54, 12), robe, 0, 0.27, 0);
    add(body, new THREE.CylinderGeometry(0.335, 0.345, 0.05, 12), fur, 0, 0.025, 0);
    add(body, new THREE.CylinderGeometry(0.205, 0.205, 0.05, 12), gold, 0, 0.36, 0);
    add(body, new THREE.CylinderGeometry(0.15, 0.2, 0.3, 10), robe, 0, 0.52, 0);
    for (const s of [-1, 1]) add(body, new THREE.SphereGeometry(0.05, 8, 6), gold, s * 0.17, 0.63, 0);
    // 貂皮披风：背后一段开口筒
    const cape = add(body, new THREE.CylinderGeometry(0.2, 0.38, 0.6, 12, 1, true, Math.PI * 0.45, Math.PI * 0.9), fur, 0, 0.42, 0);
    cape.material.side = THREE.DoubleSide;
    cape.rotation.y = Math.PI;

    const armL = add(body, new THREE.CapsuleGeometry(0.045, 0.22, 3, 6), robe, -0.2, 0.52, 0);
    armL.rotation.z = -0.22;
    const armR = add(body, new THREE.CapsuleGeometry(0.045, 0.22, 3, 6), robe, 0.2, 0.55, 0.04);
    armR.rotation.z = 0.42; armR.rotation.x = -0.3;
    add(body, new THREE.SphereGeometry(0.04, 6, 5), skin, -0.22, 0.4, 0.01);
    add(body, new THREE.SphereGeometry(0.04, 6, 5), skin, 0.26, 0.66, 0.15);

    // 权杖
    const staff = add(body, new THREE.CylinderGeometry(0.012, 0.012, 0.72, 6), gold, 0.28, 0.5, 0.17);
    staff.rotation.z = 0.1;
    add(body, new THREE.SphereGeometry(0.038, 8, 6), gold, 0.31, 0.87, 0.17);
  }

  const head = headGroup(body, seated ? 0.73 : 0.78, skin, hair, dark);
  head.rotation.x = -0.08;
  const beard = add(head, new THREE.ConeGeometry(0.11, 0.24, 8), m(0xe6dfd0, 0.95), 0, -0.15, 0.045);
  beard.rotation.x = Math.PI + 0.22;
  const crown = add(head, new THREE.CylinderGeometry(0.105, 0.105, 0.075, 12, 1, true), gold, 0, 0.135, 0);
  crown.material.side = THREE.DoubleSide;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(head, new THREE.ConeGeometry(0.022, 0.06, 4), gold, Math.cos(a) * 0.098, 0.2, Math.sin(a) * 0.098);
  }
  add(head, new THREE.SphereGeometry(0.018, 6, 5), m(0xb0313f, 0.3, 0.4), 0, 0.14, 0.104);

  root.scale.setScalar(seated ? 1.0 : 1.06);
  root.userData.npc = { body, head, t: Math.random() * 6, seated, headOnly: seated };
  return root;
}

/** 爱虚荣的人：高礼帽插羽毛、单手叉腰、另一只手举着镜子。 */
export function makeConceitedNPC() {
  const coat = m(0x6f3a78), trim = m(0xd8c8d6, 0.6, 0.2), pants = m(0x2f2735);
  const skin = m(0xf0cbaa), hair = m(0x3a2a26), dark = m(0x1e1a18), glass = m(0xcfd8e2, 0.15, 0.9);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  for (const s of [-1, 1]) {
    add(body, new THREE.CylinderGeometry(0.045, 0.05, 0.26, 6), pants, s * 0.06, 0.13, 0);
    add(body, new THREE.BoxGeometry(0.09, 0.05, 0.15), dark, s * 0.06, 0.025, 0.02);
  }
  add(body, new THREE.CylinderGeometry(0.115, 0.155, 0.34, 10), coat, 0, 0.44, 0);
  add(body, new THREE.CylinderGeometry(0.158, 0.158, 0.03, 10), trim, 0, 0.3, 0);
  for (let i = 0; i < 3; i++) add(body, new THREE.SphereGeometry(0.013, 5, 4), trim, 0, 0.33 + i * 0.07, 0.15);

  // 左手叉腰
  const upperL = add(body, new THREE.CapsuleGeometry(0.035, 0.16, 3, 6), coat, -0.16, 0.46, 0);
  upperL.rotation.z = -1.05;
  const foreL = add(body, new THREE.CapsuleGeometry(0.032, 0.14, 3, 6), coat, -0.235, 0.38, 0.03);
  foreL.rotation.z = -0.25;
  add(body, new THREE.SphereGeometry(0.033, 6, 5), skin, -0.19, 0.3, 0.03);
  // 右手举镜子
  const upperR = add(body, new THREE.CapsuleGeometry(0.035, 0.16, 3, 6), coat, 0.17, 0.5, 0.02);
  upperR.rotation.z = 0.45; upperR.rotation.x = -0.75;
  add(body, new THREE.SphereGeometry(0.033, 6, 5), skin, 0.17, 0.62, 0.13);
  const handle = add(body, new THREE.CylinderGeometry(0.008, 0.008, 0.09, 5), trim, 0.17, 0.67, 0.15);
  handle.rotation.x = 0.5;
  const rim = add(body, new THREE.TorusGeometry(0.055, 0.008, 5, 14), trim, 0.17, 0.74, 0.16);
  rim.rotation.x = -0.35;
  const lens = add(body, new THREE.CircleGeometry(0.052, 14), glass, 0.17, 0.74, 0.163);
  lens.rotation.x = -0.35;
  lens.material.side = THREE.DoubleSide;

  const head = headGroup(body, 0.68, skin, hair, dark);
  head.rotation.x = -0.16; // 下巴抬着
  for (let i = 0; i < 3; i++) {
    const a = -0.9 + i * 0.9;
    const curl = add(head, new THREE.SphereGeometry(0.045, 7, 6), hair, Math.cos(a) * 0.09, 0.09, -0.09);
    curl.scale.set(1, 0.8, 0.8);
  }
  const hc = m(0x241f2c, 0.55);
  add(head, new THREE.CylinderGeometry(0.185, 0.19, 0.018, 14), hc, 0, 0.1, 0);
  add(head, new THREE.CylinderGeometry(0.098, 0.104, 0.3, 12), hc, 0, 0.26, 0);
  add(head, new THREE.CylinderGeometry(0.107, 0.107, 0.035, 12), m(0x7a2f45, 0.6), 0, 0.13, 0);
  const feather = add(head, new THREE.ConeGeometry(0.03, 0.24, 5), m(0xd94f6b, 0.8), 0.1, 0.36, -0.02);
  feather.rotation.z = 0.3; feather.scale.set(1, 1, 0.45);

  root.scale.setScalar(1.02);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

/** 酒鬼：驼背、红鼻子、眼袋、手里一只酒瓶，帽子歪戴着。 */
export function makeTipplerNPC() {
  const coat = m(0x8a5a44), trim = m(0x5f3f31), pants = m(0x3e3940);
  const skin = m(0xd9a888), hair = m(0x4a3a2e), dark = m(0x1e1a18);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.x = 0.16;
  body.position.y = 0.02; // 驼背后前倾，抬高一点避免脚部切进球面
  root.add(body);

  for (const s of [-1, 1]) {
    add(body, new THREE.CylinderGeometry(0.05, 0.055, 0.22, 6), pants, s * 0.07, 0.11, 0);
    add(body, new THREE.BoxGeometry(0.1, 0.05, 0.16), dark, s * 0.07, 0.025, 0.03);
  }
  add(body, new THREE.CylinderGeometry(0.125, 0.175, 0.34, 10), coat, 0, 0.36, 0);
  add(body, new THREE.SphereGeometry(0.165, 10, 8), coat, 0, 0.33, 0.05);
  add(body, new THREE.CylinderGeometry(0.178, 0.178, 0.035, 10), trim, 0, 0.23, 0);

  const armL = add(body, new THREE.CapsuleGeometry(0.04, 0.2, 3, 6), coat, -0.18, 0.4, 0.02);
  armL.rotation.z = -0.18; armL.rotation.x = -0.25;
  add(body, new THREE.SphereGeometry(0.036, 6, 5), skin, -0.2, 0.26, 0.06);
  const armR = add(body, new THREE.CapsuleGeometry(0.04, 0.17, 3, 6), coat, 0.18, 0.42, 0.04);
  armR.rotation.z = 0.3; armR.rotation.x = -0.55;
  add(body, new THREE.SphereGeometry(0.036, 6, 5), skin, 0.21, 0.34, 0.12);

  // 酒瓶
  const bottle = new THREE.Group();
  bottle.position.set(0.22, 0.36, 0.14);
  bottle.rotation.z = 0.35;
  const glass = new THREE.MeshStandardMaterial({
    color: 0x2f5a34, roughness: 0.25, metalness: 0.1, flatShading: true,
    emissive: new THREE.Color(0x1d3a20), transparent: true, opacity: 0.9,
  });
  const bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.14, 8), glass);
  bottleBody.castShadow = true;
  bottle.add(bottleBody);
  add(bottle, new THREE.CylinderGeometry(0.014, 0.02, 0.07, 6), glass, 0, 0.1, 0);
  add(bottle, new THREE.CylinderGeometry(0.015, 0.015, 0.014, 6), m(0x8a6a44), 0, 0.14, 0);
  add(bottle, new THREE.BoxGeometry(0.045, 0.03, 0.004), m(0xd8cbb0, 0.9), 0, 0.01, 0.04);
  body.add(bottle);

  const head = headGroup(body, 0.6, skin, hair, dark, 0xb9473d);
  head.rotation.x = 0.22;
  for (const s of [-1, 1]) {
    const bag = add(head, new THREE.SphereGeometry(0.02, 5, 4), m(0x9a7a66), s * 0.055, -0.055, 0.1);
    bag.scale.set(1, 0.7, 0.6);
  }
  for (let i = 0; i < 3; i++) {
    const tuft = add(head, new THREE.ConeGeometry(0.03, 0.09, 5), hair, (i - 1) * 0.06, -0.17, 0.03);
    tuft.rotation.x = Math.PI + 0.2;
  }
  const cap = add(head, new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), m(0x584539, 0.9), 0, 0.02, 0);
  cap.rotation.z = 0.22; cap.rotation.x = -0.18;

  root.scale.setScalar(0.98);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

/** 商人：深蓝西装马甲、圆眼镜、怀里一本账本，耳朵上夹着铅笔。 */
export function makeBusinessmanNPC() {
  const suit = m(0x3f5470), vest = m(0x2f4056), shirt = m(0xeae6dc, 0.8), tie = m(0x8a2f3a);
  const pants = m(0x30343d), skin = m(0xf0cbaa), hair = m(0x2c2622), dark = m(0x1e1a18);
  const gold = m(0xd8b23f, 0.35, 0.8);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  for (const s of [-1, 1]) {
    add(body, new THREE.CylinderGeometry(0.048, 0.052, 0.28, 6), pants, s * 0.062, 0.14, 0);
    add(body, new THREE.BoxGeometry(0.095, 0.05, 0.16), dark, s * 0.062, 0.025, 0.03);
  }
  add(body, new THREE.CylinderGeometry(0.115, 0.155, 0.36, 10), suit, 0, 0.44, 0);
  add(body, new THREE.CylinderGeometry(0.117, 0.15, 0.2, 10), vest, 0, 0.46, 0.004);
  add(body, new THREE.BoxGeometry(0.07, 0.2, 0.02), shirt, 0, 0.5, 0.128);
  add(body, new THREE.BoxGeometry(0.028, 0.16, 0.012), tie, 0, 0.48, 0.14);
  for (const s of [-1, 1]) add(body, new THREE.SphereGeometry(0.026, 6, 5), shirt, s * 0.026, 0.6, 0.12);

  // 双手捧着账本
  const book = new THREE.Group();
  book.position.set(0, 0.36, 0.17);
  book.rotation.x = -0.55;
  add(book, new THREE.BoxGeometry(0.19, 0.03, 0.24), vest, 0, 0, 0);
  add(book, new THREE.BoxGeometry(0.175, 0.022, 0.225), m(0xe8e2d2, 0.95), 0, 0.012, 0);
  for (let i = 0; i < 3; i++) add(book, new THREE.BoxGeometry(0.15, 0.003, 0.006), m(0x9a9484), 0, 0.025, -0.06 + i * 0.055);
  body.add(book);
  const armL = add(body, new THREE.CapsuleGeometry(0.038, 0.15, 3, 6), suit, -0.15, 0.44, 0.08);
  armL.rotation.x = -0.85; armL.rotation.z = -0.2;
  const armR = add(body, new THREE.CapsuleGeometry(0.038, 0.15, 3, 6), suit, 0.15, 0.44, 0.08);
  armR.rotation.x = -0.85; armR.rotation.z = 0.2;
  add(body, new THREE.SphereGeometry(0.034, 6, 5), skin, -0.11, 0.3, 0.2);
  add(body, new THREE.SphereGeometry(0.034, 6, 5), skin, 0.11, 0.3, 0.2);

  const head = headGroup(body, 0.7, skin, hair, dark);
  for (const s of [-1, 1]) add(head, new THREE.TorusGeometry(0.042, 0.006, 4, 14), gold, s * 0.05, 0.015, 0.115);
  add(head, new THREE.BoxGeometry(0.03, 0.006, 0.006), gold, 0, 0.02, 0.115);
  const pencil = add(head, new THREE.CylinderGeometry(0.006, 0.006, 0.13, 5), m(0xd8a63a, 0.7), 0.115, 0.06, -0.01);
  pencil.rotation.z = 0.7;

  root.scale.setScalar(1.03);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

/** 点灯人：举着长杆，杆头挂着一盏刚点亮的灯。 */
export function makeLamplighterNPC() {
  const coat = m(0x5b6b4d), pants = m(0x3c4148);
  const skin = m(0xe8c39c), hair = m(0x5a4a3a), dark = m(0x1e1a18);
  const iron = m(0x2f3336, 0.4, 0.6);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  for (const s of [-1, 1]) {
    add(body, new THREE.CylinderGeometry(0.048, 0.052, 0.26, 6), pants, s * 0.065, 0.13, 0);
    add(body, new THREE.BoxGeometry(0.1, 0.06, 0.17), dark, s * 0.065, 0.03, 0.03);
  }
  add(body, new THREE.CylinderGeometry(0.115, 0.16, 0.36, 10), coat, 0, 0.44, 0);
  add(body, new THREE.CylinderGeometry(0.163, 0.163, 0.035, 10), m(0x3a3b3e), 0, 0.28, 0);
  add(body, new THREE.TorusGeometry(0.115, 0.022, 5, 12), m(0x9a4b3a, 0.9), 0, 0.62, 0);

  const armDown = add(body, new THREE.CapsuleGeometry(0.04, 0.19, 3, 6), coat, -0.17, 0.44, 0);
  armDown.rotation.z = -0.16;
  add(body, new THREE.SphereGeometry(0.036, 6, 5), skin, -0.19, 0.3, 0.01);
  const armUp = add(body, new THREE.CapsuleGeometry(0.04, 0.2, 3, 6), coat, 0.18, 0.55, 0.03);
  armUp.rotation.z = 0.55; armUp.rotation.x = -0.45;
  add(body, new THREE.SphereGeometry(0.036, 6, 5), skin, 0.26, 0.68, 0.09);

  // 长杆 + 钩子 + 灯
  const pole = add(body, new THREE.CylinderGeometry(0.011, 0.013, 1.0, 6), iron, 0.3, 0.6, 0.08);
  pole.rotation.z = 0.12;
  const hook = add(body, new THREE.TorusGeometry(0.045, 0.008, 5, 10, Math.PI * 1.2), iron, 0.36, 1.05, 0.08);
  hook.rotation.z = -0.4;
  const lantern = new THREE.Group();
  lantern.position.set(0.4, 1.0, 0.08);
  add(lantern, new THREE.CylinderGeometry(0.055, 0.06, 0.02, 8), iron, 0, 0.06, 0);
  add(lantern, new THREE.CylinderGeometry(0.058, 0.058, 0.02, 8), iron, 0, -0.06, 0);
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffd9a0, roughness: 0.4, flatShading: true,
    emissive: new THREE.Color(0xffb45a), emissiveIntensity: 1.6, transparent: true, opacity: 0.92,
  });
  lantern.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8), flameMat));
  body.add(lantern);

  const head = headGroup(body, 0.68, skin, hair, dark);
  const cap = add(head, new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), m(0x3a3b3e, 0.9), 0, 0.03, 0);
  cap.rotation.x = -0.1;
  add(head, new THREE.BoxGeometry(0.16, 0.015, 0.09), m(0x3a3b3e, 0.9), 0, 0.06, 0.13);

  root.scale.setScalar(0.98);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

/** 地理学家：长袍、圆眼镜、白长胡子，腋下夹着一本厚书，手里一支羽毛笔。 */
export function makeGeographerNPC() {
  const robe = m(0x8b8677), trim = m(0xd6cfb9, 0.7), belt = m(0x5b5148);
  const skin = m(0xe6c6a6), hair = m(0xd0cbbd), dark = m(0x1e1a18), gold = m(0xc9a95a, 0.35, 0.7);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.x = 0.12; // 略微伏在书上
  body.position.y = 0.04; // 前倾后书角会向下探，整体抬高避免切进地面
  root.add(body);

  add(body, new THREE.CylinderGeometry(0.18, 0.3, 0.5, 12), robe, 0, 0.25, 0);
  add(body, new THREE.CylinderGeometry(0.305, 0.31, 0.04, 12), trim, 0, 0.02, 0);
  add(body, new THREE.CylinderGeometry(0.16, 0.19, 0.3, 10), robe, 0, 0.5, 0);
  add(body, new THREE.CylinderGeometry(0.175, 0.175, 0.04, 10), belt, 0, 0.38, 0);

  // 左臂夹着书
  const armL = add(body, new THREE.CapsuleGeometry(0.04, 0.18, 3, 6), robe, -0.17, 0.5, 0.01);
  armL.rotation.z = -0.35; armL.rotation.x = -0.2;
  add(body, new THREE.SphereGeometry(0.036, 6, 5), skin, -0.2, 0.4, 0.09);
  const book = new THREE.Group();
  book.position.set(-0.22, 0.44, 0.1);
  book.rotation.z = 0.3; book.rotation.y = -0.2;
  add(book, new THREE.BoxGeometry(0.2, 0.05, 0.26), m(0x5e4632, 0.9), 0, 0, 0);
  add(book, new THREE.BoxGeometry(0.185, 0.042, 0.245), m(0xefe8d6, 0.95), 0.004, 0, 0.002);
  add(book, new THREE.BoxGeometry(0.19, 0.052, 0.02), gold, 0, 0, -0.12);
  body.add(book);

  // 右手拿羽毛笔
  const armR = add(body, new THREE.CapsuleGeometry(0.04, 0.18, 3, 6), robe, 0.17, 0.5, 0.03);
  armR.rotation.z = 0.3; armR.rotation.x = -0.5;
  add(body, new THREE.SphereGeometry(0.036, 6, 5), skin, 0.2, 0.42, 0.13);
  const quill = new THREE.Group();
  quill.position.set(0.21, 0.46, 0.14);
  quill.rotation.z = -0.45; quill.rotation.x = 0.3;
  add(quill, new THREE.CylinderGeometry(0.005, 0.008, 0.2, 5), m(0xf2ecdc, 0.95), 0, 0.06, 0);
  const plume = add(quill, new THREE.ConeGeometry(0.028, 0.14, 5), m(0xf6f0e2, 0.95), 0, 0.2, 0);
  plume.scale.set(1, 1, 0.45);
  body.add(quill);

  const head = headGroup(body, 0.72, skin, hair, dark);
  for (const s of [-1, 1]) add(head, new THREE.TorusGeometry(0.042, 0.005, 4, 14), gold, s * 0.05, 0.015, 0.115);
  add(head, new THREE.BoxGeometry(0.03, 0.005, 0.005), gold, 0, 0.02, 0.115);
  const beard = add(head, new THREE.ConeGeometry(0.1, 0.3, 8), m(0xdcd6c8, 0.95), 0, -0.19, 0.04);
  beard.rotation.x = Math.PI + 0.12;
  const beret = add(head, new THREE.SphereGeometry(0.14, 10, 6), m(0x635e55, 0.85), 0.02, 0.1, -0.01);
  beret.scale.set(1.05, 0.36, 1.05);

  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}
