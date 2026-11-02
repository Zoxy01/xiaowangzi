/**
 * 小王子角色：程序化低面数模型（约 6k 三角面，单个角色 < 0.3 MB 显存）。
 * 不导入原作网格（body 5.4 万顶点 + 围巾 1.4 万顶点，且有版权），按用户给的模型设计稿重建：
 *   薄荷绿立领外套（三颗金扣、深绿镶边）、金黄宽腰带、同色绿长裤、
 *   棕色系带短靴、蓬松的金色卷发、浅肤色；再加一条金黄围巾（设计稿没有，用户要求补上）。
 * 比例按设计稿：约 4.5 头身（比早先的大头 Q 版更接近参考模型），总高仍保持 0.9 —— 相机构图按这个高度调过。
 * 动画用部件 pivot：idle 呼吸、走路摆臂摆腿、抬头/低头、围巾飘带逐节波动。
 *
 * 对外接口（各章节在用，别改名）：root、head、headTilt、arms[i].pivot、legs、scarfTail、
 * scarfStrips、coat、update()、lookAtPoint()。脸朝局部 +Z，脚底在 y=0，总高约 0.9。
 */
import * as THREE from 'three';

const COLORS = {
  jacket: 0x6f9558,
  jacketDark: 0x4f7040,
  jacketLight: 0x87ab6b,
  trouser: 0x5e8049,
  sash: 0xe9b84c,
  sashDark: 0xcf9c31,
  scarf: 0xf3b945,
  scarfDark: 0xdc9c2c,
  hair: 0xe8c473,
  hairDark: 0xd3a453,
  skin: 0xf6d8b8,
  skinShade: 0xe4b795,
  boot: 0x8a5a3b,
  bootDark: 0x6b4329,
  sole: 0x43301f,
  eye: 0x3a2a1e,
  brow: 0xc39a52,
  button: 0xe7c25c,
  mouth: 0xc07f6a,
};

function mat(color, { rough = 0.8, flat = false, side = THREE.FrontSide, glow = 0.3 } = {}) {
  // emissive 底光：黄昏/夜晚时角色不至于和背景糊在一起
  // （实测日落时角色区域 avg=59.3、背景 61.9，几乎看不见人）。
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: 0,
    flatShading: flat,
    side,
    emissive: c.clone().multiplyScalar(glow),
    emissiveIntensity: 1,
  });
}

/**
 * 一条围巾飘带：若干节首尾相接的 pivot，每节一块略收窄的薄片，沿 -Y 方向垂下。
 * 返回 { root, segs }，动画时逐节加 rotation.x 形成波浪。
 */
function makeScarfStrip(material, { segs, segLen, width, taper = 0.75 }) {
  const root = new THREE.Group();
  const list = [];
  let parent = root;
  for (let i = 0; i < segs; i++) {
    const pivot = new THREE.Group();
    if (i > 0) pivot.position.y = -segLen;
    const w = width * (1 - (i / segs) * (1 - taper));
    const geo = new THREE.BoxGeometry(w, segLen * 1.04, 0.013);
    geo.translate(0, -segLen / 2, 0);
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    pivot.add(m);
    parent.add(pivot);
    list.push(pivot);
    parent = pivot;
  }
  return { root, segs: list };
}

export class PrinceAvatar {
  constructor() {
    const root = new THREE.Group();
    root.name = 'prince';
    this.root = root;

    const mJacket = mat(COLORS.jacket, { rough: 0.86 });
    const mJacketDark = mat(COLORS.jacketDark, { rough: 0.9 });
    const mJacketLight = mat(COLORS.jacketLight, { rough: 0.86 });
    const mTrouser = mat(COLORS.trouser, { rough: 0.9 });
    const mSash = mat(COLORS.sash, { rough: 0.72, glow: 0.34 });
    const mSashDark = mat(COLORS.sashDark, { rough: 0.78, glow: 0.3 });
    const mScarf = mat(COLORS.scarf, { rough: 0.74, side: THREE.DoubleSide, glow: 0.34 });
    const mScarfDark = mat(COLORS.scarfDark, { rough: 0.78, side: THREE.DoubleSide, glow: 0.3 });
    const mHair = mat(COLORS.hair, { rough: 0.62, glow: 0.32 });
    const mHairDark = mat(COLORS.hairDark, { rough: 0.66, glow: 0.28 });
    const mSkin = mat(COLORS.skin, { rough: 0.74, glow: 0.28 });
    const mSkinShade = mat(COLORS.skinShade, { rough: 0.78, glow: 0.24 });
    const mBoot = mat(COLORS.boot, { rough: 0.7 });
    const mBootDark = mat(COLORS.bootDark, { rough: 0.75 });
    const mSole = mat(COLORS.sole, { rough: 0.95, glow: 0.12 });
    const mButton = mat(COLORS.button, { rough: 0.32, glow: 0.42 });
    const mEye = new THREE.MeshStandardMaterial({ color: COLORS.eye, roughness: 0.22 });
    const mWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mBrow = mat(COLORS.brow, { rough: 0.7, glow: 0.2 });
    const mMouth = new THREE.MeshStandardMaterial({ color: COLORS.mouth, roughness: 0.6 });
    const mBlush = new THREE.MeshBasicMaterial({
      color: 0xf19a86, transparent: true, opacity: 0.32, depthWrite: false,
    });

    const mesh = (geo, material, x, y, z, parent = root) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // ───────────────────────────── 外套 ─────────────────────────────
    // 立领短外套：肩略宽、腰收一点、下摆到胯下，轮廓比早先的长大衣更接近设计稿
    const coatProfile = [
      [0.000, 0.392], [0.098, 0.394], [0.102, 0.404], [0.100, 0.432],
      [0.094, 0.462], [0.089, 0.492], [0.089, 0.528], [0.093, 0.566],
      [0.094, 0.602], [0.092, 0.632], [0.084, 0.656], [0.062, 0.670],
      [0.030, 0.676], [0.000, 0.678],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const coat = new THREE.Mesh(new THREE.LatheGeometry(coatProfile, 22), mJacket);
    coat.castShadow = true;
    root.add(coat);
    this.coat = coat;

    // 下摆镶边（深绿一圈）+ 内衬，避免从下往上看是空壳
    const hem = mesh(new THREE.CylinderGeometry(0.1015, 0.099, 0.016, 22, 1, true), mJacketDark, 0, 0.398, 0);
    hem.material.side = THREE.DoubleSide;
    const lining = new THREE.Mesh(new THREE.CircleGeometry(0.097, 22), mJacketDark);
    lining.rotation.x = Math.PI / 2;
    lining.position.y = 0.393;
    root.add(lining);

    // 前襟：中缝 + 三颗金扣（设计稿正面三粒扣）
    const placket = mesh(new THREE.BoxGeometry(0.014, 0.25, 0.008), mJacketDark, 0, 0.53, 0.0905);
    placket.rotation.x = -0.05;
    for (const y of [0.618, 0.566, 0.514]) {
      mesh(new THREE.SphereGeometry(0.0092, 8, 6), mButton, 0, y, 0.0955);
    }
    // 立领：一圈深绿领口 + 前面一小段翻领
    const collar = mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.03, 18, 1, true), mJacketDark, 0, 0.673, 0);
    collar.material.side = THREE.DoubleSide;
    const collarEdge = mesh(new THREE.TorusGeometry(0.056, 0.006, 6, 18), mJacketLight, 0, 0.687, 0);
    collarEdge.rotation.x = Math.PI / 2;
    // 肩线：两侧各一条略深的接缝，让肩部有结构
    for (const sx of [-1, 1]) {
      const seam = mesh(new THREE.BoxGeometry(0.075, 0.008, 0.006), mJacketDark, sx * 0.062, 0.652, 0.052);
      seam.rotation.z = sx * -0.16;
      seam.rotation.y = sx * 0.5;
    }

    // 金黄宽腰带：两圈亮带 + 一条暗缝，正面一个小小的垂结
    const sash = mesh(new THREE.TorusGeometry(0.0915, 0.019, 8, 26), mSash, 0, 0.468, 0);
    sash.rotation.x = Math.PI / 2;
    sash.scale.set(1, 1, 0.62);
    const sash2 = mesh(new THREE.TorusGeometry(0.0915, 0.007, 6, 26), mSashDark, 0, 0.484, 0);
    sash2.rotation.x = Math.PI / 2;
    sash2.scale.set(1, 1, 0.55);
    const sashKnot = mesh(new THREE.SphereGeometry(0.021, 10, 8), mSash, 0.052, 0.464, 0.072);
    sashKnot.scale.set(1, 1.15, 0.7);
    const sashTail = mesh(new THREE.BoxGeometry(0.026, 0.058, 0.012), mSash, 0.046, 0.432, 0.079);
    sashTail.rotation.z = 0.22;

    // ───────────────────────────── 腿与靴子 ─────────────────────────────
    this.legs = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.042, 0.424, 0);
      root.add(pivot);
      // 裤腿：从胯到脚踝，上粗下细
      mesh(new THREE.CylinderGeometry(0.041, 0.034, 0.25, 12), mTrouser, 0, -0.125, 0, pivot);
      // 裤脚收口
      mesh(new THREE.CylinderGeometry(0.036, 0.035, 0.024, 12), mTrouser, 0, -0.252, 0, pivot);
      // 靴筒（从脚踝到裤脚）
      mesh(new THREE.CylinderGeometry(0.040, 0.042, 0.10, 12), mBoot, 0, -0.30, 0, pivot);
      mesh(new THREE.TorusGeometry(0.041, 0.006, 6, 12), mBootDark, 0, -0.252, 0, pivot).rotation.x = Math.PI / 2;
      // 脚踝到脚背
      const ankle = mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.055, 12), mBoot, 0, -0.362, 0.006, pivot);
      ankle.rotation.x = 0.12;
      // 圆头鞋身（脚底正好落在 y=0）
      const foot = mesh(new THREE.SphereGeometry(0.045, 14, 10), mBoot, 0, -0.385, 0.022, pivot);
      foot.scale.set(0.92, 0.62, 1.55);
      // 鞋底
      mesh(new THREE.BoxGeometry(0.078, 0.02, 0.145), mSole, 0, -0.414, 0.024, pivot);
      // 鞋带：两道细横条
      for (const y of [-0.325, -0.352]) {
        const lace = mesh(new THREE.BoxGeometry(0.052, 0.005, 0.006), mBootDark, 0, y, 0.043, pivot);
        lace.rotation.x = 0.16;
      }
      this.legs.push({ pivot, side: sx });
    }

    // ───────────────────────────── 手臂 ─────────────────────────────
    this.arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.097, 0.638, 0);
      root.add(pivot);
      const shoulder = mesh(new THREE.SphereGeometry(0.039, 12, 10), mJacket, 0, -0.004, 0, pivot);
      shoulder.scale.set(1, 0.95, 1);
      // 袖子：略收，袖口深绿
      mesh(new THREE.CylinderGeometry(0.033, 0.038, 0.19, 12), mJacket, 0, -0.104, 0, pivot);
      mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.02, 12), mJacketDark, 0, -0.198, 0, pivot);
      // 手
      const hand = mesh(new THREE.SphereGeometry(0.029, 12, 10), mSkin, 0, -0.219, 0.002, pivot);
      hand.scale.set(0.95, 1.05, 0.9);
      pivot.rotation.z = sx * 0.16;
      this.arms.push({ pivot, side: sx, restZ: sx * 0.16 });
    }

    // ───────────────────────────── 脖子 ─────────────────────────────
    mesh(new THREE.CylinderGeometry(0.030, 0.034, 0.055, 12), mSkin, 0, 0.688, 0);

    // ───────────────────────────── 围巾 ─────────────────────────────
    // 脖子上一圈厚围巾 + 侧后方的结 + 背后四条飘带（两长两短）
    const wrap = mesh(new THREE.TorusGeometry(0.049, 0.023, 8, 20), mScarf, 0, 0.674, 0);
    wrap.rotation.x = Math.PI / 2;
    wrap.scale.set(1.06, 1.1, 1);
    const wrap2 = mesh(new THREE.TorusGeometry(0.045, 0.016, 8, 20), mScarfDark, 0, 0.691, 0);
    wrap2.rotation.x = Math.PI / 2 - 0.12;
    wrap2.scale.set(1.05, 1.05, 1);
    const knot = mesh(new THREE.SphereGeometry(0.025, 10, 8), mScarf, 0.038, 0.678, -0.05);
    knot.scale.set(1, 0.95, 0.75);

    this.scarfTail = new THREE.Group();
    this.scarfTail.position.set(0.034, 0.681, -0.058);
    root.add(this.scarfTail);
    this.scarfStrips = [];
    const strips = [
      { segs: 5, segLen: 0.072, width: 0.055, x: 0.014, yaw: 0.18, mat: mScarf, phase: 0 },      // 长
      { segs: 5, segLen: 0.066, width: 0.05, x: -0.016, yaw: -0.12, mat: mScarfDark, phase: 1.3 }, // 长
      { segs: 3, segLen: 0.05, width: 0.044, x: 0.032, yaw: 0.5, mat: mScarfDark, phase: 2.1 },    // 短
      { segs: 3, segLen: 0.046, width: 0.04, x: -0.03, yaw: -0.44, mat: mScarf, phase: 0.7 },      // 短
    ];
    for (const s of strips) {
      const st = makeScarfStrip(s.mat, s);
      st.root.position.x = s.x;
      st.root.rotation.y = s.yaw;
      this.scarfTail.add(st.root);
      this.scarfStrips.push({ ...st, phase: s.phase, long: s.segs > 3 });
    }

    // ───────────────────────────── 头 ─────────────────────────────
    this.head = new THREE.Group();
    this.head.position.y = 0.792;
    root.add(this.head);

    const HR = 0.098;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HR, 24, 18), mSkin);
    skull.scale.set(1, 1.04, 0.97);
    skull.castShadow = true;
    this.head.add(skull);
    // 下颌稍微收一点，脸更秀气
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(HR * 0.86, 18, 14), mSkin);
    jaw.position.set(0, -0.038, 0.006);
    jaw.scale.set(0.92, 0.82, 0.9);
    this.head.add(jaw);
    // 耳朵
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mSkinShade);
      ear.scale.set(0.42, 1, 0.78);
      ear.position.set(sx * 0.093, -0.006, -0.004);
      this.head.add(ear);
    }

    // 五官：大眼（眼白 + 深棕瞳孔 + 高光）、细眉、小鼻、浅色嘴
    for (const sx of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 12, 10), mWhite);
      white.scale.set(1, 1.12, 0.62);
      white.position.set(sx * 0.036, 0.001, 0.083);
      this.head.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0098, 12, 10), mEye);
      iris.scale.set(1, 1.08, 0.75);
      iris.position.set(sx * 0.036, -0.001, 0.0925);
      this.head.add(iris);
      const hi = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 6, 6), mWhite);
      hi.position.set(sx * 0.036 + 0.0035, 0.0055, 0.0975);
      this.head.add(hi);
      // 上眼睑：一条略粗的弧，压住眼白上缘，眼神更温和
      const lid = new THREE.Mesh(new THREE.TorusGeometry(0.0165, 0.0026, 5, 14, Math.PI), mSkinShade);
      lid.position.set(sx * 0.036, 0.0035, 0.0865);
      lid.rotation.set(0, 0, Math.PI);
      this.head.add(lid);
      // 眉毛
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.0038, 0.005), mBrow);
      brow.position.set(sx * 0.037, 0.031, 0.0865);
      brow.rotation.z = sx * -0.12;
      this.head.add(brow);
      // 腮红（很淡）
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.017, 12), mBlush);
      const bn = new THREE.Vector3(sx * 0.052, -0.032, 0.075).normalize();
      blush.position.copy(bn).multiplyScalar(HR * 0.99);
      blush.lookAt(bn.clone().multiplyScalar(2));
      this.head.add(blush);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 10, 8), mSkinShade);
    nose.position.set(0, -0.024, 0.0905);
    nose.scale.set(1, 0.9, 0.9);
    this.head.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.0035, 0.004), mMouth);
    mouth.position.set(0, -0.052, 0.0855);
    this.head.add(mouth);

    // ───────────────────────────── 头发 ─────────────────────────────
    // 底色发壳（偏后偏上，露出整张脸）+ 一圈圈卷发团，做成设计稿那种蓬松的金色卷发
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1045, 20, 16), mHair);
    cap.position.set(0, 0.02, -0.026);
    cap.scale.set(1.03, 0.82, 1.02);
    cap.castShadow = true;
    this.head.add(cap);

    const curlGeo = new THREE.SphereGeometry(1, 9, 7);
    const curls = [];
    // 刘海一排（额头以上，不遮眼）
    for (let i = 0; i < 7; i++) {
      curls.push([-0.96 + i * 0.32, 0.5 + Math.sin(i * 1.7) * 0.04, 0.025 + (i % 2) * 0.002]);
    }
    // 头顶一圈
    for (let i = 0; i < 9; i++) curls.push([-Math.PI + i * (Math.PI * 2 / 9), 0.88, 0.026]);
    // 中圈（太阳穴到后脑）
    for (let i = 0; i < 11; i++) {
      const az = -Math.PI + i * (Math.PI * 2 / 11) + 0.28;
      if (Math.abs(az) < 0.92) continue; // 正面留空，别糊住脸
      curls.push([az, 0.56, 0.031]);
    }
    // 后颈一圈小卷
    for (let i = 0; i < 7; i++) {
      const az = 1.25 + i * ((Math.PI * 2 - 2.5) / 6);
      curls.push([az, 0.13, 0.027]);
    }
    const Y = new THREE.Vector3(0, 1, 0);
    curls.forEach(([az, el, size], i) => {
      const dir = new THREE.Vector3(
        Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el),
      ).normalize();
      const c = new THREE.Mesh(curlGeo, i % 3 === 0 ? mHairDark : mHair);
      c.position.set(0, 0.012, -0.012).addScaledVector(dir, HR * 1.03);
      c.quaternion.setFromUnitVectors(Y, dir);
      const squish = 0.82 + ((i * 37) % 10) / 44;
      c.scale.set(size, size * squish, size);
      c.rotation.z += (i % 5) * 0.3;
      c.castShadow = true;
      this.head.add(c);
    });
    // 额前一小撮翘起来的卷（设计稿里那簇呆毛）
    const cowlick = new THREE.Mesh(curlGeo, mHair);
    cowlick.position.set(0.016, 0.086, 0.062);
    cowlick.scale.set(0.028, 0.021, 0.026);
    cowlick.rotation.z = 0.4;
    this.head.add(cowlick);

    // ───────────────────────────── 状态 ─────────────────────────────
    this.t = 0;
    this.walkPhase = 0;
    this.walkAmount = 0;
    this.headTilt = 0; // -1 低头 .. 1 抬头
    this.root.scale.setScalar(1.0);
  }

  /**
   * @param {number} dt
   * @param {number} moveMag 0..1 移动强度
   * @param {boolean} moving
   */
  update(dt, moveMag, moving) {
    this.t += dt;

    // 走路周期
    const targetWalk = moving ? 1 : 0;
    this.walkAmount += (targetWalk - this.walkAmount) * Math.min(1, dt * 9);
    if (moving) this.walkPhase += dt * 9.2 * Math.max(0.45, moveMag);
    const w = this.walkAmount;

    const swing = Math.sin(this.walkPhase) * 0.58 * w;
    this.arms[0].pivot.rotation.x = swing;
    this.arms[1].pivot.rotation.x = -swing;
    // idle 时手臂随呼吸微微张合
    const armOpen = Math.sin(this.t * 1.7) * 0.03 * (1 - w);
    this.arms[0].pivot.rotation.z = this.arms[0].restZ - armOpen;
    this.arms[1].pivot.rotation.z = this.arms[1].restZ + armOpen;
    this.legs[0].pivot.rotation.x = -swing * 0.95;
    this.legs[1].pivot.rotation.x = swing * 0.95;
    // 外套下摆随步伐轻轻左右摆
    if (this.coat) this.coat.rotation.y = Math.sin(this.walkPhase) * 0.05 * w;

    // 呼吸（idle）+ 走路上下起伏
    const breathe = Math.sin(this.t * 1.7) * 0.01 * (1 - w);
    const bob = breathe + Math.abs(Math.sin(this.walkPhase)) * 0.024 * w;
    // 关键：不能直接写 root.position.y —— 那是角色在父节点里的落脚点（walker 每帧写入的
    // 球面位置），覆盖成呼吸值会把角色从球面上挪开，相机看的位置和模型对不上。
    // 以落脚点为基准，沿当前法线（角色局部 +Y）叠加起伏。
    // walker 是用 avatar.root（Object3D）构造的，basePos/baseUp 挂在 root 上，不在本类实例上；
    // 早先读 this.basePos 永远是 undefined，模型被拖离球面 ——「相机不跟随人物」的真因。
    const base = this.root.basePos || this.basePos;
    const baseUp = this.root.baseUp || this.baseUp;
    if (base && baseUp) {
      this.root.position.copy(base).addScaledVector(baseUp, bob);
    }

    // 头部：轻微摆动 + 情绪倾斜；走路时前倾一点
    this.head.rotation.z = Math.sin(this.t * 0.9) * 0.035;
    const targetPitch = -this.headTilt * 0.45 + w * 0.06;
    this.head.rotation.x += (targetPitch - this.head.rotation.x) * Math.min(1, dt * 6);

    // 围巾：整体被风吹向身后（走路时飘得更高），每节相位递增形成波浪
    const lift = 0.4 + w * 0.8 + Math.sin(this.t * 0.7) * 0.05;
    this.scarfTail.rotation.x = 0;
    for (const s of this.scarfStrips) {
      const amp = (s.long ? 0.17 : 0.13) * (0.6 + w * 0.8);
      const speed = 3.0 + w * 3.5;
      s.segs.forEach((seg, i) => {
        const wave = Math.sin(this.t * speed + s.phase - i * 0.9) * amp;
        seg.rotation.x = (i === 0 ? lift : 0.12 * w) + wave;
        seg.rotation.z = Math.sin(this.t * 1.9 + s.phase + i * 0.6) * 0.05;
      });
    }
  }

  /** 让角色看向某点（只调头部俯仰） */
  lookAtPoint(worldPoint) {
    const local = this.root.worldToLocal(worldPoint.clone());
    const pitch = Math.atan2(local.y - this.head.position.y, Math.hypot(local.x, local.z));
    this.headTilt = THREE.MathUtils.clamp(pitch * 1.6, -1, 1);
  }
}
