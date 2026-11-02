import { IcosahedronGeometry, Vector3, Color, MathUtils, BufferAttribute, MeshStandardMaterial, Mesh, Group, BoxGeometry, CylinderGeometry, TorusGeometry, ConeGeometry, SphereGeometry, MeshBasicMaterial, PointLight, MeshPhysicalMaterial, BufferGeometry, PointsMaterial, AdditiveBlending, Points, DoubleSide, Shape, ShapeGeometry, Matrix4, ShaderMaterial, FrontSide, BackSide, Vector2, LatheGeometry, CircleGeometry, CatmullRomCurve3, TubeGeometry, DodecahedronGeometry, PlaneGeometry, CapsuleGeometry, InstancedMesh, Object3D, Quaternion, RingGeometry, CanvasTexture, SRGBColorSpace, MeshLambertMaterial, Float32BufferAttribute, SpriteMaterial, Sprite, Scene, FogExp2, PerspectiveCamera, Clock, OrthographicCamera, DirectionalLight, HemisphereLight, OctahedronGeometry, InstancedBufferAttribute, WebGLRenderer, PCFSoftShadowMap, ACESFilmicToneMapping } from './three.js';

/**
 * 输入：虚拟摇杆（移动）+ 右侧拖动（视角）+ 键盘（桌面调试）。
 * 全部用 Pointer Events，iOS Safari 13+ 支持，且自动覆盖触摸/鼠标。
 */

class Input {
  constructor({ stickEl, knobEl, lookEl, canvas }) {
    this.move = { x: 0, y: 0 }; // x=右, y=前
    this.look = { x: 0, y: 0 }; // 本帧累计的视角增量（弧度）
    this.jumpPressed = false;
    this.lookSensitivity = 1;
    this.enabled = true;

    this._stickId = null;
    this._lookId = null;
    this._lookLast = { x: 0, y: 0 };
    this._keys = new Set();

    this._bindStick(stickEl, knobEl);
    this._bindLook(lookEl, canvas);
    this._bindKeys();
  }

  _bindStick(el, knob) {
    if (!el) return;
    const R = 46; // 摇杆最大位移
    const reset = () => {
      this._stickId = null;
      this.move.x = 0;
      this.move.y = 0;
      knob.style.transform = 'translate(0px, 0px)';
    };

    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this._stickId = e.pointerId;
      // setPointerCapture 在某些情况下会抛 NotFoundError（例如事件被合成、
      // 或指针已被释放），一旦抛出就会中断后面的移动逻辑，摇杆“卡死”。
      // 它不是必需的（下面有 pointerup/lostpointercapture 兜底），所以吞掉异常。
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 拿不到捕获也能用，靠全局 pointerup 收尾 */
      }
      this._moveStick(e, el, knob, R);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickId) return;
      e.preventDefault();
      this._moveStick(e, el, knob, R);
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId === this._stickId) reset();
    });
    el.addEventListener('pointercancel', reset);
    el.addEventListener('lostpointercapture', reset);
    // 全局兜底：手指在摇杆外抬起 / 系统打断 / 来电弹出，都必须把摇杆归零，
    // 否则角色会「一直自己往前走」（iOS 上 pointerup 经常不回到原元素）。
    const globalReset = (e) => {
      if (this._stickId !== null && (e === undefined || e.pointerId === this._stickId)) reset();
    };
    addEventListener('pointerup', globalReset);
    addEventListener('pointercancel', globalReset);
    addEventListener('blur', () => globalReset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) globalReset();
    });
  }

  _moveStick(e, el, knob, R) {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // 归一化到 [-1,1]，死区 0.14
    let nx = dx / R;
    let ny = dy / R;
    const mag = Math.hypot(nx, ny);
    if (mag < 0.14) {
      nx = 0;
      ny = 0;
    }
    this.move.x = nx;
    this.move.y = -ny; // 屏幕向上 = 前进
  }

  _bindLook(lookEl, canvas) {
    const onDown = (e) => {
      if (!this.enabled) return;
      if (this._lookId !== null) return;
      this._lookId = e.pointerId;
      this._lookLast.x = e.clientX;
      this._lookLast.y = e.clientY;
      if (lookEl.setPointerCapture) {
        try {
          lookEl.setPointerCapture(e.pointerId);
        } catch {
          /* 同上：捕获失败不影响转视角，靠全局 pointerup 收尾 */
        }
      }
    };
    const onMove = (e) => {
      if (e.pointerId !== this._lookId) return;
      const dx = e.clientX - this._lookLast.x;
      const dy = e.clientY - this._lookLast.y;
      this._lookLast.x = e.clientX;
      this._lookLast.y = e.clientY;
      const k = 0.0042 * this.lookSensitivity;
      // 约定（与手机第三人称游戏一致）：手指右滑 → 镜头向右转；上滑 → 镜头抬头。
      // camYaw 增大 = 向右转（见 getCameraForward），camPitch 减小 = 相机降低、抬头看。
      this.look.x += dx * k;
      this.look.y += dy * k;
    };
    const onUp = (e) => {
      if (e.pointerId !== this._lookId) return;
      this._lookId = null;
    };
    for (const el of [lookEl, canvas]) {
      if (!el) continue;
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    }
  }

  _bindKeys() {
    addEventListener('keydown', (e) => {
      this._keys.add(e.code);
      if (e.code === 'Space') this.jumpPressed = true;
      this._applyKeys();
    });
    addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
      this._applyKeys();
    });
  }

  _applyKeys() {
    if (this._stickId !== null) return; // 触摸优先
    const k = this._keys;
    const x = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const y = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    this.move.x = x / len;
    this.move.y = y / len;
  }

  /** 每帧取一次视角增量并清零。 */
  consumeLook() {
    const out = { x: this.look.x, y: this.look.y };
    this.look.x = 0;
    this.look.y = 0;
    return out;
  }

  consumeJump() {
    const j = this.jumpPressed;
    this.jumpPressed = false;
    return j;
  }

  get moveMagnitude() {
    return Math.min(1, Math.hypot(this.move.x, this.move.y));
  }
}

/**
 * 星球目录：8 章，数据全部来自原站 LPStrings（中文源句 + 各语言译文）。
 * x/y 是旅程地图上的相对位置（0..1），缩略图尺寸来自 srcSet 权重。
 */
const PLANETS = [
  {
    id: 'b612',
    thumb: 'b612',
    x: 0.28,
    y: 0.6,
    size: 1.24, // 相对基准尺寸
    chapter: '第一章',
    name: 'B-612 · 家园',
    tagline: '玫瑰在这里',
    intro: '有一颗只比房子大一点的星球，上面住着一位小王子。',
    action: '走进家园',
    visitedNote: '他从这里出发',
    built: true,
  },
  {
    id: 'king',
    thumb: 'king',
    x: 0.43,
    y: 0.3,
    size: 0.95,
    chapter: '第二章',
    name: '国王的星球',
    tagline: '325 号小行星',
    intro: '这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。',
    action: '前去拜访',
    visitedNote: '国王要任命他做大使，他还是走了。',
    built: true,
  },
  {
    id: 'vanity',
    thumb: 'theater',
    x: 0.55,
    y: 0.52,
    size: 0.88,
    chapter: '第三章',
    name: '爱虚荣者的星球',
    tagline: '326 号小行星',
    intro: '这里住着一个爱虚荣的人，他只听得见赞美。',
    action: '前去拜访',
    visitedNote: '他拍了两次手。那个人只想听掌声，他就走了。',
    built: false,
  },
  {
    id: 'bar',
    thumb: 'bar',
    x: 0.67,
    y: 0.29,
    size: 0.9,
    chapter: '第四章',
    name: '酒鬼的星球',
    tagline: '327 号小行星',
    intro: '这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。',
    action: '前去拜访',
    visitedNote: '他问了几句，没有得到答案，坐了一会儿就走了。',
    built: false,
  },
  {
    id: 'merchant',
    thumb: 'counting',
    x: 0.78,
    y: 0.55,
    size: 0.9,
    chapter: '第五章',
    name: '商人的星球',
    tagline: '328 号小行星',
    intro: '这里住着一个商人，他一刻不停地数星星，说它们都归他所有。',
    action: '前去拜访',
    visitedNote: '他说完自己的花和火山，商人找不到话回答。',
    built: false,
  },
  {
    id: 'lamp',
    thumb: 'lamp',
    x: 0.34,
    y: 0.78,
    size: 0.78,
    chapter: '第六章',
    name: '点灯人的星球',
    tagline: '329 号小行星',
    intro: '这是最小的一颗星球，只放得下一盏路灯和一个点灯人。',
    action: '前去拜访',
    visitedNote: '他想留下来陪点灯人，可这颗星球太小，容不下两个人。',
    built: false,
  },
  {
    id: 'geo',
    thumb: 'geo',
    x: 0.52,
    y: 0.79,
    size: 0.92,
    chapter: '第七章',
    name: '地理学家的星球',
    tagline: '330 号小行星',
    intro: '这里住着一位地理学家，他从不出门，却记下了别处的山和海。',
    action: '前去拜访',
    visitedNote: '他第一次担心起留在家里的花，然后去了地理学家说的地球。',
    built: false,
  },
  {
    id: 'earth',
    thumb: 'earth',
    x: 0.76,
    y: 0.8,
    size: 1.0,
    chapter: '第八章',
    name: '地球',
    tagline: '第七颗星球',
    intro: '这里是地球。一片沙漠，头顶有一颗格外亮的星。',
    action: '前往地球',
    visitedNote: '他在这里',
    built: false,
  },
];

/**
 * 「哪些星球能玩」的唯一真相是 chapters/index.js 的注册表。
 * 这里只提供查询函数，不反向 import 章节（否则会形成循环依赖，
 * 表现为 markBuilt 在模块求值期间拿到未初始化的数组而静默失效）。
 */
function planetById(id) {
  return PLANETS.find((p) => p.id === id);
}

function applyBuilt(ids) {
  for (const p of PLANETS) p.built = ids.includes(p.id);
  return PLANETS;
}

/**
 * 星球场景构建：程序化几何 + 星空 + 光照。
 * 约定：整个星球系统挂在 {rotAxis} 组里，让星球缓慢自转，
 * 玩家靠「反向自转」保持在原地（原站 B612TimeOfDay 的思路）。
 */

const R$7 = 6.0; // B-612 星球半径（世界单位）
// 交互距离收紧系数：各章配置的 radius 是旧版「- 星球半径」后的数值（1.35–1.8），
// 等于放宽了 5–6 m；改为真实距离后用 INTERACT_REACH 把阈值拉紧，需要靠近到跟前才能互动。
// 0.78 → 配置 1.25–2.2 对应 0.97–1.7 m：站在物件跟前就出提示，不用贴脸。
const INTERACT_REACH = 0.78;

function noise(x, y, z) {
  return (
    Math.sin(x * 1.7 + Math.cos(y * 2.3)) * 0.5 +
    Math.sin(y * 2.1 + Math.cos(z * 1.9)) * 0.5
  );
}

/** 星球本体：顶点做径向扰动，得到「小坡」而不是完美球；顶点色做柔光渐变 */
function makePlanet({ radius = R$7, color = 0x8a7a4a, detail = 40, bump = 0.045, tint = 0.24 } = {}) {
  const geo = new IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new Vector3();
  const colors = new Float32Array(pos.count * 3);
  const base = new Color(color);
  const light = base.clone().lerp(new Color(0xfff0d2), 0.42);
  const dark = base.clone().lerp(new Color(0x241d14), 0.34);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise(v.x * 0.6, v.y * 0.6, v.z * 0.6);
    // 第二层大尺度噪声：让地表有大块明暗，而不是均匀一片
    const patch = noise(v.x * 0.22 + 5.1, v.y * 0.22 - 2.7, v.z * 0.22 + 1.3);
    v.multiplyScalar(1 + n * bump);
    pos.setXYZ(i, v.x, v.y, v.z);
    const up = v.clone().normalize().y; // 上下半球轻微渐亮
    const k = 0.5 + n * 0.55 + patch * 0.3 + up * 0.08;
    c.copy(dark).lerp(base, MathUtils.clamp(k, 0, 1));
    c.lerp(light, MathUtils.clamp((k - 0.62) * tint * 3, 0, 0.55));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new BufferAttribute(colors, 3));

  const mat = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: false,
    emissive: base.clone().multiplyScalar(0.16),
  });
  const mesh = new Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** 把物体放到球面上：dir 为归一化方向，height 为离表面高度 */
function placeOnSphere(obj, dir, height = 0, radius = R$7) {
  const n = dir.clone().normalize();
  obj.position.copy(n).multiplyScalar(radius + height);
  obj.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), n);
  return obj;
}

/** 球面上的方向（方位角 az，纬度 lat） */
function sphereDir(az, lat) {
  const cl = Math.cos(lat);
  return new Vector3(cl * Math.cos(az), Math.sin(lat), cl * Math.sin(az)).normalize();
}

// ------------------------------------------------------------- 椅子
function makeChair() {
  const g = new Group();
  const wood = new MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.88, flatShading: true });
  const seat = new Mesh(new BoxGeometry(0.26, 0.035, 0.26), wood);
  seat.position.y = 0.19;
  seat.castShadow = true;
  g.add(seat);
  const back = new Mesh(new BoxGeometry(0.26, 0.24, 0.035), wood);
  back.position.set(0, 0.31, -0.115);
  back.castShadow = true;
  g.add(back);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new Mesh(new CylinderGeometry(0.014, 0.014, 0.19, 5), wood);
    leg.position.set(sx * 0.1, 0.095, sz * 0.1);
    g.add(leg);
  }
  return g;
}

// ------------------------------------------------------------- 水壶
function makeWateringCan() {
  const g = new Group();
  const metal = new MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.45, metalness: 0.65 });
  const body = new Mesh(new CylinderGeometry(0.055, 0.07, 0.11, 10), metal);
  body.position.y = 0.055;
  body.castShadow = true;
  g.add(body);
  const spout = new Mesh(new CylinderGeometry(0.012, 0.02, 0.13, 6), metal);
  spout.position.set(0.075, 0.08, 0);
  spout.rotation.z = -0.85;
  g.add(spout);
  const handle = new Mesh(new TorusGeometry(0.035, 0.008, 5, 10, Math.PI), metal);
  handle.position.set(-0.03, 0.115, 0);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  return g;
}

// ------------------------------------------------------------- 星球道具（第二～八章共用）

/** 王座：高背椅 + 坐垫 + 扶手 */
function makeThrone() {
  const g = new Group();
  const velvet = new MeshStandardMaterial({ color: 0x7a1f2e, roughness: 0.92, flatShading: true });
  const gold = new MeshStandardMaterial({ color: 0xc9a227, roughness: 0.42, metalness: 0.7 });
  const wood = new MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9, flatShading: true });

  const seat = new Mesh(new BoxGeometry(0.4, 0.06, 0.36), velvet);
  seat.position.y = 0.24;
  seat.castShadow = true;
  g.add(seat);

  const back = new Mesh(new BoxGeometry(0.4, 0.52, 0.06), velvet);
  back.position.set(0, 0.52, -0.15);
  back.castShadow = true;
  g.add(back);

  // 椅背金边
  const trim = new Mesh(new TorusGeometry(0.16, 0.012, 6, 18, Math.PI), gold);
  trim.position.set(0, 0.74, -0.15);
  g.add(trim);

  for (const sx of [-1, 1]) {
    const arm = new Mesh(new BoxGeometry(0.05, 0.05, 0.34), wood);
    arm.position.set(sx * 0.19, 0.32, -0.02);
    g.add(arm);
    const post = new Mesh(new CylinderGeometry(0.022, 0.022, 0.26, 6), wood);
    post.position.set(sx * 0.19, 0.13, 0.14);
    g.add(post);
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new Mesh(new CylinderGeometry(0.018, 0.014, 0.24, 6), wood);
    leg.position.set(sx * 0.15, 0.12, sz * 0.13);
    g.add(leg);
  }
  g.userData.seatY = 0.27;
  return g;
}

/** 国王的斗篷（挂在王座后面的大红布） */
function makeCape() {
  const g = new Group();
  const mat = new MeshStandardMaterial({
    color: 0x8c1d2c,
    roughness: 0.95,
    flatShading: true,
    side: DoubleSide,
  });
  const shape = new Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.34, 1.0);
  shape.lineTo(-0.34, 1.0);
  shape.lineTo(-0.5, 0);
  const cloth = new Mesh(new ShapeGeometry(shape), mat);
  cloth.castShadow = true;
  g.add(cloth);
  return g;
}

/** 路灯：灯柱 + 灯罩 + 光晕（点灯人星球） */
function makeStreetLamp() {
  const g = new Group();
  const iron = new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.5 });

  const base = new Mesh(new CylinderGeometry(0.07, 0.09, 0.06, 10), iron);
  base.position.y = 0.03;
  g.add(base);

  const post = new Mesh(new CylinderGeometry(0.022, 0.028, 0.72, 8), iron);
  post.position.y = 0.4;
  post.castShadow = true;
  g.add(post);

  const arm = new Mesh(new TorusGeometry(0.06, 0.012, 5, 10, Math.PI / 2), iron);
  arm.position.set(0.06, 0.76, 0);
  arm.rotation.z = Math.PI;
  g.add(arm);

  // 灯罩
  const glass = new Mesh(
    new CylinderGeometry(0.062, 0.078, 0.14, 8),
    new MeshStandardMaterial({
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

  const cap = new Mesh(new ConeGeometry(0.085, 0.05, 8), iron);
  cap.position.set(0.12, 0.815, 0);
  g.add(cap);

  // 光晕
  const halo = new Mesh(
    new SphereGeometry(0.2, 12, 10),
    new MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.16, depthWrite: false })
  );
  halo.position.copy(glass.position);
  g.add(halo);

  g.userData.glass = glass;
  g.userData.halo = halo;
  g.userData.light = new PointLight(0xffb347, 1.2, 3.2, 2);
  g.userData.light.position.copy(glass.position);
  g.add(g.userData.light);
  return g;
}

/** 酒桶/柜台（酒鬼星球） */
function makeBarrel() {
  const g = new Group();
  const wood = new MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.92, flatShading: true });
  const iron = new MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.55, metalness: 0.6 });

  const body = new Mesh(new CylinderGeometry(0.19, 0.15, 0.34, 12), wood);
  body.position.y = 0.17;
  body.castShadow = true;
  g.add(body);
  for (const y of [0.08, 0.27]) {
    const hoop = new Mesh(new TorusGeometry(0.185, 0.01, 5, 16), iron);
    hoop.position.y = y;
    hoop.rotation.x = Math.PI / 2;
    g.add(hoop);
  }
  const top = new Mesh(new CylinderGeometry(0.155, 0.155, 0.02, 12), wood);
  top.position.y = 0.35;
  g.add(top);
  return g;
}

/** 酒瓶（空瓶/满瓶通用） */
function makeBottle(color = 0x2c5b3a) {
  const g = new Group();
  const glass = new MeshPhysicalMaterial({
    color,
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.78,
    transmission: 0.4,
  });
  const body = new Mesh(new CylinderGeometry(0.045, 0.05, 0.15, 10), glass);
  body.position.y = 0.075;
  body.castShadow = true;
  g.add(body);
  const neck = new Mesh(new CylinderGeometry(0.018, 0.038, 0.09, 8), glass);
  neck.position.y = 0.19;
  g.add(neck);
  const cork = new Mesh(
    new CylinderGeometry(0.019, 0.019, 0.022, 8),
    new MeshStandardMaterial({ color: 0xc8a165, roughness: 1 })
  );
  cork.position.y = 0.245;
  g.add(cork);
  return g;
}

/** 账本/票据堆（商人星球） */
function makeLedger() {
  const g = new Group();
  const paper = new MeshStandardMaterial({ color: 0xe8e0cc, roughness: 1, flatShading: true });
  const cover = new MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.9, flatShading: true });
  const book = new Mesh(new BoxGeometry(0.26, 0.035, 0.34), cover);
  book.position.y = 0.018;
  book.castShadow = true;
  g.add(book);
  for (let i = 0; i < 6; i++) {
    const page = new Mesh(new BoxGeometry(0.24, 0.004, 0.32), paper);
    page.position.set(0, 0.038 + i * 0.004, 0);
    page.rotation.y = (Math.random() - 0.5) * 0.04;
    g.add(page);
  }
  return g;
}

/** 望远镜（地理学家星球） */
function makeTelescope() {
  const g = new Group();
  const brass = new MeshStandardMaterial({ color: 0xb08d3a, roughness: 0.35, metalness: 0.8 });
  const wood = new MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9, flatShading: true });

  const tube = new Mesh(new CylinderGeometry(0.05, 0.062, 0.4, 12), brass);
  tube.rotation.z = -0.9;
  tube.position.set(0, 0.26, 0);
  tube.castShadow = true;
  g.add(tube);

  for (const sx of [-1, 1]) {
    const leg = new Mesh(new CylinderGeometry(0.012, 0.012, 0.34, 6), wood);
    leg.position.set(sx * 0.08, 0.16, 0);
    leg.rotation.z = sx * 0.22;
    g.add(leg);
  }
  const leg3 = new Mesh(new CylinderGeometry(0.012, 0.012, 0.34, 6), wood);
  leg3.position.set(0, 0.16, 0.09);
  leg3.rotation.x = -0.24;
  g.add(leg3);
  return g;
}

/** 沙漠里的石头（地球） */
function makeRock(scale = 1) {
  const g = new Group();
  const mat = new MeshStandardMaterial({ color: 0x8a7a62, roughness: 1, flatShading: true });
  const geo = new IcosahedronGeometry(0.2 * scale, 0);
  const rock = new Mesh(geo, mat);
  rock.position.y = 0.12 * scale;
  rock.scale.set(1, 0.7, 1.15);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  g.add(rock);
  return g;
}

/** 星空中的小光点（爱虚荣者星球的「掌声」视觉） */
function makeSparkles(count = 14, radius = 0.5, color = 0xffe9a8) {
  const geo = new BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * Math.PI - Math.PI / 2;
    const r = radius * (0.6 + Math.random() * 0.5);
    pos[i * 3] = Math.cos(e) * Math.cos(a) * r;
    pos[i * 3 + 1] = Math.abs(Math.sin(e)) * r * 1.2 + 0.3;
    pos[i * 3 + 2] = Math.cos(e) * Math.sin(a) * r;
  }
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const mat = new PointsMaterial({
    color,
    size: 0.06,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const pts = new Points(geo, mat);
  pts.userData.base = pos.slice();
  return pts;
}

// ------------------------------------------------------------- 星空
function makeStars(count = 2600, radius = 380) {
  const geo = new BufferGeometry();
  const pos = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const c = new Color();
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
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('size', new BufferAttribute(sizes, 1));
  geo.setAttribute('color', new BufferAttribute(colors, 3));

  const mat = new PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const points = new Points(geo, mat);
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
function makeSkyDome() {
  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );
  const uniforms = {
    topColor: { value: new Color(0x0a1030) },
    midColor: { value: new Color(0x2a2a55) },
    botColor: { value: new Color(0x6b4a4a) },
    sunDir: { value: new Vector3(0, 1, 0) },
    glowColor: { value: new Color(0xff9a5a) },
    glowAmount: { value: 0.6 },
    // 地平线雾光：让天空与地面接缝处有一层柔和的暖雾（光遇的标志性观感）
    hazeColor: { value: new Color(0xfff2dc) },
    hazeAmount: { value: 0.5 },
    // 球心方向（让渐变贴合「脚下的星球」）
    centerDir: { value: new Vector3(0, 0, -1) },
    // 相机的参考「上」方向：球面行走时它随角色脚下法线走，天空才会随抬头低头变化
    worldUp: { value: new Vector3(0, 1, 0) },
    // 相机矩阵：每帧由 Game 写入，用于还原真实视线方向
    camWorld: { value: new Matrix4() },
    camProjInv: { value: new Matrix4() },
  };
  const mat = new ShaderMaterial({
    uniforms,
    side: FrontSide,
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
  const quad = new Mesh(geo, mat);
  quad.frustumCulled = false;
  quad.renderOrder = -1e3;
  quad.userData.uniforms = uniforms;
  // 作为「背景层」独立渲染：挂到场景外由 renderer.autoClear 控制
  quad.name = 'skydome';
  return quad;
}

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

const TAU$1 = Math.PI * 2;

// ---------------------------------------------------------------- 方向
const dirOf = (az, lat) =>
  new Vector3(
    Math.cos((lat * Math.PI) / 180) * Math.cos((az * Math.PI) / 180),
    Math.sin((lat * Math.PI) / 180),
    Math.cos((lat * Math.PI) / 180) * Math.sin((az * Math.PI) / 180)
  ).normalize();

/** 各地点方向：章节逻辑、地形、小径共用同一份，避免对不上。 */
const B612 = {
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
const GLOBE_DIR = (() => {
  const n = B612.rose.clone();
  const t = new Vector3().crossVectors(new Vector3(0, 1, 0), n).normalize();
  return n.clone().addScaledVector(t, 0.55 / R$7).normalize();
})();

/** 玫瑰背后的木栅栏朝向（比玫瑰更靠「上坡」一点） */
const FENCE_DIR = (() => {
  const n = B612.rose.clone();
  const up = new Vector3(0, 1, 0);
  const t = new Vector3().crossVectors(up, n).normalize();
  return n.clone().addScaledVector(t, -0.9 / R$7).normalize();
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

const _n = new Vector3();

/** 地表相对 R 的高度（米）。同一个函数既用于建网格，也用于摆件和行走。 */
function b612HeightAt(dir) {
  _n.copy(dir).normalize();
  const x = _n.x, y = _n.y, z = _n.z;
  // 三层正弦叠加：缓坡 + 草丘 + 细碎起伏，全部在 ±0.12 m 内，走起来不会绊脚
  let h =
    Math.sin(x * 2.1 + 1.7) * Math.cos(z * 1.9 - 0.6) * 0.5 +
    Math.sin(y * 3.1 + x * 1.3) * 0.3 +
    Math.sin(z * 5.3 - y * 2.4) * 0.12;
  h *= 0.12;
  for (const f of FLATS) {
    const ang = Math.acos(MathUtils.clamp(_n.dot(f.dir), -1, 1));
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
    for (let i = 0; i < n; i++) pts.push(new Vector3().copy(a).lerp(b, i / n).normalize());
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
const GRASS = new Color(0x7fa34d);
const GRASS_LIGHT = new Color(0xa8c56a);
const GRASS_DRY = new Color(0xb0aa62);
const MOSS = new Color(0x4f6e3a);
const DIRT = new Color(0xb5885a);
const DIRT_DARK = new Color(0x96703f);
const STONE = new Color(0x8b8174);
const STONE_DARK = new Color(0x5f554b);

function colorAt(n, h) {
  const c = new Color();
  // 草甸：三档绿交替，加一点点干草
  const g1 = Math.sin(n.x * 5.1 + n.z * 3.7) * 0.5 + Math.sin(n.y * 6.3 - n.x * 2.9) * 0.5;
  const g2 = Math.sin(n.z * 9.1 + n.y * 4.3) * 0.5 + 0.5;
  c.copy(GRASS).lerp(GRASS_LIGHT, MathUtils.clamp(g1 * 0.9 + 0.35, 0, 1) * 0.75);
  c.lerp(GRASS_DRY, Math.max(0, g2 - 0.62) * 0.5);
  // 泉眼附近更湿更深的苔色
  const dSpring = Math.acos(MathUtils.clamp(n.dot(B612.spring), -1, 1));
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
function makeB612Planet() {
  const group = new Group();
  // 用 SphereGeometry 而不是 Icosahedron：它是带索引的，computeVertexNormals 后是
  // 平滑法线（草甸要柔和的明暗过渡，不能有棱面）。
  const geo = new SphereGeometry(R$7, 160, 120);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const n = new Vector3();
  const col = new Color();

  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    const h = b612HeightAt(n);
    pos.setXYZ(i, n.x * (R$7 + h), n.y * (R$7 + h), n.z * (R$7 + h));
    col.copy(colorAt(n, h));
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const planet = new Mesh(
    geo,
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 })
  );
  planet.receiveShadow = true;
  planet.castShadow = true;
  group.add(planet);

  // 浮岛底部：几块倒挂的岩锥，从星球边缘看下去像一座被拔起来的小岛
  const underMat = new MeshStandardMaterial({ color: 0x5b5148, roughness: 1, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU$1 + 0.4;
    const dir = new Vector3(Math.cos(a) * 0.55, -0.82, Math.sin(a) * 0.55).normalize();
    const cone = new Mesh(new ConeGeometry(0.42 - (i % 3) * 0.08, 1.5 - (i % 2) * 0.5, 5), underMat);
    cone.position.copy(dir).multiplyScalar(R$7 * 0.97);
    // 圆锥的尖（+Y）朝外/朝下，宽底贴着地表
    cone.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    cone.castShadow = false;
    group.add(cone);
  }

  // 大气边光：BackSide 薄壳，只在轮廓处透出一点暖色
  const rim = new Mesh(
    new SphereGeometry(R$7 * 1.02, 40, 28),
    new MeshBasicMaterial({
      color: 0xffd6a2,
      transparent: true,
      opacity: 0.05,
      side: BackSide,
      blending: AdditiveBlending,
      depthWrite: false,
    })
  );
  rim.name = 'atmosphere';
  group.add(rim);

  group.userData.planet = planet;
  return group;
}

// ---------------------------------------------------------------- 材质小工具
function m$1(color, rough = 0.92, metal = 0, extra = {}) {
  const c = new Color(color);
  return new MeshStandardMaterial({
    color: c,
    roughness: rough,
    metalness: metal,
    flatShading: true,
    emissive: c.clone().multiplyScalar(extra.emissive ?? 0.14),
    ...extra,
  });
}

function add$1(g, geo, mat, x = 0, y = 0, z = 0) {
  const mesh = new Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- 火山
function makeB612Volcano(scale = 1, alive = true) {
  const g = new Group();
  const rock = m$1(0x5a4c3e, 1);
  const rockDark = m$1(0x3d332a, 1);
  const rimMat = m$1(0x6d5a49, 1);

  // 层状剖面：底部外扩，往上收成火山口
  const pts = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    const rr = (0.56 - 0.44 * Math.pow(t, 0.72)) * scale;
    pts.push(new Vector2(Math.max(0.055, rr), t * 0.6 * scale));
  }
  const cone = new Mesh(new LatheGeometry(pts, 16), rock);
  cone.castShadow = true;
  cone.receiveShadow = true;
  g.add(cone);

  // 山脊：沿坡面加几道折线，破掉「圆筒」感
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU$1 + 0.3;
    const ridge = add$1(g, new ConeGeometry(0.07 * scale, 0.5 * scale, 4), rockDark,
      Math.cos(a) * 0.26 * scale, 0.2 * scale, Math.sin(a) * 0.26 * scale);
    ridge.rotation.z = Math.cos(a) * 0.35;
    ridge.rotation.x = -Math.sin(a) * 0.35;
    ridge.scale.set(1, 1, 0.7);
  }

  // 火山口：环 + 岩浆
  const rim = add$1(g, new TorusGeometry(0.115 * scale, 0.026 * scale, 6, 18), rimMat, 0, 0.595 * scale, 0);
  rim.rotation.x = Math.PI / 2;
  const magma = new Mesh(
    new CircleGeometry(0.1 * scale, 16),
    new MeshBasicMaterial({ color: alive ? 0xff7a35 : 0x2c2620 })
  );
  magma.rotation.x = -Math.PI / 2;
  magma.position.y = 0.585 * scale;
  g.add(magma);
  magma.userData.pulse = Math.random() * TAU$1;

  // 活火山：顺着坡面流一小段熔岩
  if (alive) {
    const flow = add$1(g, new ConeGeometry(0.03 * scale, 0.3 * scale, 4),
      new MeshBasicMaterial({ color: 0xff8a3d }), 0.14 * scale, 0.42 * scale, 0.02);
    flow.rotation.z = -0.42;
    flow.scale.set(1, 1, 0.5);
    g.userData.flow = flow;
  }

  // 烟：一小团缓慢旋转的点
  const smokeGeo = new BufferGeometry();
  const sp = new Float32Array(22 * 3);
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * TAU$1;
    const r = Math.random() * 0.07 * scale;
    sp[i * 3] = Math.cos(a) * r;
    sp[i * 3 + 1] = (0.6 + Math.random() * 0.55) * scale;
    sp[i * 3 + 2] = Math.sin(a) * r;
  }
  smokeGeo.setAttribute('position', new BufferAttribute(sp, 3));
  const smoke = new Points(
    smokeGeo,
    new PointsMaterial({
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
function makeB612Rose() {
  const g = new Group();
  const green = m$1(0x3f6f3c, 0.95);
  const greenLight = m$1(0x5c8a4c, 0.95);

  // 微微弯的茎
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(0.01, 0.16, 0.006),
    new Vector3(-6e-3, 0.32, 0.003),
    new Vector3(0, 0.46, 0),
  ]);
  add$1(g, new TubeGeometry(curve, 10, 0.017, 6, false), green);

  // 三片叶子：扁球压成叶片，带一点弧度
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4;
    const leaf = add$1(g, new SphereGeometry(0.075, 8, 6), i === 1 ? greenLight : green,
      Math.cos(a) * 0.07, 0.17 + i * 0.085, Math.sin(a) * 0.07);
    leaf.scale.set(1, 0.1, 0.42);
    leaf.rotation.y = -a;
    leaf.rotation.z = 0.42;
  }

  // 花冠：四层，外深内亮
  const flower = new Group();
  flower.position.y = 0.47;
  const rings = [
    { n: 6, r: 0.07, tilt: 1.16, col: 0x9c1a2e, y: 0.0, size: 0.06 },
    { n: 6, r: 0.054, tilt: 0.86, col: 0xbe2843, y: 0.022, size: 0.055 },
    { n: 5, r: 0.037, tilt: 0.6, col: 0xd63c56, y: 0.04, size: 0.048 },
    { n: 4, r: 0.023, tilt: 0.36, col: 0xea6a80, y: 0.054, size: 0.04 },
  ];
  for (const ring of rings) {
    const mat = m$1(ring.col, 0.72, 0, { emissive: 0.18 });
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * TAU$1 + ring.y * 9;
      const p = add$1(flower, new SphereGeometry(ring.size, 7, 5, 0, TAU$1, 0, Math.PI * 0.62), mat,
        Math.cos(a) * ring.r, ring.y, Math.sin(a) * ring.r);
      p.scale.set(1, 0.34, 0.78);
      p.rotation.y = -a;
      p.rotation.x = -ring.tilt;
      p.rotation.z = 0.1;
    }
  }
  const core = add$1(flower, new SphereGeometry(0.026, 8, 6), m$1(0x7c1526, 0.8), 0, 0.055, 0);
  core.scale.y = 0.7;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU$1;
    const sep = add$1(flower, new ConeGeometry(0.02, 0.075, 4), greenLight, Math.cos(a) * 0.045, -0.02, Math.sin(a) * 0.045);
    sep.rotation.z = Math.cos(a) * 0.5;
    sep.rotation.x = -Math.sin(a) * 0.5;
  }
  g.add(flower);
  g.userData.flower = flower;

  // 刺
  const thornMat = m$1(0x2c4a2c, 1);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.9;
    const th = add$1(g, new ConeGeometry(0.008, 0.035, 4), thornMat, Math.cos(a) * 0.02, 0.1 + i * 0.06, Math.sin(a) * 0.02);
    th.rotation.z = -Math.cos(a) * 1.5;
    th.rotation.x = Math.sin(a) * 1.5;
  }

  // 脚下一小撮土 + 草
  add$1(g, new CylinderGeometry(0.11, 0.13, 0.03, 12), m$1(0x6b4f38, 1), 0, 0.008, 0).scale.y = 0.6;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU$1 + 0.3;
    const h = 0.08 + (i % 3) * 0.03;
    const b = add$1(g, new ConeGeometry(0.007, h, 3), i % 2 ? green : greenLight,
      Math.cos(a) * 0.13, h / 2, Math.sin(a) * 0.13);
    b.rotation.z = Math.cos(a) * 0.3;
    b.rotation.x = -Math.sin(a) * 0.3;
    b.castShadow = false;
  }
  return g;
}

// ---------------------------------------------------------------- 玻璃罩
function makeB612Globe() {
  const g = new Group();
  const dome = new Mesh(
    new SphereGeometry(0.235, 20, 14, 0, TAU$1, 0, Math.PI * 0.62),
    new MeshPhysicalMaterial({
      color: 0xdff0ff,
      transparent: true,
      opacity: 0.17,
      roughness: 0.04,
      metalness: 0,
      side: DoubleSide,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    })
  );
  // _liftGlobe() 会淡出 children[0]，所以 dome 必须是第一个子节点
  dome.position.y = 0.62;
  g.add(dome);

  const rim = add$1(g, new TorusGeometry(0.228, 0.009, 6, 22), m$1(0xb08a4e, 0.35, 0.8), 0, 0.625, 0);
  rim.rotation.x = Math.PI / 2;
  return g;
}

/** 放玻璃罩的石座：底座 + 台面 + 一点苔痕 */
function makeB612Pedestal() {
  const g = new Group();
  const stone = m$1(0x8e8678, 0.95);
  const stoneDark = m$1(0x6f675b, 0.95);
  add$1(g, new CylinderGeometry(0.16, 0.19, 0.05, 10), stoneDark, 0, 0.025, 0);
  add$1(g, new CylinderGeometry(0.13, 0.145, 0.16, 10), stone, 0, 0.13, 0);
  add$1(g, new CylinderGeometry(0.17, 0.16, 0.035, 10), stone, 0, 0.22, 0);
  // 苔
  for (let i = 0; i < 3; i++) {
    const a = i * 2.2;
    const mo = add$1(g, new SphereGeometry(0.045, 6, 4), m$1(0x5d7a3f, 0.95), Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14);
    mo.scale.set(1, 0.5, 1);
  }
  return g;
}

// ---------------------------------------------------------------- 木栅栏（玫瑰背后）
function makeB612Fence() {
  const g = new Group();
  const wood = m$1(0x8a6a46, 0.95);
  const woodDark = m$1(0x6d5134, 0.95);
  // 竖板：做成一段矮篱，围着玫瑰后方
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * 1.15;
    const h = 0.34 + Math.sin(i * 1.7) * 0.03;
    const p = add$1(g, new BoxGeometry(0.075, h, 0.03), i % 2 ? wood : woodDark, t, h / 2, 0);
    p.rotation.z = Math.sin(i * 2.3) * 0.03;
  }
  // 两道横撑
  for (const y of [0.12, 0.26]) {
    const r = add$1(g, new BoxGeometry(1.2, 0.035, 0.022), woodDark, 0, y, -0.03);
    r.castShadow = true;
  }
  return g;
}

// ---------------------------------------------------------------- 工具棚
function makeB612Shed() {
  const g = new Group();
  const wood = m$1(0x8a6544, 0.95);
  const woodDark = m$1(0x64482f, 0.95);
  const roof = m$1(0x5c4231, 0.98);
  const doorMat = m$1(0x54704c, 0.9);
  const vine = m$1(0x5d8244, 0.95);

  add$1(g, new BoxGeometry(0.5, 0.4, 0.42), wood, 0, 0.2, 0);
  for (let i = 0; i < 5; i++) {
    const x = -0.19 + i * 0.095;
    add$1(g, new BoxGeometry(0.012, 0.38, 0.008), woodDark, x, 0.2, 0.213);
    add$1(g, new BoxGeometry(0.012, 0.38, 0.008), woodDark, x, 0.2, -0.213);
  }
  // 门 + 门框 + 把手
  add$1(g, new BoxGeometry(0.17, 0.29, 0.02), doorMat, -0.03, 0.15, 0.215);
  add$1(g, new BoxGeometry(0.2, 0.32, 0.008), woodDark, -0.03, 0.15, 0.207);
  add$1(g, new SphereGeometry(0.012, 6, 5), m$1(0xd8b45a, 0.4, 0.7), 0.04, 0.145, 0.228);
  // 小窗（暖光）
  const pane = add$1(g, new BoxGeometry(0.11, 0.09, 0.01), m$1(0xffd9a0, 0.5, 0, { emissive: 0.9 }), 0.14, 0.27, 0.216);
  pane.castShadow = false;
  add$1(g, new BoxGeometry(0.13, 0.012, 0.012), woodDark, 0.14, 0.32, 0.22);
  add$1(g, new BoxGeometry(0.012, 0.11, 0.012), woodDark, 0.14, 0.27, 0.22);
  // 单坡屋顶（参考图是斜的一整片）+ 出檐
  const r = add$1(g, new BoxGeometry(0.62, 0.035, 0.52), roof, 0.01, 0.44, 0.02);
  r.rotation.x = 0.16;
  add$1(g, new BoxGeometry(0.64, 0.03, 0.06), woodDark, 0.01, 0.465, 0.27).rotation.x = 0.16;
  // 爬藤：几颗小绿球贴着墙角往上
  for (let i = 0; i < 7; i++) {
    const x = 0.23 + Math.sin(i * 1.9) * 0.03;
    const y = 0.06 + i * 0.055;
    const v = add$1(g, new SphereGeometry(0.035, 6, 5), vine, x, y, 0.2 + Math.cos(i * 1.3) * 0.03);
    v.scale.set(1, 0.8, 0.7);
    v.castShadow = false;
  }
  return g;
}

// ---------------------------------------------------------------- 泉眼
function makeB612Spring() {
  const g = new Group();
  const stone = m$1(0x9a938a, 0.95);
  const stoneDark = m$1(0x726b62, 0.95);
  const mossMat = m$1(0x5d7a3f, 0.95);

  // 池底与水面
  add$1(g, new CylinderGeometry(0.3, 0.27, 0.04, 18), stoneDark, 0, -5e-3, 0);
  const water = new Mesh(
    new CircleGeometry(0.29, 24),
    new MeshStandardMaterial({
      color: 0x69b6c8,
      roughness: 0.06,
      metalness: 0.35,
      transparent: true,
      opacity: 0.9,
      emissive: new Color(0x1d4a55),
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.022;
  g.add(water);
  g.userData.water = water;

  // 同心涟漪
  for (let i = 1; i <= 3; i++) {
    const ring = add$1(g, new TorusGeometry(0.09 * i, 0.006, 4, 20),
      new MeshBasicMaterial({ color: 0xd8f2f7, transparent: true, opacity: 0.32 - i * 0.06 }), 0, 0.028, 0);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    ring.userData.ringIndex = i;
    if (!g.userData.rings) g.userData.rings = [];
    g.userData.rings.push(ring);
  }

  // 石砌池沿 + 苔
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU$1;
    const r = add$1(g, new DodecahedronGeometry(0.08, 0), i % 3 ? stone : stoneDark,
      Math.cos(a) * 0.33, 0.03, Math.sin(a) * 0.33);
    r.scale.set(1.2, 0.7, 1);
    r.rotation.set(a, a * 0.7, 0);
    if (i % 4 === 0) {
      const mo = add$1(g, new SphereGeometry(0.055, 6, 4), mossMat, Math.cos(a) * 0.36, 0.075, Math.sin(a) * 0.36);
      mo.scale.set(1, 0.4, 1);
      mo.castShadow = false;
    }
  }

  // 睡莲叶
  for (let i = 0; i < 4; i++) {
    const a = i * 1.9 + 0.5;
    const pad = add$1(g, new CircleGeometry(0.045, 8), m$1(0x4f7a3a, 0.9), Math.cos(a) * 0.16, 0.026, Math.sin(a) * 0.16);
    pad.rotation.x = -Math.PI / 2;
    pad.castShadow = false;
  }

  // 顺坡流下去的小溪：一条浅色水面
  const stream = add$1(g, new PlaneGeometry(0.16, 0.7, 1, 4), new MeshStandardMaterial({
    color: 0x7fc4d2, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.75,
  }), 0, 0.012, -0.62);
  stream.rotation.x = -Math.PI / 2;
  stream.castShadow = false;
  g.userData.stream = stream;

  // 芦苇
  for (let i = 0; i < 6; i++) {
    const a = 1.9 + i * 0.42;
    const h = 0.2 + (i % 3) * 0.06;
    const reed = add$1(g, new CylinderGeometry(0.005, 0.007, h, 4), m$1(0x6d7d3f, 0.95),
      Math.cos(a) * 0.36, h / 2, Math.sin(a) * 0.36);
    reed.rotation.z = Math.cos(a) * 0.12;
    if (i % 2 === 0) add$1(g, new CapsuleGeometry(0.012, 0.05, 2, 4), m$1(0x7a5a34, 0.95), Math.cos(a) * 0.36, h + 0.02, Math.sin(a) * 0.36);
  }
  return g;
}

// ---------------------------------------------------------------- 草丛 / 野花
function makeB612Grass() {
  const g = new Group();
  const greens = [m$1(0x6d8b41, 0.95), m$1(0x8ea758, 0.95), m$1(0x5a6b36, 0.95)];
  const blades = 7 + Math.floor(Math.random() * 4);
  for (let i = 0; i < blades; i++) {
    const a = Math.random() * TAU$1;
    const rr = Math.random() * 0.09;
    const h = 0.1 + Math.random() * 0.1;
    const b = add$1(g, new ConeGeometry(0.008, h, 3), greens[i % 3],
      Math.cos(a) * rr, h / 2, Math.sin(a) * rr);
    b.rotation.z = Math.cos(a) * 0.28;
    b.rotation.x = -Math.sin(a) * 0.28;
    b.castShadow = false;
  }
  if (Math.random() < 0.45) {
    const a = Math.random() * TAU$1;
    const x = Math.cos(a) * 0.07, z = Math.sin(a) * 0.07;
    add$1(g, new CylinderGeometry(0.003, 0.003, 0.12, 3), greens[2], x, 0.06, z).castShadow = false;
    const petalCol = [0xf3ecdc, 0xf1c9d8, 0xe9d98a, 0xd9c8f0][Math.floor(Math.random() * 4)];
    for (let i = 0; i < 5; i++) {
      const p = add$1(g, new SphereGeometry(0.018, 5, 4), m$1(petalCol, 0.9), x, 0.12, z);
      p.scale.set(1, 0.35, 0.5);
      p.rotation.y = (i / 5) * TAU$1;
      p.position.x += Math.cos((i / 5) * TAU$1) * 0.016;
      p.position.z += Math.sin((i / 5) * TAU$1) * 0.016;
      p.castShadow = false;
    }
    add$1(g, new SphereGeometry(0.012, 6, 5), m$1(0xe8b83c, 0.8), x, 0.128, z).castShadow = false;
  }
  return g;
}

/** 苔石：低面数岩石 + 顶部苔盖，散布在草甸上 */
function makeB612Boulder(scale = 1) {
  const g = new Group();
  const rock = m$1(0x8a8072, 1);
  const rockDark = m$1(0x6b6156, 1);
  const mossMat = m$1(0x5d7a3f, 0.98);
  const body = add$1(g, new DodecahedronGeometry(0.3 * scale, 0), rock, 0, 0.16 * scale, 0);
  body.scale.set(1.15, 0.8, 0.95);
  body.rotation.set(0.3, scale * 3.1, 0.15);
  const side = add$1(g, new DodecahedronGeometry(0.16 * scale, 0), rockDark, 0.24 * scale, 0.1 * scale, 0.06 * scale);
  side.scale.set(1, 0.8, 1);
  side.rotation.set(0.8, 1.2, 0.4);
  const cap = add$1(g, new SphereGeometry(0.3 * scale, 9, 6, 0, TAU$1, 0, Math.PI * 0.5), mossMat, 0, 0.24 * scale, 0);
  cap.scale.set(1.12, 0.42, 0.92);
  cap.castShadow = false;
  return g;
}

/** 野花：一个 InstancedMesh 铺满草甸（白 / 粉 / 黄 / 紫） */
function makeB612Flowers(count = 260, seed = 11) {
  const geo = new IcosahedronGeometry(0.028, 0);
  const mat = new MeshStandardMaterial({ roughness: 0.85, flatShading: true });
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new Object3D();
  const col = new Color();
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
      const d = new Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (d.lengthSq() < 1e-4) continue;
      d.normalize();
      if (d.y < -0.55) d.y = -d.y; // 下半部不长花
      let blocked = Math.acos(MathUtils.clamp(d.dot(B612.spring), -1, 1)) < 0.1;
      for (const v of B612.volcanoes) {
        if (Math.acos(MathUtils.clamp(d.dot(v.dir), -1, 1)) < 0.13) blocked = true;
      }
      if (!blocked) {
        dir = d;
        break;
      }
    }
    if (!dir) dir = new Vector3(0, 1, 0);
    dummy.position.copy(dir).multiplyScalar(R$7 + b612HeightAt(dir) + 0.02);
    dummy.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    dummy.rotateY(rnd() * TAU$1);
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
function makeB612Nook() {
  const g = new Group();
  const stone = m$1(0x8e8678, 0.95);
  const stoneDark = m$1(0x6f675b, 0.95);
  const mossMat = m$1(0x5d7a3f, 0.95);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU$1;
    const r = add$1(g, new DodecahedronGeometry(0.1, 0), i % 2 ? stone : stoneDark,
      Math.cos(a) * 0.42, 0.04, Math.sin(a) * 0.42);
    r.scale.set(1.15, 0.72, 1);
    r.rotation.set(a, a * 0.8, 0);
    if (i % 3 === 0) {
      const mo = add$1(g, new SphereGeometry(0.07, 6, 4), mossMat, Math.cos(a) * 0.46, 0.09, Math.sin(a) * 0.46);
      mo.scale.set(1, 0.4, 1);
      mo.castShadow = false;
    }
  }
  // 毯子 + 枕头：软软的一块
  const blanket = add$1(g, new BoxGeometry(0.34, 0.02, 0.46), m$1(0xe8d9bf, 0.95), 0, 0.012, 0);
  blanket.rotation.y = 0.2;
  const stripe = add$1(g, new BoxGeometry(0.34, 0.004, 0.06), m$1(0xb9705e, 0.95), 0, 0.024, 0.1);
  stripe.rotation.y = 0.2;
  const pillow = add$1(g, new SphereGeometry(0.1, 9, 6), m$1(0xf2e8d6, 0.98), 0, 0.03, -0.2);
  pillow.scale.set(1.15, 0.35, 0.7);
  pillow.castShadow = false;
  return g;
}

// ---------------------------------------------------------------- 猴面包树幼苗
function makeBaobabSprout() {
  const g = new Group();
  const green = m$1(0x5c8a4c, 0.95);
  // 参考图里是「小萝卜一样」的球根 + 两片叶
  const bulb = add$1(g, new SphereGeometry(0.045, 7, 5), m$1(0x8a7a4a, 0.95), 0, 0.035, 0);
  bulb.scale.set(1, 0.85, 1);
  add$1(g, new CylinderGeometry(0.008, 0.012, 0.08, 4), m$1(0x6b7a3a, 0.95), 0, 0.1, 0);
  for (const s of [-1, 1]) {
    const leaf = add$1(g, new SphereGeometry(0.045, 7, 5), green, s * 0.04, 0.15, 0);
    leaf.scale.set(1.1, 0.16, 0.72);
    leaf.rotation.z = s * 0.55;
    leaf.castShadow = false;
  }
  return g;
}

// ---------------------------------------------------------------- 碎石（实例化）
function makeB612Pebbles(count = 110, seed = 7) {
  const geo = new DodecahedronGeometry(0.032, 0);
  const mat = new MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const dummy = new Object3D();
  const col = new Color();
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    const p = PATH[Math.floor(rnd() * PATH.length)];
    const side = new Vector3().crossVectors(p, new Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const off = (0.22 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1);
    const dir = p.clone().addScaledVector(side, off / R$7).normalize();
    dummy.position.copy(dir).multiplyScalar(R$7 + b612HeightAt(dir) + 0.008);
    dummy.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    dummy.rotateY(rnd() * TAU$1);
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
function makeB612Fireflies(count = 30) {
  const geo = new BufferGeometry();
  const pos = new Float32Array(count * 3);
  const base = [];
  let s = 3;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    const anchor = i % 2 ? B612.rose : B612.spring;
    const d = anchor.clone().add(new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.07)).normalize();
    const r = R$7 + 0.14 + rnd() * 0.36;
    const p = d.multiplyScalar(r);
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    base.push({ p: p.clone(), ph: rnd() * TAU$1, sp: 0.3 + rnd() * 0.5 });
  }
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const pts = new Points(geo, new PointsMaterial({
    color: 0xffe2a0,
    size: 0.055,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: AdditiveBlending,
  }));
  pts.userData.base = base;
  return pts;
}

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

function mat(color, { rough = 0.8, flat = false, side = FrontSide, glow = 0.3 } = {}) {
  // emissive 底光：黄昏/夜晚时角色不至于和背景糊在一起
  // （实测日落时角色区域 avg=59.3、背景 61.9，几乎看不见人）。
  const c = new Color(color);
  return new MeshStandardMaterial({
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
  const root = new Group();
  const list = [];
  let parent = root;
  for (let i = 0; i < segs; i++) {
    const pivot = new Group();
    if (i > 0) pivot.position.y = -segLen;
    const w = width * (1 - (i / segs) * (1 - taper));
    const geo = new BoxGeometry(w, segLen * 1.04, 0.013);
    geo.translate(0, -segLen / 2, 0);
    const m = new Mesh(geo, material);
    m.castShadow = true;
    pivot.add(m);
    parent.add(pivot);
    list.push(pivot);
    parent = pivot;
  }
  return { root, segs: list };
}

class PrinceAvatar {
  constructor() {
    const root = new Group();
    root.name = 'prince';
    this.root = root;

    const mJacket = mat(COLORS.jacket, { rough: 0.86 });
    const mJacketDark = mat(COLORS.jacketDark, { rough: 0.9 });
    const mJacketLight = mat(COLORS.jacketLight, { rough: 0.86 });
    const mTrouser = mat(COLORS.trouser, { rough: 0.9 });
    const mSash = mat(COLORS.sash, { rough: 0.72, glow: 0.34 });
    const mSashDark = mat(COLORS.sashDark, { rough: 0.78, glow: 0.3 });
    const mScarf = mat(COLORS.scarf, { rough: 0.74, side: DoubleSide, glow: 0.34 });
    const mScarfDark = mat(COLORS.scarfDark, { rough: 0.78, side: DoubleSide, glow: 0.3 });
    const mHair = mat(COLORS.hair, { rough: 0.62, glow: 0.32 });
    const mHairDark = mat(COLORS.hairDark, { rough: 0.66, glow: 0.28 });
    const mSkin = mat(COLORS.skin, { rough: 0.74, glow: 0.28 });
    const mSkinShade = mat(COLORS.skinShade, { rough: 0.78, glow: 0.24 });
    const mBoot = mat(COLORS.boot, { rough: 0.7 });
    const mBootDark = mat(COLORS.bootDark, { rough: 0.75 });
    const mSole = mat(COLORS.sole, { rough: 0.95, glow: 0.12 });
    const mButton = mat(COLORS.button, { rough: 0.32, glow: 0.42 });
    const mEye = new MeshStandardMaterial({ color: COLORS.eye, roughness: 0.22 });
    const mWhite = new MeshBasicMaterial({ color: 0xffffff });
    const mBrow = mat(COLORS.brow, { rough: 0.7, glow: 0.2 });
    const mMouth = new MeshStandardMaterial({ color: COLORS.mouth, roughness: 0.6 });
    const mBlush = new MeshBasicMaterial({
      color: 0xf19a86, transparent: true, opacity: 0.32, depthWrite: false,
    });

    const mesh = (geo, material, x, y, z, parent = root) => {
      const m = new Mesh(geo, material);
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
    ].map(([r, y]) => new Vector2(r, y));
    const coat = new Mesh(new LatheGeometry(coatProfile, 22), mJacket);
    coat.castShadow = true;
    root.add(coat);
    this.coat = coat;

    // 下摆镶边（深绿一圈）+ 内衬，避免从下往上看是空壳
    const hem = mesh(new CylinderGeometry(0.1015, 0.099, 0.016, 22, 1, true), mJacketDark, 0, 0.398, 0);
    hem.material.side = DoubleSide;
    const lining = new Mesh(new CircleGeometry(0.097, 22), mJacketDark);
    lining.rotation.x = Math.PI / 2;
    lining.position.y = 0.393;
    root.add(lining);

    // 前襟：中缝 + 三颗金扣（设计稿正面三粒扣）
    const placket = mesh(new BoxGeometry(0.014, 0.25, 0.008), mJacketDark, 0, 0.53, 0.0905);
    placket.rotation.x = -0.05;
    for (const y of [0.618, 0.566, 0.514]) {
      mesh(new SphereGeometry(0.0092, 8, 6), mButton, 0, y, 0.0955);
    }
    // 立领：一圈深绿领口 + 前面一小段翻领
    const collar = mesh(new CylinderGeometry(0.055, 0.062, 0.03, 18, 1, true), mJacketDark, 0, 0.673, 0);
    collar.material.side = DoubleSide;
    const collarEdge = mesh(new TorusGeometry(0.056, 0.006, 6, 18), mJacketLight, 0, 0.687, 0);
    collarEdge.rotation.x = Math.PI / 2;
    // 肩线：两侧各一条略深的接缝，让肩部有结构
    for (const sx of [-1, 1]) {
      const seam = mesh(new BoxGeometry(0.075, 0.008, 0.006), mJacketDark, sx * 0.062, 0.652, 0.052);
      seam.rotation.z = sx * -0.16;
      seam.rotation.y = sx * 0.5;
    }

    // 金黄宽腰带：两圈亮带 + 一条暗缝，正面一个小小的垂结
    const sash = mesh(new TorusGeometry(0.0915, 0.019, 8, 26), mSash, 0, 0.468, 0);
    sash.rotation.x = Math.PI / 2;
    sash.scale.set(1, 1, 0.62);
    const sash2 = mesh(new TorusGeometry(0.0915, 0.007, 6, 26), mSashDark, 0, 0.484, 0);
    sash2.rotation.x = Math.PI / 2;
    sash2.scale.set(1, 1, 0.55);
    const sashKnot = mesh(new SphereGeometry(0.021, 10, 8), mSash, 0.052, 0.464, 0.072);
    sashKnot.scale.set(1, 1.15, 0.7);
    const sashTail = mesh(new BoxGeometry(0.026, 0.058, 0.012), mSash, 0.046, 0.432, 0.079);
    sashTail.rotation.z = 0.22;

    // ───────────────────────────── 腿与靴子 ─────────────────────────────
    this.legs = [];
    for (const sx of [-1, 1]) {
      const pivot = new Group();
      pivot.position.set(sx * 0.042, 0.424, 0);
      root.add(pivot);
      // 裤腿：从胯到脚踝，上粗下细
      mesh(new CylinderGeometry(0.041, 0.034, 0.25, 12), mTrouser, 0, -0.125, 0, pivot);
      // 裤脚收口
      mesh(new CylinderGeometry(0.036, 0.035, 0.024, 12), mTrouser, 0, -0.252, 0, pivot);
      // 靴筒（从脚踝到裤脚）
      mesh(new CylinderGeometry(0.040, 0.042, 0.10, 12), mBoot, 0, -0.3, 0, pivot);
      mesh(new TorusGeometry(0.041, 0.006, 6, 12), mBootDark, 0, -0.252, 0, pivot).rotation.x = Math.PI / 2;
      // 脚踝到脚背
      const ankle = mesh(new CylinderGeometry(0.038, 0.042, 0.055, 12), mBoot, 0, -0.362, 0.006, pivot);
      ankle.rotation.x = 0.12;
      // 圆头鞋身（脚底正好落在 y=0）
      const foot = mesh(new SphereGeometry(0.045, 14, 10), mBoot, 0, -0.385, 0.022, pivot);
      foot.scale.set(0.92, 0.62, 1.55);
      // 鞋底
      mesh(new BoxGeometry(0.078, 0.02, 0.145), mSole, 0, -0.414, 0.024, pivot);
      // 鞋带：两道细横条
      for (const y of [-0.325, -0.352]) {
        const lace = mesh(new BoxGeometry(0.052, 0.005, 0.006), mBootDark, 0, y, 0.043, pivot);
        lace.rotation.x = 0.16;
      }
      this.legs.push({ pivot, side: sx });
    }

    // ───────────────────────────── 手臂 ─────────────────────────────
    this.arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new Group();
      pivot.position.set(sx * 0.097, 0.638, 0);
      root.add(pivot);
      const shoulder = mesh(new SphereGeometry(0.039, 12, 10), mJacket, 0, -4e-3, 0, pivot);
      shoulder.scale.set(1, 0.95, 1);
      // 袖子：略收，袖口深绿
      mesh(new CylinderGeometry(0.033, 0.038, 0.19, 12), mJacket, 0, -0.104, 0, pivot);
      mesh(new CylinderGeometry(0.0335, 0.0335, 0.02, 12), mJacketDark, 0, -0.198, 0, pivot);
      // 手
      const hand = mesh(new SphereGeometry(0.029, 12, 10), mSkin, 0, -0.219, 0.002, pivot);
      hand.scale.set(0.95, 1.05, 0.9);
      pivot.rotation.z = sx * 0.16;
      this.arms.push({ pivot, side: sx, restZ: sx * 0.16 });
    }

    // ───────────────────────────── 脖子 ─────────────────────────────
    mesh(new CylinderGeometry(0.030, 0.034, 0.055, 12), mSkin, 0, 0.688, 0);

    // ───────────────────────────── 围巾 ─────────────────────────────
    // 脖子上一圈厚围巾 + 侧后方的结 + 背后四条飘带（两长两短）
    const wrap = mesh(new TorusGeometry(0.049, 0.023, 8, 20), mScarf, 0, 0.674, 0);
    wrap.rotation.x = Math.PI / 2;
    wrap.scale.set(1.06, 1.1, 1);
    const wrap2 = mesh(new TorusGeometry(0.045, 0.016, 8, 20), mScarfDark, 0, 0.691, 0);
    wrap2.rotation.x = Math.PI / 2 - 0.12;
    wrap2.scale.set(1.05, 1.05, 1);
    const knot = mesh(new SphereGeometry(0.025, 10, 8), mScarf, 0.038, 0.678, -0.05);
    knot.scale.set(1, 0.95, 0.75);

    this.scarfTail = new Group();
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
    this.head = new Group();
    this.head.position.y = 0.792;
    root.add(this.head);

    const HR = 0.098;
    const skull = new Mesh(new SphereGeometry(HR, 24, 18), mSkin);
    skull.scale.set(1, 1.04, 0.97);
    skull.castShadow = true;
    this.head.add(skull);
    // 下颌稍微收一点，脸更秀气
    const jaw = new Mesh(new SphereGeometry(HR * 0.86, 18, 14), mSkin);
    jaw.position.set(0, -0.038, 0.006);
    jaw.scale.set(0.92, 0.82, 0.9);
    this.head.add(jaw);
    // 耳朵
    for (const sx of [-1, 1]) {
      const ear = new Mesh(new SphereGeometry(0.022, 10, 8), mSkinShade);
      ear.scale.set(0.42, 1, 0.78);
      ear.position.set(sx * 0.093, -6e-3, -4e-3);
      this.head.add(ear);
    }

    // 五官：大眼（眼白 + 深棕瞳孔 + 高光）、细眉、小鼻、浅色嘴
    for (const sx of [-1, 1]) {
      const white = new Mesh(new SphereGeometry(0.0165, 12, 10), mWhite);
      white.scale.set(1, 1.12, 0.62);
      white.position.set(sx * 0.036, 0.001, 0.083);
      this.head.add(white);
      const iris = new Mesh(new SphereGeometry(0.0098, 12, 10), mEye);
      iris.scale.set(1, 1.08, 0.75);
      iris.position.set(sx * 0.036, -1e-3, 0.0925);
      this.head.add(iris);
      const hi = new Mesh(new SphereGeometry(0.0034, 6, 6), mWhite);
      hi.position.set(sx * 0.036 + 0.0035, 0.0055, 0.0975);
      this.head.add(hi);
      // 上眼睑：一条略粗的弧，压住眼白上缘，眼神更温和
      const lid = new Mesh(new TorusGeometry(0.0165, 0.0026, 5, 14, Math.PI), mSkinShade);
      lid.position.set(sx * 0.036, 0.0035, 0.0865);
      lid.rotation.set(0, 0, Math.PI);
      this.head.add(lid);
      // 眉毛
      const brow = new Mesh(new BoxGeometry(0.026, 0.0038, 0.005), mBrow);
      brow.position.set(sx * 0.037, 0.031, 0.0865);
      brow.rotation.z = sx * -0.12;
      this.head.add(brow);
      // 腮红（很淡）
      const blush = new Mesh(new CircleGeometry(0.017, 12), mBlush);
      const bn = new Vector3(sx * 0.052, -0.032, 0.075).normalize();
      blush.position.copy(bn).multiplyScalar(HR * 0.99);
      blush.lookAt(bn.clone().multiplyScalar(2));
      this.head.add(blush);
    }
    const nose = new Mesh(new SphereGeometry(0.0105, 10, 8), mSkinShade);
    nose.position.set(0, -0.024, 0.0905);
    nose.scale.set(1, 0.9, 0.9);
    this.head.add(nose);
    const mouth = new Mesh(new BoxGeometry(0.017, 0.0035, 0.004), mMouth);
    mouth.position.set(0, -0.052, 0.0855);
    this.head.add(mouth);

    // ───────────────────────────── 头发 ─────────────────────────────
    // 底色发壳（偏后偏上，露出整张脸）+ 一圈圈卷发团，做成设计稿那种蓬松的金色卷发
    const cap = new Mesh(new SphereGeometry(0.1045, 20, 16), mHair);
    cap.position.set(0, 0.02, -0.026);
    cap.scale.set(1.03, 0.82, 1.02);
    cap.castShadow = true;
    this.head.add(cap);

    const curlGeo = new SphereGeometry(1, 9, 7);
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
    const Y = new Vector3(0, 1, 0);
    curls.forEach(([az, el, size], i) => {
      const dir = new Vector3(
        Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el),
      ).normalize();
      const c = new Mesh(curlGeo, i % 3 === 0 ? mHairDark : mHair);
      c.position.set(0, 0.012, -0.012).addScaledVector(dir, HR * 1.03);
      c.quaternion.setFromUnitVectors(Y, dir);
      const squish = 0.82 + ((i * 37) % 10) / 44;
      c.scale.set(size, size * squish, size);
      c.rotation.z += (i % 5) * 0.3;
      c.castShadow = true;
      this.head.add(c);
    });
    // 额前一小撮翘起来的卷（设计稿里那簇呆毛）
    const cowlick = new Mesh(curlGeo, mHair);
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
    this.headTilt = MathUtils.clamp(pitch * 1.6, -1, 1);
  }
}

/**
 * 球面行走：星球是一个球，玩家永远站在球面上。
 *   position = normalize(position) * radius
 *   相机 / 角色的「上」= 球面法线
 * 这是原站 B612.Core PlayerController + ThirdPersonCamera 的最小可行复刻。
 */

const UP = new Vector3(0, 1, 0);

class PlanetWalker {
  /**
   * @param {THREE.Object3D} avatar 角色模型根节点
   * @param {number} radius 星球半径（世界单位）
   * @param {{colliders?: THREE.Object3D[], height?: number, heightAt?: (dir: THREE.Vector3) => number}} opts
   */
  constructor(avatar, radius, opts = {}) {
    this.avatar = avatar;
    this.radius = radius;
    // 角色脚的局部高度：模型原点在脚底时用 0
    this.standHeight = opts.standHeight ?? 0.06;
    this.colliders = opts.colliders || [];
    // 地形高度（可选）：返回相对 radius 的米数，B-612 用它让角色贴着起伏走
    this.heightAt = opts.heightAt || null;

    this.position = new Vector3(0, 0, 1).multiplyScalar(radius); // 世界坐标
    this.up = new Vector3(0, 0, 1); // 当前法线
    this.heading = 0; // 朝向角（相对切平面）
    this.velocityY = 0; // 跳/落
    this.onGround = true;
    this.speed = 2.6; // 单位/秒（星球半径约 6）
    this.runSpeed = 4.6;
    this._tmp = new Vector3();
    this._fwd = new Vector3();
    this._right = new Vector3();

    // 相机环绕参数（由玩家拖动控制）
    this.camYaw = 0;
    this.camPitch = 0.24;
    this.camDist = 4.2;

    this.spawn(new Vector3(0, 0, 1));
  }

  spawn(dir) {
    this.up.copy(dir).normalize();
    this.position.copy(this.up).multiplyScalar(this.radius + this.standHeight + this._groundOffset());
    this.heading = 0;
    this.velocityY = 0;
    this.onGround = true;
    this._buildBasis(true);
    this.sync(true);
  }

  /** 根据当前法线算出切平面基：right / 前向（由 heading 决定） */
  /**
   * 切平面基。
   *
   * 早期实现每帧都用「世界 UP 叉乘法线」重建 _right，法线一旦接近 ±UP
   * （走到星球两极）参考轴会切换、基突然翻转，表现为转视角时相机猛地一跳。
   * 现在改成**平行传输**：把上一帧的 _right 投影到新切平面即可，连续且无奇点。
   * force=true 时（出生/传送）才用参考轴重建。
   */
  _buildBasis(force = false) {
    const u = this.up;
    if (force || !this._basisReady) {
      // 选一个与 up 不平行的参考轴
      const ref = Math.abs(u.y) > 0.92 ? new Vector3(0, 0, 1) : UP;
      this._right.crossVectors(ref, u).normalize();
      this._basisReady = true;
    } else {
      // 平行传输：去掉法线方向的分量
      this._right.addScaledVector(u, -this._right.dot(u));
      if (this._right.lengthSq() < 1e-8) {
        const ref = Math.abs(u.y) > 0.92 ? new Vector3(0, 0, 1) : UP;
        this._right.crossVectors(ref, u).normalize();
      } else {
        this._right.normalize();
      }
    }
    this._fwd.crossVectors(u, this._right).normalize();
  }

  /**
   * 让镜头对准世界里的某个方向（通常是「你降落时要看到的东西」）。
   * 不做这一步的话，玩家进入新星球后相机对着空地，
   * 得先原地转一圈才找得到可互动的东西。
   * @param {THREE.Vector3} worldDir 目标方向（世界坐标，不必归一）
   */
  lookToward(worldDir) {
    this._buildBasis();
    // 把目标方向投到切平面
    const t = worldDir.clone().normalize();
    t.addScaledVector(this.up, -t.dot(this.up));
    if (t.lengthSq() < 1e-8) return;
    t.normalize();
    // camForward = _fwd*cos(yaw) + _right*sin(yaw)，反解 yaw
    this.camYaw = Math.atan2(t.dot(this._right), t.dot(this._fwd));
    this.heading = 0;
    this.facing = null;
  }

  /** 相机所在的方位角，用来把摇杆方向映射到世界 */
  getCameraForward(out = new Vector3()) {
    this._buildBasis();
    const yaw = this.camYaw;
    out.copy(this._fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(this._right, Math.sin(yaw));
    return out.normalize();
  }

  getCameraRight(out = new Vector3()) {
    const f = this.getCameraForward(new Vector3());
    // 屏幕右 = forward × up。早先这里多了一个 negate()，导致「摇杆右推往左走」。
    return out.crossVectors(f, this.up).normalize();
  }

  update(dt, move, look, jump) {
    // ---- 视角
    this.camYaw += look.x;
    this.camPitch = MathUtils.clamp(this.camPitch + look.y, -0.35, 1.05);

    // ---- 移动方向（相机相对）
    const fwd = this.getCameraForward(new Vector3());
    // 同 getCameraRight：屏幕右是 forward × up，不能取反
    const right = new Vector3().crossVectors(fwd, this.up).normalize();
    const wish = new Vector3().addScaledVector(fwd, move.y).addScaledVector(right, move.x);
    const mag = Math.min(1, wish.length());

    let moved = null;
    if (mag > 0.01) {
      wish.normalize();
      // 沿切平面移动
      const tangent = wish.clone().addScaledVector(this.up, -wish.dot(this.up));
      if (tangent.lengthSq() > 1e-8) {
        tangent.normalize();
        const spd = (move.run ? this.runSpeed : this.speed) * mag;
        this.position.addScaledVector(tangent, spd * dt);
        // 更新朝向：朝向 = 移动方向
        this.facing = tangent.clone();
        moved = tangent;
      }
    } else {
      this.facing = null;
    }

    // ---- 重力：始终向球心
    this.up.copy(this.position).normalize();

    // 基必须用「移动后」的法线重建，再算 heading：
    // 否则 heading 是在旧切平面上量的，角色朝向会慢半拍、越走越偏。
    if (moved) {
      this._buildBasis();
      this.heading = Math.atan2(moved.dot(this._right), moved.dot(this._fwd));
    }

    const surface = this.radius + this.standHeight;

    if (jump && this.onGround) {
      this.velocityY = 3.1;
      this.onGround = false;
    }
    this.velocityY -= 9.4 * dt;
    this.position.addScaledVector(this.up, this.velocityY * dt);

    const dist = this.position.length();
    const ground = surface + this._groundOffset();
    if (dist <= ground) {
      this.position.setLength(ground);
      this.velocityY = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    this.sync(false);
  }

  /** 地形抬升：默认平坦；有 heightAt 时读地形高度（B-612 的沙丘） */
  _groundOffset() {
    return this.heightAt ? this.heightAt(this.up) : 0;
  }

  /**
   * 把模型姿态同步到球面。
   *
   * 早期用 `setFromUnitVectors(UP, up)` 再绕 UP 乘一个航向角：
   * 这个「最小旋转」会额外引入一个滚转（roll），对法线 ≈ +Z 的位置，
   * 模型的 +Z（脸）会被转到 -Y 方向 —— 角色于是**倒着走**。
   * 正确做法是直接用「上 + 前」构造正交基，模型的 +Y→法线、+Z→朝向。
   */
  sync(instant) {
    this.up.copy(this.position).normalize();
    this.avatar.position.copy(this.position);
    // 把「落脚点」和「法线」交给角色动画：它要在落脚点之上沿法线做呼吸/走路的起伏，
    // 不能直接覆写 position.y（那会把角色从球面上挪开，相机与模型对不上）。
    // 必须用独立向量存落脚点，否则叠加起伏会逐帧累积、越走越飘。
    if (!this.avatar.basePos) this.avatar.basePos = new Vector3();
    this.avatar.basePos.copy(this.position);
    this.avatar.baseUp = this.up;

    const yAxis = this.up;
    const zAxis = this.getFacing(this._faceTmp || (this._faceTmp = new Vector3()));
    // 朝向必须在切平面内（getFacing 已保证，这里再保险一次）
    zAxis.addScaledVector(yAxis, -zAxis.dot(yAxis));
    if (zAxis.lengthSq() < 1e-8) zAxis.copy(this.getCameraForward(new Vector3()));
    zAxis.normalize();
    const xAxis = (this._xTmp || (this._xTmp = new Vector3())).crossVectors(yAxis, zAxis).normalize();

    const m = this._mTmp || (this._mTmp = new Matrix4());
    m.makeBasis(xAxis, yAxis, zAxis);
    const q = this._qTmp || (this._qTmp = new Quaternion());
    q.setFromRotationMatrix(m);

    if (instant) {
      this.avatar.quaternion.copy(q);
    } else {
      this.avatar.quaternion.slerp(q, 0.22);
    }
  }

  /**
   * 相机：绕角色、贴球面背面避让。
   *
   * 关键：this.position 是「角色所在父节点」的局部坐标，如果父节点（星球 root）
   * 有倾斜或自转，直接拿局部坐标当世界坐标算出来的相机就会跟丢角色
   * （表现为角色被推到画面之外、看着像「相机没有跟随」）。
   * 所以这里全程在局部空间求解，末尾再用 worldParent 的矩阵转成世界坐标。
   */
  updateCamera(camera, dt) {
    const up = this.up;
    // 观察点：角色胸口略上（模型约 1.0 高）
    const surf = this.position.clone().addScaledVector(up, 1.05);

    const fwd = this.getCameraForward(new Vector3());
    // 相机相对角色的偏移方向 = 身后 + 抬高。
    // 注意符号：早年写成 fwd*cos + up*sin 再取负，等于「pitch 越大相机越往下」，
    // 拖一下视角相机就钻到地面以下，于是被球体夹住、画面乱跳。
    const pitch = MathUtils.clamp(this.camPitch, -0.35, 1.05);
    const back = fwd
      .clone()
      .multiplyScalar(-Math.cos(pitch))
      .addScaledVector(up, Math.sin(pitch))
      .normalize();

    // 相机枢轴：角色头顶上方一点，绕它环绕
    const pivot = this.position.clone().addScaledVector(up, this.standHeight + 0.85);
    const minClear = this.radius + 0.45;
    // 互动聚焦：靠近可交互物时镜头缓缓推近一点（章节每帧设置 focusBias），
    // 离开后自动回落。用指数插值，避免在交互边界来回跳。
    const wantBias = this.focusBias == null ? 1 : this.focusBias;
    if (this._biasT == null) this._biasT = wantBias;
    this._biasT += (wantBias - this._biasT) * (1 - Math.exp(-dt * 3.6));
    let dist = this.camDist * this._biasT;

    // 相机不能穿进星球：pivot 已在球外，沿 back 走会遇到球壳，取进入点
    {
      const b = 2 * pivot.dot(back);
      const c = pivot.lengthSq() - minClear * minClear;
      const disc = b * b - 4 * c;
      if (disc > 0) {
        const t = (-b - Math.sqrt(disc)) / 2;
        if (t > 0.2) dist = Math.min(dist, Math.max(0.9, t - 0.08));
      }
    }

    const target = pivot.clone().addScaledVector(back, dist);

    // 初始化或重置：相机在局部原点或太近时，直接设置位置，不插值
    // （插值会让相机从 (0,0,0) 逐步飞向 target，中途方向错误）
    if (camera.position.length() < minClear * 0.8) {
      camera.position.copy(target);
    } else {
      // 平滑：位置按指数趋近，避免瞬移；dt 抖动时也稳定
      const k = 1 - Math.exp(-dt * 14);
      camera.position.lerp(target, k);
    }
    // 插值途中同样不许进地下
    if (camera.position.length() < minClear) camera.position.setLength(minClear);

    // 相机上向量缓动跟随球面法线，转弯时地平线不会猛地翻过来
    if (!this._camUp) this._camUp = up.clone();
    const a = 1 - Math.exp(-dt * 10);
    this._camUp.lerp(up, a).normalize();
    const camUp = this._camUp;

    // 相机挂在星球 root 下时 position/quaternion 都是局部量，
    // 而 lookAt 收的是世界坐标，所以把观察点与上向量一并转到世界空间。
    const parent = camera.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      const pm = parent.matrixWorld;
      camera.up.copy(camUp).transformDirection(pm);
      camera.lookAt(surf.clone().applyMatrix4(pm));
    } else {
      camera.up.copy(camUp);
      camera.lookAt(surf);
    }
  }

  /** 角色当前面向（世界坐标单位向量） */
  getFacing(out = new Vector3()) {
    this._buildBasis();
    return out
      .copy(this._fwd)
      .multiplyScalar(Math.cos(this.heading))
      .addScaledVector(this._right, Math.sin(this.heading))
      .normalize();
  }
}

var table = {"en":{"小王子":"The Little Prince","玫瑰花":"The Flower","国王":"The King","爱虚荣的人":"The Conceited Man","酒鬼":"The Tippler","酒馆门":"The tavern door","商人":"The Businessman","点灯人":"The Lamplighter","地理学家":"The Geographer","蛇":"The Snake","玫瑰们":"The Roses","狐狸":"The Fox","小花":"A Flower","飞行员":"The Aviator","小王子（自语）":"The Little Prince (to himself)","小王子的旅程":"The Little Prince’s Journey","故事，从一朵玫瑰开始":"It all begins with a flower","离开玫瑰以后，他去拜访别的星球":"After leaving his flower, he set out to visit other planets","还看不清……":"Too far to make out…","这颗星球还在建造中，暂时还不能降落。":"This planet is still being built. You can’t land here yet.","还在建造中":"Still being built","前去拜访":"Pay a visit","已经拜访过":"Visited","再去看看":"Visit again","设置":"Settings","B-612 · 家园":"B-612 · Home","玫瑰在这里":"Where his flower lives","有一颗只比房子大一点的星球，上面住着一位小王子。":"On a planet scarcely bigger than a house, there lives a little prince.","走进家园":"Step onto B-612","他从这里出发":"Where his journey began","他给玫瑰浇过水、看过日落，然后跟着候鸟走了。":"He watered his flower, watched the sunset, and left with the migrating birds.","这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。":"This is B-612, the little prince’s home: scarcely bigger than a house, with three volcanoes and one flower.","国王的星球":"The King’s Planet","325 号小行星":"Asteroid 325","这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。":"Here lives a king. In his eyes, everyone is a subject, and even the stars obey him.","国王要任命他做大使，他还是走了。":"The king wanted to make him an ambassador. He left all the same.","这里住着一位国王。他的星球上没有别人。":"Here lives a king. There is no one else on his planet.","326 号小行星":"Asteroid 326","这里住着一个爱虚荣的人，他只听得见赞美。":"Here lives a conceited man. He hears nothing but praise.","他拍了两次手。那个人只想听掌声，他就走了。":"He clapped his hands twice. The man wanted nothing but applause, so he went on his way.","这里住着一个爱虚荣的人。他等着有人来崇拜他。":"Here lives a conceited man, waiting for someone to admire him.","327 号小行星":"Asteroid 327","这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。":"Here lives a tippler. He drinks to forget the thing that shames him: drinking.","他问了几句，没有得到答案，坐了一会儿就走了。":"He asked a few questions, found no answers, sat for a while, and left.","这里住着一个酒鬼。他喝酒，是为了忘记一件事。":"Here lives a tippler. He drinks to forget something.","328 号小行星":"Asteroid 328","这里住着一个商人，他一刻不停地数星星，说它们都归他所有。":"Here lives a businessman who counts the stars without a pause, and says they all belong to him.","他说完自己的花和火山，商人找不到话回答。":"He spoke of his flower and his volcanoes, and the businessman found nothing to say.","这里住着一个商人。他在数星星，数了很多年。":"Here lives a businessman. He has been counting stars for years and years.","329 号小行星":"Asteroid 329","这是最小的一颗星球，只放得下一盏路灯和一个点灯人。":"This is the smallest planet of all, with just enough room for a street lamp and a lamplighter.","他想留下来陪点灯人，可这颗星球太小，容不下两个人。":"He wanted to stay with the lamplighter, but the planet was too small for two.","这里是最小的一颗星球。只有一盏路灯，和一个一分钟也歇不了的人。":"The smallest planet of all: one street lamp, and a man who never gets a minute’s rest.","330 号小行星":"Asteroid 330","这里住着一位地理学家，他从不出门，却记下了别处的山和海。":"Here lives a geographer. He never goes out, yet he writes down the mountains and seas of faraway places.","他第一次担心起留在家里的花，然后去了地理学家说的地球。":"For the first time, he worried about the flower he had left at home. Then he went on to the Earth, as the geographer had told him.","这里住着一位地理学家。他写一本很大的书，却从没离开过书桌。":"Here lives a geographer. He writes an enormous book, yet he has never left his desk.","地球":"Earth","第七颗星球":"The seventh planet","地理学家说，去地球看看吧，它的名声很好。":"“Go and see the Earth,” the geographer said. “It has a good reputation.”","前往地球":"Go to Earth","他在这里":"He is here","这里是地球。一片沙漠，头顶有一颗格外亮的星。":"This is the Earth: a desert, and overhead, one especially bright star.","有一颗只比房子大一点的星球，":"On a planet scarcely bigger than a house,","上面住着一位小王子。":"there lives a little prince.","这里住着一位国王。":"Here lives a king.","在他眼里，人人都是臣民，连星星也听他的。":"In his eyes, everyone is a subject, and even the stars obey him.","这里住着一个爱虚荣的人，":"Here lives a conceited man.","他只听得见赞美。":"He hears nothing but praise.","这里住着一个酒鬼。":"Here lives a tippler.","他喝酒，是为了忘掉让他难为情的事——喝酒。":"He drinks to forget the thing that shames him: drinking.","这里住着一个商人，他一刻不停地数星星，":"Here lives a businessman who counts the stars without a pause,","说它们都归他所有。":"and says they all belong to him.","这是最小的一颗星球，":"This is the smallest planet of all,","只放得下一盏路灯和一个点灯人。":"with just enough room for a street lamp and a lamplighter.","这里住着一位地理学家，":"Here lives a geographer.","他从不出门，却记下了别处的山和海。":"He never goes out, yet he writes down the mountains and seas of faraway places.","地理学家说，去地球看看吧，":"“Go and see the Earth,” the geographer said.","它的名声很好。":"“It has a good reputation.”","第一章":"Chapter One","第二章":"Chapter Two","第三章":"Chapter Three","第四章":"Chapter Four","第五章":"Chapter Five","第六章":"Chapter Six","第七章":"Chapter Seven","第八章":"Chapter Eight","第{0}章":"Chapter {0}","在 B-612 的最后一天":"The last day on B-612","一座空荡荡的宫殿，住着一位国王":"An empty palace, home to a king","爱虚荣者的星球":"The Conceited Man’s Planet","一颗从没有人经过的星球，住着一个爱虚荣的人":"A planet no one ever passes by, home to a conceited man","酒鬼的星球":"The Tippler’s Planet","一个用喝酒来忘记一切的人":"A man who drinks to forget everything","商人的星球":"The Businessman’s Planet","一个忙得连头也不抬的商人":"A businessman too busy even to look up","点灯人的星球":"The Lamplighter’s Planet","一颗一分钟就转一圈的星球，住着一个点灯人":"A planet that turns once a minute, home to a lamplighter","地理学家的星球":"The Geographer’s Planet","一位记下了山和海，却从没去看过的地理学家":"A geographer who records mountains and seas he has never seen","一颗很大的星球，可是一个人也看不见":"A very large planet, and not a soul in sight","四处走走，熟悉一下这颗星球":"Walk around and get to know your planet","去看看玫瑰花":"Go and see the flower","照料玫瑰花":"Tend the flower","去工具棚拿水壶":"Fetch the watering can from the shed","去泉眼打水":"Fill it at the spring","最后一次给她浇水":"Water her one last time","看最后一场日落":"Watch the last sunset","去星球边上的椅子坐下":"Sit in the chair at the planet’s edge","去见国王":"Go and see the king","去看舞台上的人":"See the man on the stage","去酒馆里坐坐":"Sit a while in the tavern","拜访数星星的商人":"Visit the man who counts the stars","？？？":"???","在星空里找到 B-612":"Find B-612 among the stars","去灯下看看":"Go and see the lamp","去地图馆看看":"Look around the map library","去问问这是哪里":"Find out where you are","和岩石上的蛇说说话":"Talk to the snake on the rock","去玫瑰园看看":"Visit the rose garden","去苹果树下找狐狸":"Find the fox under the apple tree","踏上回家的路":"Set out for home","去叫醒飞行员":"Wake the aviator","回到落下来的地方":"Return to where you fell","沿着石路走到门洞":"Follow the stone path to the gateway","{0}　完成":"{0} — Complete","下一件事":"Next","可以启程了":"Ready to set off","按住":"Hold","启程":"Set off","按一下查看本章目标":"Press to see this chapter’s goals","再按一下收起":"Press again to close","隐藏":"Hidden","{0} · {1} 米":"{0} · {1} m","{0} 米":"{0} m","前方是旅途":"The journey lies ahead","先去看一次日落，再启程":"Watch one sunset before you set off","要启程吗？":"Set off now?","Q   启程":"Q   Set off","Q 启程，跟着候鸟去下一颗星球        Esc 再待一会儿":"Q Set off with the birds to the next planet        Esc Stay a little longer","今日已日落，改日再来":"The sun has set for today. Come back another day.","正在准备画面 · {0}%":"Preparing the scene · {0}%","{0}　　　{0}":"{0}   {0}","移动":"Move","鼠标":"Mouse","点击画面后移动鼠标，看看四周":"Click the screen, then move the mouse to look around","快跑":"Run","拿起水壶":"Pick up the can","放回水壶":"Put the can back","放下水壶":"Put the can down","打水":"Draw water","浇水":"Water the flower","给玫瑰浇水":"Water the flower","壶是空的":"The can is empty.","拿起玻璃罩":"Lift the glass globe","放回去":"Put it back","放回玻璃罩":"Put it back","先把水壶放在花旁":"Set the can down by the flower first","先把水壶放下":"Put the can down first","坐下":"Sit down","起身":"Stand up","交谈":"Talk","交互":"Interact","推开宫门":"Push open the palace doors","推开门":"Push the door open","推开木门":"Push the door open","拉开门":"Pull the door open","拉开木门":"Pull the door open","合上门":"Close the door","合上木门":"Close the door","开门":"Open the door","关门":"Close the door","鼓掌":"Clap","看星星":"Look at the stars","离开":"Leave","滚轮":"Scroll","放大":"Zoom","眺望":"Gaze out","喊":"Call out","上车":"Board the train","转辘轳":"Turn the winch","叫醒他":"Wake him","和蛇说话":"Talk to the snake","水壶":"Watering can","泉眼":"Spring","椅子":"Chair","玫瑰园":"Rose garden","火车":"Train","苹果树":"Apple tree","车站":"Station","门洞":"Gateway","暂停":"Paused","继续":"Resume","回到旅程地图":"Back to the Journey Map","返回地图":"Back to Map","返回游戏":"Back to Game","全屏":"Fullscreen","清除进度":"Clear Progress","确定清除？":"Clear all progress?","语言":"Language","操作":"Controls","方向键也可以":"Arrow keys work too","视角":"Look","点击画面后转动鼠标":"Click the screen, then move the mouse","空格":"Space","跳":"Jump","互动":"Interact","靠近有星标的东西":"Go near things marked with a star","按住，走完一圈":"Hold until the ring is full","本章目标":"Chapter goals","按一下展开，再按收起":"Press to open, press again to close","鼠标灵敏度":"Mouse Sensitivity","声音":"Sound","主音量":"Master Volume","音乐":"Music","音效":"Sound Effects","我想……该是吃早饭的时候了。":"I do believe… it is time for breakfast.","能不能劳您费心，也想着我一点……":"Would you be so kind as to spare a thought for me…","再见了。":"Goodbye.","……":"…","我想去别的星球看看。":"I want to go and see other planets.","（轻轻咳了一声）":"(She coughs softly)","我以前真傻。请你原谅我。":"I’ve been so foolish. Please forgive me.","是啊，我是爱你的。":"Yes, of course I love you.","你一点都没察觉，是我的错。":"You never knew it, and that was my fault.","不过，你也和我一样傻。":"But you were just as foolish as I was.","别管这个罩子了。我不要它了。":"Leave the glass globe alone. I don’t want it anymore.","可是风……":"But the wind…","夜里的凉风会对我有好处的。我是一朵花。":"The cool night air will do me good. I am a flower.","可是那些野兽……":"But the wild beasts…","我什么都不怕。我有我的爪子。":"I’m not afraid of anything. I have my claws.","（亮出她的四根刺）":"(She shows her four thorns)","别这样磨磨蹭蹭的，真烦人。":"Don’t linger like this. It’s tiresome.","你已经决定要走了。走吧。":"You have decided to go. So go.","人在很难过的时候，就喜欢看日落……":"When you are very sad, you love to watch the sunset…","我很喜欢看日落。":"I’m very fond of sunsets.","啊，来了一位臣民！":"Ah! Here comes a subject!","您从没见过我，怎么知道我是臣民？":"You have never seen me before. How do you know I’m a subject?","来到我面前的，都是我的臣民。这里的一切都听我的，连星星也是。":"All who come before me are my subjects. Everything here obeys me — even the stars.","那您能让太阳现在落下吗？我想看一次日落。":"Then could you make the sun set now? I would so like to see a sunset.","当然。不过命令要下在合适的时候。今晚七点四十，我会命令它落下。":"Certainly. But an order must be given at the proper time. This evening at seven-forty, I shall command it to set.","……七点四十，它本来就要落下的。":"…At seven-forty, it was going to set anyway.","在我家，想看日落，把椅子挪几步就行了。":"At home, when I want a sunset, I just move my chair a few steps.","我该走了。":"I must be going.","等等！我任命你做我的大使！":"Wait! I hereby appoint you my ambassador!","啊！啊！来了一位崇拜者！":"Ah! Ah! A visit from an admirer!","你拍拍手吧。":"Go on, clap your hands.","你真的非常崇拜我吗？":"Do you really admire me very much?","“崇拜”是什么意思？":"What does “admire” mean?","崇拜，就是承认我是这颗星球上\\n最英俊、穿得最好、最有钱、最聪明的人。":"To admire me means to agree that I am the handsomest,\\nbest-dressed, richest and cleverest man on this planet.","可这颗星球上只有你一个人！":"But you are all alone on this planet!","行行好，还是崇拜我吧！":"Do me this kindness. Admire me anyway!","我崇拜你。可这对你有什么要紧呢？":"I admire you. But what difference can that make to you?","你在这儿做什么？":"What are you doing here?","我在喝酒。":"I’m drinking.","你为什么喝酒？":"Why are you drinking?","为了忘记。":"To forget.","忘记什么？":"Forget what?","忘记我的羞愧。":"To forget that I’m ashamed.","羞愧什么？":"Ashamed of what?","羞愧我喝酒！":"Ashamed of drinking!","二十六加五，三十一。呼！\\n一共是五亿零一百六十二万二千七百三十一。":"Twenty-six and five, thirty-one. Phew!\\nThat makes five hundred and one million, six hundred twenty-two thousand, seven hundred thirty-one.","五亿什么？":"Five hundred million what?","星星。":"Stars.","你拿五亿颗星星做什么？":"And what do you do with five hundred million stars?","什么也不做。我拥有它们。":"Nothing. I own them.","那你拿它们怎么办呢？":"Then what do you do with them?","我把星星的数目写在一张小纸上，\\n再把这张纸锁进抽屉。":"I write the number of my stars on a little slip of paper,\\nand then I lock that paper in a drawer.","就这些？":"And that’s all?","这就够了！":"That is enough!","我有一朵花，我每天给她浇水。\\n我有三座火山，我每星期疏通一遍。":"I own a flower, and I water her every day.\\nI own three volcanoes, and I sweep them out every week.","我拥有它们，对我的火山有用，对我的花也有用。\\n可你对星星没有用……":"My owning them is of use to my volcanoes, and of use to my flower.\\nBut you are of no use to the stars…","你好。你为什么刚把路灯熄了？":"Hello. Why did you just put out your lamp?","这是规定。早上好。":"Those are the orders. Good morning.","可你为什么又把它点亮了？":"But why have you just lit it again?","没什么要明白的。规定就是规定。晚上好。":"There’s nothing to understand. Orders are orders. Good evening.","从前还说得过去：早上熄灯，晚上点灯。":"It used to make sense: out in the morning, lit in the evening.","可星球一年比一年转得快，规定却没改！":"But year after year the planet turns faster, and the orders haven’t changed!","现在它一分钟转一圈，我连一秒钟也歇不了。":"Now it turns once a minute, and I don’t get a single second’s rest.","只有他不让我觉得可笑。\\n也许是因为，他操心的是自己以外的事。":"He is the only one who doesn’t strike me as ridiculous.\\nPerhaps because he cares about something besides himself.","瞧！来了一位探险家！":"Why, look! An explorer!","你从远方来！给我讲讲你的星球！":"You come from far away! Tell me about your planet!","我那儿很小。我有三座火山。":"It’s very small where I live. I have three volcanoes.","我还有一朵花。":"I have a flower, too.","我们不记录花。":"We do not record flowers.","为什么！花是最美的！":"Why not? Flowers are the loveliest of all!","因为花是转瞬即逝的。":"Because flowers are ephemeral.","“转瞬即逝”是什么意思？":"What does “ephemeral” mean?","意思是“很快就有消失的危险”。":"It means “in danger of disappearing soon.”","我的花是转瞬即逝的，她只有四根刺来保护自己！\\n而我把她独自留在了家里！":"My flower is ephemeral, and she has only four thorns to protect herself!\\nAnd I have left her all alone at home!","我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！":"My flower is ephemeral, and she has only four thorns to protect herself! And I have left her all alone at home!","我落在哪颗星球上了？":"What planet have I fallen onto?","地球上，在非洲。":"On Earth. In Africa.","看，我的星球。它就在我们头顶上……可它多远啊！":"Look at my planet. It’s right above us… But how far away it is!","它真美。你来这儿做什么？":"It is beautiful. What brings you here?","我和一朵花闹了点别扭。":"I’ve had a little trouble with a flower.","人在哪儿？在沙漠里有点孤独……":"Where are the people? It’s a little lonely in the desert…","在人群里也一样孤独。":"It is lonely among people, too.","我碰到谁，就把他送回他来的那片土地。":"Whoever I touch, I send back to the earth he came from.","你这么弱小，落在这花岗岩的地球上，我可怜你。哪天你太想念你的星球，我可以帮你。":"You are so weak, on this Earth of granite. I pity you. One day, if you miss your planet too much, I can help you.","人在哪儿？":"Where are the people?","人？风吹着他们到处走。他们没有根，这让他们很难办。":"People? The wind blows them about. They have no roots, and that makes life very hard for them.","你好！做我的朋友吧，我很孤独。":"Hello! Be my friend. I’m all alone.","你好……我很孤独……":"Hello… I’m all alone…","我很孤独……":"I’m all alone…","你们是谁？":"Who are you?","我们是玫瑰。":"We are roses.","我还以为我有一朵独一无二的花，\\n原来只是一朵普通的玫瑰。":"I thought I had a flower that was unique in all the world.\\nAnd all I had was an ordinary rose.","来和我玩吧。我很难过……":"Come and play with me. I’m so sad…","我不能和你玩。我没有被驯养。":"I can’t play with you. I am not tamed.","“驯养”是什么意思？":"What does “tame” mean?","就是“建立联系”。对我来说，你还只是一个小男孩，和十万个小男孩一模一样。":"It means “to establish ties.” To me, you are still only a little boy, just like a hundred thousand other little boys.","可如果你驯养了我，你对我就是世上唯一的。":"But if you tame me, you will be unique in all the world to me.","我开始明白了。有一朵花……我想她驯养了我……":"I’m beginning to understand. There is a flower… I think she has tamed me…","再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。":"Go and look at the roses again. You will understand that yours is unique in all the world.","你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。":"You are beautiful, but you are empty. She alone matters more than all of you, because she is the one I watered. Because she is my rose.","这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。":"Here is my secret. It is very simple: it is only with the heart that one can see clearly. What is essential is invisible to the eye.","是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。":"It is the time you spent on your rose that makes your rose so important.","你要永远为你驯养的东西负责。你要对你的玫瑰负责……":"You become responsible, forever, for what you have tamed. You are responsible for your rose…","我要对我的玫瑰负责……":"I am responsible for my rose…","第八章　地球":"Chapter Eight · Earth","沙丘":"The Dunes","这是他在地球上的最后一段路。他的玫瑰，在头顶那颗星星上。":"The last stretch of his road on Earth. His rose is on the star overhead.","请你……给我画一只羊！":"Please… draw me a sheep!","这只太老了。我要一只能活很久的羊。":"This one is too old. I want a sheep that will live a long time.","这是箱子。你要的羊就在里面。":"This is the box. The sheep you want is inside.","这正是我想要的！":"That’s exactly how I wanted it!","瞧！它睡着了……":"Look! He’s fallen asleep…","八天后":"Eight days later","小王子分享了旅程中的经历":"The little prince told him all about his journey","啊！你的回忆真美。可我还没修好飞机。":"Ah! Your memories are lovely. But I still haven’t repaired my plane.","今天夜里，就满一年了。我的星星，会正好在我去年落下的地方上空……":"Tonight, it will be a year. My star will be right above the place where I fell last year…","你是要回到你落下的地方去？":"So you’re going back to the place where you fell?","嗯……":"Mm…","让沙漠变美的，是它在什么地方藏着一口井……":"What makes the desert beautiful is that somewhere it hides a well…","真正重要的东西，眼睛是看不见的。":"What is essential is invisible to the eye.","哪天你太想念你的星球，我可以帮你。":"One day, if you miss your planet too much, I can help you.","你会看见我的脚印在沙上是从哪儿开始的。你在那儿等我。今天夜里我会到。":"You’ll see where my footprints begin in the sand. Wait for me there. I’ll be there tonight.","啊！你在这儿……":"Ah! You’re here…","我很高兴，你找到了飞机缺的东西。你可以回家了……":"I’m glad you found what your plane was missing. Now you can go home…","你怎么知道？":"How did you know?","我也是，今天，我要回家了……远得多……也难得多……":"I’m going home today, too… It’s much farther… and much harder…","小家伙，我还想听你笑……":"Little man, I want to hear you laugh again…","夜里你看天空的时候，我就在其中一颗星星上笑。对你来说，就像所有的星星都在笑。":"When you look up at the sky at night, I’ll be laughing on one of the stars. So for you, it will be as if all the stars were laughing.","你知道……我的花……我要对她负责！她那么弱小，只有四根刺来保护自己……":"You know… my flower… I’m responsible for her! And she is so weak, with only four thorns to protect herself…","好了……就这些……":"There… That’s all…","是你为你的玫瑰花费的时间，":"It is the time you spent on your rose","才使你的玫瑰变得这么重要。":"that makes your rose so important.","——送给最爱的人":"— For the one I love most","完":"The End","未能载入这一章，请检查网络后重新进入。":"Couldn’t load this chapter. Check your connection and enter again.","重新进入":"Enter again"},"fr":{"小王子":"Le Petit Prince","玫瑰花":"La Fleur","国王":"Le Roi","爱虚荣的人":"Le Vaniteux","酒鬼":"Le Buveur","酒馆门":"La porte de la taverne","商人":"Le Businessman","点灯人":"L’Allumeur de réverbères","地理学家":"Le Géographe","蛇":"Le Serpent","玫瑰们":"Les Roses","狐狸":"Le Renard","小花":"Une fleur","飞行员":"L’Aviateur","小王子（自语）":"Le Petit Prince (à lui-même)","小王子的旅程":"Le Voyage du petit prince","故事，从一朵玫瑰开始":"Tout commence par une fleur","离开玫瑰以后，他去拜访别的星球":"Après avoir quitté sa fleur, il partit visiter d’autres planètes","还看不清……":"Trop loin pour bien voir…","这颗星球还在建造中，暂时还不能降落。":"Cette planète est encore en construction. On ne peut pas encore s’y poser.","还在建造中":"En construction","前去拜访":"Rendre visite","已经拜访过":"Déjà visitée","再去看看":"Y retourner","设置":"Réglages","B-612 · 家园":"B-612 · Chez lui","玫瑰在这里":"Là où vit sa fleur","有一颗只比房子大一点的星球，上面住着一位小王子。":"Sur une planète à peine plus grande qu’une maison vit un petit prince.","走进家园":"Aller sur B-612","他从这里出发":"D’où il est parti","他给玫瑰浇过水、看过日落，然后跟着候鸟走了。":"Il arrosa sa fleur, regarda le coucher du soleil, puis s’en alla avec les oiseaux sauvages.","这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。":"Voici B-612, la planète du petit prince : à peine plus grande qu’une maison, avec trois volcans et une seule fleur.","国王的星球":"La Planète du roi","325 号小行星":"Astéroïde 325","这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。":"Ici vit un roi. Pour lui, tous les hommes sont des sujets, et même les étoiles lui obéissent.","国王要任命他做大使，他还是走了。":"Le roi voulut faire de lui son ambassadeur. Il partit quand même.","这里住着一位国王。他的星球上没有别人。":"Ici vit un roi. Il n’y a personne d’autre sur sa planète.","326 号小行星":"Astéroïde 326","这里住着一个爱虚荣的人，他只听得见赞美。":"Ici vit un vaniteux. Il n’entend jamais que les louanges.","他拍了两次手。那个人只想听掌声，他就走了。":"Il frappa deux fois dans ses mains. Le vaniteux ne voulait que des applaudissements ; alors il s’en alla.","这里住着一个爱虚荣的人。他等着有人来崇拜他。":"Ici vit un vaniteux, qui attend qu’on vienne l’admirer.","327 号小行星":"Astéroïde 327","这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。":"Ici vit un buveur. Il boit pour oublier ce qui lui fait honte : boire.","他问了几句，没有得到答案，坐了一会儿就走了。":"Il posa quelques questions, ne trouva pas de réponse, resta assis un moment et s’en alla.","这里住着一个酒鬼。他喝酒，是为了忘记一件事。":"Ici vit un buveur. Il boit pour oublier quelque chose.","328 号小行星":"Astéroïde 328","这里住着一个商人，他一刻不停地数星星，说它们都归他所有。":"Ici vit un businessman qui compte les étoiles sans relâche, et dit qu’elles lui appartiennent toutes.","他说完自己的花和火山，商人找不到话回答。":"Il parla de sa fleur et de ses volcans, et le businessman ne trouva rien à répondre.","这里住着一个商人。他在数星星，数了很多年。":"Ici vit un businessman. Il compte les étoiles depuis des années et des années.","329 号小行星":"Astéroïde 329","这是最小的一颗星球，只放得下一盏路灯和一个点灯人。":"C’est la plus petite planète de toutes, avec juste assez de place pour un réverbère et un allumeur de réverbères.","他想留下来陪点灯人，可这颗星球太小，容不下两个人。":"Il aurait voulu rester avec l’allumeur, mais la planète était trop petite : il n’y avait pas de place pour deux.","这里是最小的一颗星球。只有一盏路灯，和一个一分钟也歇不了的人。":"La plus petite planète de toutes : un réverbère, et un homme qui n’a jamais une minute de repos.","330 号小行星":"Astéroïde 330","这里住着一位地理学家，他从不出门，却记下了别处的山和海。":"Ici vit un géographe. Il ne sort jamais, et pourtant il note les montagnes et les mers des pays lointains.","他第一次担心起留在家里的花，然后去了地理学家说的地球。":"Pour la première fois, il s’inquiéta de la fleur restée chez lui. Puis il partit pour la Terre, comme le géographe le lui avait conseillé.","这里住着一位地理学家。他写一本很大的书，却从没离开过书桌。":"Ici vit un géographe. Il écrit d’énormes livres, mais n’a jamais quitté son bureau.","地球":"La Terre","第七颗星球":"La septième planète","地理学家说，去地球看看吧，它的名声很好。":"« Va voir la Terre », dit le géographe. « Elle a une bonne réputation. »","前往地球":"Aller sur la Terre","他在这里":"Il est ici","这里是地球。一片沙漠，头顶有一颗格外亮的星。":"Voici la Terre : un désert, et là-haut, une étoile plus brillante que les autres.","有一颗只比房子大一点的星球，":"Sur une planète à peine plus grande qu’une maison","上面住着一位小王子。":"vit un petit prince.","这里住着一位国王。":"Ici vit un roi.","在他眼里，人人都是臣民，连星星也听他的。":"Pour lui, tous les hommes sont des sujets, et même les étoiles lui obéissent.","这里住着一个爱虚荣的人，":"Ici vit un vaniteux.","他只听得见赞美。":"Il n’entend jamais que les louanges.","这里住着一个酒鬼。":"Ici vit un buveur.","他喝酒，是为了忘掉让他难为情的事——喝酒。":"Il boit pour oublier ce qui lui fait honte : boire.","这里住着一个商人，他一刻不停地数星星，":"Ici vit un businessman qui compte les étoiles sans relâche,","说它们都归他所有。":"et dit qu’elles lui appartiennent toutes.","这是最小的一颗星球，":"C’est la plus petite planète de toutes,","只放得下一盏路灯和一个点灯人。":"avec juste assez de place pour un réverbère et un allumeur de réverbères.","这里住着一位地理学家，":"Ici vit un géographe.","他从不出门，却记下了别处的山和海。":"Il ne sort jamais, et pourtant il note les montagnes et les mers des pays lointains.","地理学家说，去地球看看吧，":"« Va voir la Terre », dit le géographe.","它的名声很好。":"« Elle a une bonne réputation. »","第一章":"Chapitre premier","第二章":"Chapitre deux","第三章":"Chapitre trois","第四章":"Chapitre quatre","第五章":"Chapitre cinq","第六章":"Chapitre six","第七章":"Chapitre sept","第八章":"Chapitre huit","第{0}章":"Chapitre {0}","在 B-612 的最后一天":"Le dernier jour sur B-612","一座空荡荡的宫殿，住着一位国王":"Un palais vide, habité par un roi","爱虚荣者的星球":"La Planète du vaniteux","一颗从没有人经过的星球，住着一个爱虚荣的人":"Une planète où personne ne passe jamais, habitée par un vaniteux","酒鬼的星球":"La Planète du buveur","一个用喝酒来忘记一切的人":"Un homme qui boit pour tout oublier","商人的星球":"La Planète du businessman","一个忙得连头也不抬的商人":"Un businessman trop occupé pour lever la tête","点灯人的星球":"La Planète de l’allumeur","一颗一分钟就转一圈的星球，住着一个点灯人":"Une planète qui tourne une fois par minute, habitée par un allumeur de réverbères","地理学家的星球":"La Planète du géographe","一位记下了山和海，却从没去看过的地理学家":"Un géographe qui note des montagnes et des mers qu’il n’a jamais vues","一颗很大的星球，可是一个人也看不见":"Une très grande planète, et pas âme qui vive","四处走走，熟悉一下这颗星球":"Faire le tour de la planète","去看看玫瑰花":"Aller voir la fleur","照料玫瑰花":"Prendre soin de la fleur","去工具棚拿水壶":"Prendre l’arrosoir dans la remise","去泉眼打水":"Le remplir à la source","最后一次给她浇水":"L’arroser une dernière fois","看最后一场日落":"Regarder le dernier coucher de soleil","去星球边上的椅子坐下":"S’asseoir sur la chaise, au bord de la planète","去见国王":"Aller voir le roi","去看舞台上的人":"Voir l’homme sur la scène","去酒馆里坐坐":"S’asseoir un moment à la taverne","拜访数星星的商人":"Rendre visite à l’homme qui compte les étoiles","？？？":"???","在星空里找到 B-612":"Trouver B-612 parmi les étoiles","去灯下看看":"Aller voir le réverbère","去地图馆看看":"Visiter la salle des cartes","去问问这是哪里":"Demander où l’on est","和岩石上的蛇说说话":"Parler au serpent sur le rocher","去玫瑰园看看":"Visiter le jardin de roses","去苹果树下找狐狸":"Trouver le renard sous le pommier","踏上回家的路":"Prendre le chemin du retour","去叫醒飞行员":"Réveiller l’aviateur","回到落下来的地方":"Retourner au point de sa chute","沿着石路走到门洞":"Suivre le chemin de pierre jusqu’à l’arche","{0}　完成":"{0} — terminé","下一件事":"Ensuite","可以启程了":"Prêt à partir","按住":"Maintenir","启程":"Partir","按一下查看本章目标":"Afficher les objectifs du chapitre","再按一下收起":"Appuyer encore pour fermer","隐藏":"Secret","{0} · {1} 米":"{0} · {1} m","{0} 米":"{0} m","前方是旅途":"Le voyage commence ici","先去看一次日落，再启程":"Voir un coucher de soleil avant de partir","要启程吗？":"Partir maintenant ?","Q   启程":"Q   Partir","Q 启程，跟着候鸟去下一颗星球        Esc 再待一会儿":"Q Partir avec les oiseaux vers la planète suivante        Esc Rester encore un peu","今日已日落，改日再来":"Le soleil est couché. Revenez un autre jour.","正在准备画面 · {0}%":"Préparation de la scène · {0} %","{0}　　　{0}":"{0}   {0}","移动":"Se déplacer","鼠标":"Souris","点击画面后移动鼠标，看看四周":"Cliquer, puis bouger la souris pour regarder","快跑":"Courir","拿起水壶":"Prendre l’arrosoir","放回水壶":"Ranger l’arrosoir","放下水壶":"Poser l’arrosoir","打水":"Puiser de l’eau","浇水":"Arroser la fleur","给玫瑰浇水":"Arroser la fleur","壶是空的":"L’arrosoir est vide.","拿起玻璃罩":"Soulever le globe","放回去":"Le remettre","放回玻璃罩":"Remettre le globe","先把水壶放在花旁":"D’abord, poser l’arrosoir près de la fleur","先把水壶放下":"D’abord, poser l’arrosoir","坐下":"S’asseoir","起身":"Se lever","交谈":"Parler","交互":"Interagir","推开宫门":"Pousser les portes","推开门":"Pousser la porte","推开木门":"Pousser la porte","拉开门":"Tirer la porte","拉开木门":"Tirer la porte","合上门":"Fermer la porte","合上木门":"Fermer la porte","开门":"Ouvrir la porte","关门":"Fermer la porte","鼓掌":"Applaudir","看星星":"Regarder les étoiles","离开":"Quitter","滚轮":"Molette","放大":"Zoomer","眺望":"Contempler","喊":"Appeler","上车":"Monter dans le train","转辘轳":"Tourner la poulie","叫醒他":"Le réveiller","和蛇说话":"Parler au serpent","水壶":"Arrosoir","泉眼":"Source","椅子":"Chaise","玫瑰园":"Jardin de roses","火车":"Train","苹果树":"Pommier","车站":"Gare","门洞":"Arche","暂停":"Pause","继续":"Reprendre","回到旅程地图":"Retour à la carte du voyage","返回地图":"Retour à la carte","返回游戏":"Retour au jeu","全屏":"Plein écran","清除进度":"Effacer la progression","确定清除？":"Tout effacer ?","语言":"Langue","操作":"Commandes","方向键也可以":"Ou les touches fléchées","视角":"Regarder","点击画面后转动鼠标":"Cliquer, puis bouger la souris","空格":"Espace","跳":"Sauter","互动":"Interagir","靠近有星标的东西":"S’approcher de ce qui porte une étoile","按住，走完一圈":"Maintenir jusqu’à remplir le cercle","本章目标":"Objectifs du chapitre","按一下展开，再按收起":"Appuyer pour ouvrir, encore pour fermer","鼠标灵敏度":"Sensibilité de la souris","声音":"Son","主音量":"Volume général","音乐":"Musique","音效":"Effets sonores","我想……该是吃早饭的时候了。":"C’est l’heure, je crois… du petit déjeuner.","能不能劳您费心，也想着我一点……":"Auriez-vous la bonté de penser à moi…","再见了。":"Adieu.","……":"…","我想去别的星球看看。":"Je veux aller voir d’autres planètes.","（轻轻咳了一声）":"(Elle tousse doucement)","我以前真傻。请你原谅我。":"J’ai été sotte. Je te demande pardon.","是啊，我是爱你的。":"Mais oui, je t’aime.","你一点都没察觉，是我的错。":"Tu n’en as rien su, par ma faute.","不过，你也和我一样傻。":"Mais tu as été aussi sot que moi.","别管这个罩子了。我不要它了。":"Laisse ce globe tranquille. Je n’en veux plus.","可是风……":"Mais le vent…","夜里的凉风会对我有好处的。我是一朵花。":"L’air frais de la nuit me fera du bien. Je suis une fleur.","可是那些野兽……":"Mais les bêtes…","我什么都不怕。我有我的爪子。":"Les bêtes, je ne les crains pas. J’ai mes griffes.","（亮出她的四根刺）":"(Elle montre ses quatre épines)","别这样磨磨蹭蹭的，真烦人。":"Ne traîne pas comme ça, c’est agaçant.","你已经决定要走了。走吧。":"Tu as décidé de partir. Va-t’en.","人在很难过的时候，就喜欢看日落……":"Quand on est tellement triste, on aime les couchers de soleil…","我很喜欢看日落。":"J’aime bien les couchers de soleil.","啊，来了一位臣民！":"Ah ! Voilà un sujet !","您从没见过我，怎么知道我是臣民？":"Vous ne m’avez jamais vu. Comment savez-vous que je suis un sujet ?","来到我面前的，都是我的臣民。这里的一切都听我的，连星星也是。":"Tous ceux qui se présentent devant moi sont mes sujets. Ici, tout m’obéit, même les étoiles.","那您能让太阳现在落下吗？我想看一次日落。":"Alors, pouvez-vous ordonner au soleil de se coucher maintenant ? Je voudrais tant voir un coucher de soleil.","当然。不过命令要下在合适的时候。今晚七点四十，我会命令它落下。":"Certes. Mais un ordre doit être donné au bon moment. Ce soir, à sept heures quarante, je lui ordonnerai de se coucher.","……七点四十，它本来就要落下的。":"…À sept heures quarante, il allait se coucher de toute façon.","在我家，想看日落，把椅子挪几步就行了。":"Chez moi, pour voir un coucher de soleil, je n’ai qu’à tirer ma chaise de quelques pas.","我该走了。":"Il faut que je m’en aille.","等等！我任命你做我的大使！":"Attends ! Je te fais mon ambassadeur !","啊！啊！来了一位崇拜者！":"Ah ! Ah ! Voilà la visite d’un admirateur !","你拍拍手吧。":"Frappe tes mains l’une contre l’autre.","你真的非常崇拜我吗？":"Est-ce que tu m’admires vraiment beaucoup ?","“崇拜”是什么意思？":"Qu’est-ce que signifie « admirer » ?","崇拜，就是承认我是这颗星球上\\n最英俊、穿得最好、最有钱、最聪明的人。":"Admirer signifie reconnaître que je suis l’homme le plus beau,\\nle mieux habillé, le plus riche et le plus intelligent de la planète.","可这颗星球上只有你一个人！":"Mais tu es seul sur ta planète !","行行好，还是崇拜我吧！":"Fais-moi ce plaisir. Admire-moi quand même !","我崇拜你。可这对你有什么要紧呢？":"Je t’admire. Mais en quoi cela peut-il bien t’intéresser ?","你在这儿做什么？":"Que fais-tu là ?","我在喝酒。":"Je bois.","你为什么喝酒？":"Pourquoi bois-tu ?","为了忘记。":"Pour oublier.","忘记什么？":"Pour oublier quoi ?","忘记我的羞愧。":"Pour oublier que j’ai honte.","羞愧什么？":"Honte de quoi ?","羞愧我喝酒！":"Honte de boire !","二十六加五，三十一。呼！\\n一共是五亿零一百六十二万二千七百三十一。":"Vingt-six et cinq trente et un. Ouf !\\nÇa fait donc cinq cent un millions six cent vingt-deux mille sept cent trente et un.","五亿什么？":"Cinq cents millions de quoi ?","星星。":"D’étoiles.","你拿五亿颗星星做什么？":"Et que fais-tu de cinq cents millions d’étoiles ?","什么也不做。我拥有它们。":"Rien. Je les possède.","那你拿它们怎么办呢？":"Et alors, qu’en fais-tu ?","我把星星的数目写在一张小纸上，\\n再把这张纸锁进抽屉。":"J’écris sur un petit papier le nombre de mes étoiles,\\npuis j’enferme à clef ce papier-là dans un tiroir.","就这些？":"Et c’est tout ?","这就够了！":"Ça suffit !","我有一朵花，我每天给她浇水。\\n我有三座火山，我每星期疏通一遍。":"Moi, je possède une fleur que j’arrose tous les jours.\\nJe possède trois volcans que je ramone toutes les semaines.","我拥有它们，对我的火山有用，对我的花也有用。\\n可你对星星没有用……":"C’est utile à mes volcans, et c’est utile à ma fleur, que je les possède.\\nMais tu n’es pas utile aux étoiles…","你好。你为什么刚把路灯熄了？":"Bonjour. Pourquoi viens-tu d’éteindre ton réverbère ?","这是规定。早上好。":"C’est la consigne. Bonjour.","可你为什么又把它点亮了？":"Mais pourquoi viens-tu de le rallumer ?","没什么要明白的。规定就是规定。晚上好。":"Il n’y a rien à comprendre. La consigne c’est la consigne. Bonsoir.","从前还说得过去：早上熄灯，晚上点灯。":"Autrefois, c’était raisonnable : j’éteignais le matin et j’allumais le soir.","可星球一年比一年转得快，规定却没改！":"Mais la planète, d’année en année, a tourné de plus en plus vite, et la consigne n’a pas changé !","现在它一分钟转一圈，我连一秒钟也歇不了。":"Maintenant qu’elle fait un tour par minute, je n’ai plus une seconde de repos.","只有他不让我觉得可笑。\\n也许是因为，他操心的是自己以外的事。":"C’est le seul qui ne me paraisse pas ridicule.\\nC’est peut-être parce qu’il s’occupe d’autre chose que de soi-même.","瞧！来了一位探险家！":"Tiens ! Voilà un explorateur !","你从远方来！给我讲讲你的星球！":"Tu viens de loin ! Décris-moi ta planète !","我那儿很小。我有三座火山。":"Chez moi, c’est tout petit. J’ai trois volcans.","我还有一朵花。":"J’ai aussi une fleur.","我们不记录花。":"Nous ne notons pas les fleurs.","为什么！花是最美的！":"Pourquoi ça ! C’est le plus joli !","因为花是转瞬即逝的。":"Parce que les fleurs sont éphémères.","“转瞬即逝”是什么意思？":"Qu’est-ce que signifie « éphémère » ?","意思是“很快就有消失的危险”。":"Ça signifie « qui est menacé de disparition prochaine ».","我的花是转瞬即逝的，她只有四根刺来保护自己！\\n而我把她独自留在了家里！":"Ma fleur est éphémère, et elle n’a que quatre épines pour se défendre contre le monde !\\nEt je l’ai laissée toute seule chez moi !","我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！":"Ma fleur est éphémère, et elle n’a que quatre épines pour se défendre contre le monde ! Et je l’ai laissée toute seule chez moi !","我落在哪颗星球上了？":"Sur quelle planète suis-je tombé ?","地球上，在非洲。":"Sur la Terre, en Afrique.","看，我的星球。它就在我们头顶上……可它多远啊！":"Regarde ma planète. Elle est juste au-dessus de nous… Mais comme elle est loin !","它真美。你来这儿做什么？":"Elle est belle. Que viens-tu faire ici ?","我和一朵花闹了点别扭。":"J’ai des difficultés avec une fleur.","人在哪儿？在沙漠里有点孤独……":"Où sont les hommes ? On est un peu seul dans le désert…","在人群里也一样孤独。":"On est seul aussi chez les hommes.","我碰到谁，就把他送回他来的那片土地。":"Celui que je touche, je le rends à la terre dont il est sorti.","你这么弱小，落在这花岗岩的地球上，我可怜你。哪天你太想念你的星球，我可以帮你。":"Tu me fais pitié, toi si faible, sur cette Terre de granit. Je puis t’aider un jour si tu regrettes trop ta planète.","人在哪儿？":"Où sont les hommes ?","人？风吹着他们到处走。他们没有根，这让他们很难办。":"Les hommes ? Le vent les promène. Ils manquent de racines, ça les gêne beaucoup.","你好！做我的朋友吧，我很孤独。":"Bonjour ! Soyez mes amis, je suis seul.","你好……我很孤独……":"Bonjour… je suis seul…","我很孤独……":"Je suis seul…","你们是谁？":"Qui êtes-vous ?","我们是玫瑰。":"Nous sommes des roses.","我还以为我有一朵独一无二的花，\\n原来只是一朵普通的玫瑰。":"Je me croyais riche d’une fleur unique,\\net je ne possède qu’une rose ordinaire.","来和我玩吧。我很难过……":"Viens jouer avec moi. Je suis tellement triste…","我不能和你玩。我没有被驯养。":"Je ne puis pas jouer avec toi. Je ne suis pas apprivoisé.","“驯养”是什么意思？":"Qu’est-ce que signifie « apprivoiser » ?","就是“建立联系”。对我来说，你还只是一个小男孩，和十万个小男孩一模一样。":"Ça signifie « créer des liens ». Tu n’es encore pour moi qu’un petit garçon tout semblable à cent mille petits garçons.","可如果你驯养了我，你对我就是世上唯一的。":"Mais si tu m’apprivoises, tu seras pour moi unique au monde.","我开始明白了。有一朵花……我想她驯养了我……":"Je commence à comprendre. Il y a une fleur… je crois qu’elle m’a apprivoisé…","再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。":"Va revoir les roses. Tu comprendras que la tienne est unique au monde.","你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。":"Vous êtes belles, mais vous êtes vides. À elle seule, elle est plus importante que vous toutes, puisque c’est elle que j’ai arrosée. Puisque c’est ma rose.","这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。":"Voici mon secret. Il est très simple : on ne voit bien qu’avec le cœur. L’essentiel est invisible pour les yeux.","是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。":"C’est le temps que tu as perdu pour ta rose qui fait ta rose si importante.","你要永远为你驯养的东西负责。你要对你的玫瑰负责……":"Tu deviens responsable pour toujours de ce que tu as apprivoisé. Tu es responsable de ta rose…","我要对我的玫瑰负责……":"Je suis responsable de ma rose…","第八章　地球":"Chapitre huit · La Terre","沙丘":"Les Dunes","这是他在地球上的最后一段路。他的玫瑰，在头顶那颗星星上。":"Le dernier bout de son chemin sur la Terre. Sa rose est sur l’étoile, là-haut.","请你……给我画一只羊！":"S’il vous plaît… dessine-moi un mouton !","这只太老了。我要一只能活很久的羊。":"Celui-là est trop vieux. Je veux un mouton qui vive longtemps.","这是箱子。你要的羊就在里面。":"Ça, c’est la caisse. Le mouton que tu veux est dedans.","这正是我想要的！":"C’est tout à fait comme ça que je le voulais !","瞧！它睡着了……":"Tiens ! Il s’est endormi…","八天后":"Huit jours plus tard","小王子分享了旅程中的经历":"Le petit prince lui a raconté tout son voyage","啊！你的回忆真美。可我还没修好飞机。":"Ah ! Ils sont bien jolis, tes souvenirs, mais je n’ai pas encore réparé mon avion.","今天夜里，就满一年了。我的星星，会正好在我去年落下的地方上空……":"Cette nuit, ça fera un an. Mon étoile se trouvera juste au-dessus de l’endroit où je suis tombé l’année dernière…","你是要回到你落下的地方去？":"Tu retournes vers le point de ta chute ?","嗯……":"Hum…","让沙漠变美的，是它在什么地方藏着一口井……":"Ce qui embellit le désert, c’est qu’il cache un puits quelque part…","真正重要的东西，眼睛是看不见的。":"L’essentiel est invisible pour les yeux.","哪天你太想念你的星球，我可以帮你。":"Je puis t’aider un jour si tu regrettes trop ta planète.","你会看见我的脚印在沙上是从哪儿开始的。你在那儿等我。今天夜里我会到。":"Tu verras où commence ma trace dans le sable. Tu n’as qu’à m’y attendre. J’y serai cette nuit.","啊！你在这儿……":"Ah ! Tu es là…","我很高兴，你找到了飞机缺的东西。你可以回家了……":"Je suis content que tu aies trouvé ce qui manquait à ta machine. Tu vas pouvoir rentrer chez toi…","你怎么知道？":"Comment sais-tu ?","我也是，今天，我要回家了……远得多……也难得多……":"Moi aussi, aujourd’hui, je rentre chez moi… C’est bien plus loin… c’est bien plus difficile…","小家伙，我还想听你笑……":"Petit bonhomme, je veux encore t’entendre rire…","夜里你看天空的时候，我就在其中一颗星星上笑。对你来说，就像所有的星星都在笑。":"Quand tu regarderas le ciel, la nuit, je rirai dans l’une des étoiles. Alors ce sera pour toi comme si riaient toutes les étoiles.","你知道……我的花……我要对她负责！她那么弱小，只有四根刺来保护自己……":"Tu sais… ma fleur… j’en suis responsable ! Et elle est tellement faible ! Elle n’a que quatre épines pour se protéger contre le monde…","好了……就这些……":"Voilà… C’est tout…","是你为你的玫瑰花费的时间，":"C’est le temps que tu as perdu pour ta rose","才使你的玫瑰变得这么重要。":"qui fait ta rose si importante.","——送给最爱的人":"— À toi que j’aime le plus","完":"Fin","未能载入这一章，请检查网络后重新进入。":"Impossible de charger ce chapitre. Vérifiez votre connexion, puis réessayez.","重新进入":"Réessayer"},"es":{"小王子":"El Principito","玫瑰花":"La flor","国王":"El rey","爱虚荣的人":"El vanidoso","酒鬼":"El bebedor","酒馆门":"La puerta de la taberna","商人":"El hombre de negocios","点灯人":"El farolero","地理学家":"El geógrafo","蛇":"La serpiente","玫瑰们":"Las rosas","狐狸":"El zorro","小花":"Una flor","飞行员":"El aviador","小王子（自语）":"El Principito (para sí)","小王子的旅程":"El viaje del Principito","故事，从一朵玫瑰开始":"Todo empieza con una flor","离开玫瑰以后，他去拜访别的星球":"Tras dejar a su flor, partió a visitar otros planetas","还看不清……":"Aún no se distingue…","这颗星球还在建造中，暂时还不能降落。":"Este planeta aún está en construcción. Todavía no puedes aterrizar.","还在建造中":"En construcción","前去拜访":"Visitar","已经拜访过":"Visitado","再去看看":"Volver a visitar","设置":"Ajustes","B-612 · 家园":"B-612 · Hogar","玫瑰在这里":"Donde vive su flor","有一颗只比房子大一点的星球，上面住着一位小王子。":"En un planeta apenas más grande que una casa, vive un principito.","走进家园":"Ir a B-612","他从这里出发":"Donde empezó su viaje","他给玫瑰浇过水、看过日落，然后跟着候鸟走了。":"Regó su flor, miró la puesta de sol y se fue con las aves migratorias.","这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。":"Esto es B-612, el hogar del principito: apenas más grande que una casa, con tres volcanes y una flor.","国王的星球":"El planeta del rey","325 号小行星":"Asteroide 325","这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。":"Aquí vive un rey. A sus ojos, todos son súbditos y hasta las estrellas le obedecen.","国王要任命他做大使，他还是走了。":"El rey quería nombrarlo embajador. Aun así, se fue.","这里住着一位国王。他的星球上没有别人。":"Aquí vive un rey. No hay nadie más en su planeta.","326 号小行星":"Asteroide 326","这里住着一个爱虚荣的人，他只听得见赞美。":"Aquí vive un vanidoso. No oye más que alabanzas.","他拍了两次手。那个人只想听掌声，他就走了。":"Aplaudió dos veces. Aquel hombre solo quería aplausos, así que siguió su camino.","这里住着一个爱虚荣的人。他等着有人来崇拜他。":"Aquí vive un vanidoso, que espera que alguien venga a admirarlo.","327 号小行星":"Asteroide 327","这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。":"Aquí vive un bebedor. Bebe para olvidar lo que le avergüenza: beber.","他问了几句，没有得到答案，坐了一会儿就走了。":"Hizo algunas preguntas, no obtuvo respuestas, se sentó un rato y se fue.","这里住着一个酒鬼。他喝酒，是为了忘记一件事。":"Aquí vive un bebedor. Bebe para olvidar algo.","328 号小行星":"Asteroide 328","这里住着一个商人，他一刻不停地数星星，说它们都归他所有。":"Aquí vive un hombre de negocios que cuenta las estrellas sin parar, y dice que todas son suyas.","他说完自己的花和火山，商人找不到话回答。":"Habló de su flor y de sus volcanes, y el hombre de negocios no supo qué responder.","这里住着一个商人。他在数星星，数了很多年。":"Aquí vive un hombre de negocios. Lleva años y años contando estrellas.","329 号小行星":"Asteroide 329","这是最小的一颗星球，只放得下一盏路灯和一个点灯人。":"Este es el planeta más pequeño de todos, con espacio justo para un farol y un farolero.","他想留下来陪点灯人，可这颗星球太小，容不下两个人。":"Quiso quedarse con el farolero, pero el planeta era demasiado pequeño para dos.","这里是最小的一颗星球。只有一盏路灯，和一个一分钟也歇不了的人。":"El planeta más pequeño de todos: un farol y un hombre que no descansa ni un minuto.","330 号小行星":"Asteroide 330","这里住着一位地理学家，他从不出门，却记下了别处的山和海。":"Aquí vive un geógrafo. Nunca sale de casa, pero anota las montañas y los mares de lugares lejanos.","他第一次担心起留在家里的花，然后去了地理学家说的地球。":"Por primera vez, se preocupó por la flor que había dejado en casa. Luego fue a la Tierra, como le había aconsejado el geógrafo.","这里住着一位地理学家。他写一本很大的书，却从没离开过书桌。":"Aquí vive un geógrafo. Escribe un libro enorme, pero nunca se ha apartado de su escritorio.","地球":"La Tierra","第七颗星球":"El séptimo planeta","地理学家说，去地球看看吧，它的名声很好。":"«Ve a ver la Tierra», le dijo el geógrafo. «Tiene buena reputación».","前往地球":"Ir a la Tierra","他在这里":"Aquí está él","这里是地球。一片沙漠，头顶有一颗格外亮的星。":"Esta es la Tierra: un desierto y, en lo alto, una estrella especialmente brillante.","有一颗只比房子大一点的星球，":"En un planeta apenas más grande que una casa,","上面住着一位小王子。":"vive un principito.","这里住着一位国王。":"Aquí vive un rey.","在他眼里，人人都是臣民，连星星也听他的。":"A sus ojos, todos son súbditos y hasta las estrellas le obedecen.","这里住着一个爱虚荣的人，":"Aquí vive un vanidoso.","他只听得见赞美。":"No oye más que alabanzas.","这里住着一个酒鬼。":"Aquí vive un bebedor.","他喝酒，是为了忘掉让他难为情的事——喝酒。":"Bebe para olvidar lo que le avergüenza: beber.","这里住着一个商人，他一刻不停地数星星，":"Aquí vive un hombre de negocios que cuenta las estrellas sin parar,","说它们都归他所有。":"y dice que todas son suyas.","这是最小的一颗星球，":"Este es el planeta más pequeño de todos,","只放得下一盏路灯和一个点灯人。":"con espacio justo para un farol y un farolero.","这里住着一位地理学家，":"Aquí vive un geógrafo.","他从不出门，却记下了别处的山和海。":"Nunca sale de casa, pero anota las montañas y los mares de lugares lejanos.","地理学家说，去地球看看吧，":"«Ve a ver la Tierra», le dijo el geógrafo.","它的名声很好。":"«Tiene buena reputación».","第一章":"Capítulo uno","第二章":"Capítulo dos","第三章":"Capítulo tres","第四章":"Capítulo cuatro","第五章":"Capítulo cinco","第六章":"Capítulo seis","第七章":"Capítulo siete","第八章":"Capítulo ocho","第{0}章":"Capítulo {0}","在 B-612 的最后一天":"El último día en B-612","一座空荡荡的宫殿，住着一位国王":"Un palacio vacío, hogar de un rey","爱虚荣者的星球":"El planeta del vanidoso","一颗从没有人经过的星球，住着一个爱虚荣的人":"Un planeta por el que nunca pasa nadie, hogar de un vanidoso","酒鬼的星球":"El planeta del bebedor","一个用喝酒来忘记一切的人":"Un hombre que bebe para olvidarlo todo","商人的星球":"El planeta del hombre de negocios","一个忙得连头也不抬的商人":"Un hombre de negocios tan ocupado que ni levanta la vista","点灯人的星球":"El planeta del farolero","一颗一分钟就转一圈的星球，住着一个点灯人":"Un planeta que da una vuelta por minuto, hogar de un farolero","地理学家的星球":"El planeta del geógrafo","一位记下了山和海，却从没去看过的地理学家":"Un geógrafo que anota montañas y mares que nunca ha visto","一颗很大的星球，可是一个人也看不见":"Un planeta muy grande, y ni un alma a la vista","四处走走，熟悉一下这颗星球":"Da un paseo y conoce tu planeta","去看看玫瑰花":"Ve a ver a la flor","照料玫瑰花":"Cuida la flor","去工具棚拿水壶":"Busca la regadera en el cobertizo","去泉眼打水":"Llénala en el manantial","最后一次给她浇水":"Riégala por última vez","看最后一场日落":"Mira la última puesta de sol","去星球边上的椅子坐下":"Siéntate en la silla al borde del planeta","去见国王":"Ve a ver al rey","去看舞台上的人":"Ve a ver al hombre del escenario","去酒馆里坐坐":"Siéntate un rato en la taberna","拜访数星星的商人":"Visita al hombre que cuenta estrellas","？？？":"???","在星空里找到 B-612":"Encuentra B-612 entre las estrellas","去灯下看看":"Ve a ver el farol","去地图馆看看":"Recorre la biblioteca de mapas","去问问这是哪里":"Averigua dónde estás","和岩石上的蛇说说话":"Habla con la serpiente de la roca","去玫瑰园看看":"Visita el jardín de rosas","去苹果树下找狐狸":"Busca al zorro bajo el manzano","踏上回家的路":"Emprende el camino a casa","去叫醒飞行员":"Despierta al aviador","回到落下来的地方":"Vuelve al lugar donde caíste","沿着石路走到门洞":"Sigue el camino de piedra hasta el arco","{0}　完成":"{0} — Completado","下一件事":"Siguiente","可以启程了":"Listo para partir","按住":"Mantén","启程":"Partir","按一下查看本章目标":"Pulsa para ver los objetivos del capítulo","再按一下收起":"Pulsa otra vez para cerrar","隐藏":"Oculto","{0} · {1} 米":"{0} · {1} m","{0} 米":"{0} m","前方是旅途":"El viaje te espera","先去看一次日落，再启程":"Mira una puesta de sol antes de partir","要启程吗？":"¿Partir ahora?","Q   启程":"Q   Partir","Q 启程，跟着候鸟去下一颗星球        Esc 再待一会儿":"Q Partir con las aves hacia el siguiente planeta        Esc Quedarse un poco más","今日已日落，改日再来":"El sol ya se puso por hoy. Vuelve otro día.","正在准备画面 · {0}%":"Preparando la escena · {0}%","{0}　　　{0}":"{0}   {0}","移动":"Moverse","鼠标":"Ratón","点击画面后移动鼠标，看看四周":"Haz clic y mueve el ratón para mirar alrededor","快跑":"Correr","拿起水壶":"Tomar la regadera","放回水壶":"Devolver la regadera","放下水壶":"Dejar la regadera","打水":"Sacar agua","浇水":"Regar la flor","给玫瑰浇水":"Regar la flor","壶是空的":"La regadera está vacía.","拿起玻璃罩":"Levantar el fanal","放回去":"Volver a ponerlo","放回玻璃罩":"Volver a ponerlo","先把水壶放在花旁":"Primero deja la regadera junto a la flor","先把水壶放下":"Primero deja la regadera","坐下":"Sentarse","起身":"Levantarse","交谈":"Hablar","交互":"Interactuar","推开宫门":"Empujar las puertas del palacio","推开门":"Empujar la puerta","推开木门":"Empujar la puerta","拉开门":"Abrir la puerta","拉开木门":"Abrir la puerta","合上门":"Cerrar la puerta","合上木门":"Cerrar la puerta","开门":"Abrir la puerta","关门":"Cerrar la puerta","鼓掌":"Aplaudir","看星星":"Mirar las estrellas","离开":"Salir","滚轮":"Rueda","放大":"Acercar","眺望":"Contemplar","喊":"Gritar","上车":"Subir al tren","转辘轳":"Girar la manivela","叫醒他":"Despertarlo","和蛇说话":"Hablar con la serpiente","水壶":"Regadera","泉眼":"Manantial","椅子":"Silla","玫瑰园":"Jardín de rosas","火车":"Tren","苹果树":"Manzano","车站":"Estación","门洞":"Arco","暂停":"Pausa","继续":"Continuar","回到旅程地图":"Mapa del viaje","返回地图":"Volver al mapa","返回游戏":"Volver al juego","全屏":"Pantalla completa","清除进度":"Borrar progreso","确定清除？":"¿Borrar todo el progreso?","语言":"Idioma","操作":"Controles","方向键也可以":"También con las flechas","视角":"Mirar","点击画面后转动鼠标":"Haz clic y mueve el ratón","空格":"Espacio","跳":"Saltar","互动":"Interactuar","靠近有星标的东西":"Acércate a lo marcado con una estrella","按住，走完一圈":"Mantén pulsado hasta llenar el círculo","本章目标":"Objetivos del capítulo","按一下展开，再按收起":"Pulsa una vez para abrir y otra para cerrar","鼠标灵敏度":"Sensibilidad del ratón","声音":"Sonido","主音量":"Volumen general","音乐":"Música","音效":"Efectos de sonido","我想……该是吃早饭的时候了。":"Creo que… ya es la hora del desayuno.","能不能劳您费心，也想着我一点……":"¿Tendría usted la bondad de pensar un poco en mí…?","再见了。":"Adiós.","……":"…","我想去别的星球看看。":"Quiero ir a ver otros planetas.","（轻轻咳了一声）":"(Tose suavemente)","我以前真傻。请你原谅我。":"He sido una tonta. Te pido perdón.","是啊，我是爱你的。":"Pues sí, te quiero.","你一点都没察觉，是我的错。":"Nunca te diste cuenta, y fue culpa mía.","不过，你也和我一样傻。":"Pero tú fuiste tan tonto como yo.","别管这个罩子了。我不要它了。":"Deja ese fanal. Ya no lo quiero.","可是风……":"Pero el viento…","夜里的凉风会对我有好处的。我是一朵花。":"El aire fresco de la noche me hará bien. Soy una flor.","可是那些野兽……":"Pero las fieras…","我什么都不怕。我有我的爪子。":"No le temo a nada. Tengo mis garras.","（亮出她的四根刺）":"(Muestra sus cuatro espinas)","别这样磨磨蹭蹭的，真烦人。":"No te demores así. Es irritante.","你已经决定要走了。走吧。":"Has decidido partir. Vete.","人在很难过的时候，就喜欢看日落……":"Cuando uno está muy triste, le gustan las puestas de sol…","我很喜欢看日落。":"Me encantan las puestas de sol.","啊，来了一位臣民！":"¡Ah! ¡He aquí un súbdito!","您从没见过我，怎么知道我是臣民？":"Usted nunca me ha visto. ¿Cómo sabe que soy un súbdito?","来到我面前的，都是我的臣民。这里的一切都听我的，连星星也是。":"Todos los que llegan ante mí son mis súbditos. Aquí todo me obedece, hasta las estrellas.","那您能让太阳现在落下吗？我想看一次日落。":"Entonces, ¿podría hacer que el sol se ponga ahora? Me gustaría tanto ver una puesta de sol.","当然。不过命令要下在合适的时候。今晚七点四十，我会命令它落下。":"Por supuesto. Pero una orden debe darse en el momento oportuno. Esta noche, a las siete y cuarenta, le ordenaré que se ponga.","……七点四十，它本来就要落下的。":"…A las siete y cuarenta se iba a poner de todos modos.","在我家，想看日落，把椅子挪几步就行了。":"En mi casa, para ver una puesta de sol, me basta con mover la silla unos pasos.","我该走了。":"Debo irme.","等等！我任命你做我的大使！":"¡Espera! ¡Te nombro mi embajador!","啊！啊！来了一位崇拜者！":"¡Ah! ¡Ah! ¡He aquí la visita de un admirador!","你拍拍手吧。":"Vamos, aplaude.","你真的非常崇拜我吗？":"¿De verdad me admiras mucho?","“崇拜”是什么意思？":"¿Qué significa «admirar»?","崇拜，就是承认我是这颗星球上\\n最英俊、穿得最好、最有钱、最聪明的人。":"Admirarme significa reconocer que soy el hombre más apuesto,\\nmejor vestido, más rico y más inteligente de este planeta.","可这颗星球上只有你一个人！":"¡Pero si estás solo en este planeta!","行行好，还是崇拜我吧！":"Hazme ese favor. ¡Admírame de todos modos!","我崇拜你。可这对你有什么要紧呢？":"Te admiro. Pero ¿de qué te sirve eso?","你在这儿做什么？":"¿Qué haces aquí?","我在喝酒。":"Bebo.","你为什么喝酒？":"¿Por qué bebes?","为了忘记。":"Para olvidar.","忘记什么？":"¿Olvidar qué?","忘记我的羞愧。":"Para olvidar que tengo vergüenza.","羞愧什么？":"¿Vergüenza de qué?","羞愧我喝酒！":"¡Vergüenza de beber!","二十六加五，三十一。呼！\\n一共是五亿零一百六十二万二千七百三十一。":"Veintiséis y cinco, treinta y uno. ¡Uf!\\nEn total, quinientos un millones seiscientos veintidós mil setecientos treinta y uno.","五亿什么？":"¿Quinientos millones de qué?","星星。":"De estrellas.","你拿五亿颗星星做什么？":"¿Y qué haces con quinientos millones de estrellas?","什么也不做。我拥有它们。":"Nada. Las poseo.","那你拿它们怎么办呢？":"¿Y entonces qué haces con ellas?","我把星星的数目写在一张小纸上，\\n再把这张纸锁进抽屉。":"Escribo en un papelito el número de mis estrellas,\\ny luego guardo ese papel bajo llave en un cajón.","就这些？":"¿Y eso es todo?","这就够了！":"¡Es suficiente!","我有一朵花，我每天给她浇水。\\n我有三座火山，我每星期疏通一遍。":"Yo poseo una flor, y la riego todos los días.\\nPoseo tres volcanes, y los deshollino todas las semanas.","我拥有它们，对我的火山有用，对我的花也有用。\\n可你对星星没有用……":"Que yo los posea es útil para mis volcanes y es útil para mi flor.\\nPero tú no eres útil para las estrellas…","你好。你为什么刚把路灯熄了？":"Hola. ¿Por qué acabas de apagar tu farol?","这是规定。早上好。":"Es la consigna. Buenos días.","可你为什么又把它点亮了？":"¿Y por qué acabas de volver a encenderlo?","没什么要明白的。规定就是规定。晚上好。":"No hay nada que entender. La consigna es la consigna. Buenas noches.","从前还说得过去：早上熄灯，晚上点灯。":"Antes tenía sentido: lo apagaba por la mañana y lo encendía por la noche.","可星球一年比一年转得快，规定却没改！":"¡Pero el planeta gira cada año más rápido, y la consigna no ha cambiado!","现在它一分钟转一圈，我连一秒钟也歇不了。":"Ahora da una vuelta por minuto, y no tengo ni un segundo de descanso.","只有他不让我觉得可笑。\\n也许是因为，他操心的是自己以外的事。":"Es el único que no me parece ridículo.\\nTal vez porque se ocupa de algo más que de sí mismo.","瞧！来了一位探险家！":"¡Vaya! ¡He aquí un explorador!","你从远方来！给我讲讲你的星球！":"¡Vienes de lejos! ¡Háblame de tu planeta!","我那儿很小。我有三座火山。":"Donde yo vivo, todo es muy pequeño. Tengo tres volcanes.","我还有一朵花。":"También tengo una flor.","我们不记录花。":"Nosotros no anotamos las flores.","为什么！花是最美的！":"¿Por qué no? ¡Las flores son lo más bonito que hay!","因为花是转瞬即逝的。":"Porque las flores son efímeras.","“转瞬即逝”是什么意思？":"¿Qué significa «efímera»?","意思是“很快就有消失的危险”。":"Significa «que está amenazada de próxima desaparición».","我的花是转瞬即逝的，她只有四根刺来保护自己！\\n而我把她独自留在了家里！":"¡Mi flor es efímera, y no tiene más que cuatro espinas para defenderse!\\n¡Y la he dejado completamente sola en casa!","我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！":"¡Mi flor es efímera, y no tiene más que cuatro espinas para defenderse! ¡Y la he dejado completamente sola en casa!","我落在哪颗星球上了？":"¿En qué planeta he caído?","地球上，在非洲。":"En la Tierra, en África.","看，我的星球。它就在我们头顶上……可它多远啊！":"Mira mi planeta. Está justo encima de nosotros… ¡Pero qué lejos está!","它真美。你来这儿做什么？":"Es bello. ¿Y qué vienes a hacer aquí?","我和一朵花闹了点别扭。":"He tenido algunos problemas con una flor.","人在哪儿？在沙漠里有点孤独……":"¿Dónde están los hombres? Se está un poco solo en el desierto…","在人群里也一样孤独。":"También se está solo entre los hombres.","我碰到谁，就把他送回他来的那片土地。":"A quien yo toco, lo devuelvo a la tierra de donde salió.","你这么弱小，落在这花岗岩的地球上，我可怜你。哪天你太想念你的星球，我可以帮你。":"Me das lástima, tan débil sobre esta Tierra de granito. Si algún día añoras demasiado tu planeta, puedo ayudarte.","人在哪儿？":"¿Dónde están los hombres?","人？风吹着他们到处走。他们没有根，这让他们很难办。":"¿Los hombres? El viento los lleva de un lado a otro. No tienen raíces, y eso les complica mucho la vida.","你好！做我的朋友吧，我很孤独。":"¡Hola! Sé mi amigo. Estoy solo.","你好……我很孤独……":"Hola… estoy solo…","我很孤独……":"Estoy solo…","你们是谁？":"¿Quiénes sois?","我们是玫瑰。":"Somos rosas.","我还以为我有一朵独一无二的花，\\n原来只是一朵普通的玫瑰。":"Creía tener una flor única en el mundo,\\ny no tenía más que una rosa común.","来和我玩吧。我很难过……":"Ven a jugar conmigo. Estoy tan triste…","我不能和你玩。我没有被驯养。":"No puedo jugar contigo. No estoy domesticado.","“驯养”是什么意思？":"¿Qué significa «domesticar»?","就是“建立联系”。对我来说，你还只是一个小男孩，和十万个小男孩一模一样。":"Significa «crear lazos». Para mí, todavía no eres más que un muchachito igual a otros cien mil muchachitos.","可如果你驯养了我，你对我就是世上唯一的。":"Pero si me domesticas, serás para mí único en el mundo.","我开始明白了。有一朵花……我想她驯养了我……":"Empiezo a comprender. Hay una flor… creo que me ha domesticado…","再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。":"Ve a ver otra vez las rosas. Comprenderás que la tuya es única en el mundo.","你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。":"Sois bellas, pero estáis vacías. Ella sola es más importante que todas vosotras, porque es a ella a quien he regado. Porque es mi rosa.","这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。":"He aquí mi secreto. Es muy simple: solo se ve bien con el corazón. Lo esencial es invisible a los ojos.","是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。":"Es el tiempo que dedicaste a tu rosa lo que hace que tu rosa sea tan importante.","你要永远为你驯养的东西负责。你要对你的玫瑰负责……":"Eres responsable para siempre de lo que has domesticado. Eres responsable de tu rosa…","我要对我的玫瑰负责……":"Soy responsable de mi rosa…","第八章　地球":"Capítulo ocho · La Tierra","沙丘":"Las dunas","这是他在地球上的最后一段路。他的玫瑰，在头顶那颗星星上。":"Es el último tramo de su camino en la Tierra. Su rosa está en la estrella que brilla en lo alto.","请你……给我画一只羊！":"¡Por favor… dibújame un cordero!","这只太老了。我要一只能活很久的羊。":"Este es demasiado viejo. Quiero un cordero que viva mucho tiempo.","这是箱子。你要的羊就在里面。":"Esta es la caja. El cordero que quieres está dentro.","这正是我想要的！":"¡Es justo como lo quería!","瞧！它睡着了……":"¡Mira! Se quedó dormido…","八天后":"Ocho días después","小王子分享了旅程中的经历":"El principito le contó todo su viaje","啊！你的回忆真美。可我还没修好飞机。":"¡Ah! Tus recuerdos son muy bonitos. Pero todavía no he reparado mi avión.","今天夜里，就满一年了。我的星星，会正好在我去年落下的地方上空……":"Esta noche se cumple un año. Mi estrella estará justo encima del lugar donde caí el año pasado…","你是要回到你落下的地方去？":"¿Entonces vuelves al lugar donde caíste?","嗯……":"Mm…","让沙漠变美的，是它在什么地方藏着一口井……":"Lo que embellece al desierto es que esconde un pozo en algún lugar…","真正重要的东西，眼睛是看不见的。":"Lo esencial es invisible a los ojos.","哪天你太想念你的星球，我可以帮你。":"Si algún día añoras demasiado tu planeta, puedo ayudarte.","你会看见我的脚印在沙上是从哪儿开始的。你在那儿等我。今天夜里我会到。":"Verás dónde empiezan mis huellas en la arena. Espérame allí. Llegaré esta noche.","啊！你在这儿……":"¡Ah! Estás aquí…","我很高兴，你找到了飞机缺的东西。你可以回家了……":"Me alegra que hayas encontrado lo que le faltaba a tu avión. Ya puedes volver a casa…","你怎么知道？":"¿Cómo lo sabes?","我也是，今天，我要回家了……远得多……也难得多……":"Yo también vuelvo hoy a casa… Es mucho más lejos… y mucho más difícil…","小家伙，我还想听你笑……":"Hombrecito, quiero oírte reír otra vez…","夜里你看天空的时候，我就在其中一颗星星上笑。对你来说，就像所有的星星都在笑。":"Cuando mires al cielo por la noche, yo estaré riendo en una de las estrellas. Para ti será como si todas las estrellas rieran.","你知道……我的花……我要对她负责！她那么弱小，只有四根刺来保护自己……":"Sabes… mi flor… ¡soy responsable de ella! Y es tan débil, con solo cuatro espinas para defenderse…","好了……就这些……":"Bueno… eso es todo…","是你为你的玫瑰花费的时间，":"Es el tiempo que dedicaste a tu rosa","才使你的玫瑰变得这么重要。":"lo que hace que tu rosa sea tan importante.","——送给最爱的人":"— Para quien más quiero","完":"Fin","未能载入这一章，请检查网络后重新进入。":"No se pudo cargar este capítulo. Revisa tu conexión y vuelve a entrar.","重新进入":"Volver a entrar"},"de":{"小王子":"Der kleine Prinz","玫瑰花":"Die Blume","国王":"Der König","爱虚荣的人":"Der Eitle","酒鬼":"Der Säufer","酒馆门":"Die Wirtshaustür","商人":"Der Geschäftsmann","点灯人":"Der Laternenanzünder","地理学家":"Der Geograph","蛇":"Die Schlange","玫瑰们":"Die Rosen","狐狸":"Der Fuchs","小花":"Eine Blume","飞行员":"Der Pilot","小王子（自语）":"Der kleine Prinz (für sich)","小王子的旅程":"Die Reise des kleinen Prinzen","故事，从一朵玫瑰开始":"Alles beginnt mit einer Blume","离开玫瑰以后，他去拜访别的星球":"Nach dem Abschied von seiner Blume besuchte er andere Planeten","还看不清……":"Noch nicht zu erkennen …","这颗星球还在建造中，暂时还不能降落。":"Dieser Planet ist noch im Bau. Landen ist noch nicht möglich.","还在建造中":"Noch im Bau","前去拜访":"Besuchen","已经拜访过":"Besucht","再去看看":"Wieder besuchen","设置":"Einstellungen","B-612 · 家园":"B-612 · Zuhause","玫瑰在这里":"Wo seine Blume lebt","有一颗只比房子大一点的星球，上面住着一位小王子。":"Auf einem Planeten, kaum größer als ein Haus, lebt ein kleiner Prinz.","走进家园":"B-612 betreten","他从这里出发":"Hier begann seine Reise","他给玫瑰浇过水、看过日落，然后跟着候鸟走了。":"Er goss seine Blume, sah den Sonnenuntergang und zog mit den Zugvögeln fort.","这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。":"Das ist B-612, das Zuhause des kleinen Prinzen: kaum größer als ein Haus, mit drei Vulkanen und einer Blume.","国王的星球":"Der Planet des Königs","325 号小行星":"Asteroid 325","这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。":"Hier lebt ein König. In seinen Augen ist jeder ein Untertan, und sogar die Sterne gehorchen ihm.","国王要任命他做大使，他还是走了。":"Der König wollte ihn zum Botschafter ernennen. Er ging trotzdem.","这里住着一位国王。他的星球上没有别人。":"Hier lebt ein König. Außer ihm ist niemand auf seinem Planeten.","326 号小行星":"Asteroid 326","这里住着一个爱虚荣的人，他只听得见赞美。":"Hier lebt ein Eitler. Er hört nichts als Lob.","他拍了两次手。那个人只想听掌声，他就走了。":"Er klatschte zweimal in die Hände. Der Mann wollte nur Beifall, also zog er weiter.","这里住着一个爱虚荣的人。他等着有人来崇拜他。":"Hier lebt ein Eitler und wartet darauf, dass ihn jemand bewundert.","327 号小行星":"Asteroid 327","这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。":"Hier lebt ein Säufer. Er trinkt, um zu vergessen, wofür er sich schämt: das Trinken.","他问了几句，没有得到答案，坐了一会儿就走了。":"Er stellte ein paar Fragen, fand keine Antworten, saß eine Weile da und ging.","这里住着一个酒鬼。他喝酒，是为了忘记一件事。":"Hier lebt ein Säufer. Er trinkt, um etwas zu vergessen.","328 号小行星":"Asteroid 328","这里住着一个商人，他一刻不停地数星星，说它们都归他所有。":"Hier lebt ein Geschäftsmann, der ohne Pause die Sterne zählt und behauptet, sie gehörten alle ihm.","他说完自己的花和火山，商人找不到话回答。":"Er erzählte von seiner Blume und seinen Vulkanen, und dem Geschäftsmann fiel keine Antwort ein.","这里住着一个商人。他在数星星，数了很多年。":"Hier lebt ein Geschäftsmann. Er zählt seit vielen Jahren Sterne.","329 号小行星":"Asteroid 329","这是最小的一颗星球，只放得下一盏路灯和一个点灯人。":"Dies ist der kleinste Planet von allen, gerade groß genug für eine Straßenlaterne und einen Laternenanzünder.","他想留下来陪点灯人，可这颗星球太小，容不下两个人。":"Er wollte beim Laternenanzünder bleiben, doch der Planet war zu klein für zwei.","这里是最小的一颗星球。只有一盏路灯，和一个一分钟也歇不了的人。":"Der kleinste Planet von allen: eine Straßenlaterne und ein Mann, der keine Minute Ruhe hat.","330 号小行星":"Asteroid 330","这里住着一位地理学家，他从不出门，却记下了别处的山和海。":"Hier lebt ein Geograph. Er geht nie aus dem Haus und schreibt doch die Berge und Meere ferner Orte auf.","他第一次担心起留在家里的花，然后去了地理学家说的地球。":"Zum ersten Mal sorgte er sich um die Blume, die er zu Hause gelassen hatte. Dann reiste er zur Erde, wie der Geograph es ihm geraten hatte.","这里住着一位地理学家。他写一本很大的书，却从没离开过书桌。":"Hier lebt ein Geograph. Er schreibt ein riesiges Buch und hat doch nie seinen Schreibtisch verlassen.","地球":"Die Erde","第七颗星球":"Der siebente Planet","地理学家说，去地球看看吧，它的名声很好。":"„Besuch doch die Erde“, sagte der Geograph. „Sie hat einen guten Ruf.“","前往地球":"Zur Erde reisen","他在这里":"Hier ist er","这里是地球。一片沙漠，头顶有一颗格外亮的星。":"Das ist die Erde: eine Wüste und darüber ein besonders heller Stern.","有一颗只比房子大一点的星球，":"Auf einem Planeten, kaum größer als ein Haus,","上面住着一位小王子。":"lebt ein kleiner Prinz.","这里住着一位国王。":"Hier lebt ein König.","在他眼里，人人都是臣民，连星星也听他的。":"In seinen Augen ist jeder ein Untertan, und sogar die Sterne gehorchen ihm.","这里住着一个爱虚荣的人，":"Hier lebt ein Eitler.","他只听得见赞美。":"Er hört nichts als Lob.","这里住着一个酒鬼。":"Hier lebt ein Säufer.","他喝酒，是为了忘掉让他难为情的事——喝酒。":"Er trinkt, um zu vergessen, wofür er sich schämt: das Trinken.","这里住着一个商人，他一刻不停地数星星，":"Hier lebt ein Geschäftsmann, der ohne Pause die Sterne zählt","说它们都归他所有。":"und behauptet, sie gehörten alle ihm.","这是最小的一颗星球，":"Dies ist der kleinste Planet von allen,","只放得下一盏路灯和一个点灯人。":"gerade groß genug für eine Straßenlaterne und einen Laternenanzünder.","这里住着一位地理学家，":"Hier lebt ein Geograph.","他从不出门，却记下了别处的山和海。":"Er geht nie aus dem Haus und schreibt doch die Berge und Meere ferner Orte auf.","地理学家说，去地球看看吧，":"„Besuch doch die Erde“, sagte der Geograph.","它的名声很好。":"„Sie hat einen guten Ruf.“","第一章":"Erstes Kapitel","第二章":"Zweites Kapitel","第三章":"Drittes Kapitel","第四章":"Viertes Kapitel","第五章":"Fünftes Kapitel","第六章":"Sechstes Kapitel","第七章":"Siebtes Kapitel","第八章":"Achtes Kapitel","第{0}章":"Kapitel {0}","在 B-612 的最后一天":"Der letzte Tag auf B-612","一座空荡荡的宫殿，住着一位国王":"Ein leerer Palast, bewohnt von einem König","爱虚荣者的星球":"Der Planet des Eitlen","一颗从没有人经过的星球，住着一个爱虚荣的人":"Ein Planet, an dem nie jemand vorbeikommt, bewohnt von einem Eitlen","酒鬼的星球":"Der Planet des Säufers","一个用喝酒来忘记一切的人":"Ein Mann, der trinkt, um alles zu vergessen","商人的星球":"Der Planet des Geschäftsmanns","一个忙得连头也不抬的商人":"Ein Geschäftsmann, der vor Eile nicht aufsieht","点灯人的星球":"Der Planet des Laternenanzünders","一颗一分钟就转一圈的星球，住着一个点灯人":"Ein Planet, der sich jede Minute einmal dreht, bewohnt von einem Laternenanzünder","地理学家的星球":"Der Planet des Geographen","一位记下了山和海，却从没去看过的地理学家":"Ein Geograph, der Berge und Meere verzeichnet, die er nie gesehen hat","一颗很大的星球，可是一个人也看不见":"Ein sehr großer Planet, und weit und breit kein Mensch","四处走走，熟悉一下这颗星球":"Herumgehen und den Planeten kennenlernen","去看看玫瑰花":"Nach der Blume sehen","照料玫瑰花":"Die Blume pflegen","去工具棚拿水壶":"Die Gießkanne aus dem Schuppen holen","去泉眼打水":"An der Quelle Wasser schöpfen","最后一次给她浇水":"Die Blume ein letztes Mal gießen","看最后一场日落":"Den letzten Sonnenuntergang sehen","去星球边上的椅子坐下":"Auf dem Stuhl am Planetenrand Platz nehmen","去见国王":"Den König aufsuchen","去看舞台上的人":"Den Mann auf der Bühne ansehen","去酒馆里坐坐":"Eine Weile in der Schenke sitzen","拜访数星星的商人":"Den Mann besuchen, der Sterne zählt","？？？":"???","在星空里找到 B-612":"B-612 am Sternenhimmel finden","去灯下看看":"Zur Laterne gehen","去地图馆看看":"Die Kartenbibliothek erkunden","去问问这是哪里":"Fragen, wo man hier ist","和岩石上的蛇说说话":"Mit der Schlange auf dem Felsen sprechen","去玫瑰园看看":"Den Rosengarten besuchen","去苹果树下找狐狸":"Den Fuchs unter dem Apfelbaum finden","踏上回家的路":"Den Heimweg antreten","去叫醒飞行员":"Den Piloten wecken","回到落下来的地方":"Dorthin zurück, wo du gefallen bist","沿着石路走到门洞":"Dem Steinweg bis zum Torbogen folgen","{0}　完成":"{0} – abgeschlossen","下一件事":"Als Nächstes","可以启程了":"Bereit zum Aufbruch","按住":"Gedrückt halten","启程":"Aufbrechen","按一下查看本章目标":"Drücken für die Kapitelziele","再按一下收起":"Erneut drücken zum Schließen","隐藏":"Verborgen","{0} · {1} 米":"{0} · {1} m","{0} 米":"{0} m","前方是旅途":"Vor dir liegt die Reise","先去看一次日落，再启程":"Vor dem Aufbruch einen Sonnenuntergang sehen","要启程吗？":"Jetzt aufbrechen?","Q   启程":"Q   Aufbrechen","Q 启程，跟着候鸟去下一颗星球        Esc 再待一会儿":"Q Mit den Zugvögeln zum nächsten Planeten        Esc Noch ein wenig bleiben","今日已日落，改日再来":"Für heute ist die Sonne unter. Ein andermal.","正在准备画面 · {0}%":"Szene wird vorbereitet · {0}%","{0}　　　{0}":"{0}   {0}","移动":"Bewegen","鼠标":"Maus","点击画面后移动鼠标，看看四周":"Ins Bild klicken, dann mit der Maus umsehen","快跑":"Rennen","拿起水壶":"Gießkanne nehmen","放回水壶":"Zurückstellen","放下水壶":"Kanne abstellen","打水":"Wasser schöpfen","浇水":"Blume gießen","给玫瑰浇水":"Blume gießen","壶是空的":"Die Kanne ist leer.","拿起玻璃罩":"Glassturz abheben","放回去":"Wieder aufsetzen","放回玻璃罩":"Wieder aufsetzen","先把水壶放在花旁":"Erst die Kanne neben die Blume stellen","先把水壶放下":"Erst die Kanne abstellen","坐下":"Hinsetzen","起身":"Aufstehen","交谈":"Sprechen","交互":"Benutzen","推开宫门":"Tor aufstoßen","推开门":"Tür aufstoßen","推开木门":"Tür aufstoßen","拉开门":"Tür aufziehen","拉开木门":"Tür aufziehen","合上门":"Tür schließen","合上木门":"Tür schließen","开门":"Tür öffnen","关门":"Tür schließen","鼓掌":"Klatschen","看星星":"Sterne ansehen","离开":"Zurücktreten","滚轮":"Mausrad","放大":"Zoomen","眺望":"Hinausblicken","喊":"Rufen","上车":"Einsteigen","转辘轳":"Winde drehen","叫醒他":"Ihn wecken","和蛇说话":"Ansprechen","水壶":"Gießkanne","泉眼":"Quelle","椅子":"Stuhl","玫瑰园":"Rosengarten","火车":"Zug","苹果树":"Apfelbaum","车站":"Bahnhof","门洞":"Torbogen","暂停":"Pause","继续":"Weiter","回到旅程地图":"Zur Reisekarte","返回地图":"Zur Karte","返回游戏":"Zurück zum Spiel","全屏":"Vollbild","清除进度":"Spielstand löschen","确定清除？":"Wirklich löschen?","语言":"Sprache","操作":"Steuerung","方向键也可以":"Auch mit Pfeiltasten","视角":"Umsehen","点击画面后转动鼠标":"Ins Bild klicken, dann Maus bewegen","空格":"Leertaste","跳":"Springen","互动":"Interagieren","靠近有星标的东西":"Zu Dingen mit Stern gehen","按住，走完一圈":"Halten, bis der Ring voll ist","本章目标":"Kapitelziele","按一下展开，再按收起":"Drücken zum Öffnen und Schließen","鼠标灵敏度":"Mausempfindlichkeit","声音":"Ton","主音量":"Gesamtlautstärke","音乐":"Musik","音效":"Geräusche","我想……该是吃早饭的时候了。":"Mir scheint … es ist Zeit für das Frühstück.","能不能劳您费心，也想着我一点……":"Hätten Sie wohl die Güte, auch ein wenig an mich zu denken …","再见了。":"Leb wohl.","……":"…","我想去别的星球看看。":"Ich möchte andere Planeten sehen.","（轻轻咳了一声）":"(Sie hustet leise)","我以前真傻。请你原谅我。":"Ich bin so töricht gewesen. Bitte verzeih mir.","是啊，我是爱你的。":"Aber ja, ich liebe dich.","你一点都没察觉，是我的错。":"Du hast es nie gemerkt, und das war meine Schuld.","不过，你也和我一样傻。":"Aber du warst genauso töricht wie ich.","别管这个罩子了。我不要它了。":"Lass den Glassturz. Ich will ihn nicht mehr.","可是风……":"Aber der Wind …","夜里的凉风会对我有好处的。我是一朵花。":"Die kühle Nachtluft wird mir guttun. Ich bin eine Blume.","可是那些野兽……":"Aber die wilden Tiere …","我什么都不怕。我有我的爪子。":"Ich fürchte mich vor nichts. Ich habe meine Krallen.","（亮出她的四根刺）":"(Sie zeigt ihre vier Dornen)","别这样磨磨蹭蹭的，真烦人。":"Zögere doch nicht so. Das ist lästig.","你已经决定要走了。走吧。":"Du hast beschlossen fortzugehen. So geh.","人在很难过的时候，就喜欢看日落……":"Wenn man sehr traurig ist, liebt man Sonnenuntergänge …","我很喜欢看日落。":"Ich sehe so gern Sonnenuntergänge.","啊，来了一位臣民！":"Ah! Da kommt ein Untertan!","您从没见过我，怎么知道我是臣民？":"Sie haben mich nie gesehen. Woher wissen Sie, dass ich ein Untertan bin?","来到我面前的，都是我的臣民。这里的一切都听我的，连星星也是。":"Wer vor mich tritt, ist mein Untertan. Alles hier gehorcht mir – sogar die Sterne.","那您能让太阳现在落下吗？我想看一次日落。":"Können Sie dann die Sonne jetzt untergehen lassen? Ich möchte so gern einmal zusehen.","当然。不过命令要下在合适的时候。今晚七点四十，我会命令它落下。":"Gewiss. Doch ein Befehl muss zur rechten Zeit erteilt werden. Heute Abend um sieben Uhr vierzig befehle ich ihr unterzugehen.","……七点四十，它本来就要落下的。":"… Um sieben Uhr vierzig geht sie sowieso unter.","在我家，想看日落，把椅子挪几步就行了。":"Zu Hause rücke ich für einen Sonnenuntergang einfach meinen Stuhl ein Stück.","我该走了。":"Ich muss jetzt gehen.","等等！我任命你做我的大使！":"Halt! Hiermit ernenne ich dich zu meinem Botschafter!","啊！啊！来了一位崇拜者！":"Ah! Ah! Besuch von einem Bewunderer!","你拍拍手吧。":"Na los, klatsch in die Hände.","你真的非常崇拜我吗？":"Bewunderst du mich wirklich sehr?","“崇拜”是什么意思？":"Was heißt „bewundern“?","崇拜，就是承认我是这颗星球上\\n最英俊、穿得最好、最有钱、最聪明的人。":"Bewundern heißt anerkennen, dass ich der schönste,\\nbestgekleidete, reichste und klügste Mann dieses Planeten bin.","可这颗星球上只有你一个人！":"Aber du bist doch ganz allein auf diesem Planeten!","行行好，还是崇拜我吧！":"Tu mir den Gefallen. Bewundere mich trotzdem!","我崇拜你。可这对你有什么要紧呢？":"Ich bewundere dich. Aber was hast du eigentlich davon?","你在这儿做什么？":"Was machst du da?","我在喝酒。":"Ich trinke.","你为什么喝酒？":"Warum trinkst du?","为了忘记。":"Um zu vergessen.","忘记什么？":"Was denn vergessen?","忘记我的羞愧。":"Um zu vergessen, dass ich mich schäme.","羞愧什么？":"Wofür schämst du dich?","羞愧我喝酒！":"Dafür, dass ich trinke!","二十六加五，三十一。呼！\\n一共是五亿零一百六十二万二千七百三十一。":"Sechsundzwanzig und fünf, einunddreißig. Uff!\\nDas sind zusammen fünfhunderteine Million sechshundertzweiundzwanzigtausendsiebenhunderteinunddreißig.","五亿什么？":"Fünfhundert Millionen was?","星星。":"Sterne.","你拿五亿颗星星做什么？":"Und was machst du mit fünfhundert Millionen Sternen?","什么也不做。我拥有它们。":"Nichts. Ich besitze sie.","那你拿它们怎么办呢？":"Und was tust du dann mit ihnen?","我把星星的数目写在一张小纸上，\\n再把这张纸锁进抽屉。":"Ich schreibe die Zahl meiner Sterne auf einen kleinen Zettel\\nund schließe den Zettel in eine Schublade ein.","就这些？":"Und das ist alles?","这就够了！":"Das genügt!","我有一朵花，我每天给她浇水。\\n我有三座火山，我每星期疏通一遍。":"Ich besitze eine Blume, die ich jeden Tag gieße.\\nIch besitze drei Vulkane, die ich jede Woche ausfege.","我拥有它们，对我的火山有用，对我的花也有用。\\n可你对星星没有用……":"Meinen Vulkanen nützt es, dass ich sie besitze, und meiner Blume auch.\\nAber du nützt den Sternen nichts …","你好。你为什么刚把路灯熄了？":"Guten Tag. Warum hast du eben deine Laterne gelöscht?","这是规定。早上好。":"Das ist die Weisung. Guten Morgen.","可你为什么又把它点亮了？":"Aber warum hast du sie gleich wieder angezündet?","没什么要明白的。规定就是规定。晚上好。":"Da gibt es nichts zu verstehen. Weisung ist Weisung. Guten Abend.","从前还说得过去：早上熄灯，晚上点灯。":"Früher ergab das Sinn: morgens löschen, abends anzünden.","可星球一年比一年转得快，规定却没改！":"Aber der Planet dreht sich von Jahr zu Jahr schneller, und die Weisung ist geblieben!","现在它一分钟转一圈，我连一秒钟也歇不了。":"Jetzt dreht er sich einmal in der Minute, und ich habe keine Sekunde Ruhe.","只有他不让我觉得可笑。\\n也许是因为，他操心的是自己以外的事。":"Er ist der Einzige, der mir nicht lächerlich vorkommt.\\nVielleicht, weil er sich um etwas anderes kümmert als um sich selbst.","瞧！来了一位探险家！":"Sieh an! Ein Forscher!","你从远方来！给我讲讲你的星球！":"Du kommst von weit her! Erzähl mir von deinem Planeten!","我那儿很小。我有三座火山。":"Bei mir ist alles ganz klein. Ich habe drei Vulkane.","我还有一朵花。":"Ich habe auch eine Blume.","我们不记录花。":"Blumen verzeichnen wir nicht.","为什么！花是最美的！":"Warum nicht? Blumen sind doch das Schönste!","因为花是转瞬即逝的。":"Weil Blumen vergänglich sind.","“转瞬即逝”是什么意思？":"Was bedeutet „vergänglich“?","意思是“很快就有消失的危险”。":"Das heißt: „in Gefahr, bald zu verschwinden“.","我的花是转瞬即逝的，她只有四根刺来保护自己！\\n而我把她独自留在了家里！":"Meine Blume ist vergänglich, und sie hat nur vier Dornen, um sich zu schützen!\\nUnd ich habe sie ganz allein zu Hause gelassen!","我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！":"Meine Blume ist vergänglich, und sie hat nur vier Dornen, um sich zu schützen! Und ich habe sie ganz allein zu Hause gelassen!","我落在哪颗星球上了？":"Auf welchen Planeten bin ich gefallen?","地球上，在非洲。":"Auf die Erde. Nach Afrika.","看，我的星球。它就在我们头顶上……可它多远啊！":"Sieh, mein Planet. Er steht genau über uns … Aber wie weit weg er ist!","它真美。你来这儿做什么？":"Er ist schön. Was führt dich hierher?","我和一朵花闹了点别扭。":"Ich hatte ein wenig Ärger mit einer Blume.","人在哪儿？在沙漠里有点孤独……":"Wo sind die Menschen? Man ist ein bisschen einsam in der Wüste …","在人群里也一样孤独。":"Man ist auch bei den Menschen einsam.","我碰到谁，就把他送回他来的那片土地。":"Wen ich berühre, den gebe ich der Erde zurück, aus der er kam.","你这么弱小，落在这花岗岩的地球上，我可怜你。哪天你太想念你的星球，我可以帮你。":"Du bist so schwach auf dieser Erde aus Granit. Du tust mir leid. Wenn du dich eines Tages zu sehr nach deinem Planeten sehnst, kann ich dir helfen.","人在哪儿？":"Wo sind die Menschen?","人？风吹着他们到处走。他们没有根，这让他们很难办。":"Die Menschen? Der Wind treibt sie umher. Sie haben keine Wurzeln, das macht ihnen das Leben schwer.","你好！做我的朋友吧，我很孤独。":"Hallo! Sei mein Freund, ich bin ganz allein.","你好……我很孤独……":"Hallo … ich bin ganz allein …","我很孤独……":"Ich bin ganz allein …","你们是谁？":"Wer seid ihr?","我们是玫瑰。":"Wir sind Rosen.","我还以为我有一朵独一无二的花，\\n原来只是一朵普通的玫瑰。":"Ich glaubte, ich hätte eine Blume, die einzig ist in der Welt.\\nUnd dabei besitze ich nur eine gewöhnliche Rose.","来和我玩吧。我很难过……":"Komm und spiel mit mir. Ich bin so traurig …","我不能和你玩。我没有被驯养。":"Ich kann nicht mit dir spielen. Ich bin nicht gezähmt.","“驯养”是什么意思？":"Was bedeutet „zähmen“?","就是“建立联系”。对我来说，你还只是一个小男孩，和十万个小男孩一模一样。":"Es bedeutet „sich vertraut machen“. Für mich bist du noch nichts als ein kleiner Junge, genau wie hunderttausend andere kleine Jungen.","可如果你驯养了我，你对我就是世上唯一的。":"Aber wenn du mich zähmst, wirst du für mich einzig sein in der Welt.","我开始明白了。有一朵花……我想她驯养了我……":"Ich fange an zu verstehen. Es gibt eine Blume … ich glaube, sie hat mich gezähmt …","再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。":"Geh und sieh dir die Rosen noch einmal an. Du wirst begreifen, dass deine einzig ist in der Welt.","你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。":"Ihr seid schön, aber ihr seid leer. Sie allein ist wichtiger als ihr alle, denn sie ist es, die ich gegossen habe. Denn sie ist meine Rose.","这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。":"Hier ist mein Geheimnis, es ist ganz einfach: Man sieht nur mit dem Herzen gut. Das Wesentliche ist für die Augen unsichtbar.","是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。":"Die Zeit, die du mit deiner Rose verbracht hast, macht deine Rose so wichtig.","你要永远为你驯养的东西负责。你要对你的玫瑰负责……":"Du bist zeitlebens für das verantwortlich, was du dir vertraut gemacht hast. Du bist für deine Rose verantwortlich …","我要对我的玫瑰负责……":"Ich bin für meine Rose verantwortlich …","第八章　地球":"Achtes Kapitel · Die Erde","沙丘":"Die Dünen","这是他在地球上的最后一段路。他的玫瑰，在头顶那颗星星上。":"Das letzte Stück seines Weges auf der Erde. Seine Rose ist auf dem Stern dort oben.","请你……给我画一只羊！":"Bitte … zeichne mir ein Schaf!","这只太老了。我要一只能活很久的羊。":"Das hier ist zu alt. Ich will ein Schaf, das lange lebt.","这是箱子。你要的羊就在里面。":"Das ist die Kiste. Das Schaf, das du willst, ist da drin.","这正是我想要的！":"Genau so habe ich es mir gewünscht!","瞧！它睡着了……":"Sieh mal! Es ist eingeschlafen …","八天后":"Acht Tage später","小王子分享了旅程中的经历":"Der kleine Prinz erzählte ihm von seiner Reise","啊！你的回忆真美。可我还没修好飞机。":"Ach! Deine Erinnerungen sind wunderschön. Aber mein Flugzeug ist noch nicht repariert.","今天夜里，就满一年了。我的星星，会正好在我去年落下的地方上空……":"Heute Nacht ist es ein Jahr her. Mein Stern wird genau über der Stelle stehen, wo ich letztes Jahr gefallen bin …","你是要回到你落下的地方去？":"Du willst also dorthin zurück, wo du gefallen bist?","嗯……":"Hm …","让沙漠变美的，是它在什么地方藏着一口井……":"Was die Wüste schön macht, ist, dass sie irgendwo einen Brunnen verbirgt …","真正重要的东西，眼睛是看不见的。":"Das Wesentliche ist für die Augen unsichtbar.","哪天你太想念你的星球，我可以帮你。":"Wenn du dich eines Tages zu sehr nach deinem Planeten sehnst, kann ich dir helfen.","你会看见我的脚印在沙上是从哪儿开始的。你在那儿等我。今天夜里我会到。":"Du wirst sehen, wo meine Spuren im Sand beginnen. Warte dort auf mich. Heute Nacht komme ich.","啊！你在这儿……":"Ah! Da bist du ja …","我很高兴，你找到了飞机缺的东西。你可以回家了……":"Ich bin froh, dass du gefunden hast, was deinem Flugzeug fehlte. Jetzt kannst du nach Hause …","你怎么知道？":"Woher weißt du das?","我也是，今天，我要回家了……远得多……也难得多……":"Auch ich gehe heute nach Hause … Es ist viel weiter … und viel schwerer …","小家伙，我还想听你笑……":"Kleines Männchen, ich möchte dich wieder lachen hören …","夜里你看天空的时候，我就在其中一颗星星上笑。对你来说，就像所有的星星都在笑。":"Wenn du nachts in den Himmel schaust, lache ich auf einem der Sterne. Dann ist es für dich, als ob alle Sterne lachten.","你知道……我的花……我要对她负责！她那么弱小，只有四根刺来保护自己……":"Weißt du … meine Blume … ich bin für sie verantwortlich! Und sie ist so schwach, sie hat nur vier Dornen, um sich zu schützen …","好了……就这些……":"So … das ist alles …","是你为你的玫瑰花费的时间，":"Die Zeit, die du mit deiner Rose verbracht hast,","才使你的玫瑰变得这么重要。":"macht deine Rose so wichtig.","——送给最爱的人":"– Für den Menschen, den ich am meisten liebe","完":"Ende","未能载入这一章，请检查网络后重新进入。":"Dieses Kapitel konnte nicht geladen werden. Bitte Verbindung prüfen und erneut betreten.","重新进入":"Erneut betreten"},"pt":{"小王子":"O Pequeno Príncipe","玫瑰花":"A Flor","国王":"O Rei","爱虚荣的人":"O Vaidoso","酒鬼":"O Bêbado","酒馆门":"A porta da taverna","商人":"O Homem de Negócios","点灯人":"O Acendedor de Lampiões","地理学家":"O Geógrafo","蛇":"A Serpente","玫瑰们":"As Rosas","狐狸":"A Raposa","小花":"Uma Flor","飞行员":"O Aviador","小王子（自语）":"O Pequeno Príncipe (para si mesmo)","小王子的旅程":"A jornada entre as estrelas","故事，从一朵玫瑰开始":"Tudo começa com uma flor","离开玫瑰以后，他去拜访别的星球":"Depois de deixar a flor, ele foi visitar outros planetas","还看不清……":"Longe demais para ver…","这颗星球还在建造中，暂时还不能降落。":"Este planeta ainda está em construção. Não é possível pousar por enquanto.","还在建造中":"Em construção","前去拜访":"Fazer uma visita","已经拜访过":"Visitado","再去看看":"Visitar de novo","设置":"Configurações","B-612 · 家园":"B-612 · Lar","玫瑰在这里":"Onde vive a sua flor","有一颗只比房子大一点的星球，上面住着一位小王子。":"Num planeta pouco maior que uma casa, vive um pequeno príncipe.","走进家园":"Ir ao B-612","他从这里出发":"Onde a viagem começou","他给玫瑰浇过水、看过日落，然后跟着候鸟走了。":"Ele regou a sua flor, viu o pôr do sol e partiu com as aves migratórias.","这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。":"Este é o B-612, o lar do pequeno príncipe: pouco maior que uma casa, com três vulcões e uma flor.","国王的星球":"O planeta do rei","325 号小行星":"Asteroide 325","这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。":"Aqui vive um rei. Para ele, todos são súditos, e até as estrelas lhe obedecem.","国王要任命他做大使，他还是走了。":"O rei quis nomeá-lo embaixador. Mesmo assim, ele partiu.","这里住着一位国王。他的星球上没有别人。":"Aqui vive um rei. Não há mais ninguém no seu planeta.","326 号小行星":"Asteroide 326","这里住着一个爱虚荣的人，他只听得见赞美。":"Aqui vive um vaidoso. Ele só ouve elogios.","他拍了两次手。那个人只想听掌声，他就走了。":"Ele bateu palmas duas vezes. O homem só queria aplausos, então ele seguiu viagem.","这里住着一个爱虚荣的人。他等着有人来崇拜他。":"Aqui vive um vaidoso, à espera de alguém que o admire.","327 号小行星":"Asteroide 327","这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。":"Aqui vive um bêbado. Ele bebe para esquecer aquilo que o envergonha: beber.","他问了几句，没有得到答案，坐了一会儿就走了。":"Ele fez algumas perguntas, não encontrou respostas, ficou sentado um pouco e foi embora.","这里住着一个酒鬼。他喝酒，是为了忘记一件事。":"Aqui vive um bêbado. Ele bebe para esquecer uma coisa.","328 号小行星":"Asteroide 328","这里住着一个商人，他一刻不停地数星星，说它们都归他所有。":"Aqui vive um homem de negócios que conta as estrelas sem parar e diz que todas são dele.","他说完自己的花和火山，商人找不到话回答。":"Ele falou da sua flor e dos seus vulcões, e o homem de negócios não soube o que responder.","这里住着一个商人。他在数星星，数了很多年。":"Aqui vive um homem de negócios. Há anos e anos ele conta estrelas.","329 号小行星":"Asteroide 329","这是最小的一颗星球，只放得下一盏路灯和一个点灯人。":"Este é o menor planeta de todos, com lugar apenas para um lampião e um acendedor de lampiões.","他想留下来陪点灯人，可这颗星球太小，容不下两个人。":"Ele quis ficar com o acendedor de lampiões, mas o planeta era pequeno demais para dois.","这里是最小的一颗星球。只有一盏路灯，和一个一分钟也歇不了的人。":"O menor planeta de todos: um lampião e um homem que não tem um minuto de descanso.","330 号小行星":"Asteroide 330","这里住着一位地理学家，他从不出门，却记下了别处的山和海。":"Aqui vive um geógrafo. Ele nunca sai de casa, mas registra as montanhas e os mares de lugares distantes.","他第一次担心起留在家里的花，然后去了地理学家说的地球。":"Pela primeira vez, ficou preocupado com a flor que deixara em casa. Depois seguiu para a Terra, como o geógrafo lhe aconselhara.","这里住着一位地理学家。他写一本很大的书，却从没离开过书桌。":"Aqui vive um geógrafo. Ele escreve um livro enorme, mas nunca saiu de trás da mesa.","地球":"Terra","第七颗星球":"O sétimo planeta","地理学家说，去地球看看吧，它的名声很好。":"“Vá ver a Terra”, disse o geógrafo. “Ela tem boa reputação.”","前往地球":"Ir para a Terra","他在这里":"Ele está aqui","这里是地球。一片沙漠，头顶有一颗格外亮的星。":"Esta é a Terra: um deserto e, lá no alto, uma estrela especialmente brilhante.","有一颗只比房子大一点的星球，":"Num planeta pouco maior que uma casa,","上面住着一位小王子。":"vive um pequeno príncipe.","这里住着一位国王。":"Aqui vive um rei.","在他眼里，人人都是臣民，连星星也听他的。":"Para ele, todos são súditos, e até as estrelas lhe obedecem.","这里住着一个爱虚荣的人，":"Aqui vive um vaidoso.","他只听得见赞美。":"Ele só ouve elogios.","这里住着一个酒鬼。":"Aqui vive um bêbado.","他喝酒，是为了忘掉让他难为情的事——喝酒。":"Ele bebe para esquecer aquilo que o envergonha: beber.","这里住着一个商人，他一刻不停地数星星，":"Aqui vive um homem de negócios que conta as estrelas sem parar","说它们都归他所有。":"e diz que todas são dele.","这是最小的一颗星球，":"Este é o menor planeta de todos,","只放得下一盏路灯和一个点灯人。":"com lugar apenas para um lampião e um acendedor de lampiões.","这里住着一位地理学家，":"Aqui vive um geógrafo.","他从不出门，却记下了别处的山和海。":"Ele nunca sai de casa, mas registra as montanhas e os mares de lugares distantes.","地理学家说，去地球看看吧，":"“Vá ver a Terra”, disse o geógrafo.","它的名声很好。":"“Ela tem boa reputação.”","第一章":"Capítulo Um","第二章":"Capítulo Dois","第三章":"Capítulo Três","第四章":"Capítulo Quatro","第五章":"Capítulo Cinco","第六章":"Capítulo Seis","第七章":"Capítulo Sete","第八章":"Capítulo Oito","第{0}章":"Capítulo {0}","在 B-612 的最后一天":"O último dia no B-612","一座空荡荡的宫殿，住着一位国王":"Um palácio vazio, onde vive um rei","爱虚荣者的星球":"O planeta do vaidoso","一颗从没有人经过的星球，住着一个爱虚荣的人":"Um planeta por onde ninguém passa, onde vive um vaidoso","酒鬼的星球":"O planeta do bêbado","一个用喝酒来忘记一切的人":"Um homem que bebe para esquecer tudo","商人的星球":"O planeta do homem de negócios","一个忙得连头也不抬的商人":"Um homem de negócios tão ocupado que nem levanta a cabeça","点灯人的星球":"O planeta do acendedor de lampiões","一颗一分钟就转一圈的星球，住着一个点灯人":"Um planeta que dá uma volta por minuto, onde vive um acendedor de lampiões","地理学家的星球":"O planeta do geógrafo","一位记下了山和海，却从没去看过的地理学家":"Um geógrafo que registra montanhas e mares que nunca viu","一颗很大的星球，可是一个人也看不见":"Um planeta muito grande, e nem uma alma à vista","四处走走，熟悉一下这颗星球":"Dê uma volta e conheça o seu planeta","去看看玫瑰花":"Vá ver a flor","照料玫瑰花":"Cuide da flor","去工具棚拿水壶":"Pegue o regador no galpão","去泉眼打水":"Encha-o na fonte","最后一次给她浇水":"Regue-a pela última vez","看最后一场日落":"Veja o último pôr do sol","去星球边上的椅子坐下":"Sente-se na cadeira à beira do planeta","去见国王":"Vá ver o rei","去看舞台上的人":"Vá ver o homem no palco","去酒馆里坐坐":"Sente-se um pouco na taverna","拜访数星星的商人":"Visite o homem que conta as estrelas","？？？":"???","在星空里找到 B-612":"Encontre o B-612 entre as estrelas","去灯下看看":"Vá ver o lampião","去地图馆看看":"Explore a biblioteca de mapas","去问问这是哪里":"Descubra onde você está","和岩石上的蛇说说话":"Fale com a serpente na pedra","去玫瑰园看看":"Visite o jardim de rosas","去苹果树下找狐狸":"Procure a raposa debaixo da macieira","踏上回家的路":"Tome o caminho de volta para casa","去叫醒飞行员":"Acorde o aviador","回到落下来的地方":"Volte ao lugar onde você caiu","沿着石路走到门洞":"Siga o caminho de pedra até o portal","{0}　完成":"{0} — Concluído","下一件事":"A seguir","可以启程了":"Pronto para partir","按住":"Segure","启程":"Partir","按一下查看本章目标":"Pressione para ver os objetivos do capítulo","再按一下收起":"Pressione de novo para fechar","隐藏":"Segredo","{0} · {1} 米":"{0} · {1} m","{0} 米":"{0} m","前方是旅途":"A viagem espera lá adiante","先去看一次日落，再启程":"Veja um pôr do sol antes de partir","要启程吗？":"Partir agora?","Q   启程":"Q   Partir","Q 启程，跟着候鸟去下一颗星球        Esc 再待一会儿":"Q Partir com as aves para o próximo planeta        Esc Ficar mais um pouco","今日已日落，改日再来":"O sol já se pôs hoje. Volte outro dia.","正在准备画面 · {0}%":"Preparando a cena · {0}%","{0}　　　{0}":"{0}   {0}","移动":"Mover","鼠标":"Mouse","点击画面后移动鼠标，看看四周":"Clique na tela e olhe em volta com o mouse","快跑":"Correr","拿起水壶":"Pegar o regador","放回水壶":"Devolver o regador","放下水壶":"Pôr o regador no chão","打水":"Tirar água","浇水":"Regar a flor","给玫瑰浇水":"Regar a flor","壶是空的":"O regador está vazio.","拿起玻璃罩":"Erguer a redoma","放回去":"Pôr de volta","放回玻璃罩":"Pôr de volta","先把水壶放在花旁":"Deixar o regador junto à flor primeiro","先把水壶放下":"Pôr o regador no chão primeiro","坐下":"Sentar","起身":"Levantar","交谈":"Conversar","交互":"Interagir","推开宫门":"Empurrar as portas do palácio","推开门":"Empurrar a porta","推开木门":"Empurrar a porta","拉开门":"Puxar a porta","拉开木门":"Puxar a porta","合上门":"Fechar a porta","合上木门":"Fechar a porta","开门":"Abrir a porta","关门":"Fechar a porta","鼓掌":"Aplaudir","看星星":"Olhar as estrelas","离开":"Sair","滚轮":"Roda do mouse","放大":"Ampliar","眺望":"Olhar ao longe","喊":"Gritar","上车":"Embarcar no trem","转辘轳":"Girar a roldana","叫醒他":"Acordá-lo","和蛇说话":"Falar com a serpente","水壶":"Regador","泉眼":"Fonte","椅子":"Cadeira","玫瑰园":"Jardim de rosas","火车":"Trem","苹果树":"Macieira","车站":"Estação","门洞":"Portal","暂停":"Em pausa","继续":"Continuar","回到旅程地图":"Voltar ao mapa","返回地图":"Voltar ao mapa","返回游戏":"Voltar ao jogo","全屏":"Tela cheia","清除进度":"Apagar progresso","确定清除？":"Apagar tudo?","语言":"Idioma","操作":"Controles","方向键也可以":"Ou use as setas","视角":"Olhar","点击画面后转动鼠标":"Clique na tela e mova o mouse","空格":"Espaço","跳":"Pular","互动":"Interagir","靠近有星标的东西":"Chegue perto do que tem uma estrela","按住，走完一圈":"Segure até completar o anel","本章目标":"Objetivos do capítulo","按一下展开，再按收起":"Pressione para abrir e de novo para fechar","鼠标灵敏度":"Sensibilidade do mouse","声音":"Som","主音量":"Volume geral","音乐":"Música","音效":"Efeitos sonoros","我想……该是吃早饭的时候了。":"Creio… que já é hora do desjejum.","能不能劳您费心，也想着我一点……":"Teria a bondade de pensar um pouco em mim também…","再见了。":"Adeus.","……":"…","我想去别的星球看看。":"Quero ir conhecer outros planetas.","（轻轻咳了一声）":"(Ela tosse de leve)","我以前真傻。请你原谅我。":"Eu fui uma tola. Peço que me perdoe.","是啊，我是爱你的。":"Mas é claro que eu te amo.","你一点都没察觉，是我的错。":"Você nunca percebeu, e a culpa foi minha.","不过，你也和我一样傻。":"Mas você foi tão tolo quanto eu.","别管这个罩子了。我不要它了。":"Deixe a redoma de lado. Não a quero mais.","可是风……":"Mas o vento…","夜里的凉风会对我有好处的。我是一朵花。":"O ar fresco da noite vai me fazer bem. Eu sou uma flor.","可是那些野兽……":"Mas as feras…","我什么都不怕。我有我的爪子。":"Não tenho medo de nada. Eu tenho as minhas garras.","（亮出她的四根刺）":"(Ela mostra os seus quatro espinhos)","别这样磨磨蹭蹭的，真烦人。":"Não se demore assim. É exasperante.","你已经决定要走了。走吧。":"Você já decidiu partir. Então vá.","人在很难过的时候，就喜欢看日落……":"Quando a gente está muito triste, gosta de ver o pôr do sol…","我很喜欢看日落。":"Eu gosto muito do pôr do sol.","啊，来了一位臣民！":"Ah! Eis um súdito!","您从没见过我，怎么知道我是臣民？":"Nunca me viu antes. Como sabe que eu sou um súdito?","来到我面前的，都是我的臣民。这里的一切都听我的，连星星也是。":"Todos os que vêm à minha presença são meus súditos. Tudo aqui me obedece — até as estrelas.","那您能让太阳现在落下吗？我想看一次日落。":"Então pode fazer o sol se pôr agora? Eu queria tanto ver um pôr do sol.","当然。不过命令要下在合适的时候。今晚七点四十，我会命令它落下。":"Certamente. Mas uma ordem deve ser dada na hora certa. Esta noite, às sete e quarenta, ordenarei que ele se ponha.","……七点四十，它本来就要落下的。":"…Às sete e quarenta, ele ia se pôr de qualquer modo.","在我家，想看日落，把椅子挪几步就行了。":"Lá em casa, quando quero ver o pôr do sol, basta arrastar a cadeira alguns passos.","我该走了。":"Preciso partir.","等等！我任命你做我的大使！":"Espere! Eu o nomeio meu embaixador!","啊！啊！来了一位崇拜者！":"Ah! Ah! Lá vem um admirador!","你拍拍手吧。":"Vamos, bata palmas.","你真的非常崇拜我吗？":"Você me admira muito, de verdade?","“崇拜”是什么意思？":"O que quer dizer “admirar”?","崇拜，就是承认我是这颗星球上\\n最英俊、穿得最好、最有钱、最聪明的人。":"Admirar é reconhecer que eu sou o homem mais bonito,\\nmais bem-vestido, mais rico e mais inteligente deste planeta.","可这颗星球上只有你一个人！":"Mas você está sozinho neste planeta!","行行好，还是崇拜我吧！":"Faça-me essa gentileza. Admire-me mesmo assim!","我崇拜你。可这对你有什么要紧呢？":"Eu admiro você. Mas que diferença isso faz para você?","你在这儿做什么？":"O que você está fazendo aqui?","我在喝酒。":"Estou bebendo.","你为什么喝酒？":"Por que você bebe?","为了忘记。":"Para esquecer.","忘记什么？":"Esquecer o quê?","忘记我的羞愧。":"Esquecer que tenho vergonha.","羞愧什么？":"Vergonha de quê?","羞愧我喝酒！":"Vergonha de beber!","二十六加五，三十一。呼！\\n一共是五亿零一百六十二万二千七百三十一。":"Vinte e seis mais cinco, trinta e um. Ufa!\\nIsso dá quinhentos e um milhões, seiscentos e vinte e dois mil, setecentos e trinta e um.","五亿什么？":"Quinhentos milhões de quê?","星星。":"De estrelas.","你拿五亿颗星星做什么？":"E o que você faz com quinhentos milhões de estrelas?","什么也不做。我拥有它们。":"Nada. Eu as possuo.","那你拿它们怎么办呢？":"Então o que você faz com elas?","我把星星的数目写在一张小纸上，\\n再把这张纸锁进抽屉。":"Anoto num pedacinho de papel quantas estrelas eu tenho,\\ne depois tranco esse papel numa gaveta.","就这些？":"E é só isso?","这就够了！":"Já é o bastante!","我有一朵花，我每天给她浇水。\\n我有三座火山，我每星期疏通一遍。":"Eu possuo uma flor e a rego todos os dias.\\nPossuo três vulcões e os limpo toda semana.","我拥有它们，对我的火山有用，对我的花也有用。\\n可你对星星没有用……":"Para os meus vulcões e para a minha flor, é útil que eu os possua.\\nMas você não serve de nada para as estrelas…","你好。你为什么刚把路灯熄了？":"Olá. Por que você acabou de apagar o lampião?","这是规定。早上好。":"É o regulamento. Bom dia.","可你为什么又把它点亮了？":"Mas por que você acabou de acendê-lo de novo?","没什么要明白的。规定就是规定。晚上好。":"Não há nada para entender. Regulamento é regulamento. Boa noite.","从前还说得过去：早上熄灯，晚上点灯。":"Antes até fazia sentido: apagar de manhã, acender à noite.","可星球一年比一年转得快，规定却没改！":"Mas a cada ano o planeta gira mais depressa, e o regulamento não mudou!","现在它一分钟转一圈，我连一秒钟也歇不了。":"Agora ele dá uma volta por minuto, e eu não tenho um segundo de descanso.","只有他不让我觉得可笑。\\n也许是因为，他操心的是自己以外的事。":"Ele é o único que não me parece ridículo.\\nTalvez porque cuida de alguma coisa além de si mesmo.","瞧！来了一位探险家！":"Ora, vejam! Um explorador!","你从远方来！给我讲讲你的星球！":"Você vem de longe! Fale-me do seu planeta!","我那儿很小。我有三座火山。":"Lá onde eu moro é tudo muito pequeno. Tenho três vulcões.","我还有一朵花。":"Tenho também uma flor.","我们不记录花。":"Nós não registramos flores.","为什么！花是最美的！":"Por que não? As flores são o que há de mais bonito!","因为花是转瞬即逝的。":"Porque as flores são efêmeras.","“转瞬即逝”是什么意思？":"O que quer dizer “efêmera”?","意思是“很快就有消失的危险”。":"Quer dizer “ameaçada de desaparecer em breve”.","我的花是转瞬即逝的，她只有四根刺来保护自己！\\n而我把她独自留在了家里！":"A minha flor é efêmera, e para se proteger só tem quatro espinhos!\\nE eu a deixei sozinha em casa!","我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！":"A minha flor é efêmera, e para se proteger só tem quatro espinhos! E eu a deixei sozinha em casa!","我落在哪颗星球上了？":"Em que planeta eu caí?","地球上，在非洲。":"Na Terra. Na África.","看，我的星球。它就在我们头顶上……可它多远啊！":"Veja, o meu planeta. Está bem em cima de nós… Mas como está longe!","它真美。你来这儿做什么？":"Ele é lindo. O que você veio fazer aqui?","我和一朵花闹了点别扭。":"Tive um desentendimento com uma flor.","人在哪儿？在沙漠里有点孤独……":"Onde estão as pessoas? O deserto é um pouco solitário…","在人群里也一样孤独。":"Entre as pessoas também há solidão.","我碰到谁，就把他送回他来的那片土地。":"Quem eu toco, eu devolvo à terra de onde veio.","你这么弱小，落在这花岗岩的地球上，我可怜你。哪天你太想念你的星球，我可以帮你。":"Você é tão frágil, nesta Terra de granito. Tenho pena de você. Um dia, se você sentir saudade demais do seu planeta, eu posso ajudar você.","人在哪儿？":"Onde estão as pessoas?","人？风吹着他们到处走。他们没有根，这让他们很难办。":"As pessoas? O vento as carrega por aí. Elas não têm raízes, e isso torna a vida delas muito difícil.","你好！做我的朋友吧，我很孤独。":"Olá! Seja meu amigo. Estou sozinho.","你好……我很孤独……":"Olá… Estou sozinho…","我很孤独……":"Estou sozinho…","你们是谁？":"Quem são vocês?","我们是玫瑰。":"Somos rosas.","我还以为我有一朵独一无二的花，\\n原来只是一朵普通的玫瑰。":"Eu achava que tinha uma flor única no mundo.\\nE tudo o que eu tinha era uma rosa comum.","来和我玩吧。我很难过……":"Venha brincar comigo. Estou tão triste…","我不能和你玩。我没有被驯养。":"Não posso brincar com você. Ninguém me cativou ainda.","“驯养”是什么意思？":"O que quer dizer “cativar”?","就是“建立联系”。对我来说，你还只是一个小男孩，和十万个小男孩一模一样。":"Quer dizer “criar laços”. Para mim, você ainda é só um menino, igualzinho a cem mil outros meninos.","可如果你驯养了我，你对我就是世上唯一的。":"Mas, se você me cativar, será para mim único no mundo.","我开始明白了。有一朵花……我想她驯养了我……":"Começo a entender. Há uma flor… acho que ela me cativou…","再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。":"Vá ver as rosas outra vez. Você vai entender que a sua é única no mundo.","你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。":"Vocês são bonitas, mas são vazias. Só ela vale mais do que todas vocês, porque foi ela que eu reguei. Porque ela é a minha rosa.","这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。":"Eis o meu segredo. É muito simples: só se vê bem com o coração. O essencial é invisível para os olhos.","是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。":"É o tempo que você dedicou à sua rosa que faz a sua rosa tão importante.","你要永远为你驯养的东西负责。你要对你的玫瑰负责……":"Você se torna eternamente responsável por aquilo que cativa. Você é responsável pela sua rosa…","我要对我的玫瑰负责……":"Eu sou responsável pela minha rosa…","第八章　地球":"Capítulo Oito · Terra","沙丘":"As dunas","这是他在地球上的最后一段路。他的玫瑰，在头顶那颗星星上。":"O último trecho do seu caminho na Terra. A sua rosa está na estrela lá no alto.","请你……给我画一只羊！":"Por favor… desenhe-me um carneiro!","这只太老了。我要一只能活很久的羊。":"Este é velho demais. Quero um carneiro que viva bastante tempo.","这是箱子。你要的羊就在里面。":"Isto é uma caixa. O carneiro que você quer está aí dentro.","这正是我想要的！":"Era bem assim que eu queria!","瞧！它睡着了……":"Olhe! Ele adormeceu…","八天后":"Oito dias depois","小王子分享了旅程中的经历":"O pequeno príncipe contou tudo sobre a sua viagem","啊！你的回忆真美。可我还没修好飞机。":"Ah! Que lindas lembranças. Mas eu ainda não consertei o meu avião.","今天夜里，就满一年了。我的星星，会正好在我去年落下的地方上空……":"Esta noite, vai fazer um ano. A minha estrela vai estar bem em cima do lugar onde eu caí no ano passado…","你是要回到你落下的地方去？":"Então você vai voltar ao lugar onde caiu?","嗯……":"Hum…","让沙漠变美的，是它在什么地方藏着一口井……":"O que torna belo o deserto é que ele esconde um poço em algum lugar…","真正重要的东西，眼睛是看不见的。":"O essencial é invisível para os olhos.","哪天你太想念你的星球，我可以帮你。":"Um dia, se você sentir saudade demais do seu planeta, eu posso ajudar você.","你会看见我的脚印在沙上是从哪儿开始的。你在那儿等我。今天夜里我会到。":"Você vai ver onde começam as minhas pegadas na areia. Espere por mim lá. Esta noite eu chego.","啊！你在这儿……":"Ah! Você está aqui…","我很高兴，你找到了飞机缺的东西。你可以回家了……":"Que bom que você encontrou o que faltava no seu avião. Agora você pode voltar para casa…","你怎么知道？":"Como você sabia?","我也是，今天，我要回家了……远得多……也难得多……":"Eu também vou voltar para casa hoje… É muito mais longe… e muito mais difícil…","小家伙，我还想听你笑……":"Meu pequeno, eu quero ouvir você rir de novo…","夜里你看天空的时候，我就在其中一颗星星上笑。对你来说，就像所有的星星都在笑。":"Quando você olhar o céu à noite, eu vou estar rindo numa das estrelas. Então, para você, será como se todas as estrelas rissem.","你知道……我的花……我要对她负责！她那么弱小，只有四根刺来保护自己……":"Sabe… a minha flor… eu sou responsável por ela! E ela é tão frágil, só com quatro espinhos para se proteger…","好了……就这些……":"Pronto… É só isso…","是你为你的玫瑰花费的时间，":"É o tempo que você dedicou à sua rosa","才使你的玫瑰变得这么重要。":"que faz a sua rosa tão importante.","——送给最爱的人":"— Para quem eu mais amo","完":"Fim","未能载入这一章，请检查网络后重新进入。":"Não foi possível carregar este capítulo. Verifique a conexão e entre de novo.","重新进入":"Entrar de novo"},"ja":{"小王子":"王子さま","玫瑰花":"花","国王":"王さま","爱虚荣的人":"うぬぼれ屋","酒鬼":"のんべえ","酒馆门":"酒場の扉","商人":"ビジネスマン","点灯人":"点灯夫","地理学家":"地理学者","蛇":"ヘビ","玫瑰们":"バラたち","狐狸":"キツネ","小花":"小さな花","飞行员":"飛行士","小王子（自语）":"王子さま（ひとりごと）","小王子的旅程":"王子さまの旅","故事，从一朵玫瑰开始":"物語は、一輪の花から","离开玫瑰以后，他去拜访别的星球":"花と別れて、王子さまはほかの星を訪ねた","还看不清……":"まだよく見えない……","这颗星球还在建造中，暂时还不能降落。":"この星はまだ準備中です。今は降りられません。","还在建造中":"準備中","前去拜访":"訪ねる","已经拜访过":"訪問済み","再去看看":"もう一度訪ねる","设置":"設定","B-612 · 家园":"B-612 · ふるさと","玫瑰在这里":"あの花が暮らす星","有一颗只比房子大一点的星球，上面住着一位小王子。":"家より少しだけ大きな星に、ひとりの王子さまが住んでいる。","走进家园":"B-612 に降りる","他从这里出发":"旅のはじまりの場所","他给玫瑰浇过水、看过日落，然后跟着候鸟走了。":"花に水をあげ、夕日を見て、王子さまは渡り鳥と旅立った。","这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。":"ここは王子さまのふるさと、B-612。家より少しだけ大きな星に、三つの火山と一輪の花がある。","国王的星球":"王さまの星","325 号小行星":"小惑星325","这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。":"ここには王さまが住んでいる。誰もが自分の家来で、星さえも命令に従うと思っている。","国王要任命他做大使，他还是走了。":"王さまは大使にすると言ったけれど、王子さまは旅立った。","这里住着一位国王。他的星球上没有别人。":"ここには王さまが住んでいる。この星には、ほかに誰もいない。","326 号小行星":"小惑星326","这里住着一个爱虚荣的人，他只听得见赞美。":"ここにはうぬぼれ屋が住んでいる。ほめ言葉しか耳に入らない。","他拍了两次手。那个人只想听掌声，他就走了。":"王子さまは二度手をたたいた。その人がほしいのは拍手だけ。王子さまは旅を続けた。","这里住着一个爱虚荣的人。他等着有人来崇拜他。":"ここにはうぬぼれ屋が住んでいる。誰かが自分をほめに来るのを待っている。","327 号小行星":"小惑星327","这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。":"ここにはのんべえが住んでいる。酒を飲む恥ずかしさを忘れるために、酒を飲んでいる。","他问了几句，没有得到答案，坐了一会儿就走了。":"少し話しても、答えは見つからなかった。王子さまはしばらく座り、それから旅立った。","这里住着一个酒鬼。他喝酒，是为了忘记一件事。":"ここにはのんべえが住んでいる。あることを忘れたくて、酒を飲んでいる。","328 号小行星":"小惑星328","这里住着一个商人，他一刻不停地数星星，说它们都归他所有。":"ここにはビジネスマンが住んでいる。休まず星を数え、全部自分のものだと言う。","他说完自己的花和火山，商人找不到话回答。":"王子さまが自分の花と火山の話をすると、ビジネスマンは何も言えなかった。","这里住着一个商人。他在数星星，数了很多年。":"ここにはビジネスマンが住んでいる。もう何年も、星を数え続けている。","329 号小行星":"小惑星329","这是最小的一颗星球，只放得下一盏路灯和一个点灯人。":"いちばん小さな星。街灯が一本と、点灯夫がひとり入るだけの広さしかない。","他想留下来陪点灯人，可这颗星球太小，容不下两个人。":"点灯夫といっしょにいたかった。でも、この星は小さすぎて、ふたりは住めなかった。","这里是最小的一颗星球。只有一盏路灯，和一个一分钟也歇不了的人。":"いちばん小さな星に、街灯が一本。一分も休めない人がひとりいる。","330 号小行星":"小惑星330","这里住着一位地理学家，他从不出门，却记下了别处的山和海。":"ここには地理学者が住んでいる。一歩も外に出ず、遠くの山や海を書き記している。","他第一次担心起留在家里的花，然后去了地理学家说的地球。":"王子さまは初めて、家に残した花が心配になった。それから、地理学者に教わった地球へ向かった。","这里住着一位地理学家。他写一本很大的书，却从没离开过书桌。":"ここには地理学者が住んでいる。大きな本を書いているが、机を離れたことはない。","地球":"地球","第七颗星球":"七番目の星","地理学家说，去地球看看吧，它的名声很好。":"「地球へ行ってみなさい。評判のいい星だ」と、地理学者は言った。","前往地球":"地球へ向かう","他在这里":"王子さまがいる場所","这里是地球。一片沙漠，头顶有一颗格外亮的星。":"ここは地球。一面の砂漠の上に、ひときわ明るい星がひとつ。","有一颗只比房子大一点的星球，":"家より少しだけ大きな星に、","上面住着一位小王子。":"ひとりの王子さまが住んでいる。","这里住着一位国王。":"ここには王さまが住んでいる。","在他眼里，人人都是臣民，连星星也听他的。":"誰もが自分の家来で、星さえも命令に従うと思っている。","这里住着一个爱虚荣的人，":"ここにはうぬぼれ屋が住んでいる。","他只听得见赞美。":"ほめ言葉しか耳に入らない。","这里住着一个酒鬼。":"ここにはのんべえが住んでいる。","他喝酒，是为了忘掉让他难为情的事——喝酒。":"酒を飲む恥ずかしさを忘れるために、酒を飲んでいる。","这里住着一个商人，他一刻不停地数星星，":"ここにはビジネスマンが住んでいる。休まず星を数え、","说它们都归他所有。":"全部自分のものだと言う。","这是最小的一颗星球，":"いちばん小さな星。","只放得下一盏路灯和一个点灯人。":"街灯が一本と、点灯夫がひとり入るだけの広さしかない。","这里住着一位地理学家，":"ここには地理学者が住んでいる。","他从不出门，却记下了别处的山和海。":"一歩も外に出ず、遠くの山や海を書き記している。","地理学家说，去地球看看吧，":"「地球へ行ってみなさい」と、地理学者は言った。","它的名声很好。":"「評判のいい星だ」","第一章":"第一章","第二章":"第二章","第三章":"第三章","第四章":"第四章","第五章":"第五章","第六章":"第六章","第七章":"第七章","第八章":"第八章","第{0}章":"第{0}章","在 B-612 的最后一天":"B-612 で過ごす最後の日","一座空荡荡的宫殿，住着一位国王":"がらんとした宮殿に、王さまがひとり","爱虚荣者的星球":"うぬぼれ屋の星","一颗从没有人经过的星球，住着一个爱虚荣的人":"誰も訪れたことのない星に、\\nひとりのうぬぼれ屋が住んでいる。","酒鬼的星球":"のんべえの星","一个用喝酒来忘记一切的人":"何もかも忘れたくて、酒を飲む人","商人的星球":"ビジネスマンの星","一个忙得连头也不抬的商人":"顔を上げる暇もないビジネスマン","点灯人的星球":"点灯夫の星","一颗一分钟就转一圈的星球，住着一个点灯人":"一分で一回転する星に、点灯夫が住んでいる","地理学家的星球":"地理学者の星","一位记下了山和海，却从没去看过的地理学家":"山や海を書き記しながら、見に行ったことのない地理学者","一颗很大的星球，可是一个人也看不见":"とても大きな星なのに、人の姿が見えない","四处走走，熟悉一下这颗星球":"歩いて、星の様子を見てみよう","去看看玫瑰花":"花の様子を見に行く","照料玫瑰花":"花の世話をする","去工具棚拿水壶":"道具小屋へじょうろを取りに行く","去泉眼打水":"泉で水をくむ","最后一次给她浇水":"最後にもう一度、水をあげる","看最后一场日落":"最後の夕日を見る","去星球边上的椅子坐下":"星の端にある椅子に座る","去见国王":"王さまに会いに行く","去看舞台上的人":"舞台の人に会いに行く","去酒馆里坐坐":"酒場でひと休みする","拜访数星星的商人":"星を数えるビジネスマンを訪ねる","？？？":"？？？","在星空里找到 B-612":"星空の中に B-612 を見つける","去灯下看看":"街灯の下へ行く","去地图馆看看":"地図の館を訪ねる","去问问这是哪里":"ここがどこなのか聞く","和岩石上的蛇说说话":"岩の上のヘビと話す","去玫瑰园看看":"バラ園を見に行く","去苹果树下找狐狸":"リンゴの木の下でキツネを探す","踏上回家的路":"ふるさとへの道を歩く","去叫醒飞行员":"飛行士を起こしに行く","回到落下来的地方":"降りてきた場所へ戻る","沿着石路走到门洞":"石の道をたどって門へ向かう","{0}　完成":"{0}　達成","下一件事":"次の目標","可以启程了":"旅立つ準備ができた","按住":"長押し","启程":"出発","按一下查看本章目标":"押すと、この章の目標を表示","再按一下收起":"もう一度押すと閉じる","隐藏":"隠し目標","{0} · {1} 米":"{0} · {1} m","{0} 米":"{0} m","前方是旅途":"ここから旅がはじまる","先去看一次日落，再启程":"夕日を見てから出発しよう","要启程吗？":"出発する？","Q   启程":"Q   出発","Q 启程，跟着候鸟去下一颗星球        Esc 再待一会儿":"Q 渡り鳥と次の星へ出発        Esc もう少しここにいる","今日已日落，改日再来":"今日の夕日は沈んだ。また今度来よう","正在准备画面 · {0}%":"読み込み中 · {0}%","{0}　　　{0}":"{0}　　　{0}","移动":"移動","鼠标":"マウス","点击画面后移动鼠标，看看四周":"画面をクリックして、マウスで周りを見渡す","快跑":"走る","拿起水壶":"じょうろを持つ","放回水壶":"じょうろを戻す","放下水壶":"じょうろを置く","打水":"水をくむ","浇水":"水をあげる","给玫瑰浇水":"花に水をあげる","壶是空的":"じょうろが空だ","拿起玻璃罩":"ガラスの覆いを持つ","放回去":"元に戻す","放回玻璃罩":"覆いを元に戻す","先把水壶放在花旁":"先に花のそばへじょうろを置こう","先把水壶放下":"先にじょうろを置こう","坐下":"座る","起身":"立つ","交谈":"話す","交互":"調べる","推开宫门":"宮殿の扉を押す","推开门":"扉を押す","推开木门":"木の扉を押す","拉开门":"扉を引く","拉开木门":"木の扉を引く","合上门":"扉を閉める","合上木门":"木の扉を閉める","开门":"扉を開ける","关门":"扉を閉める","鼓掌":"拍手する","看星星":"星を見る","离开":"離れる","滚轮":"ホイール","放大":"ズーム","眺望":"遠くを眺める","喊":"呼びかける","上车":"列車に乗る","转辘轳":"つるべを巻き上げる","叫醒他":"起こす","和蛇说话":"ヘビと話す","水壶":"じょうろ","泉眼":"泉","椅子":"椅子","玫瑰园":"バラ園","火车":"列車","苹果树":"リンゴの木","车站":"駅","门洞":"門","暂停":"一時停止","继续":"ゲームを続ける","回到旅程地图":"旅の地図に戻る","返回地图":"地図に戻る","返回游戏":"ゲームに戻る","全屏":"全画面表示","清除进度":"セーブデータを消去","确定清除？":"本当に消去しますか？","语言":"言語","操作":"操作方法","方向键也可以":"矢印キーでも移動","视角":"視点","点击画面后转动鼠标":"画面をクリックしてマウスを動かす","空格":"Space","跳":"ジャンプ","互动":"調べる","靠近有星标的东西":"星の印があるものに近づく","按住，走完一圈":"輪が完成するまで長押し","本章目标":"この章の目標","按一下展开，再按收起":"押すと開く、もう一度押すと閉じる","鼠标灵敏度":"マウス感度","声音":"サウンド","主音量":"全体の音量","音乐":"音楽","音效":"効果音","我想……该是吃早饭的时候了。":"そろそろ……朝ごはんの時間だと思うの。","能不能劳您费心，也想着我一点……":"わたしのことも、少しは気にかけてくださらない……？","再见了。":"さようなら。","……":"……","我想去别的星球看看。":"ほかの星も見てみたいんだ。","（轻轻咳了一声）":"（そっと咳をする）","我以前真傻。请你原谅我。":"わたし、ばかだったわ。許してね。","是啊，我是爱你的。":"そうよ。あなたが好きなの。","你一点都没察觉，是我的错。":"気づいてもらえなかったのは、わたしのせいね。","不过，你也和我一样傻。":"でも、あなたもわたしと同じくらい、ばかだったのよ。","别管这个罩子了。我不要它了。":"その覆いは置いておいて。もういらないわ。","可是风……":"でも、風が……","夜里的凉风会对我有好处的。我是一朵花。":"夜の涼しい風は、体にいいの。わたしは花だもの。","可是那些野兽……":"でも、獣が来たら……","我什么都不怕。我有我的爪子。":"何も怖くないわ。わたしには爪があるもの。","（亮出她的四根刺）":"（四本のとげを見せる）","别这样磨磨蹭蹭的，真烦人。":"そんなふうにぐずぐずしないで。じれったいわ。","你已经决定要走了。走吧。":"行くって決めたんでしょう。さあ、行って。","人在很难过的时候，就喜欢看日落……":"とても悲しいときは、夕日を見たくなるんだ……","我很喜欢看日落。":"ぼく、夕日を見るのが大好きなんだ。","啊，来了一位臣民！":"おお、家来がやって来た！","您从没见过我，怎么知道我是臣民？":"ぼくに会ったこともないのに、どうして家来だとわかるの？","来到我面前的，都是我的臣民。这里的一切都听我的，连星星也是。":"わたしの前に来る者は、みな家来だ。\\nここでは、星さえもわたしに従う。","那您能让太阳现在落下吗？我想看一次日落。":"じゃあ、今すぐ太陽を沈められる？\\nぼく、夕日が見たいんだ。","当然。不过命令要下在合适的时候。今晚七点四十，我会命令它落下。":"もちろんだ。だが命令には時がある。\\n今夜七時四十分に、沈むよう命じよう。","……七点四十，它本来就要落下的。":"……七時四十分なら、命令しなくても沈むのに。","在我家，想看日落，把椅子挪几步就行了。":"ぼくの家なら、椅子を少し動かすだけで夕日が見られるよ。","我该走了。":"もう行かなくちゃ。","等等！我任命你做我的大使！":"待ちなさい！ 君をわたしの大使に任命する！","啊！啊！来了一位崇拜者！":"おお！ わたしの崇拝者が来たぞ！","你拍拍手吧。":"さあ、手をたたいてごらん。","你真的非常崇拜我吗？":"君は本当に、わたしをそんなに崇拝しているのかい？","“崇拜”是什么意思？":"「崇拝」って、どういうこと？","崇拜，就是承认我是这颗星球上\\n最英俊、穿得最好、最有钱、最聪明的人。":"わたしがこの星でいちばん美しく、いちばんおしゃれで、\\nいちばん金持ちで、いちばん賢いと認めることさ。","可这颗星球上只有你一个人！":"でも、この星には君しかいないじゃない！","行行好，还是崇拜我吧！":"頼むよ。それでもわたしを崇拝しておくれ。","我崇拜你。可这对你有什么要紧呢？":"うん、崇拝するよ。でも、それが君にとって何になるの？","你在这儿做什么？":"ここで何をしているの？","我在喝酒。":"酒を飲んでいる。","你为什么喝酒？":"どうしてお酒を飲むの？","为了忘记。":"忘れるためだ。","忘记什么？":"何を忘れるの？","忘记我的羞愧。":"恥ずかしいのを忘れるためだ。","羞愧什么？":"何が恥ずかしいの？","羞愧我喝酒！":"酒を飲むのが恥ずかしいんだ！","二十六加五，三十一。呼！\\n一共是五亿零一百六十二万二千七百三十一。":"二十六たす五は三十一。ふう！\\n全部で五億百六十二万二千七百三十一だ。","五亿什么？":"五億って、何が？","星星。":"星だ。","你拿五亿颗星星做什么？":"五億もの星を、どうするの？","什么也不做。我拥有它们。":"何もしない。わたしのものなんだ。","那你拿它们怎么办呢？":"それで、その星をどうするの？","我把星星的数目写在一张小纸上，\\n再把这张纸锁进抽屉。":"小さな紙に星の数を書いて、\\n引き出しにしまって鍵をかけるのだ。","就这些？":"それだけ？","这就够了！":"それで十分だ！","我有一朵花，我每天给她浇水。\\n我有三座火山，我每星期疏通一遍。":"ぼくには花が一輪あって、毎日水をあげてる。\\n火山も三つあって、毎週掃除してるんだ。","我拥有它们，对我的火山有用，对我的花也有用。\\n可你对星星没有用……":"ぼくは、ぼくの花や火山の役に立っているんだ。\\nでも、君は星の役に立っていないね……","你好。你为什么刚把路灯熄了？":"こんにちは。どうして今、街灯を消したの？","这是规定。早上好。":"決まりだからさ。おはよう。","可你为什么又把它点亮了？":"でも、どうしてまたつけたの？","没什么要明白的。规定就是规定。晚上好。":"考えることなんてないよ。決まりは決まりさ。こんばんは。","从前还说得过去：早上熄灯，晚上点灯。":"昔はよかった。朝に消して、夜につければよかったんだ。","可星球一年比一年转得快，规定却没改！":"ところが星は年々速く回るのに、決まりは変わらない！","现在它一分钟转一圈，我连一秒钟也歇不了。":"今じゃ一分で一回転だ。一秒だって休めないよ。","只有他不让我觉得可笑。\\n也许是因为，他操心的是自己以外的事。":"この人だけは、おかしな人だと思わない。\\n自分以外のことを考えているからかもしれない。","瞧！来了一位探险家！":"おや！ 探検家が来たぞ！","你从远方来！给我讲讲你的星球！":"遠くから来たのだね！ 君の星のことを聞かせてくれ！","我那儿很小。我有三座火山。":"ぼくの星は、とても小さいよ。火山が三つあるんだ。","我还有一朵花。":"花も一輪あるよ。","我们不记录花。":"花は記録しない。","为什么！花是最美的！":"どうして！ 花はいちばんきれいなのに！","因为花是转瞬即逝的。":"花は、はかないものだからだ。","“转瞬即逝”是什么意思？":"「はかない」って、どういうこと？","意思是“很快就有消失的危险”。":"「すぐに消えてしまうおそれがある」という意味だ。","我的花是转瞬即逝的，她只有四根刺来保护自己！\\n而我把她独自留在了家里！":"ぼくの花は、はかないんだ。身を守るとげは四本だけ！\\nそれなのに、あの花をひとりぼっちで家に残してきたんだ！","我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！":"ぼくの花は、はかないんだ。身を守るとげは四本だけ！\\nそれなのに、あの花をひとりぼっちで家に残してきたんだ！","我落在哪颗星球上了？":"ぼく、どの星に降りてきたの？","地球上，在非洲。":"地球の、アフリカだよ。","看，我的星球。它就在我们头顶上……可它多远啊！":"見て、ぼくの星だ。頭の真上にある……\\nでも、なんて遠いんだろう！","它真美。你来这儿做什么？":"きれいな星だね。ここへ何をしに来たの？","我和一朵花闹了点别扭。":"花と、ちょっと気まずくなったんだ。","人在哪儿？在沙漠里有点孤独……":"人はどこにいるの？ 砂漠は少し寂しいね……","在人群里也一样孤独。":"人の中にいても、寂しいものだよ。","我碰到谁，就把他送回他来的那片土地。":"触れた相手を、生まれてきた土へ帰してあげるんだ。","你这么弱小，落在这花岗岩的地球上，我可怜你。哪天你太想念你的星球，我可以帮你。":"こんなにか弱い君が、硬い岩の地球に来るなんて、かわいそうに。\\nいつか自分の星が恋しくてたまらなくなったら、力になるよ。","人在哪儿？":"人はどこにいるの？","人？风吹着他们到处走。他们没有根，这让他们很难办。":"人？ 風に吹かれて、あちこちへ行くわ。\\n根がないから、大変なのね。","你好！做我的朋友吧，我很孤独。":"こんにちは！ぼくの友だちになって。ひとりぼっちなんだ。","你好……我很孤独……":"こんにちは……ひとりぼっちなんだ……","我很孤独……":"ひとりぼっちなんだ……","你们是谁？":"君たちは誰？","我们是玫瑰。":"わたしたちはバラよ。","我还以为我有一朵独一无二的花，\\n原来只是一朵普通的玫瑰。":"世界でたったひとつの花を持っていると思っていたのに、\\nただのバラだったんだ。","来和我玩吧。我很难过……":"いっしょに遊ぼうよ。ぼく、とても悲しいんだ……","我不能和你玩。我没有被驯养。":"君とは遊べないよ。まだ誰にもなついていないから。","“驯养”是什么意思？":"「なつく」って、どういうこと？","就是“建立联系”。对我来说，你还只是一个小男孩，和十万个小男孩一模一样。":"絆を結ぶことだよ。今の君は、ぼくにとって、\\nほかに十万人もいる男の子と変わらない。","可如果你驯养了我，你对我就是世上唯一的。":"でも、ぼくをなつかせたら、\\n君はぼくにとって、世界でたったひとりになる。","我开始明白了。有一朵花……我想她驯养了我……":"少しわかってきたよ。花が一輪あるんだ……\\nあの花が、ぼくをなつかせたのかもしれない……","再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。":"もう一度、あのバラたちを見ておいで。\\n君のバラが、世界でたったひとつだとわかるよ。","你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。":"君たちは美しい。でも、空っぽなんだ。\\nぼくには、あの一輪のほうが君たち全部より大切なんだ。\\nぼくが水をあげた花だから。ぼくのバラだから。","这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。":"秘密を教えるよ。とても簡単なことなんだ。\\n心で見なくちゃ、よく見えない。\\n本当に大切なものは、目には見えないんだ。","是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。":"君がバラのために時間をかけたから、\\nそのバラが、こんなにも大切になったんだよ。","你要永远为你驯养的东西负责。你要对你的玫瑰负责……":"なつかせた相手には、ずっと責任を持つんだ。\\n君には、君のバラへの責任がある……","我要对我的玫瑰负责……":"ぼくには、ぼくのバラへの責任がある……","第八章　地球":"第八章　地球","沙丘":"砂丘","这是他在地球上的最后一段路。他的玫瑰，在头顶那颗星星上。":"地球での旅も、あと少し。王子さまのバラは、頭上の星にいる。","请你……给我画一只羊！":"お願い……ヒツジの絵を描いて！","这只太老了。我要一只能活很久的羊。":"このヒツジは年を取りすぎてる。長生きするヒツジがほしいんだ。","这是箱子。你要的羊就在里面。":"これは箱だよ。君のほしいヒツジは、この中にいる。","这正是我想要的！":"そう、こんなのがほしかったんだ！","瞧！它睡着了……":"見て！ 眠ってる……","八天后":"八日後","小王子分享了旅程中的经历":"王子さまは、旅の思い出を語った。","啊！你的回忆真美。可我还没修好飞机。":"ああ、すてきな思い出だね。でも、飛行機はまだ直っていないんだ。","今天夜里，就满一年了。我的星星，会正好在我去年落下的地方上空……":"今夜で、ちょうど一年になるんだ。\\n去年ぼくが降りてきた場所の真上に、ぼくの星が来る……","你是要回到你落下的地方去？":"降りてきた場所に戻るつもりなのかい？","嗯……":"うん……","让沙漠变美的，是它在什么地方藏着一口井……":"砂漠が美しいのは、どこかに井戸を隠しているからなんだ……","真正重要的东西，眼睛是看不见的。":"本当に大切なものは、目には見えないんだ。","哪天你太想念你的星球，我可以帮你。":"いつか自分の星が恋しくてたまらなくなったら、力になるよ。","你会看见我的脚印在沙上是从哪儿开始的。你在那儿等我。今天夜里我会到。":"砂に足跡がつきはじめている場所があるよ。\\nそこで待っていて。今夜、ぼくも行くから。","啊！你在这儿……":"ああ、ここにいたんだ……","我很高兴，你找到了飞机缺的东西。你可以回家了……":"飛行機に足りなかったものが見つかって、よかったね。\\nこれで、家に帰れるね……","你怎么知道？":"どうしてわかるんだい？","我也是，今天，我要回家了……远得多……也难得多……":"ぼくも今日、家に帰るんだ……\\nずっと遠くて……ずっと難しいけれど……","小家伙，我还想听你笑……":"ねえ、君の笑い声を、また聞きたいよ……","夜里你看天空的时候，我就在其中一颗星星上笑。对你来说，就像所有的星星都在笑。":"夜、空を見上げたら、どれかひとつの星で、ぼくが笑ってる。\\n君には、星がみんな笑っているように思えるよ。","你知道……我的花……我要对她负责！她那么弱小，只有四根刺来保护自己……":"あのね……ぼくの花……ぼくには責任があるんだ！\\nあんなにか弱くて、身を守るとげは四本しかないんだよ……","好了……就这些……":"うん……これで、おしまい……","是你为你的玫瑰花费的时间，":"君がバラのために時間をかけたから、","才使你的玫瑰变得这么重要。":"そのバラが、こんなにも大切になったんだよ。","——送给最爱的人":"——いちばん大切なあなたへ","完":"おしまい","未能载入这一章，请检查网络后重新进入。":"この章を読み込めませんでした。通信状況を確認して、もう一度お試しください。","重新进入":"もう一度入る"},"ko":{"小王子":"어린 왕자","玫瑰花":"꽃","国王":"왕","爱虚荣的人":"허영쟁이","酒鬼":"술꾼","酒馆门":"선술집 문","商人":"사업가","点灯人":"가로등지기","地理学家":"지리학자","蛇":"뱀","玫瑰们":"장미들","狐狸":"여우","小花":"작은 꽃","飞行员":"비행사","小王子（自语）":"어린 왕자 (혼잣말)","小王子的旅程":"어린 왕자의 여행","故事，从一朵玫瑰开始":"이야기는 꽃 한 송이에서 시작돼요","离开玫瑰以后，他去拜访别的星球":"꽃을 떠난 뒤, 어린 왕자는 다른 별들을 찾아갔어요","还看不清……":"아직 잘 보이지 않아요…","这颗星球还在建造中，暂时还不能降落。":"이 별은 아직 만드는 중이에요. 지금은 내릴 수 없어요.","还在建造中":"만드는 중","前去拜访":"찾아가기","已经拜访过":"다녀온 곳","再去看看":"다시 가 보기","设置":"설정","B-612 · 家园":"B-612 · 고향","玫瑰在这里":"꽃이 사는 곳","有一颗只比房子大一点的星球，上面住着一位小王子。":"집 한 채보다 조금 큰 별에, 어린 왕자가 살고 있어요.","走进家园":"B-612에 내리기","他从这里出发":"여행이 시작된 곳","他给玫瑰浇过水、看过日落，然后跟着候鸟走了。":"꽃에 물을 주고 노을을 본 뒤, 철새를 따라 떠났어요.","这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。":"여기는 어린 왕자의 고향 B-612예요. 집 한 채보다 조금 크고, 화산 세 개와 꽃 한 송이가 있어요.","国王的星球":"왕의 별","325 号小行星":"소행성 325호","这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。":"여기에는 왕이 살아요. 왕의 눈에는 모두가 신하이고, 별들조차 왕의 말을 따라요.","国王要任命他做大使，他还是走了。":"왕은 그를 대사로 임명하려 했지만, 어린 왕자는 그래도 떠났어요.","这里住着一位国王。他的星球上没有别人。":"여기에는 왕이 살아요. 이 별에는 왕 말고 아무도 없어요.","326 号小行星":"소행성 326호","这里住着一个爱虚荣的人，他只听得见赞美。":"여기에는 허영쟁이가 살아요. 그의 귀에는 칭찬만 들려요.","他拍了两次手。那个人只想听掌声，他就走了。":"어린 왕자는 박수를 두 번 쳤어요. 그 사람이 바라는 건 박수뿐이어서, 어린 왕자는 길을 떠났어요.","这里住着一个爱虚荣的人。他等着有人来崇拜他。":"여기에는 허영쟁이가 살아요. 누군가 자기를 숭배하러 오기를 기다리고 있어요.","327 号小行星":"소행성 327호","这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。":"여기에는 술꾼이 살아요. 부끄러운 일을 잊으려고 술을 마셔요. 그 일이란 바로 술을 마시는 거예요.","他问了几句，没有得到答案，坐了一会儿就走了。":"몇 가지 물어봤지만 답을 얻지 못했고, 잠시 앉아 있다가 떠났어요.","这里住着一个酒鬼。他喝酒，是为了忘记一件事。":"여기에는 술꾼이 살아요. 무언가를 잊으려고 술을 마셔요.","328 号小行星":"소행성 328호","这里住着一个商人，他一刻不停地数星星，说它们都归他所有。":"여기에는 쉬지 않고 별을 세는 사업가가 살아요. 별이 전부 자기 것이라고 해요.","他说完自己的花和火山，商人找不到话回答。":"어린 왕자가 자기 꽃과 화산 이야기를 하자, 사업가는 아무 대답도 하지 못했어요.","这里住着一个商人。他在数星星，数了很多年。":"여기에는 사업가가 살아요. 몇 년째 별을 세고 있어요.","329 号小行星":"소행성 329호","这是最小的一颗星球，只放得下一盏路灯和一个点灯人。":"여기는 가장 작은 별이에요. 가로등 하나와 가로등지기 한 사람이 겨우 들어가요.","他想留下来陪点灯人，可这颗星球太小，容不下两个人。":"가로등지기 곁에 남고 싶었지만, 별이 너무 작아서 둘이 함께 있을 수 없었어요.","这里是最小的一颗星球。只有一盏路灯，和一个一分钟也歇不了的人。":"여기는 가장 작은 별이에요. 가로등 하나와, 일 분도 쉬지 못하는 사람 하나가 있어요.","330 号小行星":"소행성 330호","这里住着一位地理学家，他从不出门，却记下了别处的山和海。":"여기에는 지리학자가 살아요. 밖에 나가 본 적도 없으면서, 먼 곳의 산과 바다를 기록해요.","他第一次担心起留在家里的花，然后去了地理学家说的地球。":"어린 왕자는 처음으로 집에 두고 온 꽃이 걱정되었어요. 그리고 지리학자가 말한 지구로 향했어요.","这里住着一位地理学家。他写一本很大的书，却从没离开过书桌。":"여기에는 지리학자가 살아요. 아주 큰 책을 쓰지만, 책상을 떠나 본 적은 없어요.","地球":"지구","第七颗星球":"일곱 번째 별","地理学家说，去地球看看吧，它的名声很好。":"“지구에 가 보게. 평판이 좋은 별이라네.” 지리학자가 말했어요.","前往地球":"지구로 가기","他在这里":"어린 왕자가 있는 곳","这里是地球。一片沙漠，头顶有一颗格外亮的星。":"여기는 지구예요. 끝없는 사막, 그리고 머리 위에 유난히 밝은 별 하나.","有一颗只比房子大一点的星球，":"집 한 채보다 조금 큰 별에,","上面住着一位小王子。":"어린 왕자가 살고 있어요.","这里住着一位国王。":"여기에는 왕이 살아요.","在他眼里，人人都是臣民，连星星也听他的。":"왕의 눈에는 모두가 신하이고, 별들조차 왕의 말을 따라요.","这里住着一个爱虚荣的人，":"여기에는 허영쟁이가 살아요.","他只听得见赞美。":"그의 귀에는 칭찬만 들려요.","这里住着一个酒鬼。":"여기에는 술꾼이 살아요.","他喝酒，是为了忘掉让他难为情的事——喝酒。":"부끄러운 일을 잊으려고 술을 마셔요. 그 일이란 바로 술을 마시는 거예요.","这里住着一个商人，他一刻不停地数星星，":"여기에는 쉬지 않고 별을 세는 사업가가 살아요.","说它们都归他所有。":"별이 전부 자기 것이라고 해요.","这是最小的一颗星球，":"여기는 가장 작은 별이에요.","只放得下一盏路灯和一个点灯人。":"가로등 하나와 가로등지기 한 사람이 겨우 들어가요.","这里住着一位地理学家，":"여기에는 지리학자가 살아요.","他从不出门，却记下了别处的山和海。":"밖에 나가 본 적도 없으면서, 먼 곳의 산과 바다를 기록해요.","地理学家说，去地球看看吧，":"“지구에 가 보게.” 지리학자가 말했어요.","它的名声很好。":"“평판이 좋은 별이라네.”","第一章":"제1장","第二章":"제2장","第三章":"제3장","第四章":"제4장","第五章":"제5장","第六章":"제6장","第七章":"제7장","第八章":"제8장","第{0}章":"제{0}장","在 B-612 的最后一天":"B-612에서의 마지막 하루","一座空荡荡的宫殿，住着一位国王":"텅 빈 궁전에 사는 왕","爱虚荣者的星球":"허영쟁이의 별","一颗从没有人经过的星球，住着一个爱虚荣的人":"아무도 지나가지 않는 별에 사는 허영쟁이","酒鬼的星球":"술꾼의 별","一个用喝酒来忘记一切的人":"모든 걸 잊으려고 술을 마시는 사람","商人的星球":"사업가의 별","一个忙得连头也不抬的商人":"고개 들 틈도 없이 바쁜 사업가","点灯人的星球":"가로등지기의 별","一颗一分钟就转一圈的星球，住着一个点灯人":"일 분에 한 바퀴 도는 별에 사는 가로등지기","地理学家的星球":"지리학자의 별","一位记下了山和海，却从没去看过的地理学家":"산과 바다를 기록하지만, 가 본 적은 없는 지리학자","一颗很大的星球，可是一个人也看不见":"사람 하나 보이지 않는 아주 큰 별","四处走走，熟悉一下这颗星球":"이리저리 걸으며 별 둘러보기","去看看玫瑰花":"꽃 보러 가기","照料玫瑰花":"꽃 돌보기","去工具棚拿水壶":"헛간에서 물뿌리개 가져오기","去泉眼打水":"샘에서 물 받기","最后一次给她浇水":"마지막으로 꽃에 물 주기","看最后一场日落":"마지막 노을 보기","去星球边上的椅子坐下":"별 가장자리 의자에 앉기","去见国王":"왕을 만나러 가기","去看舞台上的人":"무대 위 사람을 보러 가기","去酒馆里坐坐":"술집에 잠깐 앉아 보기","拜访数星星的商人":"별을 세는 사업가 찾아가기","？？？":"???","在星空里找到 B-612":"밤하늘에서 B-612 찾기","去灯下看看":"가로등 아래로 가 보기","去地图馆看看":"지도 도서관 둘러보기","去问问这是哪里":"여기가 어디인지 물어보기","和岩石上的蛇说说话":"바위 위의 뱀과 이야기하기","去玫瑰园看看":"장미 정원에 가 보기","去苹果树下找狐狸":"사과나무 아래에서 여우 찾기","踏上回家的路":"집으로 가는 길에 오르기","去叫醒飞行员":"비행사 깨우러 가기","回到落下来的地方":"떨어졌던 곳으로 돌아가기","沿着石路走到门洞":"돌길을 따라 아치문까지 가기","{0}　完成":"{0}　완료","下一件事":"다음 할 일","可以启程了":"이제 떠날 수 있어요","按住":"길게 누르기","启程":"출발","按一下查看本章目标":"한 번 눌러 이 장의 목표 보기","再按一下收起":"다시 눌러 닫기","隐藏":"숨은 목표","{0} · {1} 米":"{0} · {1} m","{0} 米":"{0} m","前方是旅途":"이 앞은 여행길이에요","先去看一次日落，再启程":"먼저 노을을 한 번 보고 출발해요","要启程吗？":"출발할까요?","Q   启程":"Q   출발","Q 启程，跟着候鸟去下一颗星球        Esc 再待一会儿":"Q 철새를 따라 다음 별로 출발        Esc 조금 더 머물기","今日已日落，改日再来":"오늘 노을은 끝났어요. 다음에 다시 와요.","正在准备画面 · {0}%":"화면 준비 중 · {0}%","{0}　　　{0}":"{0}　　　{0}","移动":"이동","鼠标":"마우스","点击画面后移动鼠标，看看四周":"화면을 클릭하고 마우스로 둘러보기","快跑":"달리기","拿起水壶":"물뿌리개 들기","放回水壶":"물뿌리개 돌려놓기","放下水壶":"물뿌리개 내려놓기","打水":"물 받기","浇水":"물 주기","给玫瑰浇水":"꽃에 물 주기","壶是空的":"물뿌리개가 비었네.","拿起玻璃罩":"유리 덮개 들기","放回去":"제자리에 두기","放回玻璃罩":"유리 덮개 씌우기","先把水壶放在花旁":"먼저 꽃 옆에 물뿌리개를 내려놓아요","先把水壶放下":"먼저 물뿌리개를 내려놓아요","坐下":"앉기","起身":"일어서기","交谈":"말 걸기","交互":"살펴보기","推开宫门":"궁전 문 밀어 열기","推开门":"문 밀어 열기","推开木门":"나무 문 밀어 열기","拉开门":"문 당겨 열기","拉开木门":"나무 문 당겨 열기","合上门":"문 닫기","合上木门":"나무 문 닫기","开门":"문 열기","关门":"문 닫기","鼓掌":"박수 치기","看星星":"별 보기","离开":"그만 보기","滚轮":"휠","放大":"확대","眺望":"멀리 바라보기","喊":"외치기","上车":"기차 타기","转辘轳":"도르래 돌리기","叫醒他":"깨우기","和蛇说话":"뱀에게 말 걸기","水壶":"물뿌리개","泉眼":"샘","椅子":"의자","玫瑰园":"장미 정원","火车":"기차","苹果树":"사과나무","车站":"기차역","门洞":"아치문","暂停":"일시 정지","继续":"계속하기","回到旅程地图":"여행 지도로 돌아가기","返回地图":"지도로 돌아가기","返回游戏":"게임으로 돌아가기","全屏":"전체 화면","清除进度":"진행 기록 지우기","确定清除？":"진행 기록을 모두 지울까요?","语言":"언어","操作":"조작","方向键也可以":"방향키로도 이동","视角":"시점","点击画面后转动鼠标":"화면을 클릭한 뒤 마우스 움직이기","空格":"Space","跳":"점프","互动":"상호작용","靠近有星标的东西":"별 표시가 있는 것에 다가가기","按住，走完一圈":"고리가 다 찰 때까지 길게 누르기","本章目标":"이 장의 목표","按一下展开，再按收起":"누르면 열고, 다시 누르면 닫기","鼠标灵敏度":"마우스 감도","声音":"소리","主音量":"전체 음량","音乐":"음악","音效":"효과음","我想……该是吃早饭的时候了。":"아무래도… 아침 식사 시간인 것 같네요.","能不能劳您费心，也想着我一点……":"번거로우시겠지만, 저도 조금은 생각해 주시겠어요…","再见了。":"잘 있어.","……":"…","我想去别的星球看看。":"다른 별들을 보러 가고 싶어.","（轻轻咳了一声）":"(가볍게 기침한다)","我以前真傻。请你原谅我。":"난 정말 바보였어. 날 용서해 줘.","是啊，我是爱你的。":"그래, 난 널 사랑해.","你一点都没察觉，是我的错。":"네가 그걸 전혀 몰랐던 건 내 잘못이야.","不过，你也和我一样傻。":"하지만 너도 나만큼 바보였어.","别管这个罩子了。我不要它了。":"유리 덮개는 그냥 둬. 이젠 필요 없어.","可是风……":"하지만 바람이…","夜里的凉风会对我有好处的。我是一朵花。":"서늘한 밤바람은 내게 좋을 거야. 난 꽃이니까.","可是那些野兽……":"하지만 짐승들이…","我什么都不怕。我有我的爪子。":"난 아무것도 무섭지 않아. 내겐 발톱이 있잖아.","（亮出她的四根刺）":"(가시 네 개를 내보인다)","别这样磨磨蹭蹭的，真烦人。":"그렇게 꾸물대지 마. 정말 성가셔.","你已经决定要走了。走吧。":"떠나기로 마음먹었잖아. 어서 가.","人在很难过的时候，就喜欢看日落……":"몹시 슬플 때는 해 지는 모습이 보고 싶어져…","我很喜欢看日落。":"난 해 지는 모습이 정말 좋아.","啊，来了一位臣民！":"아, 신하가 하나 왔구나!","您从没见过我，怎么知道我是臣民？":"저를 한 번도 보신 적이 없는데, 제가 신하인 줄 어떻게 아세요?","来到我面前的，都是我的臣民。这里的一切都听我的，连星星也是。":"짐 앞에 오는 자는 모두 짐의 신하니라.\\n이곳의 모든 것이 짐을 따른다. 별들까지도.","那您能让太阳现在落下吗？我想看一次日落。":"그럼 지금 해가 지게 해 주실 수 있어요?\\n해 지는 모습을 꼭 보고 싶어요.","当然。不过命令要下在合适的时候。今晚七点四十，我会命令它落下。":"물론이다. 하지만 명령은 알맞은 때에 내려야 하는 법.\\n오늘 저녁 7시 40분에 해가 지도록 명령하겠노라.","……七点四十，它本来就要落下的。":"…7시 40분이면, 원래 해가 지는 시간인데.","在我家，想看日落，把椅子挪几步就行了。":"우리 집에서는 해 지는 모습이 보고 싶으면\\n의자를 몇 걸음 옮기기만 하면 돼요.","我该走了。":"이제 가 봐야겠어요.","等等！我任命你做我的大使！":"기다려라! 짐이 너를 대사로 임명하노라!","啊！啊！来了一位崇拜者！":"아! 아! 숭배자가 찾아왔군!","你拍拍手吧。":"자, 박수를 쳐 봐.","你真的非常崇拜我吗？":"넌 정말로 나를 그렇게 숭배하니?","“崇拜”是什么意思？":"“숭배한다”는 게 무슨 뜻이야?","崇拜，就是承认我是这颗星球上\\n最英俊、穿得最好、最有钱、最聪明的人。":"숭배란, 내가 이 별에서 제일 잘생기고 제일 멋쟁이에\\n제일 부자이고 제일 똑똑한 사람이라고 인정하는 거야.","可这颗星球上只有你一个人！":"하지만 이 별엔 너 혼자뿐이잖아!","行行好，还是崇拜我吧！":"제발 부탁이야. 그래도 나를 숭배해 줘!","我崇拜你。可这对你有什么要紧呢？":"널 숭배해. 그런데 그게 너한테 무슨 소용이 있어?","你在这儿做什么？":"여기서 뭐 해?","我在喝酒。":"술 마시고 있지.","你为什么喝酒？":"왜 술을 마셔?","为了忘记。":"잊으려고.","忘记什么？":"뭘 잊으려고?","忘记我的羞愧。":"부끄러운 걸 잊으려고.","羞愧什么？":"뭐가 부끄러운데?","羞愧我喝酒！":"술 마시는 게 부끄러워!","二十六加五，三十一。呼！\\n一共是五亿零一百六十二万二千七百三十一。":"스물여섯에 다섯을 더하면 서른하나. 휴!\\n다 합쳐서 오억 백육십이만 이천칠백삼십일이로군.","五亿什么？":"오억 개의 뭐?","星星。":"별이지.","你拿五亿颗星星做什么？":"별 오억 개로 뭘 하는데?","什么也不做。我拥有它们。":"아무것도 안 해. 그냥 가지고 있지.","那你拿它们怎么办呢？":"그럼 그 별들을 어떻게 하는데?","我把星星的数目写在一张小纸上，\\n再把这张纸锁进抽屉。":"작은 종이에 내 별의 숫자를 적어서,\\n그 종이를 서랍에 넣고 잠가 두지.","就这些？":"그게 다야?","这就够了！":"그거면 충분해!","我有一朵花，我每天给她浇水。\\n我有三座火山，我每星期疏通一遍。":"나한테는 꽃이 한 송이 있는데, 날마다 물을 줘.\\n화산도 세 개 있는데, 매주 깨끗이 청소해.","我拥有它们，对我的火山有用，对我的花也有用。\\n可你对星星没有用……":"내가 가지고 있으니까 내 화산에도 내 꽃에도 도움이 돼.\\n하지만 너는 별들한테 아무 도움이 안 되잖아…","你好。你为什么刚把路灯熄了？":"안녕. 왜 방금 가로등을 껐어?","这是规定。早上好。":"규칙이니까. 좋은 아침이야.","可你为什么又把它点亮了？":"그런데 왜 또 켰어?","没什么要明白的。规定就是规定。晚上好。":"이해할 건 없어. 규칙은 규칙이니까. 좋은 저녁이야.","从前还说得过去：早上熄灯，晚上点灯。":"예전엔 그래도 괜찮았지. 아침에 끄고, 저녁에 켜면 됐으니까.","可星球一年比一年转得快，规定却没改！":"그런데 별은 해마다 빨리 도는데, 규칙은 그대로야!","现在它一分钟转一圈，我连一秒钟也歇不了。":"이젠 일 분에 한 바퀴를 도니, 일 초도 쉴 수가 없어.","只有他不让我觉得可笑。\\n也许是因为，他操心的是自己以外的事。":"저 사람만은 우스워 보이지 않아.\\n아마 자기 자신이 아닌 다른 것을 돌보기 때문일 거야.","瞧！来了一位探险家！":"오! 탐험가가 왔군!","你从远方来！给我讲讲你的星球！":"자네는 먼 곳에서 왔군! 자네 별 이야기를 들려주게!","我那儿很小。我有三座火山。":"우리 별은 아주 작아. 화산이 세 개 있어.","我还有一朵花。":"꽃도 한 송이 있어.","我们不记录花。":"우리는 꽃은 기록하지 않네.","为什么！花是最美的！":"왜! 꽃이 제일 아름다운데!","因为花是转瞬即逝的。":"꽃은 덧없는 것이기 때문일세.","“转瞬即逝”是什么意思？":"“덧없다”는 게 무슨 뜻이야?","意思是“很快就有消失的危险”。":"“머지않아 사라질 위험이 있다”는 뜻이라네.","我的花是转瞬即逝的，她只有四根刺来保护自己！\\n而我把她独自留在了家里！":"내 꽃은 덧없는 거야. 자기를 지킬 가시는 네 개뿐이야!\\n그런데 난 그 꽃을 집에 혼자 두고 왔어!","我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！":"내 꽃은 덧없는 거야. 자기를 지킬 가시는 네 개뿐이야! 그런데 난 그 꽃을 집에 혼자 두고 왔어!","我落在哪颗星球上了？":"내가 떨어진 곳은 어느 별이야?","地球上，在非洲。":"지구야. 아프리카지.","看，我的星球。它就在我们头顶上……可它多远啊！":"봐, 내 별이야. 바로 우리 머리 위에 있어…\\n그런데 정말 멀구나!","它真美。你来这儿做什么？":"아름다운 별이군. 여긴 뭘 하러 왔지?","我和一朵花闹了点别扭。":"어떤 꽃이랑 사이가 좀 틀어졌어.","人在哪儿？在沙漠里有点孤独……":"사람들은 어디 있어? 사막은 좀 외롭구나…","在人群里也一样孤独。":"사람들 속에 있어도 외롭기는 마찬가지야.","我碰到谁，就把他送回他来的那片土地。":"내가 건드리는 자는 누구든, 그가 나온 땅으로 돌려보내지.","你这么弱小，落在这花岗岩的地球上，我可怜你。哪天你太想念你的星球，我可以帮你。":"이렇게 약한 네가 화강암 지구에 떨어지다니, 가엾구나.\\n언젠가 네 별이 너무 그리워지면, 내가 도와줄 수 있어.","人在哪儿？":"사람들은 어디 있어?","人？风吹着他们到处走。他们没有根，这让他们很难办。":"사람들? 바람에 이리저리 떠돌아다니지.\\n뿌리가 없어서, 아주 힘들게 살아.","你好！做我的朋友吧，我很孤独。":"안녕! 내 친구가 되어 줘. 난 외로워.","你好……我很孤独……":"안녕… 난 외로워…","我很孤独……":"난 외로워…","你们是谁？":"너희는 누구야?","我们是玫瑰。":"우리는 장미야.","我还以为我有一朵独一无二的花，\\n原来只是一朵普通的玫瑰。":"세상에 하나뿐인 꽃을 가졌다고 생각했는데,\\n그냥 흔한 장미 한 송이였구나.","来和我玩吧。我很难过……":"나랑 같이 놀자. 난 너무 슬퍼…","我不能和你玩。我没有被驯养。":"난 너랑 놀 수 없어. 길들여지지 않았거든.","“驯养”是什么意思？":"“길들인다”는 게 무슨 뜻이야?","就是“建立联系”。对我来说，你还只是一个小男孩，和十万个小男孩一模一样。":"그건 “관계를 맺는다”는 뜻이야. 지금 내게 넌\\n다른 십만 명의 소년과 다를 게 없는 소년일 뿐이야.","可如果你驯养了我，你对我就是世上唯一的。":"하지만 네가 나를 길들인다면,\\n넌 나에게 세상에 하나뿐인 존재가 될 거야.","我开始明白了。有一朵花……我想她驯养了我……":"이제 조금 알 것 같아. 꽃이 한 송이 있는데…\\n그 꽃이 나를 길들인 것 같아…","再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。":"가서 장미들을 다시 봐.\\n네 장미가 세상에 하나뿐이라는 걸 알게 될 거야.","你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。":"너희는 아름답지만, 텅 비어 있어.\\n그 꽃 한 송이가 너희 모두보다 더 소중해.\\n내가 물을 준 꽃이니까. 내 장미니까.","这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。":"내 비밀은 아주 간단해. 오직 마음으로 보아야 잘 보여.\\n가장 중요한 것은 눈에 보이지 않아.","是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。":"네가 네 장미에게 들인 시간이\\n네 장미를 그토록 소중하게 만든 거야.","你要永远为你驯养的东西负责。你要对你的玫瑰负责……":"넌 네가 길들인 것에 언제까지나 책임이 있어.\\n넌 네 장미에게 책임이 있어…","我要对我的玫瑰负责……":"난 내 장미에게 책임이 있어…","第八章　地球":"제8장 · 지구","沙丘":"모래 언덕","这是他在地球上的最后一段路。他的玫瑰，在头顶那颗星星上。":"지구에서 걷는 마지막 길이에요. 어린 왕자의 장미는 머리 위 저 별에 있어요.","请你……给我画一只羊！":"부탁이야… 양 한 마리만 그려 줘!","这只太老了。我要一只能活很久的羊。":"이 양은 너무 늙었어. 오래 살 수 있는 양이 좋아.","这是箱子。你要的羊就在里面。":"이건 상자야. 네가 원하는 양은 그 안에 있어.","这正是我想要的！":"이게 바로 내가 원하던 거야!","瞧！它睡着了……":"봐! 잠들었어…","八天后":"여드레 뒤","小王子分享了旅程中的经历":"어린 왕자는 여행에서 겪은 일을 들려주었어요","啊！你的回忆真美。可我还没修好飞机。":"아! 네 추억은 정말 아름답구나. 하지만 난 아직 비행기를 못 고쳤어.","今天夜里，就满一年了。我的星星，会正好在我去年落下的地方上空……":"오늘 밤이면 꼭 일 년이야.\\n내 별이 작년에 내가 떨어진 곳 바로 위에 올 거야…","你是要回到你落下的地方去？":"네가 떨어졌던 곳으로 돌아가려는 거니?","嗯……":"응…","让沙漠变美的，是它在什么地方藏着一口井……":"사막이 아름다운 건, 어딘가에 우물을 숨기고 있기 때문이야…","真正重要的东西，眼睛是看不见的。":"가장 중요한 것은 눈에 보이지 않아.","哪天你太想念你的星球，我可以帮你。":"언젠가 네 별이 너무 그리워지면, 내가 도와줄 수 있어.","你会看见我的脚印在沙上是从哪儿开始的。你在那儿等我。今天夜里我会到。":"모래 위에 내 발자국이 어디서 시작되는지 보일 거야.\\n거기서 기다려. 오늘 밤에 갈게.","啊！你在这儿……":"아! 여기 있었구나…","我很高兴，你找到了飞机缺的东西。你可以回家了……":"비행기에 모자랐던 걸 찾아내서 기뻐.\\n이제 집에 돌아갈 수 있겠네…","你怎么知道？":"그걸 어떻게 알았니?","我也是，今天，我要回家了……远得多……也难得多……":"나도 오늘 집에 돌아가…\\n훨씬 더 멀고… 훨씬 더 어려워…","小家伙，我还想听你笑……":"꼬마야, 네 웃음소리를 또 듣고 싶어…","夜里你看天空的时候，我就在其中一颗星星上笑。对你来说，就像所有的星星都在笑。":"밤하늘을 보면, 별들 중 하나에서 내가 웃고 있을 거야.\\n그러면 아저씨에겐 모든 별이 웃는 것처럼 보일 거야.","你知道……我的花……我要对她负责！她那么弱小，只有四根刺来保护自己……":"있잖아… 내 꽃… 난 그 꽃에게 책임이 있어!\\n그 꽃은 너무 약해서, 자기를 지킬 가시가 네 개뿐이야…","好了……就这些……":"자… 이게 다야…","是你为你的玫瑰花费的时间，":"네가 네 장미에게 들인 시간이","才使你的玫瑰变得这么重要。":"네 장미를 그토록 소중하게 만든 거야.","——送给最爱的人":"— 가장 사랑하는 사람에게","完":"끝","未能载入这一章，请检查网络后重新进入。":"이 장을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 들어가 주세요.","重新进入":"다시 들어가기"},"zh":{"小王子":"小王子","玫瑰花":"玫瑰花","国王":"国王","爱虚荣的人":"爱虚荣的人","酒鬼":"酒鬼","酒馆门":"酒馆门","商人":"商人","点灯人":"点灯人","地理学家":"地理学家","蛇":"蛇","玫瑰们":"玫瑰们","狐狸":"狐狸","小花":"小花","飞行员":"飞行员","小王子（自语）":"小王子（自语）","小王子的旅程":"小王子的旅程","故事，从一朵玫瑰开始":"故事，从一朵玫瑰开始","离开玫瑰以后，他去拜访别的星球":"离开玫瑰以后，他去拜访别的星球","还看不清……":"还看不清……","这颗星球还在建造中，暂时还不能降落。":"这颗星球还在建造中，暂时还不能降落。","还在建造中":"还在建造中","前去拜访":"前去拜访","已经拜访过":"已经拜访过","再去看看":"再去看看","设置":"设置","B-612 · 家园":"B-612 · 家园","玫瑰在这里":"玫瑰在这里","有一颗只比房子大一点的星球，上面住着一位小王子。":"有一颗只比房子大一点的星球，上面住着一位小王子。","走进家园":"走进家园","他从这里出发":"他从这里出发","他给玫瑰浇过水、看过日落，然后跟着候鸟走了。":"他给玫瑰浇过水、看过日落，然后跟着候鸟走了。","这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。":"这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。","国王的星球":"国王的星球","325 号小行星":"325 号小行星","这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。":"这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。","国王要任命他做大使，他还是走了。":"国王要任命他做大使，他还是走了。","这里住着一位国王。他的星球上没有别人。":"这里住着一位国王。他的星球上没有别人。","326 号小行星":"326 号小行星","这里住着一个爱虚荣的人，他只听得见赞美。":"这里住着一个爱虚荣的人，他只听得见赞美。","他拍了两次手。那个人只想听掌声，他就走了。":"他拍了两次手。那个人只想听掌声，他就走了。","这里住着一个爱虚荣的人。他等着有人来崇拜他。":"这里住着一个爱虚荣的人。他等着有人来崇拜他。","327 号小行星":"327 号小行星","这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。":"这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。","他问了几句，没有得到答案，坐了一会儿就走了。":"他问了几句，没有得到答案，坐了一会儿就走了。","这里住着一个酒鬼。他喝酒，是为了忘记一件事。":"这里住着一个酒鬼。他喝酒，是为了忘记一件事。","328 号小行星":"328 号小行星","这里住着一个商人，他一刻不停地数星星，说它们都归他所有。":"这里住着一个商人，他一刻不停地数星星，说它们都归他所有。","他说完自己的花和火山，商人找不到话回答。":"他说完自己的花和火山，商人找不到话回答。","这里住着一个商人。他在数星星，数了很多年。":"这里住着一个商人。他在数星星，数了很多年。","329 号小行星":"329 号小行星","这是最小的一颗星球，只放得下一盏路灯和一个点灯人。":"这是最小的一颗星球，只放得下一盏路灯和一个点灯人。","他想留下来陪点灯人，可这颗星球太小，容不下两个人。":"他想留下来陪点灯人，可这颗星球太小，容不下两个人。","这里是最小的一颗星球。只有一盏路灯，和一个一分钟也歇不了的人。":"这里是最小的一颗星球。只有一盏路灯，和一个一分钟也歇不了的人。","330 号小行星":"330 号小行星","这里住着一位地理学家，他从不出门，却记下了别处的山和海。":"这里住着一位地理学家，他从不出门，却记下了别处的山和海。","他第一次担心起留在家里的花，然后去了地理学家说的地球。":"他第一次担心起留在家里的花，然后去了地理学家说的地球。","这里住着一位地理学家。他写一本很大的书，却从没离开过书桌。":"这里住着一位地理学家。他写一本很大的书，却从没离开过书桌。","地球":"地球","第七颗星球":"第七颗星球","地理学家说，去地球看看吧，它的名声很好。":"地理学家说，去地球看看吧，它的名声很好。","前往地球":"前往地球","他在这里":"他在这里","这里是地球。一片沙漠，头顶有一颗格外亮的星。":"这里是地球。一片沙漠，头顶有一颗格外亮的星。","有一颗只比房子大一点的星球，":"有一颗只比房子大一点的星球，","上面住着一位小王子。":"上面住着一位小王子。","这里住着一位国王。":"这里住着一位国王。","在他眼里，人人都是臣民，连星星也听他的。":"在他眼里，人人都是臣民，连星星也听他的。","这里住着一个爱虚荣的人，":"这里住着一个爱虚荣的人，","他只听得见赞美。":"他只听得见赞美。","这里住着一个酒鬼。":"这里住着一个酒鬼。","他喝酒，是为了忘掉让他难为情的事——喝酒。":"他喝酒，是为了忘掉让他难为情的事——喝酒。","这里住着一个商人，他一刻不停地数星星，":"这里住着一个商人，他一刻不停地数星星，","说它们都归他所有。":"说它们都归他所有。","这是最小的一颗星球，":"这是最小的一颗星球，","只放得下一盏路灯和一个点灯人。":"只放得下一盏路灯和一个点灯人。","这里住着一位地理学家，":"这里住着一位地理学家，","他从不出门，却记下了别处的山和海。":"他从不出门，却记下了别处的山和海。","地理学家说，去地球看看吧，":"地理学家说，去地球看看吧，","它的名声很好。":"它的名声很好。","第一章":"第一章","第二章":"第二章","第三章":"第三章","第四章":"第四章","第五章":"第五章","第六章":"第六章","第七章":"第七章","第八章":"第八章","第{0}章":"第{0}章","在 B-612 的最后一天":"在 B-612 的最后一天","一座空荡荡的宫殿，住着一位国王":"一座空荡荡的宫殿，住着一位国王","爱虚荣者的星球":"爱虚荣者的星球","一颗从没有人经过的星球，住着一个爱虚荣的人":"一颗从没有人经过的星球，住着一个爱虚荣的人","酒鬼的星球":"酒鬼的星球","一个用喝酒来忘记一切的人":"一个用喝酒来忘记一切的人","商人的星球":"商人的星球","一个忙得连头也不抬的商人":"一个忙得连头也不抬的商人","点灯人的星球":"点灯人的星球","一颗一分钟就转一圈的星球，住着一个点灯人":"一颗一分钟就转一圈的星球，住着一个点灯人","地理学家的星球":"地理学家的星球","一位记下了山和海，却从没去看过的地理学家":"一位记下了山和海，却从没去看过的地理学家","一颗很大的星球，可是一个人也看不见":"一颗很大的星球，可是一个人也看不见","四处走走，熟悉一下这颗星球":"四处走走，熟悉一下这颗星球","去看看玫瑰花":"去看看玫瑰花","照料玫瑰花":"照料玫瑰花","去工具棚拿水壶":"去工具棚拿水壶","去泉眼打水":"去泉眼打水","最后一次给她浇水":"最后一次给她浇水","看最后一场日落":"看最后一场日落","去星球边上的椅子坐下":"去星球边上的椅子坐下","去见国王":"去见国王","去看舞台上的人":"去看舞台上的人","去酒馆里坐坐":"去酒馆里坐坐","拜访数星星的商人":"拜访数星星的商人","？？？":"？？？","在星空里找到 B-612":"在星空里找到 B-612","去灯下看看":"去灯下看看","去地图馆看看":"去地图馆看看","去问问这是哪里":"去问问这是哪里","和岩石上的蛇说说话":"和岩石上的蛇说说话","去玫瑰园看看":"去玫瑰园看看","去苹果树下找狐狸":"去苹果树下找狐狸","踏上回家的路":"踏上回家的路","去叫醒飞行员":"去叫醒飞行员","回到落下来的地方":"回到落下来的地方","沿着石路走到门洞":"沿着石路走到门洞","{0}　完成":"{0}　完成","下一件事":"下一件事","可以启程了":"可以启程了","按住":"按住","启程":"启程","按一下查看本章目标":"按一下查看本章目标","再按一下收起":"再按一下收起","隐藏":"隐藏","{0} · {1} 米":"{0} · {1} 米","{0} 米":"{0} 米","前方是旅途":"前方是旅途","先去看一次日落，再启程":"先去看一次日落，再启程","要启程吗？":"要启程吗？","Q   启程":"Q   启程","Q 启程，跟着候鸟去下一颗星球        Esc 再待一会儿":"Q 启程，跟着候鸟去下一颗星球        Esc 再待一会儿","今日已日落，改日再来":"今日已日落，改日再来","正在准备画面 · {0}%":"正在准备画面 · {0}%","{0}　　　{0}":"{0}　　　{0}","移动":"移动","鼠标":"鼠标","点击画面后移动鼠标，看看四周":"点击画面后移动鼠标，看看四周","快跑":"快跑","拿起水壶":"拿起水壶","放回水壶":"放回水壶","放下水壶":"放下水壶","打水":"打水","浇水":"浇水","给玫瑰浇水":"给玫瑰浇水","壶是空的":"壶是空的","拿起玻璃罩":"拿起玻璃罩","放回去":"放回去","放回玻璃罩":"放回玻璃罩","先把水壶放在花旁":"先把水壶放在花旁","先把水壶放下":"先把水壶放下","坐下":"坐下","起身":"起身","交谈":"交谈","交互":"交互","推开宫门":"推开宫门","推开门":"推开门","推开木门":"推开木门","拉开门":"拉开门","拉开木门":"拉开木门","合上门":"合上门","合上木门":"合上木门","开门":"开门","关门":"关门","鼓掌":"鼓掌","看星星":"看星星","离开":"离开","滚轮":"滚轮","放大":"放大","眺望":"眺望","喊":"喊","上车":"上车","转辘轳":"转辘轳","叫醒他":"叫醒他","和蛇说话":"和蛇说话","水壶":"水壶","泉眼":"泉眼","椅子":"椅子","玫瑰园":"玫瑰园","火车":"火车","苹果树":"苹果树","车站":"车站","门洞":"门洞","暂停":"暂停","继续":"继续","回到旅程地图":"回到旅程地图","返回地图":"返回地图","返回游戏":"返回游戏","全屏":"全屏","清除进度":"清除进度","确定清除？":"确定清除？","语言":"语言","操作":"操作","方向键也可以":"方向键也可以","视角":"视角","点击画面后转动鼠标":"点击画面后转动鼠标","空格":"空格","跳":"跳","互动":"互动","靠近有星标的东西":"靠近有星标的东西","按住，走完一圈":"按住，走完一圈","本章目标":"本章目标","按一下展开，再按收起":"按一下展开，再按收起","鼠标灵敏度":"鼠标灵敏度","声音":"声音","主音量":"主音量","音乐":"音乐","音效":"音效","我想……该是吃早饭的时候了。":"我想……该是吃早饭的时候了。","能不能劳您费心，也想着我一点……":"能不能劳您费心，也想着我一点……","再见了。":"再见了。","……":"……","我想去别的星球看看。":"我想去别的星球看看。","（轻轻咳了一声）":"（轻轻咳了一声）","我以前真傻。请你原谅我。":"我以前真傻。请你原谅我。","是啊，我是爱你的。":"是啊，我是爱你的。","你一点都没察觉，是我的错。":"你一点都没察觉，是我的错。","不过，你也和我一样傻。":"不过，你也和我一样傻。","别管这个罩子了。我不要它了。":"别管这个罩子了。我不要它了。","可是风……":"可是风……","夜里的凉风会对我有好处的。我是一朵花。":"夜里的凉风会对我有好处的。我是一朵花。","可是那些野兽……":"可是那些野兽……","我什么都不怕。我有我的爪子。":"我什么都不怕。我有我的爪子。","（亮出她的四根刺）":"（亮出她的四根刺）","别这样磨磨蹭蹭的，真烦人。":"别这样磨磨蹭蹭的，真烦人。","你已经决定要走了。走吧。":"你已经决定要走了。走吧。","人在很难过的时候，就喜欢看日落……":"人在很难过的时候，就喜欢看日落……","我很喜欢看日落。":"我很喜欢看日落。","啊，来了一位臣民！":"啊，来了一位臣民！","您从没见过我，怎么知道我是臣民？":"您从没见过我，怎么知道我是臣民？","来到我面前的，都是我的臣民。这里的一切都听我的，连星星也是。":"来到我面前的，都是我的臣民。这里的一切都听我的，连星星也是。","那您能让太阳现在落下吗？我想看一次日落。":"那您能让太阳现在落下吗？我想看一次日落。","当然。不过命令要下在合适的时候。今晚七点四十，我会命令它落下。":"当然。不过命令要下在合适的时候。今晚七点四十，我会命令它落下。","……七点四十，它本来就要落下的。":"……七点四十，它本来就要落下的。","在我家，想看日落，把椅子挪几步就行了。":"在我家，想看日落，把椅子挪几步就行了。","我该走了。":"我该走了。","等等！我任命你做我的大使！":"等等！我任命你做我的大使！","啊！啊！来了一位崇拜者！":"啊！啊！来了一位崇拜者！","你拍拍手吧。":"你拍拍手吧。","你真的非常崇拜我吗？":"你真的非常崇拜我吗？","“崇拜”是什么意思？":"“崇拜”是什么意思？","崇拜，就是承认我是这颗星球上\\n最英俊、穿得最好、最有钱、最聪明的人。":"崇拜，就是承认我是这颗星球上\\n最英俊、穿得最好、最有钱、最聪明的人。","可这颗星球上只有你一个人！":"可这颗星球上只有你一个人！","行行好，还是崇拜我吧！":"行行好，还是崇拜我吧！","我崇拜你。可这对你有什么要紧呢？":"我崇拜你。可这对你有什么要紧呢？","你在这儿做什么？":"你在这儿做什么？","我在喝酒。":"我在喝酒。","你为什么喝酒？":"你为什么喝酒？","为了忘记。":"为了忘记。","忘记什么？":"忘记什么？","忘记我的羞愧。":"忘记我的羞愧。","羞愧什么？":"羞愧什么？","羞愧我喝酒！":"羞愧我喝酒！","二十六加五，三十一。呼！\\n一共是五亿零一百六十二万二千七百三十一。":"二十六加五，三十一。呼！\\n一共是五亿零一百六十二万二千七百三十一。","五亿什么？":"五亿什么？","星星。":"星星。","你拿五亿颗星星做什么？":"你拿五亿颗星星做什么？","什么也不做。我拥有它们。":"什么也不做。我拥有它们。","那你拿它们怎么办呢？":"那你拿它们怎么办呢？","我把星星的数目写在一张小纸上，\\n再把这张纸锁进抽屉。":"我把星星的数目写在一张小纸上，\\n再把这张纸锁进抽屉。","就这些？":"就这些？","这就够了！":"这就够了！","我有一朵花，我每天给她浇水。\\n我有三座火山，我每星期疏通一遍。":"我有一朵花，我每天给她浇水。\\n我有三座火山，我每星期疏通一遍。","我拥有它们，对我的火山有用，对我的花也有用。\\n可你对星星没有用……":"我拥有它们，对我的火山有用，对我的花也有用。\\n可你对星星没有用……","你好。你为什么刚把路灯熄了？":"你好。你为什么刚把路灯熄了？","这是规定。早上好。":"这是规定。早上好。","可你为什么又把它点亮了？":"可你为什么又把它点亮了？","没什么要明白的。规定就是规定。晚上好。":"没什么要明白的。规定就是规定。晚上好。","从前还说得过去：早上熄灯，晚上点灯。":"从前还说得过去：早上熄灯，晚上点灯。","可星球一年比一年转得快，规定却没改！":"可星球一年比一年转得快，规定却没改！","现在它一分钟转一圈，我连一秒钟也歇不了。":"现在它一分钟转一圈，我连一秒钟也歇不了。","只有他不让我觉得可笑。\\n也许是因为，他操心的是自己以外的事。":"只有他不让我觉得可笑。\\n也许是因为，他操心的是自己以外的事。","瞧！来了一位探险家！":"瞧！来了一位探险家！","你从远方来！给我讲讲你的星球！":"你从远方来！给我讲讲你的星球！","我那儿很小。我有三座火山。":"我那儿很小。我有三座火山。","我还有一朵花。":"我还有一朵花。","我们不记录花。":"我们不记录花。","为什么！花是最美的！":"为什么！花是最美的！","因为花是转瞬即逝的。":"因为花是转瞬即逝的。","“转瞬即逝”是什么意思？":"“转瞬即逝”是什么意思？","意思是“很快就有消失的危险”。":"意思是“很快就有消失的危险”。","我的花是转瞬即逝的，她只有四根刺来保护自己！\\n而我把她独自留在了家里！":"我的花是转瞬即逝的，她只有四根刺来保护自己！\\n而我把她独自留在了家里！","我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！":"我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！","我落在哪颗星球上了？":"我落在哪颗星球上了？","地球上，在非洲。":"地球上，在非洲。","看，我的星球。它就在我们头顶上……可它多远啊！":"看，我的星球。它就在我们头顶上……可它多远啊！","它真美。你来这儿做什么？":"它真美。你来这儿做什么？","我和一朵花闹了点别扭。":"我和一朵花闹了点别扭。","人在哪儿？在沙漠里有点孤独……":"人在哪儿？在沙漠里有点孤独……","在人群里也一样孤独。":"在人群里也一样孤独。","我碰到谁，就把他送回他来的那片土地。":"我碰到谁，就把他送回他来的那片土地。","你这么弱小，落在这花岗岩的地球上，我可怜你。哪天你太想念你的星球，我可以帮你。":"你这么弱小，落在这花岗岩的地球上，我可怜你。哪天你太想念你的星球，我可以帮你。","人在哪儿？":"人在哪儿？","人？风吹着他们到处走。他们没有根，这让他们很难办。":"人？风吹着他们到处走。他们没有根，这让他们很难办。","你好！做我的朋友吧，我很孤独。":"你好！做我的朋友吧，我很孤独。","你好……我很孤独……":"你好……我很孤独……","我很孤独……":"我很孤独……","你们是谁？":"你们是谁？","我们是玫瑰。":"我们是玫瑰。","我还以为我有一朵独一无二的花，\\n原来只是一朵普通的玫瑰。":"我还以为我有一朵独一无二的花，\\n原来只是一朵普通的玫瑰。","来和我玩吧。我很难过……":"来和我玩吧。我很难过……","我不能和你玩。我没有被驯养。":"我不能和你玩。我没有被驯养。","“驯养”是什么意思？":"“驯养”是什么意思？","就是“建立联系”。对我来说，你还只是一个小男孩，和十万个小男孩一模一样。":"就是“建立联系”。对我来说，你还只是一个小男孩，和十万个小男孩一模一样。","可如果你驯养了我，你对我就是世上唯一的。":"可如果你驯养了我，你对我就是世上唯一的。","我开始明白了。有一朵花……我想她驯养了我……":"我开始明白了。有一朵花……我想她驯养了我……","再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。":"再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。","你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。":"你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。","这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。":"这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。","是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。":"是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。","你要永远为你驯养的东西负责。你要对你的玫瑰负责……":"你要永远为你驯养的东西负责。你要对你的玫瑰负责……","我要对我的玫瑰负责……":"我要对我的玫瑰负责……","第八章　地球":"第八章　地球","沙丘":"沙丘","这是他在地球上的最后一段路。他的玫瑰，在头顶那颗星星上。":"这是他在地球上的最后一段路。他的玫瑰，在头顶那颗星星上。","请你……给我画一只羊！":"请你……给我画一只羊！","这只太老了。我要一只能活很久的羊。":"这只太老了。我要一只能活很久的羊。","这是箱子。你要的羊就在里面。":"这是箱子。你要的羊就在里面。","这正是我想要的！":"这正是我想要的！","瞧！它睡着了……":"瞧！它睡着了……","八天后":"八天后","小王子分享了旅程中的经历":"小王子分享了旅程中的经历","啊！你的回忆真美。可我还没修好飞机。":"啊！你的回忆真美。可我还没修好飞机。","今天夜里，就满一年了。我的星星，会正好在我去年落下的地方上空……":"今天夜里，就满一年了。我的星星，会正好在我去年落下的地方上空……","你是要回到你落下的地方去？":"你是要回到你落下的地方去？","嗯……":"嗯……","让沙漠变美的，是它在什么地方藏着一口井……":"让沙漠变美的，是它在什么地方藏着一口井……","真正重要的东西，眼睛是看不见的。":"真正重要的东西，眼睛是看不见的。","哪天你太想念你的星球，我可以帮你。":"哪天你太想念你的星球，我可以帮你。","你会看见我的脚印在沙上是从哪儿开始的。你在那儿等我。今天夜里我会到。":"你会看见我的脚印在沙上是从哪儿开始的。你在那儿等我。今天夜里我会到。","啊！你在这儿……":"啊！你在这儿……","我很高兴，你找到了飞机缺的东西。你可以回家了……":"我很高兴，你找到了飞机缺的东西。你可以回家了……","你怎么知道？":"你怎么知道？","我也是，今天，我要回家了……远得多……也难得多……":"我也是，今天，我要回家了……远得多……也难得多……","小家伙，我还想听你笑……":"小家伙，我还想听你笑……","夜里你看天空的时候，我就在其中一颗星星上笑。对你来说，就像所有的星星都在笑。":"夜里你看天空的时候，我就在其中一颗星星上笑。对你来说，就像所有的星星都在笑。","你知道……我的花……我要对她负责！她那么弱小，只有四根刺来保护自己……":"你知道……我的花……我要对她负责！她那么弱小，只有四根刺来保护自己……","好了……就这些……":"好了……就这些……","是你为你的玫瑰花费的时间，":"是你为你的玫瑰花费的时间，","才使你的玫瑰变得这么重要。":"才使你的玫瑰变得这么重要。","——送给最爱的人":"——送给最爱的人","完":"完","未能载入这一章，请检查网络后重新进入。":"未能载入这一章，请检查网络后重新进入。","重新进入":"重新进入"}};

/**
 * 本地化：中文是源句，其它语言查表。
 * 表来自 build_game_assets.py 解析的 LPStrings_<lang>.txt（原站真实文案）。
 */
const LANGS = [
  { code: 'zh', name: '中文', html: 'zh-CN' },
  { code: 'en', name: 'English', html: 'en' },
  { code: 'fr', name: 'Français', html: 'fr' },
  { code: 'es', name: 'Español', html: 'es' },
  { code: 'de', name: 'Deutsch', html: 'de' },
  { code: 'pt', name: 'Português', html: 'pt-BR' },
  { code: 'ja', name: '日本語', html: 'ja' },
  { code: 'ko', name: '한국어', html: 'ko' },
];

const STORAGE_KEY = 'lp.lang';

/**
 * 新 UI（旅程手册、徽章、提示）用的少量补充文案。
 * 原站文案表 strings.json 里没有这些词，这里只补短标签；
 * 查不到时仍然回落到中文源句，和原站 Loc 的行为一致。
 */
const EXTRA = {
  en: {
    旅程手册: 'Journal',
    任务: 'Quests',
    探索: 'Explored',
    已拜访: 'Visited',
    颗星球: 'planets',
    下一站: 'Next stop',
    徽章: 'Badges',
    目标完成: 'Objective complete',
    发现: 'Discovered',
    已解锁: 'Unlocked',
    尚未解锁: 'Locked',
    旅程从这里开始: 'The journey begins here',
    看看笼子里的老鼠: 'Look at the mouse in the cage',
    看看他的镜子: 'Look at his mirror',
    数一数他的空瓶: 'Count his empty bottles',
    看看那只抽屉: 'Look at that drawer',
    替他把灯点上: 'Light the lamp for him',
    看看他在记录什么: 'See what he is writing down'
  },
  fr: {
    旅程手册: 'Journal de voyage',
    任务: 'Quêtes',
    探索: 'Exploré',
    已拜访: 'Visités',
    颗星球: 'planètes',
    下一站: 'Prochaine étape',
    徽章: 'Insignes',
    目标完成: 'Objectif accompli',
    发现: 'Découvert',
    已解锁: 'Débloqué',
    尚未解锁: 'Verrouillé',
    旅程从这里开始: 'Le voyage commence ici',
    看看笼子里的老鼠: 'Regarder la souris dans la cage',
    看看他的镜子: 'Regarder son miroir',
    数一数他的空瓶: 'Compter ses bouteilles vides',
    看看那只抽屉: 'Regarder ce tiroir',
    替他把灯点上: 'Allumer la lanterne pour lui',
    看看他在记录什么: "Voir ce qu'il note"
  },
  es: {
    旅程手册: 'Diario de viaje',
    任务: 'Misiones',
    探索: 'Explorado',
    已拜访: 'Visitados',
    颗星球: 'planetas',
    下一站: 'Próxima parada',
    徽章: 'Insignias',
    目标完成: 'Objetivo cumplido',
    发现: 'Descubierto',
    已解锁: 'Desbloqueado',
    尚未解锁: 'Bloqueado',
    旅程从这里开始: 'El viaje empieza aquí',
    看看笼子里的老鼠: 'Mirar el ratón en la jaula',
    看看他的镜子: 'Mirar su espejo',
    数一数他的空瓶: 'Contar sus botellas vacías',
    看看那只抽屉: 'Mirar ese cajón',
    替他把灯点上: 'Encender la farola por él',
    看看他在记录什么: 'Ver qué está anotando'
  },
  de: {
    旅程手册: 'Reisetagebuch',
    任务: 'Aufgaben',
    探索: 'Erkundet',
    已拜访: 'Besucht',
    颗星球: 'Planeten',
    下一站: 'Nächster Halt',
    徽章: 'Abzeichen',
    目标完成: 'Ziel erreicht',
    发现: 'Entdeckt',
    已解锁: 'Freigeschaltet',
    尚未解锁: 'Noch gesperrt',
    旅程从这里开始: 'Die Reise beginnt hier',
    看看笼子里的老鼠: 'Die Maus im Käfig ansehen',
    看看他的镜子: 'Seinen Spiegel ansehen',
    数一数他的空瓶: 'Seine leeren Flaschen zählen',
    看看那只抽屉: 'Diese Schublade ansehen',
    替他把灯点上: 'Die Laterne für ihn anzünden',
    看看他在记录什么: 'Sehen, was er notiert'
  },
  pt: {
    旅程手册: 'Diário de viagem',
    任务: 'Missões',
    探索: 'Explorado',
    已拜访: 'Visitados',
    颗星球: 'planetas',
    下一站: 'Próxima parada',
    徽章: 'Emblemas',
    目标完成: 'Objetivo cumprido',
    发现: 'Descoberto',
    已解锁: 'Desbloqueado',
    尚未解锁: 'Bloqueado',
    旅程从这里开始: 'A viagem começa aqui',
    看看笼子里的老鼠: 'Olhar o rato na gaiola',
    看看他的镜子: 'Olhar o espelho dele',
    数一数他的空瓶: 'Contar as garrafas vazias',
    看看那只抽屉: 'Olhar aquela gaveta',
    替他把灯点上: 'Acender o lampião para ele',
    看看他在记录什么: 'Ver o que ele está anotando'
  },
  ja: {
    旅程手册: '旅の手帳',
    任务: '任務',
    探索: '探索',
    已拜访: '訪問済み',
    颗星球: '個の星',
    下一站: '次の星',
    徽章: 'バッジ',
    目标完成: '目標達成',
    发现: '発見',
    已解锁: '解放済み',
    尚未解锁: '未解放',
    旅程从这里开始: '旅はこの星から始まる',
    看看笼子里的老鼠: '檻の中のネズミを見る',
    看看他的镜子: '彼の鏡を見る',
    数一数他的空瓶: '空き瓶を数える',
    看看那只抽屉: 'あの引き出しを見る',
    替他把灯点上: '彼の代わりに灯をともす',
    看看他在记录什么: '何を記録しているか見る'
  },
  ko: {
    旅程手册: '여행 수첩',
    任务: '임무',
    探索: '탐험',
    已拜访: '방문함',
    颗星球: '개의 별',
    下一站: '다음 행성',
    徽章: '휘장',
    目标完成: '목표 달성',
    发现: '발견',
    已解锁: '해금됨',
    尚未解锁: '잠김',
    旅程从这里开始: '여행은 이 별에서 시작된다',
    看看笼子里的老鼠: '우리 안의 쥐를 보다',
    看看他的镜子: '그의 거울을 보다',
    数一数他的空瓶: '빈 병을 세어 보다',
    看看那只抽屉: '저 서랍을 보다',
    替他把灯点上: '그를 대신해 등불을 켜다',
    看看他在记录什么: '무엇을 기록하는지 보다'
  },
};

function detect() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && table[saved]) return saved;
  const nav = (navigator.languages || [navigator.language || 'zh']).map((l) => l.toLowerCase());
  for (const l of nav) {
    const hit = LANGS.find((x) => l.startsWith(x.code));
    if (hit) return hit.code;
  }
  return 'zh';
}

let lang = detect();
const listeners = new Set();

function getLang() {
  return lang;
}

function getLanguages() {
  return LANGS;
}

/** 翻译一条中文源句。找不到时回落到中文本身（原站的 Loc 行为）。 */
function t(zh) {
  if (lang === 'zh') return zh;
  const extra = EXTRA[lang];
  if (extra && extra[zh]) return extra[zh];
  const dict = table[lang];
  return (dict && dict[zh]) || zh;
}

/** 扫描所有带 data-i18n 的节点并替换文本。 */
function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  document.documentElement.lang = (LANGS.find((x) => x.code === lang) || LANGS[0]).html;
}

function setLang(code) {
  if (!table[code]) return;
  lang = code;
  localStorage.setItem(STORAGE_KEY, code);
  applyDom();
  listeners.forEach((fn) => fn(code));
}

/**
 * 逐字揭示的每字时长（毫秒）。
 * 原站 LPLanguages.txt 的 typing 策略：中日韩按字形计时，拉丁按源句长度计时。
 * 中文源句平均 10.6 字，取 glyph=62ms 与拉丁 source 的换算比例一致。
 */
function typingDelay(text) {
  const glyphLangs = new Set(['zh', 'ja', 'ko']);
  const isCJK = glyphLangs.has(lang);
  const per = isCJK ? 62 : 34;
  const total = Math.min(2600, Math.max(420, text.length * per));
  return { per, total };
}

/**
 * 显隐与轻提示工具：同时维护 class 与 HTML hidden 属性。
 *
 * 为什么需要它：样式表里有 `[hidden]{display:none!important}` 这条全局保险
 * （防止某个模块的 display 覆盖 hidden 属性而整屏遮挡）。
 * 一旦某处只 `classList.remove('hidden')` 而没有清掉 hidden 属性，
 * 元素就会永远不显示——地图曾经因此只剩背景色。
 * 统一走这里，两边永远一致。
 */
function setVisible(el, on) {
  if (!el) return;
  el.classList.toggle('hidden', !on);
  el.hidden = !on;
}

let _toastTimer = 0;
let _toastEl = null;

/**
 * 屏幕上方的轻提示：任务完成、发现新地点、收集到徽章。
 * 复用同一个节点，避免每次都往 DOM 里塞新元素（也避免动画队列堆积）。
 * @param {string} text
 * @param {'goal'|'find'|'badge'} kind
 */
function toast(text, kind = 'goal') {
  if (!_toastEl) _toastEl = document.getElementById('toast');
  if (!_toastEl || !text) return;
  _toastEl.textContent = text;
  _toastEl.dataset.kind = kind;
  // 先在无动画状态下重排，才能重放同一条 CSS 动画
  _toastEl.classList.remove('show');
  void _toastEl.offsetWidth;
  _toastEl.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => _toastEl.classList.remove('show'), 1900);
}

/**
 * 对话：纯 DOM + 逐字揭示（原站 JourneyTmpReveal 的效果）。
 * - 每个字一个 <span>，用 opacity 过渡，避免 reflow 抖动
 * - 首次点击/轻触：立即显示整句；再次点击：进入下一句
 * - 支持 speaker（人物名牌）与旁白（无 speaker）
 */

/**
 * 没写 speaker 的句子是旁白还是小王子的话：
 * 括号动作、「NNN 号小行星」开场、第三人称叙述（他…/含「小王子」）、操作提示 → 旁白；其余视为小王子。
 * 需要强制时在台词里显式写 speaker: ''（旁白）或 speaker: '小王子'。
 */
const NARRATION = /^(（|\(|【|\d+\s*号小行星|这里是|他|地球上|在他看来|点灯人|走近|四处走走|在沙漠里|去工具棚|先把|水打满)/;
function isNarration(text) {
  const s = (text || '').trim();
  if (!s) return true;
  return NARRATION.test(s) || s.includes('小王子');
}

/** 说话人 → 样式用标记（配色在 styles.css 的 .speaker[data-who] 里定义） */
function whoKey(name) {
  if (!name) return 'narrator';
  if (name.includes('玫瑰花') || name.includes('玫瑰')) return 'rose';
  if (name.includes('狐狸')) return 'fox';
  if (name.includes('蛇')) return 'snake';
  if (name.includes('国王')) return 'king';
  if (name.includes('小王子')) return 'prince';
  return 'other';
}

class Dialogue {
  constructor(rootEl, lineEl, speakerEl, advanceEl) {
    this.root = rootEl;
    this.lineEl = lineEl;
    this.speakerEl = speakerEl;
    this.advanceEl = advanceEl;

    this.queue = [];
    this.index = -1;
    this.revealing = false;
    this.spans = [];
    this.charTimer = 0;
    this.visibleChars = 0;
    this.totalChars = 0;
    this.onEnd = null;
    this.active = false;

    // #dialogue 是全局共享的 DOM 元素，每个章节都会 new 一个 Dialogue。
    // 监听器必须能移除，否则闭包 → 旧 Dialogue → onEnd → 旧章节整棵场景图全被 DOM 留住
    // （堆快照实测地球每进出一次 +1.1 MB）。
    this._abort = new AbortController();
    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.advance();
    }, { signal: this._abort.signal });
  }

  /** 章节卸载时调用：移除 DOM 监听器并断开对章节回调的引用 */
  dispose() {
    this.stop();
    this._abort.abort();
    this.queue = [];
  }

  /** lines: [{ speaker?: 中文名, text?: 中文源句, raw?: 已翻译文本, pause?: ms, onShow?: fn }] */
  play(lines, onEnd) {
    this.queue = lines.slice();
    this.index = -1;
    this.onEnd = onEnd || null;
    this.active = true;
    setVisible(this.root, true);
    requestAnimationFrame(() => this.root.classList.add('show'));
    this._next();
  }

  _next() {
    this.index++;
    if (this.index >= this.queue.length) {
      this._finish();
      return;
    }
    const item = this.queue[this.index];
    if (item.onShow) item.onShow();

    // 没写 speaker 的台词，大多是小王子自己说的话；旁白/操作提示则不显示名牌。
    // 早先一律留空，结果小王子开口时名牌不变化，看起来像对方还在说。
    const src = item.text || '';
    const who = item.speaker !== undefined ? item.speaker : isNarration(src) ? '' : '小王子';
    const speaker = who ? t(who) : '';
    this.speakerEl.textContent = speaker;
    this.speakerEl.style.visibility = speaker ? 'visible' : 'hidden';
    // 说话人配色：名牌上带一个 data-who，样式表按角色给颜色
    this.speakerEl.dataset.who = speaker ? whoKey(who) : 'narrator';

    const text = item.raw != null ? item.raw : t(item.text || '');
    this._render(text);
    this.advanceEl.classList.remove('show');
  }

  _render(text) {
    this.lineEl.textContent = '';
    this.spans = [];
    // 逐字拆分成 span；空格保留为可断行的普通文本
    for (const ch of text) {
      if (ch === '\n') {
        this.lineEl.appendChild(document.createElement('br'));
        continue;
      }
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      this.lineEl.appendChild(s);
      this.spans.push(s);
    }
    this.visibleChars = 0;
    this.totalChars = this.spans.length;
    const { per } = typingDelay(text);
    this.perChar = per;
    this.charTimer = 0;
    this.revealing = this.totalChars > 0;
    if (!this.revealing) this._completeReveal();
  }

  _completeReveal() {
    for (const s of this.spans) s.classList.add('on');
    this.visibleChars = this.totalChars;
    this.revealing = false;
    this.advanceEl.classList.add('show');
  }

  /** 点击推进 */
  advance() {
    if (!this.active) return;
    if (this.revealing) {
      // 第一次点击：补全当前句
      this._completeReveal();
      return;
    }
    this._next();
  }

  update(dt) {
    if (!this.revealing) return;
    this.charTimer += dt * 1000;
    const due = Math.min(this.totalChars, Math.floor(this.charTimer / this.perChar));
    while (this.visibleChars < due) {
      this.spans[this.visibleChars].classList.add('on');
      this.visibleChars++;
    }
    if (this.visibleChars >= this.totalChars) {
      this.revealing = false;
      this.advanceEl.classList.add('show');
    }
  }

  _finish() {
    this.active = false;
    this.root.classList.remove('show');
    setTimeout(() => {
      if (!this.active) setVisible(this.root, false);
    }, 260);
    const cb = this.onEnd;
    this.onEnd = null;
    if (cb) cb();
  }

  stop() {
    this.active = false;
    this.queue = [];
    this.onEnd = null;
    this.root.classList.remove('show');
    setVisible(this.root, false);
    // 清掉残留的逐字 span：它们既是 DOM 子节点，又被 this.spans 引用，
    // 章节切换时不清空就会一直留在堆里（实测每次进出 +60 个 span 及动画记录）
    this.lineEl && (this.lineEl.textContent = '');
    this.spans = [];
    this.visibleChars = 0;
    this.totalChars = 0;
    this.revealing = false;
  }

  get isActive() {
    return this.active;
  }
}

/**
 * Web Audio 程序化音频：不下载任何音频文件（iOS 首屏预算）。
 * - noise 缓冲复用（初始化一次）：泉声、风声
 * - 加法合成的八音盒旋律（C 大调五声），致敬原站 ChapterMusic
 * - iOS 必须用户手势后 resume()，这里由 start() 统一处理
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.volume = Number(localStorage.getItem('lp.vol') ?? 0.7);
    this.musicTimer = null;
    this.noiseBuffer = null;
    this.enabled = true;
  }

  async start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this.enabled = false;
      return;
    }
    this.ctx = new AC({ latencyHint: 'interactive' });

    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.34;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.6;
    this.sfxGain.connect(this.master);

    // 一个白噪声缓冲，多处复用
    const dur = 2;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    localStorage.setItem('lp.vol', String(v));
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------- 音乐
  /** 八音盒式旋律：五声音阶随机游走，音符极轻、长衰减 */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]; // C D E G A C D E
    let idx = 2;
    const tick = () => {
      if (!this.ctx) return;
      idx = Math.max(0, Math.min(scale.length - 1, idx + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.3 ? 2 : 1)));
      this._pluck(scale[idx], 0.9);
      if (Math.random() < 0.25) this._pluck(scale[idx] / 2, 0.55); // 低八度垫底
      this.musicTimer = setTimeout(tick, 620 + Math.random() * 900);
    };
    this.musicTimer = setTimeout(tick, 400);
  }

  stopMusic() {
    clearTimeout(this.musicTimer);
    this.musicTimer = null;
  }

  _pluck(freq, vol) {
    const c = this.ctx;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const osc2 = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 2.002; // 轻微失谐 → 钟声泛音

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol * 0.16, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);

    const g2 = c.createGain();
    g2.gain.value = 0.22;
    osc2.connect(g2).connect(g);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t0);
    osc2.start(t0);
    osc.stop(t0 + 2.7);
    osc2.stop(t0 + 2.7);
  }

  // ---------------------------------------------------------- 音效
  _noise(dur, filterType, freq, gain, detune = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.detune.value = detune;
    const g = c.createGain();
    const t0 = c.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /** 脚步声：短促的低频噪声脉冲 */
  step(soft = 1) {
    this._noise(0.09, 'bandpass', 380 + Math.random() * 220, 0.075 * soft);
  }

  /** 浇水：持续的水声 */
  water(dur = 1.6) {
    this._noise(dur, 'highpass', 1600, 0.1);
    setTimeout(() => this._noise(dur * 0.8, 'bandpass', 2600, 0.06), 180);
  }

  /** 打水：水滴声 */
  drop() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t0);
    o.frequency.exponentialRampToValueAtTime(320, t0 + 0.18);
    g.gain.setValueAtTime(0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.connect(g).connect(this.sfxGain);
    o.start(t0);
    o.stop(t0 + 0.25);
  }

  /** 交互确认：柔和的钟声 */
  chime(freq = 523.25) {
    this._pluck(freq, 1.4);
  }

  /** 日落 / 章节结束：和弦 */
  swell() {
    if (!this.ctx) return;
    [261.63, 329.63, 392.0, 523.25].forEach((f, i) => {
      setTimeout(() => this._pluck(f, 1.2), i * 90);
    });
  }

  /** UI 点击 */
  click() {
    this.chime(659.25);
  }
}

const audio = new AudioEngine();

/**
 * 3D 反馈特效：目标完成时的星光爆、交互时的冲击环。
 * 全部程序化生成 + AdditiveBlending，单次特效顶点数极少，用完立刻 dispose，
 * 不会占用首屏预算，也不会在章节之间留下残留几何体/材质。
 */

let _glowTex$1 = null;

/**
 * 柔光点贴图：Points 默认是方块，加一张径向渐变贴图才像星光。
 * 全局只生成一次并被所有章节共享，因此标记 userData.shared —— 章节 dispose 会跳过它。
 */
function glowTexture() {
  if (_glowTex$1) return _glowTex$1;
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.36, 'rgba(255,255,255,0.62)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.userData.shared = true;
  _glowTex$1 = tex;
  return tex;
}

class FxPool {
  constructor(parent) {
    this.parent = parent;
    this.items = [];
    this.texture = glowTexture();
  }

  /**
   * 星光爆：从 pos 沿切平面散开、轻微上抛再回落。
   * 因为球面场景里「地面」就是法线方向，速度必须拆成切向 + 法向，
   * 否则粒子会直接穿进球体。
   */
  burst(pos, up, { count = 24, color = 0xffd98a, speed = 1.5, life = 1.15, size = 0.075 } = {}) {
    const n = up.clone().normalize();
    let t1 = new Vector3(0, 1, 0).cross(n);
    if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0).cross(n);
    t1.normalize();
    const t2 = new Vector3().crossVectors(n, t1).normalize();

    const geo = new BufferGeometry();
    const arr = new Float32Array(count * 3);
    const vels = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = 0.35 + Math.random() * 0.7;
      const rise = 0.45 + Math.random() * 0.95;
      vels.push(
        t1
          .clone()
          .multiplyScalar(Math.cos(a) * r)
          .addScaledVector(t2, Math.sin(a) * r)
          .addScaledVector(n, rise)
          .multiplyScalar(speed)
      );
      arr[i * 3] = pos.x;
      arr[i * 3 + 1] = pos.y;
      arr[i * 3 + 2] = pos.z;
    }
    geo.setAttribute('position', new BufferAttribute(arr, 3));

    const mat = new PointsMaterial({
      color,
      size,
      map: this.texture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    this.parent.add(pts);

    let t = 0;
    const item = {
      obj: pts,
      dispose() {
        geo.dispose();
        mat.dispose();
      },
      update(dt) {
        t += dt;
        const k = t / life;
        for (let i = 0; i < vels.length; i++) {
          const v = vels[i];
          arr[i * 3] += v.x * dt;
          arr[i * 3 + 1] += v.y * dt;
          arr[i * 3 + 2] += v.z * dt;
          v.multiplyScalar(Math.max(0, 1 - 2.1 * dt)); // 空气阻力
          v.addScaledVector(n, -1.8 * dt); // 一点点「落回地面」
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, 1 - k * k);
        mat.size = size * (1 + k * 0.55);
        return k < 1;
      },
    };
    this.items.push(item);
    return item;
  }

  /** 冲击环：贴着球面扩散的一圈光，用来强调「这里可以互动」 */
  pulse(pos, normal, { color = 0xe8c87a, life = 0.7, from = 0.4, to = 1.8 } = {}) {
    const geo = new RingGeometry(0.86, 1, 44);
    const mat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const ring = new Mesh(geo, mat);
    ring.position.copy(pos);
    ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal.clone().normalize());
    ring.renderOrder = 6;
    this.parent.add(ring);

    let t = 0;
    const item = {
      obj: ring,
      dispose() {
        geo.dispose();
        mat.dispose();
      },
      update(dt) {
        t += dt;
        const k = t / life;
        const s = from + (to - from) * k;
        ring.scale.set(s, s, s);
        mat.opacity = 0.9 * (1 - k * k);
        return k < 1;
      },
    };
    this.items.push(item);
    return item;
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.update(dt)) {
        this.parent.remove(it.obj);
        it.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const it of this.items) {
      this.parent.remove(it.obj);
      it.dispose();
    }
    this.items.length = 0;
  }
}

/**
 * 旅程手册：把每章的 goals 文案补齐「该去哪儿」的提示，并定义收集用的徽章。
 *
 * 提示只是引导，不参与任何交互判定 —— goals 的下标顺序必须与
 * chapters/*.js 里 `this.goals` 的数组顺序一一对应，改文案时顺手改这里。
 * 中文是源句，其它语言查不到时按 i18n 的既有规则回落中文。
 */

const HINTS = {
  b612: [
    '沿着土路走一圈，看看这颗星球上都有些什么',
    '小路尽头有一圈木栅栏，玫瑰就在里面',
    '木棚就在玫瑰附近，门上爬着藤',
    '泉眼在草甸另一头，水面泛着蓝光',
    '带上水壶，回到玫瑰身边',
    '往星球边缘走，那里能看到落日',
    '边缘有一把椅子，坐下歇一会儿',
  ],
  king: [
    '王座就在星球上，披风拖得很长',
    '走近王座，等国王开口',
    '国王让你做什么，就照做',
    '和国王道别，继续旅程',
  ],
  vanity: [
    '高台上站着一个人，帽子上插着羽毛',
    '站到高台前，为他鼓掌',
    '他还要掌声，再鼓一次',
    '问问他「了不起」到底是什么意思',
    '离开这颗星球，继续往前走',
  ],
  bar: [
    '酒桶边上坐着一个人，低着头',
    '问他在喝什么',
    '再问他为什么喝酒',
    '什么也别说，安静地离开',
  ],
  merchant: [
    '书桌后面有个人一直低着头数数',
    '问他在数什么',
    '听他把「星星都归我」说完',
    '反问一句：你为它们做了什么',
  ],
  lamp: [
    '这颗星球很小，只有一盏路灯',
    '站在路灯下，看他把灯点亮',
    '再等一会儿，他会把灯熄掉',
    '和他道别',
  ],
  geo: [
    '书桌、望远镜、地球仪，他在桌前伏案',
    '请他把你看到的记下来',
    '问他地球在哪里',
    '想起留在家里的那朵花',
    '启程去地球',
  ],
  earth: [
    '沿着石路一直走，路上会陆续遇到东西',
    '路边有一条蛇，沙上留着它的痕迹',
    '蛇的旁边有一朵三瓣的小花',
    '再往前是一座高山，走近它喊一声',
    '山后有一片玫瑰园，开满红花',
    '狐狸在玫瑰园外面等你',
    '和狐狸待一会儿，慢慢靠近它',
    '铁路边有一个小车站',
    '车站旁有个卖药丸的商贩',
    '再往前走有一口井',
    '井边有个飞行员在修飞机',
    '回到你落下来的地方，那里有一束光',
  ],
};

/** 某个目标的一句话提示；没有对应提示时返回空串 */
function hintFor(chapterId, index) {
  const list = HINTS[chapterId];
  if (!list || index < 0 || index >= list.length) return '';
  return list[index];
}

/** 收集徽章：素材来自 06-export 里原作的徽章贴图，只作缩略图使用 */
const BADGES = [
  { id: 'flower', img: 'badge-flower', name: '玫瑰', note: '你照顾过一朵花', needs: ['b612'] },
  { id: 'fox', img: 'badge-fox', name: '狐狸', note: '你驯服了谁', needs: ['earth'] },
  { id: 'roses', img: 'badge-roses', name: '玫瑰园', note: '你见过五千朵一样的花', needs: ['earth'] },
  { id: 'snake', img: 'badge-snake', name: '蛇', note: '你听懂了它的谜语', needs: ['earth'] },
  { id: 'pilot', img: 'badge-pilot', name: '飞行员', note: '你在沙漠里遇见了另一个大人', needs: ['earth'] },
];

/** 已拜访的章节里有哪些徽章解锁了 */
function earnedBadges(visited) {
  const v = visited || [];
  return BADGES.filter((b) => b.needs.every((id) => v.includes(id)));
}

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

const TAU = Math.PI * 2;

/**
 * 每章一套柔光调色。night / dusk / day 是「天顶 → 天中 → 地平线」三段色，
 * 顺序与 world.js 的 makeSkyDome 一致（topColor / midColor / botColor）。
 */
const PALETTES = {
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
function paletteOf(name) {
  return PALETTES[name] || PALETTES.b612;
}

// ---------------------------------------------------------------- 贴图

let _glowTex = null;

/** 64×64 的径向柔光贴图（光尘 / 光晕 / 灯柱共用一张，必须打 shared 标记） */
function glowTex() {
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
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.userData.shared = true;
  _glowTex = tex;
  return tex;
}

let _shaftTex = null;

/** 竖直渐变的「光柱」贴图：上窄下宽、上淡下浓，用来做地平线附近的体积光 */
function shaftTex() {
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
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.userData.shared = true;
  _shaftTex = tex;
  return tex;
}

// ---------------------------------------------------------------- 天空元素

/**
 * 太阳光晕：贴在太阳方向上的大 sprite，柔边、加色混合。
 * 比「一个发光的球」更像光遇里那种被云层散开的光。
 */
function makeSunHalo(sunDir, { color = 0xfff0cc, dist = 260, size = 170, opacity = 0.55 } = {}) {
  const mat = new SpriteMaterial({
    map: glowTex(),
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const s = new Sprite(mat);
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
function makeLightShafts(sunDir, { color = 0xffe6bc, count = 5, radius = 6, height = 26, opacity = 0.22 } = {}) {
  const g = new Group();
  const base = sunDir.clone().normalize();
  const side = new Vector3(0, 1, 0).cross(base);
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  side.normalize();
  const up = new Vector3().crossVectors(base, side).normalize();
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const spread = (t - 0.5) * 2; // -1..1
    const mat = new SpriteMaterial({
      map: shaftTex(),
      color,
      transparent: true,
      opacity: opacity * (0.55 + Math.random() * 0.45),
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const s = new Sprite(mat);
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
function makeMotes({ radius = 6, count = 220, color = 0xffe9c2, lift = 2.6, size = 0.16 } = {}) {
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * TAU;
    const r = Math.sqrt(1 - u * u);
    const d = new Vector3(Math.cos(a) * r, u, Math.sin(a) * r).normalize();
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
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const mat = new PointsMaterial({
    map: glowTex(),
    color,
    size,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  });
  const points = new Points(geo, mat);
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
  };
  return points;
}

// ---------------------------------------------------------------- 地表植物

function unitSpherePoint(rand) {
  const u = rand() * 2 - 1;
  const a = rand() * TAU;
  const r = Math.sqrt(1 - u * u);
  return new Vector3(Math.cos(a) * r, u, Math.sin(a) * r);
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
  const g = new BufferGeometry();
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
  g.setAttribute('position', new Float32BufferAttribute(verts, 3));
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
  const a = Math.abs(up.y) > 0.94 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const t1 = new Vector3().crossVectors(a, up).normalize();
  const t2 = new Vector3().crossVectors(up, t1).normalize();
  return up
    .clone()
    .multiplyScalar(z)
    .addScaledVector(t1, Math.cos(phi) * r)
    .addScaledVector(t2, Math.sin(phi) * r)
    .normalize();
}

function makeGrassField({
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
  const mat = new MeshLambertMaterial({
    color: 0xffffff,
    emissive: new Color(0x3f5f28),
    emissiveIntensity: 1.05,
    side: DoubleSide,
  });
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new Object3D();
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const dir = unitSpherePointIn(rand, region && region.dir, capCos);
    const h = heightAt ? heightAt(dir) : 0;
    dummy.position.copy(dir).multiplyScalar(radius + h);
    q.setFromUnitVectors(up, dir);
    const yaw = new Quaternion().setFromAxisAngle(up, rand() * TAU);
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
function makeFlowerField({
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
  const group = new Group();
  const stemGeo = bladeGeometry(0.018, 0.22);
  const stemMat = new MeshLambertMaterial({
    color: stemColor,
    emissive: new Color(stemColor).multiplyScalar(0.35),
    side: DoubleSide,
  });
  const headGeo = new IcosahedronGeometry(0.045, 0);
  const headMat = new MeshLambertMaterial({
    color: 0xffffff,
    emissive: new Color(0xffffff),
    emissiveIntensity: 0.55,
  });
  const stems = new InstancedMesh(stemGeo, stemMat, count);
  const heads = new InstancedMesh(headGeo, headMat, count);
  const dummy = new Object3D();
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const dir = unitSpherePointIn(rand, region && region.dir, capCos);
    const h = heightAt ? heightAt(dir) : 0;
    const ground = dir.clone().multiplyScalar(radius + h);
    q.setFromUnitVectors(up, dir);
    const yaw = new Quaternion().setFromAxisAngle(up, rand() * TAU);
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
function dressPlanet(chapter, o = {}) {
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
function aimArt(chapter) {
  const art = chapter.art;
  if (!art) return;
  const dir = chapter.sunDir;
  art.halo.position.copy(dir).normalize().multiplyScalar(chapter.radius * 42);
  const base = dir.clone().normalize();
  const side = new Vector3(0, 1, 0).cross(base);
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  side.normalize();
  const up = new Vector3().crossVectors(base, side).normalize();
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

/**
 * 章节基类：把「一颗星球」里所有通用部分收敛到这里。
 *
 * 一颗章节需要提供的东西只有三样：
 *   1. buildScene()  往 this.root 里摆东西，并注册交互点
 *   2. goals / opening  文案
 *   3. onInteract(id)  处理交互
 *
 * 其余（光照、天空、星空、角色、相机、交互探测、光圈、目标推进、对话锁、
 * 补光跟随、星球自转）都在基类里，避免每颗星球重复几百行终于长出 bug。
 */

/** 方位角/纬度（度）→ 单位向量 */
const D$1 = (az, lat) => sphereDir((az * Math.PI) / 180, (lat * Math.PI) / 180);

class Chapter {
  constructor(game, { radius, spinSpeed = 0.012, fog = 0x1a2244, fogDensity = 0.006, palette = 'b612' }) {
    this.game = game;
    this.radius = radius;
    this.paletteName = palette;
    this.palette = paletteOf(palette);
    this.biome = {};
    this.art = null;
    this.scene = new Scene();
    this.scene.fog = new FogExp2(fog, fogDensity);

    this.camera = new PerspectiveCamera(52, 1, 0.05, 1400);
    this.clock = new Clock();

    this.root = new Group();
    this.scene.add(this.root);
    // 相机必须和角色挂在同一个 root 下：walker.position 是 root 局部坐标，
    // 若相机留在场景（世界坐标）里，root 的倾斜与自转会让角色世界位置偏出画面，
    // 表现为「相机不跟随人物」。
    this.root.add(this.camera);

    this.spin = 0;
    this.spinSpeed = spinSpeed;

    // 每帧由 Game 用来渲染天空背景层
    this.sky = makeSkyDome();
    this.skyScene = new Scene();
    this.skyScene.add(this.sky);
    this.skyCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.interactables = [];
    this.nearest = null;
    this.busy = false;
    this.stepTimer = 0;
    this.stage = 0;
    this.goals = [];
    this.goalsDone = new Set();

    this.sunAngle = 0.42;
    this._buildLights();
    this._buildSky();
    this._buildCorners();
  }

  // ------------------------------------------------------------ 通用布景
  _buildLights() {
    this.sunDir = new Vector3(0.75, 0.35, 0.55).normalize();
    const sun = new DirectionalLight(0xffe2b8, 2.5);
    sun.position.copy(this.sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -12e-4;
    this.root.add(sun);
    this.sun = sun;

    this.hemi = new HemisphereLight(0x6f7fc4, 0x2a2418, 1.05);
    this.root.add(this.hemi);
  }

  _buildSky() {
    this.stars = makeStars(2400, 360);
    this.scene.add(this.stars);
  }

  /** 角色、光圈、对话、交互注册的公共部分 */
  _buildCorners() {
    this.avatar = new PrinceAvatar();
    this.avatar.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.root.add(this.avatar.root);

    this.walker = new PlanetWalker(this.avatar.root, this.radius, { standHeight: 0.02 });
    this.walker.camDist = 4.0;

    // 跟随相机的补光：黄昏/夜晚保证主角从背景里分离出来
    this.fillLight = new DirectionalLight(0xfff0d6, 0.6);
    this.fillLight.castShadow = false;
    this.root.add(this.fillLight);
    this.root.add(this.fillLight.target);

    // 交互光圈
    this.ring = new Mesh(
      new RingGeometry(0.26, 0.34, 28),
      new MeshBasicMaterial({
        color: 0xe8c87a,
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        depthWrite: false,
      })
    );
    this.root.add(this.ring);

    // 星光特效池：目标达成时撒一把光点、发现地点时扩散一圈光环。
    // 只共用一张 32×32 的径向渐变贴图，几何体按需创建并复用。
    this.fx = new FxPool(this.root);
    this.seen = new Set();

    this.dialogue = new Dialogue(
      document.getElementById('dialogue'),
      document.getElementById('dlg-line'),
      document.getElementById('dlg-speaker'),
      document.getElementById('dlg-advance')
    );
  }

  /** 子类用：注册一个可交互点 */
  addInteract({ id, dir, radius = 1.35, label, priority = 3, enabled }) {
    this.interactables.push({
      id,
      pos: dir.clone().normalize().multiplyScalar(this.radius),
      radius,
      label,
      priority,
      enabled: enabled || (() => true),
    });
  }

  /** 降落在某个可互动点附近，并让镜头看向它。
   * 之前的出生点都放在星球另一侧（约 180°），玩家一进来只能看到空地，
   * 得盲走一段才碰得到东西。现在统一改成「落在目标斜前方 32°」。
   * @param {string} [id] 目标交互点 id；省略则取优先级最高的
   * @param {number} [deg] 与目标的角距离（度）
   */
  _spawnNearTarget(id, deg = 32) {
    const list = this.interactables.filter((i) => !id || i.id === id);
    const target = list.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3))[0];
    if (!target || !this.walker) return;
    const w = this.walker;
    // 绕一条与目标方向垂直的轴转 deg 度，落到目标斜前方
    const d = target.pos.clone().normalize();
    const axis = new Vector3(0, 1, 0).cross(d);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0).cross(d);
    axis.normalize();
    const q = new Quaternion().setFromAxisAngle(axis, MathUtils.degToRad(deg));
    w.spawn(d.clone().applyQuaternion(q));
    this._faceFirstTarget(id);
  }

  /**
   * 落地后把镜头转向最近的（或指定的）可互动点。
   * 星球是球面，道具在球的另一侧时开局只能看到一片空地，
   * 玩家会以为这关没内容。这里直接把相机转过去。
   * @param {string} [id] 目标交互点 id；省略则取优先级最高的
   */
  _faceFirstTarget(id) {
    const list = this.interactables.filter((i) => !id || i.id === id);
    const target = list.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3))[0];
    if (!target || !this.walker) return;

    const w = this.walker;
    // 目标方向 = 目标位置在「脚下切平面」上的投影。
    // 直接用 pos 差不行：出生点常常就在目标旁边，差值几乎沿着法线，
    // 投到切平面后长度趋近 0，算出来的朝向是乱数（实测会让相机对着虚空）。
    const aim = target.pos.clone().addScaledVector(w.up, -target.pos.dot(w.up));
    if (aim.length() < this.radius * 0.12) {
      // 目标几乎在正下方/正上方：先沿任意切向退开，保证投影有效
      const away = new Vector3(0, 1, 0).cross(w.up);
      if (away.lengthSq() < 1e-6) away.set(1, 0, 0).cross(w.up);
      w.position.addScaledVector(away.normalize(), this.radius * 0.35);
      w.sync(true);
      aim.copy(target.pos).addScaledVector(w.up, -target.pos.dot(w.up));
    }
    w.lookToward(aim);
  }

  /** 配色在白天/夜晚之间插值 */
  _dayK() {
    return MathUtils.clamp((this.sunAngle + 0.22) / 0.64, 0, 1);
  }

  _applySun() {
    const el = MathUtils.clamp(this.sunAngle, -0.5, 1.2);
    this.sunDir.set(Math.cos(el) * 0.86, Math.sin(el), Math.cos(el) * 0.42).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(60);

    const u = this.sky.userData.uniforms;
    u.sunDir.value.copy(this.sunDir);

    const k = this._dayK();
    // 柔光调色：night / dusk / day 三段，k 越高越亮。
    // 用两段 lerp 而不是一条直线，黄昏才有「粉紫 → 杏金」的过渡。
    const pal = this.palette || paletteOf('b612');
    const night = pal.night.map((h) => new Color(h));
    const dusk = pal.dusk.map((h) => new Color(h));
    const day = pal.day.map((h) => new Color(h));
    const bands = [night, dusk, day];
    const pick = (i) => {
      const c = new Color();
      if (k > 0.45) {
        const t = MathUtils.clamp((k - 0.45) / 0.55, 0, 1);
        c.copy(bands[1][i]).lerp(bands[2][i], t);
      } else {
        const t = MathUtils.clamp(k / 0.45, 0, 1);
        c.copy(bands[0][i]).lerp(bands[1][i], t);
      }
      return c;
    };
    u.topColor.value.copy(pick(0));
    u.midColor.value.copy(pick(1));
    u.botColor.value.copy(pick(2));
    u.glowColor.value.set(pal.glow);
    u.glowAmount.value = 0.55 + k * 0.7;
    if (u.hazeColor) u.hazeColor.value.set(pal.haze);
    if (u.hazeAmount) u.hazeAmount.value = 0.16 + k * 0.26;

    // 空气透视：雾色跟着地平线走，远处的东西才会「化」进天空里
    if (this.scene && this.scene.fog) {
      this.scene.fog.color.copy(pick(2)).lerp(pick(1), 0.4);
    }

    this.sun.intensity = 0.5 + k * 3.0;
    this.sun.color.setHSL(0.085, 0.42, 0.68 + k * 0.14);
    this.hemi.intensity = 1.15 + k * 1.35;
    this.hemi.color.copy(pick(1)).lerp(new Color(0xffffff), 0.35);
    this.hemi.groundColor.copy(pick(2)).multiplyScalar(0.55);
    this.fillLight.intensity = 0.7 + (1 - k) * 1.6;
    if (this.stars) this.stars.material.opacity = 0.12 + (1 - k) * 0.85;
    if (this.art) aimArt(this);
  }

  // ------------------------------------------------------------ 生命周期
  onEnter() {
    this.game.showHud(true);
    this._updateGoalChip();
    this._dressBiome();
    this.busy = true;
    this.dialogue.play(this.opening(), () => {
      this.busy = false;
      this._markGoal(0);
    });
    audio.startMusic();
  }

  /**
   * 铺「柔光地表」：太阳光晕、体积光柱、光尘、草叶、野花。
   * 每章的场景不同，所以参数由章节在构造里写在 `this.biome`（沙漠就不铺草）。
   * 只做一次，重复进出章节会重新构建。
   */
  _dressBiome() {
    if (this.art) return;
    dressPlanet(this, {
      palette: this.paletteName,
      ...this.biome,
    });
  }

  onExit() {
    this.dialogue.stop();
    audio.stopMusic();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  opening() {
    return [];
  }

  // ------------------------------------------------------------ 每帧
  update(dt) {
    const input = this.game.input;
    this._extraTick && this._extraTick(dt);

    if (!this.busy) {
      const move = { x: input.move.x, y: input.move.y, run: input.moveMagnitude > 0.92 };
      const look = input.consumeLook();
      const lookScaled = {
        x: look.x * (input.lookSensitivity || 1),
        y: look.y * (input.lookSensitivity || 1),
      };
      this.walker.update(dt, move, lookScaled, false);

      if (this.walker.onGround && input.moveMagnitude > 0.15) {
        this.stepTimer -= dt * (input.moveMagnitude > 0.9 ? 1.7 : 1);
        if (this.stepTimer <= 0) {
          audio.step(0.7 + Math.random() * 0.3);
          this.stepTimer = 0.42;
        }
      }
      this.avatar.update(dt, input.moveMagnitude, input.moveMagnitude > 0.15);
    } else {
      this.avatar.update(dt, 0, false);
      input.consumeLook();
    }

    input.consumeJump();
    // 靠近可交互物时镜头轻轻推近一点，让「这里可以互动」在视觉上也被感知
    this.walker.focusBias = this.nearest ? 0.86 : 1;
    this.walker.updateCamera(this.camera, dt);

    if (this.fillLight) {
      this.fillLight.position.copy(this.camera.position).addScaledVector(this.walker.up, 1.2);
      this.fillLight.target.position.copy(this.walker.position);
      this.fillLight.target.updateMatrixWorld();
    }

    this.spin += dt * this.spinSpeed;
    this.root.rotation.y = this.spin;
    this.stars.rotation.y -= dt * 0.0016;

    this._animateEnv && this._animateEnv(dt);
    this.fx && this.fx.update(dt);
    // 柔光层：光尘缓慢上升、太阳光晕呼吸
    if (this._artTick) this._artTick(dt, this.clock.elapsedTime);
    this.ring.material.opacity = Math.max(0, this.ring.material.opacity - dt * 1.6);

    if (!this.busy) this._updateInteraction();

    this.dialogue.update(dt);
    if (this.dialogue.isActive) this.busy = true;
  }

  // ------------------------------------------------------------ 交互
  _updateInteraction() {
    const p = this.walker.position;
    let best = null;
    let bestScore = Infinity;

    for (const it of this.interactables) {
      // 兼容旧章节直接 push 的交互点（没有 enabled / priority 字段）
      if (it.enabled && !it.enabled()) continue;
      // 角色与交互点都在球面上，直接用两点距离。
      // 早先这里写成「距离 - 星球半径」，阈值等于放宽了一个星球半径（5–6 m），
      // 隔着大半个星球都能互动。INTERACT_REACH 再把各章配置的半径收紧，需要走到跟前。
      const d = p.distanceTo(it.pos);
      const score = d + (it.priority ?? 3) * 0.01;
      if (d < it.radius * INTERACT_REACH && score < bestScore) {
        bestScore = score;
        best = it;
      }
    }

    this.nearest = best;
    const prompt = document.getElementById('prompt');
    const label = document.getElementById('prompt-label');
    if (best) {
      label.textContent = t(best.label);
      setVisible(prompt, true);
      requestAnimationFrame(() => prompt.classList.add('show'));
      const n = best.pos.clone().normalize();
      this.ring.position.copy(n).multiplyScalar(this.radius + 0.02);
      this.ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
      this.ring.material.opacity = 0.55;
      this.avatar.lookAtPoint(best.pos);

      // 第一次走到某个地点：记一笔探索度、扩散一圈光环、弹一条提示
      if (!this.seen.has(best.id)) {
        this.seen.add(best.id);
        const cid = this.game.chapterId;
        if (cid && this.game.markExplored) {
          this.game.markExplored(cid, best.id, this.interactables.length);
          this.game.renderGoals(this.goals, this.goalsDone, this.stage);
        }
        const n2 = best.pos.clone().normalize();
        this.fx && this.fx.pulse(best.pos.clone(), n2);
        toast(t('发现') + ' · ' + t(best.label), 'find');
        audio.chime(523);
      }
    } else {
      prompt.classList.remove('show');
      setTimeout(() => {
        if (!this.nearest) setVisible(prompt, false);
      }, 220);
    }
  }

  interact() {
    if (this.busy) return;
    if (!this.nearest) return;
    audio.click();
    this.onInteract(this.nearest.id);
  }

  onInteract() {}

  // ------------------------------------------------------------ 目标
  _markGoal(i) {
    if (this.goalsDone.has(i)) return;
    this.goalsDone.add(i);
    this.stage = Math.max(this.stage, i);
    this._updateGoalChip();
    this.game.renderGoals(this.goals, this.goalsDone, this.stage);
    // 目标完成的正反馈：脚下撒一把金色光点 + 顶部提示
    const up = this.walker.up.clone();
    const pos = this.walker.position.clone();
    this.fx && this.fx.burst(pos, up, { count: 26 });
    this.fx && this.fx.pulse(pos, up, { color: 0xffe6a8 });
    const doneCount = this.goalsDone.size;
    toast(`${t('目标完成')} · ${doneCount}/${this.goals.length}`, 'goal');
    audio.chime(660);
  }

  _updateGoalChip() {
    const el = document.getElementById('hud-goal');
    const txt = document.getElementById('hud-goal-text');
    const next = this.goals.findIndex((_, i) => !this.goalsDone.has(i));
    if (next === -1) {
      setVisible(el, false);
      return;
    }
    setVisible(el, true);
    txt.textContent = `${t('任务')} ${this.goalsDone.size}/${this.goals.length} · ${t(this.goals[next])}`;
    // 目标清单里的「任务 x/y · 探索 z%」
    const sub = document.getElementById('goals-sub');
    if (sub) {
      const cid = this.game.chapterId;
      const pct = cid && this.game.explorePct ? this.game.explorePct(cid) : 0;
      sub.textContent = `${t('任务')} ${this.goalsDone.size}/${this.goals.length} · ${t('探索')} ${pct}%`;
    }
  }

  _say(lines, onEnd) {
    this.busy = true;
    this.dialogue.play(lines, () => {
      this.busy = false;
      if (onEnd) onEnd();
    });
  }

  /** 章节完成后交回地图（Game.completeChapter 接收的是星球 id） */
  _finish() {
    this._say([{ text: '他在这里待不久。他还要去别的地方看看。' }], () => {
      this.game.completeChapter(this.game.chapterId);
    });
  }

  /**
   * 彻底释放本章占用的 GPU/CPU 资源。
   * 之前只有 B-612 实现了 dispose，其余章节每进出一次就漏掉 37 个 geometry，
   * 连点几次就会把 iOS 的内存预算吃穿，所以提到基类统一处理。
   */
  dispose() {
    const seenGeo = new Set();
    const seenMat = new Set();
    const seenTex = new Set();

    const freeTex = (t) => {
      if (!t || !t.isTexture || seenTex.has(t)) return;
      seenTex.add(t);
      // 特效池的光晕贴图是全局共享的（fx.js 里 userData.shared），
      // 章节 dispose 时不能释放，否则下一章的光点会变成黑块
      if (t.userData && t.userData.shared) return;
      t.dispose();
    };

    const freeMat = (m) => {
      if (!m || seenMat.has(m)) return;
      seenMat.add(m);
      // 材质上挂的贴图必须单独释放，否则 GPU 显存不会回收
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (v && v.isTexture) freeTex(v);
      }
      if (m.uniforms) {
        for (const u of Object.values(m.uniforms)) {
          if (u && u.value && u.value.isTexture) freeTex(u.value);
        }
      }
      m.dispose();
    };

    for (const scene of [this.scene, this.skyScene]) {
      if (!scene) continue;
      scene.traverse((o) => {
        if (o.geometry && !seenGeo.has(o.geometry)) {
          seenGeo.add(o.geometry);
          // dispose() 只释放 GPU 侧；JS 侧的 Float32Array/Uint16Array 还要靠
          // 断开 attribute 引用才回收得掉（实测不清理时每轮残留 ~660 个 ArrayBuffer）
          for (const name of Object.keys(o.geometry.attributes || {})) {
            const attr = o.geometry.attributes[name];
            // Sprite/Particle 用的是共享的 InterleavedBufferAttribute，
            // 它的 array 是只读 getter，直接赋值会抛
            // TypeError: Cannot set property array of #<InterleavedBufferAttribute>
            if (attr && attr.array && !attr.isInterleavedBufferAttribute) {
              if (typeof attr.array.length === 'number' && attr.array.length > 0) {
                // 保留一个空数组占位，避免别处还在读 length
                attr.array = new attr.array.constructor(0);
              }
            }
          }
          if (o.geometry.index && !o.geometry.index.isInterleavedBufferAttribute) {
            o.geometry.index.array = new o.geometry.index.array.constructor(0);
          }
          if (o.geometry.morphAttributes) {
            for (const k of Object.keys(o.geometry.morphAttributes)) o.geometry.morphAttributes[k] = [];
          }
          o.geometry.dispose();
        }
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(freeMat);
          else freeMat(o.material);
        }
        // 阴影用的 WebGLRenderTarget 不在材质里，必须显式释放。
        // 漏掉它每进出一次章节就留一张 1024×1024 深度图（≈4 MB），
        // 之前测到的「每轮稳定 +4.2 MB」就是它。
        if (o.isLight && o.shadow && o.shadow.map) {
          o.shadow.map.dispose();
          o.shadow.map = null;
          if (o.shadow.mapPass) {
            o.shadow.mapPass.dispose && o.shadow.mapPass.dispose();
            o.shadow.mapPass = null;
          }
        }
      });
      // 断开引用，让整棵子图进入 GC
      while (scene.children.length) scene.remove(scene.children[0]);
    }

    if (this.dialogue) (this.dialogue.dispose || this.dialogue.stop).call(this.dialogue);
    if (this.fx) {
      this.fx.dispose();
      this.fx = null;
    }
    this.seen = null;
    this.interactables = [];
    this.art = null;
    this.biome = {};
    this.starPile = null;
    this.flags = null;
    this.bottles = null;
    this.ledgers = null;
    this.books = null;
    this.garden = null;
    this.avatar = null;
    this.walker = null;
    this.planet = null;
    this.sky = null;
    this.stars = null;
    this.sun = null;
    this.hemi = null;
    this.fillLight = null;
    this.ring = null;
    // 最后断开对 Game 的引用：章节与 Game 之间是双向引用，
    // 只要有任何一方被外部（比如 rAF 回调闭包）抓住，整棵场景图就回收不了。
    this.game = null;
  }
}

/**
 * 第一章：B-612 · 家园
 * 原站事件链（LPStrings 5.1）：
 *   四处走走 → 去看看玫瑰花 → 去工具棚拿水壶 → 去泉眼打水 →
 *   最后一次给她浇水 → 看最后一场日落 → 去星球边上的椅子坐下 → 启程
 */

const D = (az, lat) => sphereDir((az * Math.PI) / 180, (lat * Math.PI) / 180);

class B612Chapter {
  constructor(game) {
    this.game = game;
    // 基类与调试工具都按 this.radius 找星球半径，这里显式暴露出来
    this.radius = R$7;
    this.scene = new Scene();
    this.scene.fog = new FogExp2(0x1a2244, 0.006);

    this.camera = new PerspectiveCamera(52, 1, 0.05, 1400);
    this.clock = new Clock();

    // 世界根（包含星球与所有物体），自转轴略微倾斜
    this.root = new Group();
    this.root.rotation.z = 0.16;
    this.scene.add(this.root);
    // 相机与角色同挂 root（walker.position 是 root 局部坐标）：
    // 否则 root 的倾斜 + 自转会把角色推到世界坐标的画面之外，看起来像「相机没跟随」。
    this.root.add(this.camera);

    this.spin = 0; // 星球自转角
    this.spinSpeed = 0.012; // 弧度/秒（让星空缓慢移动）

    this._build();
    this._buildState();
  }

  // ------------------------------------------------------------ 场景
  _build() {
    const scene = this.scene;

    // 光照：一个从侧面来的暖光 + 极弱的环境，模拟「远处有颗太阳」
    this.sunDir = new Vector3(0.75, 0.35, 0.55).normalize();
    const sun = new DirectionalLight(0xffe2b8, 2.5);
    sun.position.copy(this.sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -12e-4;
    this.root.add(sun);
    this.sun = sun;

    const amb = new HemisphereLight(0x6f7fc4, 0x2a2418, 1.05);
    this.root.add(amb);
    this.hemi = amb;

    // 天空与星空：天空作为背景层单独渲染（见 Game._tick）
    this.sky = makeSkyDome();
    this.skyScene = new Scene();
    this.skyScene.add(this.sky);
    this.skyCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.stars = makeStars(2400, 360);
    scene.add(this.stars);

    // 星球：起伏的沙丘 + 顶点色（沙地 / 苔藓 / 岩坡 / 火山玄武岩）+ 一条踩出来的小径
    this.planet = makeB612Planet();
    this.root.add(this.planet);

    // 草丛与小雏菊：撒在几个方向上，给地面一点密度
    this.grass = [];
    for (const [az, lat, s] of [
      [-20, -8, 1.15], [30, -22, 0.95], [-70, 6, 1.05], [95, -30, 0.9], [-100, 30, 1.1],
      [150, -40, 1.0], [10, 30, 0.85], [-150, -12, 1.0], [70, 20, 0.95], [180, 8, 0.9],
      [-45, -32, 0.8], [40, 12, 0.9],
    ]) {
      const dir = D(az, lat);
      const g = makeB612Grass();
      g.scale.setScalar(s);
      placeOnSphere(g, dir, b612HeightAt(dir), R$7);
      this.root.add(g);
      this.grass.push(g);
    }

    // 三座火山：两座活着的、一座熄灭的（层状剖面 + 火山口环 + 烟雾）
    this.volcanoes = [];
    for (const v of B612.volcanoes) {
      const g = makeB612Volcano(v.scale, v.alive);
      placeOnSphere(g, v.dir, b612HeightAt(v.dir) - 0.02, R$7);
      if (!v.alive) {
        g.userData.magma.material.color.setHex(0x2c2620);
        g.userData.magma.visible = false;
        if (g.userData.flow) g.userData.flow.visible = false;
        if (g.userData.smoke) g.userData.smoke.visible = false;
      }
      this.root.add(g);
      this.volcanoes.push(g);
    }

    // 玫瑰（南半球，离玩家出生点不远）：花 + 背后的木栅栏 + 旁边石座上的玻璃罩
    this.roseDir = B612.rose.clone();
    this.roseGroup = new Group();
    this.rose = makeB612Rose();
    this.roseGroup.add(this.rose);
    placeOnSphere(this.roseGroup, this.roseDir, b612HeightAt(this.roseDir) - 0.005, R$7);
    this.root.add(this.roseGroup);

    this.fence = makeB612Fence();
    placeOnSphere(this.fence, FENCE_DIR, b612HeightAt(FENCE_DIR) - 0.01, R$7);
    this._faceTangent(this.fence, FENCE_DIR, B612.rose);
    this.root.add(this.fence);

    this.pedestal = makeB612Pedestal();
    placeOnSphere(this.pedestal, GLOBE_DIR, b612HeightAt(GLOBE_DIR) - 0.005, R$7);
    this.root.add(this.pedestal);

    this.globeGroup = new Group();
    this.globe = makeB612Globe();
    this.globe.visible = true;
    this.globeGroup.add(this.globe);
    // 玻璃罩坐在石座上：石座高 0.24 m
    placeOnSphere(this.globeGroup, GLOBE_DIR, b612HeightAt(GLOBE_DIR) + 0.235, R$7);
    this.root.add(this.globeGroup);
    this.globeOn = true;
    this.watered = false;

    // 工具棚
    this.shedDir = B612.shed.clone();
    this.shed = makeB612Shed();
    placeOnSphere(this.shed, this.shedDir, b612HeightAt(this.shedDir) - 0.01, R$7);
    this.root.add(this.shed);

    // 泉眼
    this.springDir = B612.spring.clone();
    this.spring = makeB612Spring();
    placeOnSphere(this.spring, this.springDir, b612HeightAt(this.springDir) - 0.01, R$7);
    this.root.add(this.spring);

    // 水壶（初始在工具棚旁边）
    this.canHome = B612.can.clone();
    this.can = makeWateringCan();
    this.canPos = this.canHome.clone();
    placeOnSphere(this.can, this.canPos, b612HeightAt(this.canPos) + 0.01, R$7);
    this.root.add(this.can);
    this.carried = false;
    this.filled = false;

    // 椅子（星球边缘，面向日落方向）
    this.chairDir = B612.chair.clone();
    this.chair = makeChair();
    placeOnSphere(this.chair, this.chairDir, b612HeightAt(this.chairDir) - 0.005, R$7);
    // 椅背朝向太阳：坐下时正对日落
    this._aimChairAtSun();
    this.root.add(this.chair);

    // 草甸上的野花（实例化，一次 draw call）、苔石、石圈里的毯子
    this.flowers = makeB612Flowers(260);
    this.root.add(this.flowers);

    this.boulders = [];
    for (const [az, lat, sc] of [
      [-8, -34, 1.0], [22, -30, 0.85], [-52, 22, 1.1], [86, 8, 0.9], [128, 30, 0.95],
      [172, -18, 1.15], [-96, -28, 0.8], [38, 44, 1.0], [-140, 34, 0.9],
    ]) {
      const dir = D(az, lat);
      const b = makeB612Boulder(sc);
      placeOnSphere(b, dir, b612HeightAt(dir) - 0.02, R$7);
      b.rotation.y = az * 0.07;
      this.root.add(b);
      this.boulders.push(b);
    }

    this.nook = makeB612Nook();
    placeOnSphere(this.nook, B612.nook, b612HeightAt(B612.nook) - 0.005, R$7);
    this.root.add(this.nook);

    // 小径两侧的碎石、要趁早拔掉的猴面包树幼苗、夜里绕在玫瑰与泉眼旁的萤火
    this.pebbles = makeB612Pebbles(110);
    this.root.add(this.pebbles);
    this.baobabs = [];
    for (const dir of [D(-74, -22), D(-16, 12), D(104, -34)]) {
      const s = makeBaobabSprout();
      placeOnSphere(s, dir, b612HeightAt(dir), R$7);
      s.rotation.y = Math.random() * Math.PI * 2;
      this.root.add(s);
      this.baobabs.push(s);
    }
    this.fireflies = makeB612Fireflies(30);
    this.root.add(this.fireflies);

    // 玩家
    this.avatar = new PrinceAvatar();
    this.avatar.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.root.add(this.avatar.root);
    // 地形有起伏：把高度函数交给 walker，角色脚底始终贴着沙丘走
    this.walker = new PlanetWalker(this.avatar.root, R$7, { standHeight: 0.02, heightAt: b612HeightAt });
    // 角色补光（跟随角色的柔和方向光）：黄昏/夜晚保证主角从背景里分离出来。
    // 实测日落时角色与两侧背景亮度差只有 -1.1，人几乎消失在画面里。
    this.fillLight = new DirectionalLight(0xfff0d6, 0);
    this.fillLight.castShadow = false;
    this.root.add(this.fillLight);
    this.root.add(this.fillLight.target);
    // 出生在玫瑰与工具棚之间
    this.walker.spawn(B612.spawn);
    this.walker.camDist = 4.0;

    // 交互点注册
    this.interactables = [];
    this._registerInteractables();
    // 拾取光圈（靠近时出现在地面）
    this.ring = new Mesh(
      new RingGeometry(0.26, 0.34, 28),
      new MeshBasicMaterial({ color: 0xe8c87a, transparent: true, opacity: 0.0, side: DoubleSide, depthWrite: false })
    );
    this.root.add(this.ring);
    // 星光特效池 + 已发现地点（与基类同名，保持两套章节结构一致）
    this.fx = new FxPool(this.root);
    this.seen = new Set();

    // 太阳位置（日落动画用）
    this.sunAngle = 0.42; // 弧度，>0 在地平线上
    this.sunsetDone = false;

    // 柔光层：太阳光晕、体积光柱、空气里的光尘。
    // B-612 自己已经有草丛与野花（b612-scene.js），这里不再撒草，只补「空气感」。
    this.paletteName = 'b612';
    this.palette = paletteOf('b612');
    this._dayK = () =>
      MathUtils.clamp((MathUtils.clamp(this.sunAngle, -0.5, 1.2) + 0.22) / 0.64, 0, 1);
    dressPlanet(this, {
      palette: 'b612',
      grass: 0,
      flowers: 0,
      motes: 320,
      motesColor: 0xffeccb,
      shafts: 5,
      seed: 12,
    });
    this._applySun();

    // 对话
    this.dialogue = new Dialogue(
      document.getElementById('dialogue'),
      document.getElementById('dlg-line'),
      document.getElementById('dlg-speaker'),
      document.getElementById('dlg-advance')
    );

    // 开局镜头正对玫瑰：她是这一章的第一个目标，也是整篇的题眼。
    // B-612 早于 Chapter 基类写成，没有 _faceFirstTarget()，这里就地实现。
    {
      const rose = this.interactables.find((i) => i.id === 'roseTalk');
      if (rose) {
        const aim = rose.pos.clone().addScaledVector(this.walker.up, -rose.pos.dot(this.walker.up));
        if (aim.length() < R$7 * 0.12) {
          const away = new Vector3(0, 1, 0).cross(this.walker.up);
          if (away.lengthSq() < 1e-6) away.set(1, 0, 0).cross(this.walker.up);
          this.walker.position.addScaledVector(away.normalize(), R$7 * 0.35);
          this.walker.sync(true);
          aim.copy(rose.pos).addScaledVector(this.walker.up, -rose.pos.dot(this.walker.up));
        }
        this.walker.lookToward(aim);
      }
    }
  }

  _registerInteractables() {
    // 门槛写成 enabled 回调（而不是散落在 _updateInteraction 里的 if），
    // 这样基类的探测、测试脚本、以及 HUD 提示都读同一份规则。
    const add = (id, dir, radiusWorld, label, priority, enabled) => {
      // 交互点跟着地形高度走，提示光圈才不会浮在半空或陷进沙里
      const wpos = dir.clone().normalize().multiplyScalar(R$7 + b612HeightAt(dir));
      this.interactables.push({ id, pos: wpos, radius: radiusWorld, label, priority, enabled });
    };
    // 玫瑰与玻璃罩在同一处：同一半径，靠优先级决定显示哪个提示
    add('roseTalk', this.roseDir, 1.45, '交谈', 1, () => this.stage < 2);
    add('rose', this.roseDir, 1.45, '给玫瑰浇水', 0, () => this.carried && this.filled && !this.watered);
    add('globe', this.roseDir, 1.35, '拿起玻璃罩', 2, () => this.globeOn && this.stage < 2);
    add('can', this.canHome, 1.25, '拿起水壶', 3, () => !this.carried && this.stage < 5);
    add('spring', this.springDir, 1.35, '打水', 3, () => this.carried && !this.filled && this.stage < 5);
    // 椅子在「浇完最后一次水」之后就该能坐（stage>=5），
    // 不能用 sunsetDone 当门槛——那个标志正是坐下之后才置位的，会死锁。
    add('chair', this.chairDir, 1.35, '坐下', 3, () => this.stage >= 5 && !this.sunsetDone);
  }

  // ------------------------------------------------------------ 状态机
  _buildState() {
    this.stage = 0;
    this.goals = [
      '四处走走，熟悉一下这颗星球',
      '去看看玫瑰花',
      '去工具棚拿水壶',
      '去泉眼打水',
      '最后一次给她浇水',
      '看最后一场日落',
      '去星球边上的椅子坐下',
    ];
    this.goalsDone = new Set();
    this.nearest = null;
    this.busy = false; // 对话进行中时锁定移动
    this.stepTimer = 0;
  }

  onEnter() {
    this.game.showHud(true);
    this._updateGoalChip();
    // 开场旁白
    const opening = [
      { text: '这里是 B-612，小王子的家。只比一座房子大一点，有三座火山和一朵玫瑰。' },
      { text: '四处走走，熟悉一下这颗星球' },
    ];
    this.busy = true;
    this.dialogue.play(opening, () => {
      this.busy = false;
      this._markGoal(0);
    });
    audio.startMusic();
  }

  onExit() {
    this.dialogue.stop();
    audio.stopMusic();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ 每帧
  update(dt) {
    const input = this.game.input;
    this._tickSunset(dt);

    if (!this.busy) {
      const move = {
        x: input.move.x,
        y: input.move.y,
        run: input.moveMagnitude > 0.92,
      };
      const look = input.consumeLook();
      const lookScaled = { x: look.x * (input.lookSensitivity || 1), y: look.y * (input.lookSensitivity || 1) };
      this.walker.update(dt, move, lookScaled, false);

      // 脚步声
      if (this.walker.onGround && input.moveMagnitude > 0.15) {
        this.stepTimer -= dt * (input.moveMagnitude > 0.9 ? 1.7 : 1);
        if (this.stepTimer <= 0) {
          audio.step(0.7 + Math.random() * 0.3);
          this.stepTimer = 0.42;
        }
      }
      this.avatar.update(dt, input.moveMagnitude, input.moveMagnitude > 0.15);
    } else {
      this.avatar.update(dt, 0, false);
      input.consumeLook();
    }

    input.consumeJump();
    // 靠近可交互物时镜头轻轻推近，离开后回落
    this.walker.focusBias = this.nearest ? 0.86 : 1;
    this.walker.updateCamera(this.camera, dt);

    // 角色补光跟着相机走（从观察者方向打光），主角始终有立体感
    if (this.fillLight) {
      const up = this.walker.up;
      this.fillLight.position
        .copy(this.camera.position)
        .addScaledVector(up, 1.2);
      this.fillLight.target.position.copy(this.walker.position);
      this.fillLight.target.updateMatrixWorld();
    }

    // 星球缓慢自转 + 星空反向，制造「在星空中漂浮」
    this.spin += dt * this.spinSpeed;
    this.root.rotation.y = this.spin;
    this.stars.rotation.y -= dt * 0.0016;

    // 动画细节
    this._animateEnv(dt);
    this.fx && this.fx.update(dt);
    if (this._artTick) this._artTick(dt, this.clock.elapsedTime);
    this.ring.material.opacity = Math.max(0, this.ring.material.opacity - dt * 1.6);

    // 交互检测
    if (!this.busy) this._updateInteraction();

    this.dialogue.update(dt);
    if (this.dialogue.isActive) this.busy = true;
  }

  _animateEnv(dt) {
    const time = this.clock.elapsedTime;
    // 活火山口呼吸 + 烟柱慢慢转 + 熔岩流淌
    for (const v of this.volcanoes) {
      const mg = v.userData.magma;
      if (mg && mg.visible) {
        const p = (mg.userData.pulse || 0) + time * 1.5;
        mg.material.color.setHSL(0.045 + Math.sin(p) * 0.012, 0.95, 0.52 + Math.sin(p) * 0.06);
      }
      if (v.userData.smoke) v.userData.smoke.rotation.y += dt * (v.userData.smoke.userData.spin || 0.1);
      if (v.userData.flow) v.userData.flow.material.color.setHSL(0.05, 0.9, 0.5 + Math.sin(time * 2.4 + v.position.x) * 0.08);
    }
    // 泉水：水面呼吸 + 涟漪一圈圈推开
    const w = this.spring.userData.water;
    if (w) {
      w.material.opacity = 0.86 + Math.sin(time * 1.2) * 0.05;
      w.scale.setScalar(1 + Math.sin(time * 0.9) * 0.012);
    }
    for (const ring of this.spring.userData.rings || []) {
      const i = ring.userData.ringIndex;
      const k = ((time * 0.35 + i * 0.33) % 1);
      ring.scale.setScalar(0.35 + k * 2.6);
      ring.material.opacity = Math.max(0, 0.34 - i * 0.07) * (1 - k);
    }
    // 玫瑰轻微摇曳
    this.rose.rotation.z = Math.sin(time * 0.9) * 0.025;
    this.rose.rotation.x = Math.cos(time * 0.7) * 0.018;
    // 萤火：每只在原地小幅绕圈 + 明暗呼吸
    const ff = this.fireflies;
    if (ff && ff.userData.base) {
      const pos = ff.geometry.attributes.position;
      for (let i = 0; i < ff.userData.base.length; i++) {
        const b = ff.userData.base[i];
        const a = time * b.sp + b.ph;
        pos.setXYZ(i, b.p.x + Math.cos(a) * 0.08, b.p.y + Math.sin(a * 1.3) * 0.06, b.p.z + Math.sin(a) * 0.08);
      }
      pos.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ 交互
  _updateInteraction() {
    const p = this.walker.position;
    let best = null;
    let bestScore = Infinity;

    for (const it of this.interactables) {
      // 门槛统一由 enabled 回调给出（见 _registerInteractables）
      if (it.enabled && !it.enabled()) continue;

      // 同一处多个候选时按优先级取舍
      const priority = it.priority ?? 3;
      // 两点都在球面上，直接比距离（早先减去了星球半径，阈值被放宽了 6 m）
      const d = p.distanceTo(it.pos);
      const score = d + priority * 0.01;
      if (d < it.radius * INTERACT_REACH && score < bestScore) {
        bestScore = score;
        best = it;
      }
    }

    this.nearest = best;
    const prompt = document.getElementById('prompt');
    const label = document.getElementById('prompt-label');
    if (best) {
      label.textContent = t(best.label);
      setVisible(prompt, true);
      requestAnimationFrame(() => prompt.classList.add('show'));
      // 光圈落到交互点地面
      const n = best.pos.clone().normalize();
      this.ring.position.copy(n).multiplyScalar(R$7 + b612HeightAt(n) + 0.02);
      this.ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
      this.ring.material.opacity = 0.55;
      // 角色看向交互点
      this.avatar.lookAtPoint(best.pos);

      // 第一次走到某个地点：记探索度、扩散光环、弹提示
      if (!this.seen.has(best.id)) {
        this.seen.add(best.id);
        const cid = this.game.chapterId;
        if (cid && this.game.markExplored) {
          this.game.markExplored(cid, best.id, this.interactables.length);
          this.game.renderGoals(this.goals, this.goalsDone, this.stage);
        }
        this.fx && this.fx.pulse(best.pos.clone(), best.pos.clone().normalize());
        toast(t('发现') + ' · ' + t(best.label), 'find');
        audio.chime(523);
      }
    } else {
      prompt.classList.remove('show');
      setTimeout(() => {
        if (!this.nearest) setVisible(prompt, false);
      }, 220);
    }

    // 阶段推进：走近玫瑰
    if (best && (best.id === 'roseTalk' || best.id === 'rose') && this.stage === 0) {
      this._markGoal(1);
    }
  }

  /** 由 HUD 的提示按钮触发 */
  interact() {
    if (this.busy) return;
    const it = this.nearest;
    if (!it) return;
    audio.click();

    switch (it.id) {
      case 'roseTalk':
        this._talkToRose();
        break;
      case 'rose':
        this._waterRose();
        break;
      case 'can':
        this._takeCan();
        break;
      case 'spring':
        this._fillCan();
        break;
      case 'chair':
        this._sitAndWatchSunset();
        break;
      case 'globe':
        this._liftGlobe();
        break;
    }
  }

  // ------------------------------------------------------------ 事件
  _markGoal(i) {
    if (this.goalsDone.has(i)) return;
    this.goalsDone.add(i);
    this.stage = Math.max(this.stage, i);
    this._updateGoalChip();
    this.game.renderGoals(this.goals, this.goalsDone, this.stage);
    // 目标完成的正反馈：脚下撒金色光点 + 顶部提示
    const up = this.walker.up.clone();
    const pos = this.walker.position.clone();
    this.fx && this.fx.burst(pos, up, { count: 26 });
    this.fx && this.fx.pulse(pos, up, { color: 0xffe6a8 });
    toast(`${t('目标完成')} · ${this.goalsDone.size}/${this.goals.length}`, 'goal');
    audio.chime(660);
  }

  _updateGoalChip() {
    const el = document.getElementById('hud-goal');
    const txt = document.getElementById('hud-goal-text');
    const next = this.goals.findIndex((_, i) => !this.goalsDone.has(i));
    if (next === -1) {
      setVisible(el, false);
      return;
    }
    setVisible(el, true);
    txt.textContent = `${t('任务')} ${this.goalsDone.size}/${this.goals.length} · ${t(this.goals[next])}`;
    const sub = document.getElementById('goals-sub');
    if (sub) {
      const cid = this.game.chapterId;
      const pct = cid && this.game.explorePct ? this.game.explorePct(cid) : 0;
      sub.textContent = `${t('任务')} ${this.goalsDone.size}/${this.goals.length} · ${t('探索')} ${pct}%`;
    }
  }

  _say(lines, onEnd) {
    this.busy = true;
    this.dialogue.play(lines, () => {
      this.busy = false;
      if (onEnd) onEnd();
    });
  }

  _talkToRose() {
    this._markGoal(1);
    this._say([
      { speaker: '玫瑰花', text: '我想……该是吃早饭的时候了。' },
      { speaker: '玫瑰花', text: '能不能劳您费心，也想着我一点……' },
      { speaker: '玫瑰花', text: '（轻轻咳了一声）' },
      { speaker: '玫瑰花', text: '我以前真傻。请你原谅我。' },
      { speaker: '玫瑰花', text: '是啊，我是爱你的。' },
      { speaker: '玫瑰花', text: '你一点都没察觉，是我的错。' },
      { speaker: '玫瑰花', text: '不过，你也和我一样傻。' },
      { speaker: '玫瑰花', text: '别管这个罩子了。我不要它了。' },
      { text: '可是风……' },
      { speaker: '玫瑰花', text: '夜里的凉风会对我有好处的。我是一朵花。' },
      { text: '可是那些野兽……' },
      { speaker: '玫瑰花', text: '我什么都不怕。我有我的爪子。' },
      { speaker: '玫瑰花', text: '（亮出她的四根刺）' },
      { speaker: '玫瑰花', text: '别这样磨磨蹭蹭的，真烦人。' },
      { speaker: '玫瑰花', text: '你已经决定要走了。走吧。' },
      { speaker: '玫瑰花', text: '再见了。' },
      {
        text: '我的花是转瞬即逝的，她只有四根刺来保护自己！而我把她独自留在了家里！',
        onShow: () => {
          this.avatar.headTilt = -0.8;
        },
      },
    ], () => {
      this.avatar.headTilt = 0;
      this._markGoal(2);
      this._say([{ text: '去工具棚拿水壶，最后给她浇一次水。' }]);
    });
  }

  _takeCan() {
    this._markGoal(2);
    this.carried = true;
    this.can.visible = false;
    this._attachCanToHand();
    this._say([{ text: '先把水壶装满吧。泉眼在那一边。' }], () => this._markGoal(3));
  }

  _attachCanToHand() {
    // 挂在右手上
    const hand = this.avatar.arms[1].pivot;
    this.can.scale.setScalar(1.4);
    this.can.position.set(0, -0.26, 0.02);
    this.can.rotation.set(0, 0, 0);
    hand.add(this.can);
    this.can.visible = true;
  }

  _fillCan() {
    if (!this.carried || this.filled) return;
    audio.water(1.4);
    this.filled = true;
    this._markGoal(3);
    this._say([
      { speaker: '', text: '壶是空的' , raw: t('打水') },
      { text: '水打满了。回去给她浇最后一次水吧。' },
    ], () => this._markGoal(4));
  }

  _waterRose() {
    if (!this.filled) return;
    this.watered = true;
    audio.water(2.2);
    this.filled = false;
    // 壶里的水倒空了
    this.carried = false;
    this.can.visible = false;
    this._markGoal(4);
    this._say([
      {
        text: '你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。',
      },
      { text: '我该走了。看最后一场日落吧。' },
    ], () => {
      this._markGoal(5);
      this.goals[5] = '看最后一场日落';
      this._updateGoalChip();
    });
  }

  _liftGlobe() {
    if (!this.globeOn) return;
    this.globeOn = false;
    // 找到玻璃罩的透明材质，做淡出（基准透明度取自材质本身，罩子是 0.17）
    const domeMat = this.globe.children[0]?.material;
    const baseOpacity = domeMat ? domeMat.opacity : 0.17;
    let k = 0;
    const slide = () => {
      k = Math.min(1, k + 0.07);
      this.globe.position.y = k * 0.5;
      if (domeMat) domeMat.opacity = baseOpacity * (1 - k);
      if (k < 1) requestAnimationFrame(slide);
      else this.globe.visible = false;
    };
    slide();
  }

  _sitAndWatchSunset() {
    if (this.sunsetDone) return;
    this._markGoal(6);
    // 坐下：把角色放到椅子旁边
    this.walker.camDist = 5.0;
    this._say([{ text: '人在很难过的时候，就喜欢看日落……' }], () => {
      this._sunset();
    });
  }

  /** 日落：太阳高度角下降，天空变紫变暗，然后进入启程 */
  _sunset() {
    if (this.sunsetDone) return;
    this.sunsetDone = true;
    this.busy = true;
    audio.swell();
    // 由 update() 里的 _tickSunset 推进
    this.sunAnim = { t: 0, dur: 6.5, from: this.sunAngle, to: -0.24, fired: false };
  }

  /** 日落动画推进（由 update 驱动） */
  _tickSunset(dt) {
    const a = this.sunAnim;
    if (!a) return;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    // easeInOutQuad
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    this.sunAngle = a.from + (a.to - a.from) * e;
    this._applySun();
    if (k >= 1 && !a.fired) {
      a.fired = true;
      this.sunAnim = null;
      this.busy = false;
      setTimeout(() => this._afterSunset(), 1100);
    }
  }

  _afterSunset() {
    this.dialogue.play(
      [
        { speaker: '玫瑰花', text: '我很喜欢看日落。' },
        { text: '人在很难过的时候，就喜欢看日落……' },
        { text: '我想去别的星球看看。' },
      ],
      () => {
        this.game.completeChapter('b612');
      }
    );
    this.busy = true;
  }

  /** 让 obj 的 +Z 沿切平面指向 target（obj 已经摆在球面 dir 上） */
  _faceTangent(obj, dir, target) {
    const n = dir.clone().normalize();
    const f = target.clone().addScaledVector(n, -target.dot(n));
    if (f.lengthSq() < 1e-8) return;
    f.normalize();
    const x = new Vector3().crossVectors(n, f).normalize();
    obj.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, n, f));
  }

  /** 让椅背朝后、椅面正对太阳，坐下时面朝落日 */
  _aimChairAtSun() {
    const n = this.chairDir.clone().normalize();
    // 太阳方向投影到切平面
    const s = this.sunDir.clone();
    const tangentSun = s.addScaledVector(n, -s.dot(n));
    if (tangentSun.lengthSq() < 1e-4) return;
    tangentSun.normalize();
    // 椅子本地 +Z 是「正面」（椅背在 -Z），所以 +Z 要指向太阳的切向分量。
    // 必须是右手正交基：X = up × Z，否则 makeBasis 的行列式为 -1，
    // setFromRotationMatrix() 会解出一个被镜像的「歪」姿态。
    const right = new Vector3().crossVectors(n, tangentSun).normalize();
    const m = new Matrix4().makeBasis(right, n, tangentSun);
    this.chair.quaternion.setFromRotationMatrix(m);
  }

  _applySun() {
    // 太阳方向：在 XY 平面上由高度角决定
    const a = this.sunAngle;
    const el = MathUtils.clamp(a, -0.5, 1.2);
    this.sunDir.set(Math.cos(el) * 0.86, Math.sin(el), Math.cos(el) * 0.42).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(60);

    const u = this.sky.userData.uniforms;
    u.sunDir.value.copy(this.sunDir);

    const k = MathUtils.clamp((el + 0.22) / 0.64, 0, 1); // 0 = 入夜, 1 = 白天
    // 三段调色：夜（深靛） → 黄昏（粉橙，参考图的色调） → 白天（柔蓝 + 暖地平线）
    const nightTop = new Color(0x161c40);
    const nightMid = new Color(0x2b2f5e);
    const nightBot = new Color(0x6b3a4a);
    const duskTop = new Color(0x494a88);
    const duskMid = new Color(0xd98f9e);
    const duskBot = new Color(0xf7a978);
    const dayTop = new Color(0x5c9ad4);
    const dayMid = new Color(0xb6d6e8);
    const dayBot = new Color(0xf3ddb8);
    const top = new Color();
    const mid = new Color();
    const bot = new Color();
    if (k > 0.45) {
      const t = (k - 0.45) / 0.55;
      top.copy(duskTop).lerp(dayTop, t);
      mid.copy(duskMid).lerp(dayMid, t);
      bot.copy(duskBot).lerp(dayBot, t);
    } else {
      const t = k / 0.45;
      top.copy(nightTop).lerp(duskTop, t);
      mid.copy(nightMid).lerp(duskMid, t);
      bot.copy(nightBot).lerp(duskBot, t);
    }
    u.topColor.value.copy(top);
    u.midColor.value.copy(mid);
    u.botColor.value.copy(bot);
    u.glowColor.value.set(0xff9a5a).lerp(new Color(0xffe0b0), k);
    // 地平线雾光：白天薄、黄昏暖，别把中段天空洗成一片奶白
    if (u.hazeAmount) {
      u.hazeAmount.value = 0.14 + k * 0.24;
      u.hazeColor.value.copy(bot).lerp(new Color(0xfff2dc), 0.55);
    }
    u.glowAmount.value = 0.45 + k * 0.6;
    // 地平线雾跟着天空中间那层走，远处才不会突然变一块灰
    if (this.scene.fog) this.scene.fog.color.copy(mid).multiplyScalar(0.82);

    // 光照强度与色温随高度变化（夜里也保留一点月色照明，避免全黑）
    this.sun.intensity = 0.5 + k * 3.2;
    this.sun.color.setHSL(0.075, 0.5, 0.6 + k * 0.18);
    // 环境光：夜空下也要能看清脚下的星球
    if (this.hemi) {
      this.hemi.intensity = 1.0 + k * 1.2;
      this.hemi.color.setHSL(0.6, 0.34, 0.52 + k * 0.2);
      this.hemi.groundColor.setHSL(0.24, 0.3, 0.2 + k * 0.18);
    }
    // 角色补光随天色变化：白天微弱，夜里增强，保证主角永远看得清
    if (this.fillLight) {
      this.fillLight.intensity = 0.5 + (1 - k) * 1.7;
    }
    // 柔光层跟着太阳走：日落时光晕与光柱要重新对准太阳
    if (this.art) aimArt(this);
  }

  /**
   * B612Chapter 不继承 Chapter，原先这里没有 dispose()，game._teardownChapter 什么都没释放。
   * 直接借用基类的实现（只依赖 scene / skyScene / dialogue 等同名字段）。
   */
  dispose() {
    Chapter.prototype.dispose.call(this);
  }
}

/**
 * 程序化低面数 NPC：国王、爱虚荣者、酒鬼、商人、点灯人、地理学家、地球上的人。
 * 与小王子同风格（flatShading、圆头、短身），高度约 0.9。
 * 坐标约定：脚底在原点，+Y 向上，正面朝 +Z；放在 chapter.root 下（局部坐标）。
 */

function m(color, rough = 0.85, metal = 0) {
  const c = new Color(color);
  return new MeshStandardMaterial({
    color: c, roughness: rough, metalness: metal, flatShading: true,
    emissive: c.clone().multiplyScalar(0.22),
  });
}

function add(g, geo, mat, x, y, z) {
  const mesh = new Mesh(geo, mat);
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
function makeNPC(o = {}) {
  const coat = m(o.coat ?? 0x55607a);
  const trim = m(o.trim ?? 0xd8c27a, 0.5, 0.2);
  const skin = m(o.skin ?? 0xeac3a0);
  const hair = m(o.hair ?? 0x5a4030);
  const pants = m(o.pants ?? 0x33302c);
  const dark = m(0x1e1a18);

  const root = new Group();
  const body = new Group();
  root.add(body);

  // 腿 / 长袍
  if (o.robe) {
    add(body, new CylinderGeometry(0.17, 0.27, 0.42, 10), coat, 0, 0.21, 0);
    add(body, new CylinderGeometry(0.275, 0.28, 0.04, 10), trim, 0, 0.02, 0);
  } else {
    for (const s of [-1, 1]) {
      add(body, new CylinderGeometry(0.045, 0.05, 0.22, 6), pants, s * 0.065, 0.11, 0);
      add(body, new BoxGeometry(0.09, 0.05, 0.14), dark, s * 0.065, 0.025, 0.025);
    }
  }

  // 躯干
  const torsoR = o.belly ? 0.19 : 0.14;
  add(body, new CylinderGeometry(0.12, torsoR, 0.32, 10), coat, 0, 0.38, 0);
  if (o.belly) add(body, new SphereGeometry(0.17, 10, 8), coat, 0, 0.33, 0.04);
  add(body, new CylinderGeometry(torsoR + 0.005, torsoR + 0.005, 0.035, 10), trim, 0, 0.25, 0);
  // 纽扣
  for (let i = 0; i < 3; i++) add(body, new SphereGeometry(0.014, 5, 4), trim, 0, 0.3 + i * 0.07, torsoR - 0.01 + (o.belly ? 0.06 : 0));

  // 手臂
  for (const s of [-1, 1]) {
    const arm = add(body, new CapsuleGeometry(0.038, 0.2, 3, 6), coat, s * 0.16, 0.4, 0);
    arm.rotation.z = s * 0.25;
    add(body, new SphereGeometry(0.035, 6, 5), skin, s * 0.19, 0.27, 0.01);
  }

  // 头
  const head = new Group();
  head.position.y = 0.66;
  body.add(head);
  add(head, new IcosahedronGeometry(0.13, 1), skin, 0, 0, 0);
  for (const s of [-1, 1]) add(head, new SphereGeometry(0.014, 5, 4), dark, s * 0.045, 0.015, 0.118);
  add(head, new SphereGeometry(0.024, 6, 5), o.nose != null ? m(o.nose) : skin, 0, -0.015, 0.128);
  // 头发：后脑一片
  const back = add(head, new SphereGeometry(0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.01, -0.012);
  back.rotation.x = -0.35;
  if (o.beard != null) {
    const beard = add(head, new ConeGeometry(0.1, 0.22, 8), m(o.beard), 0, -0.14, 0.06);
    beard.rotation.x = Math.PI + 0.25;
  }

  // 帽子
  const hc = m(o.hatColor ?? 0x2a2a30, 0.6, o.hat === 'crown' ? 0.6 : 0);
  if (o.hat === 'crown') {
    add(head, new CylinderGeometry(0.1, 0.1, 0.07, 10, 1, true), hc, 0, 0.13, 0).material.side = DoubleSide;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(head, new ConeGeometry(0.022, 0.06, 4), hc, Math.cos(a) * 0.095, 0.19, Math.sin(a) * 0.095);
    }
  } else if (o.hat === 'top') {
    add(head, new CylinderGeometry(0.19, 0.19, 0.02, 14), hc, 0, 0.1, 0);
    add(head, new CylinderGeometry(0.1, 0.11, 0.26, 12), hc, 0, 0.23, 0);
    add(head, new CylinderGeometry(0.112, 0.112, 0.04, 12), trim, 0, 0.13, 0);
  } else if (o.hat === 'cap') {
    add(head, new SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), hc, 0, 0.03, 0);
    add(head, new BoxGeometry(0.16, 0.015, 0.09), hc, 0, 0.06, 0.13);
  } else if (o.hat === 'beret') {
    const b = add(head, new SphereGeometry(0.14, 10, 6), hc, 0.02, 0.1, -0.01);
    b.scale.set(1.05, 0.38, 1.05);
  } else if (o.hat === 'pilot') {
    add(head, new SphereGeometry(0.138, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), hc, 0, 0.015, 0);
    for (const s of [-1, 1]) add(head, new TorusGeometry(0.035, 0.012, 5, 10), trim, s * 0.045, 0.06, 0.11);
  }
  if (o.cape) {
    const cape = add(body, new CylinderGeometry(0.16, 0.34, 0.5, 12, 1, true, Math.PI * 0.6, Math.PI * 0.8), m(o.cape), 0, 0.3, 0);
    cape.material.side = DoubleSide;
    cape.rotation.y = Math.PI;
  }

  root.scale.setScalar(o.scale ?? 1);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

const _up = new Vector3();
const _dir = new Vector3();
const _x = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _v2 = new Vector3();

/** 把 NPC 立在球面上，面向 target（同一坐标系的点）。 */
function placeNPC(npc, dir, radius, faceTo) {
  _up.copy(dir).normalize();
  npc.position.copy(_up).multiplyScalar(radius);
  faceNPC(npc, faceTo, 1);
}

/** 每帧调用：慢慢转向 target，并轻微呼吸起伏。 */
function faceNPC(npc, target, k = 0.08, dt = 0) {
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
function faceHeadOnly(npc, targetWorld, k = 0.08) {
  const d = npc.userData.npc;
  if (!d || !d.head) return;
  npc.updateWorldMatrix(true, false);
  _v2.copy(targetWorld);
  npc.worldToLocal(_v2);
  const want = Math.max(-0.75, Math.min(0.75, Math.atan2(_v2.x, _v2.z)));
  d.head.rotation.y += (want - d.head.rotation.y) * k;
}

/** 从 dir 沿球面偏移 dist 米得到新方向（side 用于选方向）。 */
function besideDir(dir, radius, dist, angleDeg = 90) {
  const n = dir.clone().normalize();
  const ref = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const t = new Vector3().crossVectors(ref, n).normalize();
  t.applyAxisAngle(n, (angleDeg * Math.PI) / 180);
  return n.addScaledVector(t, dist / radius).normalize();
}

// ================================================================
// 六个有名有姓的角色：每颗星球一个人，外形与道具各自不同
// 共同约定：脚底在原点、+Y 向上、正面 +Z、userData.npc 供 faceNPC 呼吸
// ================================================================

/** 头 + 五官 + 后脑头发，返回 head 组（可再设 rotation.x 调姿态）。 */
function headGroup(body, y, skin, hair, dark, noseColor) {
  const head = new Group();
  head.position.y = y;
  body.add(head);
  add(head, new IcosahedronGeometry(0.13, 1), skin, 0, 0, 0);
  for (const s of [-1, 1]) add(head, new SphereGeometry(0.014, 5, 4), dark, s * 0.045, 0.015, 0.118);
  add(head, new SphereGeometry(0.024, 6, 5), noseColor ? m(noseColor) : skin, 0, -0.015, 0.128);
  const back = add(head, new SphereGeometry(0.135, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.01, -0.012);
  back.rotation.x = -0.35;
  return head;
}

/** 国王：高冠、貂皮披风、权杖、白胡子，比小王子高出一个头。 */
function makeKingNPC(o = {}) {
  const seated = o.seated === true;
  const robe = m(0x8e2430), fur = m(0xf1e9dc, 0.95), gold = m(0xd8b23f, 0.35, 0.8);
  const skin = m(0xe8c39c), hair = m(0x8d7659), dark = m(0x1e1a18);
  const root = new Group();
  const body = new Group();
  root.add(body);

  if (seated) {
    // 坐姿：胯部正好落在王座座面（座面高 0.27），小腿垂在座前，袍子朝前摊开。
    // 这个分支的坐标就是「王座局部坐标」，所以 king.js 把它挂到 throne 下、位移≈0。
    for (const s of [-1, 1]) {
      // 大腿朝前、小腿垂下
      const thigh = add(body, new CapsuleGeometry(0.062, 0.13, 3, 8), robe, s * 0.09, 0.34, 0.1);
      thigh.rotation.x = Math.PI / 2;
      add(body, new CapsuleGeometry(0.05, 0.16, 3, 8), robe, s * 0.09, 0.16, 0.3);
      add(body, new BoxGeometry(0.1, 0.055, 0.17), dark, s * 0.09, 0.028, 0.335);
    }
    add(body, new CylinderGeometry(0.215, 0.32, 0.26, 12), robe, 0, 0.235, 0.02);
    add(body, new CylinderGeometry(0.325, 0.33, 0.045, 12), fur, 0, 0.105, 0.02);
    // 躯干（比站姿短一截，因为胯已经坐在座面上）
    add(body, new CylinderGeometry(0.13, 0.2, 0.26, 12), robe, 0, 0.49, 0.01);
    add(body, new CylinderGeometry(0.205, 0.205, 0.05, 12), gold, 0, 0.375, 0.01);
    for (const s of [-1, 1]) add(body, new SphereGeometry(0.05, 8, 6), gold, s * 0.16, 0.6, 0.03);
    // 左手搭在扶手上，右手扶着插在地上的权杖
    const armL = add(body, new CapsuleGeometry(0.045, 0.2, 3, 6), robe, -0.2, 0.47, 0.06);
    armL.rotation.z = -0.3; armL.rotation.x = -0.5;
    const armR = add(body, new CapsuleGeometry(0.045, 0.2, 3, 6), robe, 0.21, 0.46, 0.09);
    armR.rotation.z = 0.28; armR.rotation.x = -0.42;
    add(body, new SphereGeometry(0.04, 6, 5), skin, -0.245, 0.33, 0.15);
    add(body, new SphereGeometry(0.04, 6, 5), skin, 0.275, 0.35, 0.19);
    // 权杖拄在地上
    add(body, new CylinderGeometry(0.012, 0.012, 0.62, 6), gold, 0.3, 0.31, 0.2);
    add(body, new SphereGeometry(0.038, 8, 6), gold, 0.3, 0.64, 0.2);
    add(body, new SphereGeometry(0.038, 8, 6), gold, 0.3, 0.68, 0.2);
  } else {
    add(body, new CylinderGeometry(0.19, 0.33, 0.54, 12), robe, 0, 0.27, 0);
    add(body, new CylinderGeometry(0.335, 0.345, 0.05, 12), fur, 0, 0.025, 0);
    add(body, new CylinderGeometry(0.205, 0.205, 0.05, 12), gold, 0, 0.36, 0);
    add(body, new CylinderGeometry(0.15, 0.2, 0.3, 10), robe, 0, 0.52, 0);
    for (const s of [-1, 1]) add(body, new SphereGeometry(0.05, 8, 6), gold, s * 0.17, 0.63, 0);
    // 貂皮披风：背后一段开口筒
    const cape = add(body, new CylinderGeometry(0.2, 0.38, 0.6, 12, 1, true, Math.PI * 0.45, Math.PI * 0.9), fur, 0, 0.42, 0);
    cape.material.side = DoubleSide;
    cape.rotation.y = Math.PI;

    const armL = add(body, new CapsuleGeometry(0.045, 0.22, 3, 6), robe, -0.2, 0.52, 0);
    armL.rotation.z = -0.22;
    const armR = add(body, new CapsuleGeometry(0.045, 0.22, 3, 6), robe, 0.2, 0.55, 0.04);
    armR.rotation.z = 0.42; armR.rotation.x = -0.3;
    add(body, new SphereGeometry(0.04, 6, 5), skin, -0.22, 0.4, 0.01);
    add(body, new SphereGeometry(0.04, 6, 5), skin, 0.26, 0.66, 0.15);

    // 权杖
    const staff = add(body, new CylinderGeometry(0.012, 0.012, 0.72, 6), gold, 0.28, 0.5, 0.17);
    staff.rotation.z = 0.1;
    add(body, new SphereGeometry(0.038, 8, 6), gold, 0.31, 0.87, 0.17);
  }

  const head = headGroup(body, seated ? 0.73 : 0.78, skin, hair, dark);
  head.rotation.x = -0.08;
  const beard = add(head, new ConeGeometry(0.11, 0.24, 8), m(0xe6dfd0, 0.95), 0, -0.15, 0.045);
  beard.rotation.x = Math.PI + 0.22;
  const crown = add(head, new CylinderGeometry(0.105, 0.105, 0.075, 12, 1, true), gold, 0, 0.135, 0);
  crown.material.side = DoubleSide;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(head, new ConeGeometry(0.022, 0.06, 4), gold, Math.cos(a) * 0.098, 0.2, Math.sin(a) * 0.098);
  }
  add(head, new SphereGeometry(0.018, 6, 5), m(0xb0313f, 0.3, 0.4), 0, 0.14, 0.104);

  root.scale.setScalar(seated ? 1.0 : 1.06);
  root.userData.npc = { body, head, t: Math.random() * 6, seated, headOnly: seated };
  return root;
}

/** 爱虚荣的人：高礼帽插羽毛、单手叉腰、另一只手举着镜子。 */
function makeConceitedNPC() {
  const coat = m(0x6f3a78), trim = m(0xd8c8d6, 0.6, 0.2), pants = m(0x2f2735);
  const skin = m(0xf0cbaa), hair = m(0x3a2a26), dark = m(0x1e1a18), glass = m(0xcfd8e2, 0.15, 0.9);
  const root = new Group();
  const body = new Group();
  root.add(body);

  for (const s of [-1, 1]) {
    add(body, new CylinderGeometry(0.045, 0.05, 0.26, 6), pants, s * 0.06, 0.13, 0);
    add(body, new BoxGeometry(0.09, 0.05, 0.15), dark, s * 0.06, 0.025, 0.02);
  }
  add(body, new CylinderGeometry(0.115, 0.155, 0.34, 10), coat, 0, 0.44, 0);
  add(body, new CylinderGeometry(0.158, 0.158, 0.03, 10), trim, 0, 0.3, 0);
  for (let i = 0; i < 3; i++) add(body, new SphereGeometry(0.013, 5, 4), trim, 0, 0.33 + i * 0.07, 0.15);

  // 左手叉腰
  const upperL = add(body, new CapsuleGeometry(0.035, 0.16, 3, 6), coat, -0.16, 0.46, 0);
  upperL.rotation.z = -1.05;
  const foreL = add(body, new CapsuleGeometry(0.032, 0.14, 3, 6), coat, -0.235, 0.38, 0.03);
  foreL.rotation.z = -0.25;
  add(body, new SphereGeometry(0.033, 6, 5), skin, -0.19, 0.3, 0.03);
  // 右手举镜子
  const upperR = add(body, new CapsuleGeometry(0.035, 0.16, 3, 6), coat, 0.17, 0.5, 0.02);
  upperR.rotation.z = 0.45; upperR.rotation.x = -0.75;
  add(body, new SphereGeometry(0.033, 6, 5), skin, 0.17, 0.62, 0.13);
  const handle = add(body, new CylinderGeometry(0.008, 0.008, 0.09, 5), trim, 0.17, 0.67, 0.15);
  handle.rotation.x = 0.5;
  const rim = add(body, new TorusGeometry(0.055, 0.008, 5, 14), trim, 0.17, 0.74, 0.16);
  rim.rotation.x = -0.35;
  const lens = add(body, new CircleGeometry(0.052, 14), glass, 0.17, 0.74, 0.163);
  lens.rotation.x = -0.35;
  lens.material.side = DoubleSide;

  const head = headGroup(body, 0.68, skin, hair, dark);
  head.rotation.x = -0.16; // 下巴抬着
  for (let i = 0; i < 3; i++) {
    const a = -0.9 + i * 0.9;
    const curl = add(head, new SphereGeometry(0.045, 7, 6), hair, Math.cos(a) * 0.09, 0.09, -0.09);
    curl.scale.set(1, 0.8, 0.8);
  }
  const hc = m(0x241f2c, 0.55);
  add(head, new CylinderGeometry(0.185, 0.19, 0.018, 14), hc, 0, 0.1, 0);
  add(head, new CylinderGeometry(0.098, 0.104, 0.3, 12), hc, 0, 0.26, 0);
  add(head, new CylinderGeometry(0.107, 0.107, 0.035, 12), m(0x7a2f45, 0.6), 0, 0.13, 0);
  const feather = add(head, new ConeGeometry(0.03, 0.24, 5), m(0xd94f6b, 0.8), 0.1, 0.36, -0.02);
  feather.rotation.z = 0.3; feather.scale.set(1, 1, 0.45);

  root.scale.setScalar(1.02);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

/** 酒鬼：驼背、红鼻子、眼袋、手里一只酒瓶，帽子歪戴着。 */
function makeTipplerNPC() {
  const coat = m(0x8a5a44), trim = m(0x5f3f31), pants = m(0x3e3940);
  const skin = m(0xd9a888), hair = m(0x4a3a2e), dark = m(0x1e1a18);
  const root = new Group();
  const body = new Group();
  body.rotation.x = 0.16;
  body.position.y = 0.02; // 驼背后前倾，抬高一点避免脚部切进球面
  root.add(body);

  for (const s of [-1, 1]) {
    add(body, new CylinderGeometry(0.05, 0.055, 0.22, 6), pants, s * 0.07, 0.11, 0);
    add(body, new BoxGeometry(0.1, 0.05, 0.16), dark, s * 0.07, 0.025, 0.03);
  }
  add(body, new CylinderGeometry(0.125, 0.175, 0.34, 10), coat, 0, 0.36, 0);
  add(body, new SphereGeometry(0.165, 10, 8), coat, 0, 0.33, 0.05);
  add(body, new CylinderGeometry(0.178, 0.178, 0.035, 10), trim, 0, 0.23, 0);

  const armL = add(body, new CapsuleGeometry(0.04, 0.2, 3, 6), coat, -0.18, 0.4, 0.02);
  armL.rotation.z = -0.18; armL.rotation.x = -0.25;
  add(body, new SphereGeometry(0.036, 6, 5), skin, -0.2, 0.26, 0.06);
  const armR = add(body, new CapsuleGeometry(0.04, 0.17, 3, 6), coat, 0.18, 0.42, 0.04);
  armR.rotation.z = 0.3; armR.rotation.x = -0.55;
  add(body, new SphereGeometry(0.036, 6, 5), skin, 0.21, 0.34, 0.12);

  // 酒瓶
  const bottle = new Group();
  bottle.position.set(0.22, 0.36, 0.14);
  bottle.rotation.z = 0.35;
  const glass = new MeshStandardMaterial({
    color: 0x2f5a34, roughness: 0.25, metalness: 0.1, flatShading: true,
    emissive: new Color(0x1d3a20), transparent: true, opacity: 0.9,
  });
  const bottleBody = new Mesh(new CylinderGeometry(0.035, 0.04, 0.14, 8), glass);
  bottleBody.castShadow = true;
  bottle.add(bottleBody);
  add(bottle, new CylinderGeometry(0.014, 0.02, 0.07, 6), glass, 0, 0.1, 0);
  add(bottle, new CylinderGeometry(0.015, 0.015, 0.014, 6), m(0x8a6a44), 0, 0.14, 0);
  add(bottle, new BoxGeometry(0.045, 0.03, 0.004), m(0xd8cbb0, 0.9), 0, 0.01, 0.04);
  body.add(bottle);

  const head = headGroup(body, 0.6, skin, hair, dark, 0xb9473d);
  head.rotation.x = 0.22;
  for (const s of [-1, 1]) {
    const bag = add(head, new SphereGeometry(0.02, 5, 4), m(0x9a7a66), s * 0.055, -0.055, 0.1);
    bag.scale.set(1, 0.7, 0.6);
  }
  for (let i = 0; i < 3; i++) {
    const tuft = add(head, new ConeGeometry(0.03, 0.09, 5), hair, (i - 1) * 0.06, -0.17, 0.03);
    tuft.rotation.x = Math.PI + 0.2;
  }
  const cap = add(head, new SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), m(0x584539, 0.9), 0, 0.02, 0);
  cap.rotation.z = 0.22; cap.rotation.x = -0.18;

  root.scale.setScalar(0.98);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

/** 商人：深蓝西装马甲、圆眼镜、怀里一本账本，耳朵上夹着铅笔。 */
function makeBusinessmanNPC() {
  const suit = m(0x3f5470), vest = m(0x2f4056), shirt = m(0xeae6dc, 0.8), tie = m(0x8a2f3a);
  const pants = m(0x30343d), skin = m(0xf0cbaa), hair = m(0x2c2622), dark = m(0x1e1a18);
  const gold = m(0xd8b23f, 0.35, 0.8);
  const root = new Group();
  const body = new Group();
  root.add(body);

  for (const s of [-1, 1]) {
    add(body, new CylinderGeometry(0.048, 0.052, 0.28, 6), pants, s * 0.062, 0.14, 0);
    add(body, new BoxGeometry(0.095, 0.05, 0.16), dark, s * 0.062, 0.025, 0.03);
  }
  add(body, new CylinderGeometry(0.115, 0.155, 0.36, 10), suit, 0, 0.44, 0);
  add(body, new CylinderGeometry(0.117, 0.15, 0.2, 10), vest, 0, 0.46, 0.004);
  add(body, new BoxGeometry(0.07, 0.2, 0.02), shirt, 0, 0.5, 0.128);
  add(body, new BoxGeometry(0.028, 0.16, 0.012), tie, 0, 0.48, 0.14);
  for (const s of [-1, 1]) add(body, new SphereGeometry(0.026, 6, 5), shirt, s * 0.026, 0.6, 0.12);

  // 双手捧着账本
  const book = new Group();
  book.position.set(0, 0.36, 0.17);
  book.rotation.x = -0.55;
  add(book, new BoxGeometry(0.19, 0.03, 0.24), vest, 0, 0, 0);
  add(book, new BoxGeometry(0.175, 0.022, 0.225), m(0xe8e2d2, 0.95), 0, 0.012, 0);
  for (let i = 0; i < 3; i++) add(book, new BoxGeometry(0.15, 0.003, 0.006), m(0x9a9484), 0, 0.025, -0.06 + i * 0.055);
  body.add(book);
  const armL = add(body, new CapsuleGeometry(0.038, 0.15, 3, 6), suit, -0.15, 0.44, 0.08);
  armL.rotation.x = -0.85; armL.rotation.z = -0.2;
  const armR = add(body, new CapsuleGeometry(0.038, 0.15, 3, 6), suit, 0.15, 0.44, 0.08);
  armR.rotation.x = -0.85; armR.rotation.z = 0.2;
  add(body, new SphereGeometry(0.034, 6, 5), skin, -0.11, 0.3, 0.2);
  add(body, new SphereGeometry(0.034, 6, 5), skin, 0.11, 0.3, 0.2);

  const head = headGroup(body, 0.7, skin, hair, dark);
  for (const s of [-1, 1]) add(head, new TorusGeometry(0.042, 0.006, 4, 14), gold, s * 0.05, 0.015, 0.115);
  add(head, new BoxGeometry(0.03, 0.006, 0.006), gold, 0, 0.02, 0.115);
  const pencil = add(head, new CylinderGeometry(0.006, 0.006, 0.13, 5), m(0xd8a63a, 0.7), 0.115, 0.06, -0.01);
  pencil.rotation.z = 0.7;

  root.scale.setScalar(1.03);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

/** 点灯人：举着长杆，杆头挂着一盏刚点亮的灯。 */
function makeLamplighterNPC() {
  const coat = m(0x5b6b4d), pants = m(0x3c4148);
  const skin = m(0xe8c39c), hair = m(0x5a4a3a), dark = m(0x1e1a18);
  const iron = m(0x2f3336, 0.4, 0.6);
  const root = new Group();
  const body = new Group();
  root.add(body);

  for (const s of [-1, 1]) {
    add(body, new CylinderGeometry(0.048, 0.052, 0.26, 6), pants, s * 0.065, 0.13, 0);
    add(body, new BoxGeometry(0.1, 0.06, 0.17), dark, s * 0.065, 0.03, 0.03);
  }
  add(body, new CylinderGeometry(0.115, 0.16, 0.36, 10), coat, 0, 0.44, 0);
  add(body, new CylinderGeometry(0.163, 0.163, 0.035, 10), m(0x3a3b3e), 0, 0.28, 0);
  add(body, new TorusGeometry(0.115, 0.022, 5, 12), m(0x9a4b3a, 0.9), 0, 0.62, 0);

  const armDown = add(body, new CapsuleGeometry(0.04, 0.19, 3, 6), coat, -0.17, 0.44, 0);
  armDown.rotation.z = -0.16;
  add(body, new SphereGeometry(0.036, 6, 5), skin, -0.19, 0.3, 0.01);
  const armUp = add(body, new CapsuleGeometry(0.04, 0.2, 3, 6), coat, 0.18, 0.55, 0.03);
  armUp.rotation.z = 0.55; armUp.rotation.x = -0.45;
  add(body, new SphereGeometry(0.036, 6, 5), skin, 0.26, 0.68, 0.09);

  // 长杆 + 钩子 + 灯
  const pole = add(body, new CylinderGeometry(0.011, 0.013, 1.0, 6), iron, 0.3, 0.6, 0.08);
  pole.rotation.z = 0.12;
  const hook = add(body, new TorusGeometry(0.045, 0.008, 5, 10, Math.PI * 1.2), iron, 0.36, 1.05, 0.08);
  hook.rotation.z = -0.4;
  const lantern = new Group();
  lantern.position.set(0.4, 1.0, 0.08);
  add(lantern, new CylinderGeometry(0.055, 0.06, 0.02, 8), iron, 0, 0.06, 0);
  add(lantern, new CylinderGeometry(0.058, 0.058, 0.02, 8), iron, 0, -0.06, 0);
  const flameMat = new MeshStandardMaterial({
    color: 0xffd9a0, roughness: 0.4, flatShading: true,
    emissive: new Color(0xffb45a), emissiveIntensity: 1.6, transparent: true, opacity: 0.92,
  });
  lantern.add(new Mesh(new CylinderGeometry(0.045, 0.045, 0.1, 8), flameMat));
  body.add(lantern);

  const head = headGroup(body, 0.68, skin, hair, dark);
  const cap = add(head, new SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), m(0x3a3b3e, 0.9), 0, 0.03, 0);
  cap.rotation.x = -0.1;
  add(head, new BoxGeometry(0.16, 0.015, 0.09), m(0x3a3b3e, 0.9), 0, 0.06, 0.13);

  root.scale.setScalar(0.98);
  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

/** 地理学家：长袍、圆眼镜、白长胡子，腋下夹着一本厚书，手里一支羽毛笔。 */
function makeGeographerNPC() {
  const robe = m(0x8b8677), trim = m(0xd6cfb9, 0.7), belt = m(0x5b5148);
  const skin = m(0xe6c6a6), hair = m(0xd0cbbd), dark = m(0x1e1a18), gold = m(0xc9a95a, 0.35, 0.7);
  const root = new Group();
  const body = new Group();
  body.rotation.x = 0.12; // 略微伏在书上
  body.position.y = 0.04; // 前倾后书角会向下探，整体抬高避免切进地面
  root.add(body);

  add(body, new CylinderGeometry(0.18, 0.3, 0.5, 12), robe, 0, 0.25, 0);
  add(body, new CylinderGeometry(0.305, 0.31, 0.04, 12), trim, 0, 0.02, 0);
  add(body, new CylinderGeometry(0.16, 0.19, 0.3, 10), robe, 0, 0.5, 0);
  add(body, new CylinderGeometry(0.175, 0.175, 0.04, 10), belt, 0, 0.38, 0);

  // 左臂夹着书
  const armL = add(body, new CapsuleGeometry(0.04, 0.18, 3, 6), robe, -0.17, 0.5, 0.01);
  armL.rotation.z = -0.35; armL.rotation.x = -0.2;
  add(body, new SphereGeometry(0.036, 6, 5), skin, -0.2, 0.4, 0.09);
  const book = new Group();
  book.position.set(-0.22, 0.44, 0.1);
  book.rotation.z = 0.3; book.rotation.y = -0.2;
  add(book, new BoxGeometry(0.2, 0.05, 0.26), m(0x5e4632, 0.9), 0, 0, 0);
  add(book, new BoxGeometry(0.185, 0.042, 0.245), m(0xefe8d6, 0.95), 0.004, 0, 0.002);
  add(book, new BoxGeometry(0.19, 0.052, 0.02), gold, 0, 0, -0.12);
  body.add(book);

  // 右手拿羽毛笔
  const armR = add(body, new CapsuleGeometry(0.04, 0.18, 3, 6), robe, 0.17, 0.5, 0.03);
  armR.rotation.z = 0.3; armR.rotation.x = -0.5;
  add(body, new SphereGeometry(0.036, 6, 5), skin, 0.2, 0.42, 0.13);
  const quill = new Group();
  quill.position.set(0.21, 0.46, 0.14);
  quill.rotation.z = -0.45; quill.rotation.x = 0.3;
  add(quill, new CylinderGeometry(0.005, 0.008, 0.2, 5), m(0xf2ecdc, 0.95), 0, 0.06, 0);
  const plume = add(quill, new ConeGeometry(0.028, 0.14, 5), m(0xf6f0e2, 0.95), 0, 0.2, 0);
  plume.scale.set(1, 1, 0.45);
  body.add(quill);

  const head = headGroup(body, 0.72, skin, hair, dark);
  for (const s of [-1, 1]) add(head, new TorusGeometry(0.042, 0.005, 4, 14), gold, s * 0.05, 0.015, 0.115);
  add(head, new BoxGeometry(0.03, 0.005, 0.005), gold, 0, 0.02, 0.115);
  const beard = add(head, new ConeGeometry(0.1, 0.3, 8), m(0xdcd6c8, 0.95), 0, -0.19, 0.04);
  beard.rotation.x = Math.PI + 0.12;
  const beret = add(head, new SphereGeometry(0.14, 10, 6), m(0x635e55, 0.85), 0.02, 0.1, -0.01);
  beret.scale.set(1.05, 0.36, 1.05);

  root.userData.npc = { body, head, t: Math.random() * 6 };
  return root;
}

/**
 * 第二章：国王的星球（325 号小行星）
 * 原著要点：国王宣称统治一切，包括星星；要小王子打哈欠，又说「不能强人所难」；
 * 任命他做大法官/大使，小王子还是走了。
 */

const R$6 = 5.0;

class KingChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R$6, spinSpeed: 0.01, palette: 'king' });
    // 柔光地表：国王的星球很荒，草稀稀拉拉，风里带一点灰绿色的光尘
    this.biome = {
      grass: 220,
      grassColors: [0x9aa36a, 0xb3b077, 0x8d9a63],
      flowers: 18,
      flowerColors: [0xf1d9a8, 0xe8c9b6],
      motes: 150,
      motesColor: 0xffe9c2,
      shafts: 4,
      seed: 21,
    };
    this.root.rotation.z = 0.08;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R$6, color: 0x9a8a6c, detail: 40, bump: 0.03 });
    this.root.add(this.planet);

    // 王座、国王、披风：三者挂在同一棵子树里，朝向和座面天然对齐
    this.throneDir = D$1(90, 30);
    this.throne = makeThrone();
    placeOnSphere(this.throne, this.throneDir, 0, R$6);
    this.root.add(this.throne);

    // 国王坐在王座上（坐姿模型的坐标系就是王座局部坐标，位移近似 0）
    this.kingNPC = makeKingNPC({ seated: true });
    this.throne.add(this.kingNPC);
    this.kingNPC.position.set(0, 0, -0.03);

    this.cape = makeCape();
    this.throne.add(this.cape);
    this.cape.position.set(0, 0.1, -0.2);

    // 星球边缘的一小片「领地」标记：几根旗杆
    const poleMat = new MeshStandardMaterial({ color: 0x3a3128, roughness: 0.9, flatShading: true });
    const flagMat = new MeshStandardMaterial({
      color: 0x8c1d2c,
      roughness: 0.95,
      flatShading: true,
      side: DoubleSide,
    });
    this.flags = [];
    for (const az of [-60, 0, 180, 240]) {
      const g = new Group();
      const pole = new Mesh(new CylinderGeometry(0.012, 0.012, 0.6, 6), poleMat);
      pole.position.y = 0.3;
      g.add(pole);
      const flag = new Mesh(new PlaneGeometry(0.22, 0.14), flagMat);
      flag.position.set(0.11, 0.52, 0);
      g.add(flag);
      placeOnSphere(g, D$1(az, 0), 0, R$6);
      this.root.add(g);
      this.flags.push(flag);
    }

    // 原著小事：国王说「我审判过一只老鼠」——王座旁真放一个关老鼠的小笼子
    const cage = new Group();
    const cageMat = new MeshStandardMaterial({ color: 0x6b5a42, roughness: 0.85, flatShading: true });
    const floor = new Mesh(new BoxGeometry(0.28, 0.02, 0.2), cageMat);
    floor.position.y = 0.01;
    cage.add(floor);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bar = new Mesh(new CylinderGeometry(0.006, 0.006, 0.2, 5), cageMat);
      bar.position.set(sx * 0.12, 0.1, sz * 0.08);
      cage.add(bar);
    }
    const lid = new Mesh(new BoxGeometry(0.3, 0.015, 0.22), cageMat);
    lid.position.y = 0.2;
    cage.add(lid);
    this.rat = new Mesh(
      new IcosahedronGeometry(0.05, 1),
      new MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9, flatShading: true })
    );
    this.rat.scale.set(1.3, 0.8, 1);
    this.rat.position.set(0, 0.06, 0);
    cage.add(this.rat);
    this.throne.add(cage);
    cage.position.set(0.58, 0, 0.1);

    this._spawnNearTarget('throne', 34);
    // 让王座正面（+Z）转向玩家降落的方位；国王和笼子都跟着转
    this._orientThrone();

    // 笼子的朝向：王座局部偏移转到 root 局部再归一化，得到球面上的方向
    const off = new Vector3(0.58, 0, 0.1).applyQuaternion(this.throne.quaternion);
    this.ratDir = this.throne.position.clone().add(off).normalize();

    // 登记
    this.addInteract({ id: 'throne', dir: this.throneDir, radius: 1.5, label: '拜见国王', priority: 0 });
    this.addInteract({ id: 'rat', dir: this.ratDir, radius: 1.3, label: '看看笼子里的老鼠', priority: 6 });
  }

  /** 把王座绕自身法线转到正对玩家降落的方向（朝 +Z 看人）。 */
  _orientThrone() {
    const up = this.throneDir.clone().normalize();
    const to = this.walker.position.clone().sub(this.throne.position);
    to.addScaledVector(up, -to.dot(up));
    if (to.lengthSq() < 1e-8) return;
    to.normalize();
    const x = new Vector3().crossVectors(up, to).normalize();
    const m = new Matrix4().makeBasis(x, up, to);
    this.throne.quaternion.setFromRotationMatrix(m);
  }

  _buildState() {
    this.goals = ['走近王座，拜见国王', '打一个哈欠（国王的命令）', '听国王的裁决', '告别国王，继续旅程'];
    this.goalsDone = new Set();
    this.stage = 0;
    this.yawned = false;
    this.judged = false;
  }

  opening() {
    return [
      { text: '325 号小行星。这里住着一位国王。' },
      { text: '他穿着紫貂皮袍，坐在一个很简单的宝座上，却觉得自己统治着一切。' },
      { text: '走近王座，拜见国王' },
    ];
  }

  _animateEnv(dt) {
    const time = this.clock.elapsedTime;
    // 旗帜轻微飘动
    for (let i = 0; i < this.flags.length; i++) {
      this.flags[i].rotation.y = Math.sin(time * 1.6 + i) * 0.18;
    }
    if (this.rat) this.rat.rotation.y = time * 1.4;
    // 坐着的人身体不动，只转头看你
    faceNPC(this.kingNPC, null, 0, dt);
    faceHeadOnly(this.kingNPC, this.root.localToWorld(this.walker.position.clone()), 0.07);
    // 披风呼吸
    this.cape.scale.y = 1 + Math.sin(time * 0.8) * 0.012;
  }

  onInteract(id) {
    if (id === 'rat') {
      this._say([
        { text: '笼子里关着一只灰老鼠，正在原地打转。' },
        { speaker: '国王', text: '我审判过它。我判它死刑，可每次都得赦免它。' },
        { speaker: '国王', text: '这颗星球上，只有它一个人可以被审判。' },
        { text: '国王需要有人可以被审判，才能证明自己是国王。' },
      ]);
      return;
    }
    if (id === 'yawn') {
      this._doYawn();
      return;
    }
    if (id === 'throne') {
      if (this.stage === 0) this._meetKing();
      else if (this.judged) this._farewell();
      else this._meetKing();
    }
  }

  _doYawn() {
    this.yawned = true;
    // 打哈欠这条交互用完即撤，回到「拜见国王」
    this.interactables = this.interactables.filter((i) => i.id !== 'yawn');
    this.nearest = null;
    this.avatar.headTilt = 0.5;
    this._say(
      [
        { text: '（小王子张开嘴，打了一个哈欠）' },
        { speaker: '国王', text: '好，我命令你，再打一个。' },
        { text: '我实在打不出来。' },
        { speaker: '国王', text: '那么……你就在这儿住下吧，我任命你做我的大臣。' },
      ],
      () => {
        this.avatar.headTilt = 0;
        this._judge();
      }
    );
  }

  _meetKing() {
    this._markGoal(0);
    this._say(
      [
        { speaker: '国王', text: '啊！来了一个臣民。' },
        { speaker: '国王', text: '过来，让我好好看看你。' },
        { speaker: '国王', text: '你从哪里来？' },
        { text: '从一个很远的地方。' },
        { speaker: '国王', text: '啊！那么，你是从别的星球来的。' },
        { speaker: '国王', text: '我是这里的国王，我命令你……我命令你打一个哈欠。' },
        { text: '我打不出哈欠……我有点紧张。' },
        { speaker: '国王', text: '那……我命令你有时候打哈欠，有时候不打。' },
        {
          speaker: '国王',
          text: '权威首先要建立在理智上。我命令你打哈欠，是因为我确定你能打。',
        },
      ],
      () => {
        this._markGoal(1);
        this.yawned = false;
        // 国王说完后，把提示改成「打哈欠」，形成第二次交互
        this.addInteract({ id: 'yawn', dir: this.throneDir, radius: 1.5, label: '打一个哈欠', priority: -1 });
      }
    );
  }

  /** 玩家在交互按钮的第二次点击里完成「打哈欠」 */
  _judge() {
    this._markGoal(2);
    this.judged = true;
    this._say([
      { speaker: '国王', text: '我任命你做我的大法官。' },
      { text: '可是这里只有您一个人呀。' },
      { speaker: '国王', text: '那你就审判自己吧。审判自己，比审判别人难得多。' },
      { speaker: '国王', text: '你要是能正确地审判自己，你就是真正有智慧的人。' },
      { text: '我可以在任何地方审判自己。' },
      { speaker: '国王', text: '嗯……我想你该走了。我任命你做我的大使。' },
    ]);
  }

  _farewell() {
    this._markGoal(3);
    this._say(
      [
        { speaker: '国王', text: '我任命你做我的大使。' },
        { text: '大人们真是奇怪。' },
        { text: '小王子离开了 325 号小行星。' },
      ],
      () => this.game.completeChapter('king')
    );
  }
}

/**
 * 第三章：爱虚荣者的星球（326 号小行星）
 * 原著要点：他只听得见赞美；让小王子拍手，他脱帽致意；问「你真的觉得我很了不起吗」。
 */

const R$5 = 4.6;

class VanityChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R$5, spinSpeed: 0.014, palette: 'vanity' });
    // 柔光地表：淡紫地表 + 一圈会被灯光照亮的小花
    this.biome = {
      grass: 180,
      grassColors: [0x9d92b4, 0xb3a6c6, 0x8b84a6],
      flowers: 34,
      flowerColors: [0xf2d8ef, 0xe7c3e2, 0xffe6f4],
      motes: 210,
      motesColor: 0xffe3f0,
      shafts: 4,
      seed: 33,
    };
    this.root.rotation.z = -0.06;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R$5, color: 0x8d7f9e, detail: 38, bump: 0.028 });
    this.root.add(this.planet);

    // 主角站的高台：一根柱子 + 圆盘
    this.pedestalDir = D$1(80, 24);
    const stone = new MeshStandardMaterial({ color: 0x8d8496, roughness: 0.85, flatShading: true });
    const column = new Mesh(new CylinderGeometry(0.26, 0.32, 0.5, 12), stone);
    const pedestal = new Group();
    column.position.y = 0.25;
    column.castShadow = true;
    pedestal.add(column);
    const disc = new Mesh(new CylinderGeometry(0.36, 0.36, 0.06, 14), stone);
    disc.position.y = 0.53;
    pedestal.add(disc);
    placeOnSphere(pedestal, this.pedestalDir, 0, R$5);
    this.root.add(pedestal);

    // 一顶高帽（爱虚荣者的标志）
    const hatMat = new MeshStandardMaterial({ color: 0x2b2b38, roughness: 0.6, flatShading: true });
    const hat = new Group();
    const brim = new Mesh(new CylinderGeometry(0.19, 0.19, 0.014, 14), hatMat);
    hat.add(brim);
    const crown = new Mesh(new CylinderGeometry(0.1, 0.12, 0.26, 12), hatMat);
    crown.position.y = 0.13;
    hat.add(crown);
    this.hat = hat;
    placeOnSphere(hat, this.pedestalDir, 0.62, R$5);
    this.root.add(hat);

    this.vanityNPC = makeConceitedNPC();
    placeNPC(this.vanityNPC, besideDir(this.pedestalDir, R$5, 0.75, 90), R$5 + 0.02, this.walker.position);
    this.root.add(this.vanityNPC);

    // 掌声的视觉：金色小光点
    this.sparkles = makeSparkles(18, 0.55);
    placeOnSphere(this.sparkles, this.pedestalDir, 0.7, R$5);
    this.sparkles.visible = false;
    this.root.add(this.sparkles);

    // 镜子（他只看得见自己）
    const mirror = new Mesh(
      new CircleGeometry(0.24, 20),
      new MeshStandardMaterial({ color: 0xbfd0dd, roughness: 0.05, metalness: 0.9 })
    );
    this.mirrorDir = D$1(-40, 8);
    const mount = new Group();
    mirror.position.y = 0.4;
    mirror.rotation.x = -0.16;
    mount.add(mirror);
    const legMat = new MeshStandardMaterial({ color: 0x4a4450, roughness: 0.9 });
    for (const sx of [-1, 1]) {
      const leg = new Mesh(new CylinderGeometry(0.012, 0.012, 0.4, 6), legMat);
      leg.position.set(sx * 0.1, 0.2, 0);
      leg.rotation.z = sx * 0.16;
      mount.add(leg);
    }
    placeOnSphere(mount, this.mirrorDir, 0, R$5);
    this.root.add(mount);

    this.addInteract({ id: 'clap', dir: this.pedestalDir, radius: 1.6, label: '鼓掌', priority: 0 });
    this.addInteract({ id: 'mirror', dir: this.mirrorDir, radius: 1.3, label: '看看他的镜子', priority: 6 });

    this._spawnNearTarget('clap', 34);
  }

  _buildState() {
    this.goals = [
      '走近那个站在高台上的人',
      '为他鼓掌（他只想听掌声）',
      '再鼓一次掌',
      '问问他「了不起」是什么意思',
    ];
    this.goalsDone = new Set();
    this.stage = 0;
    this.claps = 0;
  }

  opening() {
    return [
      { text: '326 号小行星。这里住着一个爱虚荣的人。' },
      { text: '在他看来，所有的人都崇拜他。' },
      { text: '走近那个站在高台上的人' },
    ];
  }

  _animateEnv(dt) {
    const time = this.clock.elapsedTime;
    faceNPC(this.vanityNPC, this.walker.position, 0.08, dt);
    this.hat.rotation.y = Math.sin(time * 0.6) * 0.1;
    if (this.sparkles.visible) {
      const p = this.sparkles.geometry.getAttribute('position');
      const base = this.sparkles.userData.base;
      for (let i = 0; i < p.count; i++) {
        p.setY(i, base[i * 3 + 1] + Math.sin(time * 2 + i) * 0.04);
      }
      p.needsUpdate = true;
      this.sparkles.rotation.y = time * 0.7;
    }
  }

  onInteract(id) {
    if (id === 'mirror') {
      this._say([
        { text: '镜子擦得很亮，一点灰都没有。' },
        { speaker: '爱虚荣的人', text: '我每天都在练习。练习怎么被人崇拜。' },
        { text: '他在镜子里看了很久，像在看唯一一个观众。' },
      ]);
      return;
    }
    if (id === 'clap') {
      this.claps = 1;
      this._markGoal(0);
      this._markGoal(1);
      this.sparkles.visible = true;
      this.hat.position.y += 0.06; // 脱帽致意
      audio.chime(880);
      this._say([
        { text: '（小王子拍了拍手）' },
        { speaker: '爱虚荣的人', text: '（脱下帽子，谦逊地致意）' },
        { speaker: '爱虚荣的人', text: '这比访问国王有趣多了！' },
        { text: '（于是小王子又拍了拍手）' },
      ]);
      this.addInteract({ id: 'clap2', dir: this.pedestalDir, radius: 1.6, label: '再鼓一次掌', priority: -1 });
      return;
    }
    if (id === 'clap2') {
      this.claps = 2;
      this._markGoal(2);
      this.hat.position.y += 0.06;
      this._say([
        { text: '（小王子又拍了拍手）' },
        { speaker: '爱虚荣的人', text: '（又脱下帽子致意）' },
        { text: '这有什么好玩的呢？' },
        { speaker: '爱虚荣的人', text: '你真的觉得我很了不起吗？' },
        { text: '「了不起」是什么意思？' },
        { speaker: '爱虚荣的人', text: '了不起，就是所有的人都崇拜我。' },
        { text: '可是这里只有你一个人呀。' },
        { speaker: '爱虚荣的人', text: '那你就崇拜我吧！' },
        { text: '大人们真是奇怪。' },
      ], () => {
        this._markGoal(3);
        this.interactables = this.interactables.filter((i) => i.id !== 'clap2');
        this._leave();
      });
      return;
    }
  }

  _leave() {
    this._say([{ text: '小王子离开了 326 号小行星。' }], () => this.game.completeChapter('vanity'));
  }
}

/**
 * 第四章：酒鬼的星球（327 号小行星）
 * 原著要点：他在喝酒；为什么喝？为了忘记；忘记什么？忘记羞愧；
 * 羞愧什么？羞愧喝酒。小王子默默走了。
 */

const R$4 = 4.4;

class BarChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R$4, spinSpeed: 0.008, fog: 0x241a2a, fogDensity: 0.01, palette: 'bar' });
    // 柔光地表：这颗星球不长草，只有灯下慢慢飘的尘埃
    this.biome = { grass: 0, flowers: 0, motes: 90, motesColor: 0xffc98a, shafts: 0, seed: 41 };
    this.root.rotation.z = 0.12;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R$4, color: 0x574a66, detail: 34, bump: 0.03 });
    this.root.add(this.planet);

    // 酒桶与空瓶散落一地
    this.barrelDir = D$1(70, 20);
    const barrel = makeBarrel();
    placeOnSphere(barrel, this.barrelDir, 0, R$4);
    this.root.add(barrel);

    this.drunkNPC = makeTipplerNPC();
    placeNPC(this.drunkNPC, besideDir(this.barrelDir, R$4, 0.7, 90), R$4 + 0.02, this.walker.position);
    this.root.add(this.drunkNPC);

    this.bottles = [];
    for (const [az, lat, col] of [
      [-30, 4, 0x2c5b3a],
      [20, -8, 0x6b3a2c],
      [140, 10, 0x2c5b3a],
      [-90, -14, 0x3a3a5b],
      [200, 6, 0x6b3a2c],
    ]) {
      const b = makeBottle(col);
      placeOnSphere(b, D$1(az, lat), 0, R$4);
      b.rotation.y = Math.random() * 3;
      this.root.add(b);
      this.bottles.push(b);
    }

    // 一盏很暗的灯
    const lampMat = new MeshStandardMaterial({
      color: 0xffca80,
      emissive: 0xff9a40,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.8,
    });
    const lamp = new Mesh(new SphereGeometry(0.09, 10, 8), lampMat);
    const lampDir = D$1(160, 26);
    placeOnSphere(lamp, lampDir, 0.4, R$4);
    this.root.add(lamp);
    const glow = new PointLight(0xffab55, 0.9, 3, 2);
    glow.position.copy(lamp.position).multiplyScalar(1.06);
    this.root.add(glow);
    this.lampGlow = glow;

    this.addInteract({ id: 'drunk', dir: this.barrelDir, radius: 1.6, label: '问他为什么喝酒', priority: 0 });
    // 原著小事：地上散着的空瓶，是「他忘记了多久」的刻度
    this.addInteract({ id: 'bottles', dir: D$1(20, -8), radius: 1.3, label: '数一数他的空瓶', priority: 6 });

    this._spawnNearTarget('drunk', 34);
  }

  _buildState() {
    this.goals = ['走近那个低头喝酒的人', '问他：你在喝什么', '问他：为什么喝酒', '沉默地离开'];
    this.goalsDone = new Set();
    this.stage = 0;
  }

  opening() {
    return [
      { text: '327 号小行星。这里住着一个酒鬼。' },
      { text: '他坐在一堆空瓶中间，沉默地喝着。' },
      { text: '走近那个低头喝酒的人' },
    ];
  }

  _animateEnv(dt) {
    const time = this.clock.elapsedTime;
    faceNPC(this.drunkNPC, this.walker.position, 0.08, dt);
    for (let i = 0; i < this.bottles.length; i++) {
      this.bottles[i].rotation.z = Math.sin(time * 0.5 + i * 2) * 0.03;
    }
    // 灯忽明忽暗
    this.lampGlow.intensity = 0.7 + Math.sin(time * 1.7) * 0.25;
  }

  onInteract(id) {
    if (id === 'bottles') {
      this._say([
        { text: '空瓶子一共四十七个，摆得很整齐。' },
        { speaker: '酒鬼', text: '别数了。数完也不会少。' },
        { text: '每一瓶都是他忘掉的一天。' },
      ]);
      return;
    }
    if (id === 'drunk') {
      this._markGoal(0);
      this._markGoal(1);
      this.stage = 1;
      this._say([
        { text: '你在那儿干什么？' },
        { speaker: '酒鬼', text: '我在喝酒。' },
        { text: '你为什么喝酒？' },
        { speaker: '酒鬼', text: '为了忘记。' },
        { text: '忘记什么呢？' },
      ], () => {
        this.addInteract({ id: 'why', dir: this.barrelDir, radius: 1.6, label: '继续问下去', priority: -1 });
      });
      return;
    }
    if (id === 'why') {
      this._markGoal(2);
      this.stage = 2;
      this.interactables = this.interactables.filter((i) => i.id !== 'why');
      this._say([
        { speaker: '酒鬼', text: '忘记我的羞愧。' },
        { text: '羞愧什么呢？' },
        { speaker: '酒鬼', text: '羞愧我喝酒。' },
        { text: '……' },
        { text: '大人们真是奇怪。' },
        { text: '小王子默默地走开了。' },
      ], () => {
        this._markGoal(3);
        this.game.completeChapter('bar');
      });
      return;
    }
  }
}

/**
 * 第五章：商人的星球（328 号小行星）
 * 原著要点：他一刻不停地数星星，说它们都归他所有（因为没人想到要占有它们）；
 * 小王子反问：我拥有火山和花，我会给花浇水、给火山清扫——你为星星做了什么？
 */

const R$3 = 4.8;

class MerchantChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R$3, spinSpeed: 0.02, palette: 'merchant' });
    // 柔光地表：账本星球，稀疏的草与冷白色的光尘
    this.biome = {
      grass: 150,
      grassColors: [0x8f9a72, 0xa8a87e, 0x7f8d68],
      flowers: 16,
      flowerColors: [0xf4efd8, 0xe6ddc0],
      motes: 170,
      motesColor: 0xfff2cf,
      shafts: 4,
      seed: 57,
    };
    this.root.rotation.z = -0.1;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R$3, color: 0x857a63, detail: 36, bump: 0.026 });
    this.root.add(this.planet);

    // 计数台：一堆账本
    this.deskDir = D$1(75, 22);
    const desk = new Group();
    const wood = new MeshStandardMaterial({ color: 0x5d4630, roughness: 0.9, flatShading: true });
    const top = new Mesh(new BoxGeometry(0.7, 0.05, 0.44), wood);
    top.position.y = 0.34;
    top.castShadow = true;
    desk.add(top);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new Mesh(new CylinderGeometry(0.02, 0.02, 0.34, 6), wood);
      leg.position.set(sx * 0.3, 0.17, sz * 0.17);
      desk.add(leg);
    }
    placeOnSphere(desk, this.deskDir, 0, R$3);
    this.root.add(desk);

    this.ledgers = [];
    for (let i = 0; i < 4; i++) {
      const led = makeLedger();
      placeOnSphere(led, this.deskDir, 0.39, R$3);
      // 沿切平面微调，别叠成一摞
      led.translateX((i - 1.5) * 0.16);
      led.translateZ(((i % 2) - 0.5) * 0.1);
      this.root.add(led);
      this.ledgers.push(led);
    }

    // 漫天「属于他」的星星：一小片金色光点，越数越多
    this.starPile = new Group();
    const starMat = new MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 40; i++) {
      const s = new Mesh(new OctahedronGeometry(0.022, 0), starMat);
      const a = Math.random() * Math.PI * 2;
      const rr = 0.4 + Math.random() * 0.9;
      s.position.set(Math.cos(a) * rr, 0.25 + Math.random() * 1.1, Math.sin(a) * rr);
      this.starPile.add(s);
    }
    placeOnSphere(this.starPile, this.deskDir, 0.1, R$3);
    this.root.add(this.starPile);

    this.merchantNPC = makeBusinessmanNPC();
    placeNPC(this.merchantNPC, besideDir(this.deskDir, R$3, 0.72, 90), R$3 + 0.02, this.walker.position);
    this.root.add(this.merchantNPC);

    this.addInteract({ id: 'merchant', dir: this.deskDir, radius: 1.65, label: '问他在数什么', priority: 0 });
    // 原著小事：星星记在纸上，纸锁进抽屉
    this.drawerDir = besideDir(this.deskDir, R$3, 1.35, -75);
    const drawer = new Group();
    const box = new Mesh(
      new BoxGeometry(0.26, 0.16, 0.2),
      new MeshStandardMaterial({ color: 0x5d4630, roughness: 0.9, flatShading: true })
    );
    box.position.y = 0.08;
    drawer.add(box);
    const knob = new Mesh(
      new SphereGeometry(0.014, 8, 6),
      new MeshStandardMaterial({ color: 0xc7a45a, roughness: 0.4, metalness: 0.7 })
    );
    knob.position.set(0, 0.08, 0.105);
    drawer.add(knob);
    placeOnSphere(drawer, this.drawerDir, 0, R$3);
    this.root.add(drawer);
    this.addInteract({ id: 'drawer', dir: this.drawerDir, radius: 1.2, label: '看看那只抽屉', priority: 6 });

    this._spawnNearTarget('merchant', 34);
  }

  _buildState() {
    this.goals = ['走近那个低头数数的人', '问他在数什么', '听他说「星星都归我」', '反问：你为它们做了什么'];
    this.goalsDone = new Set();
    this.stage = 0;
  }

  opening() {
    return [
      { text: '328 号小行星。这里住着一个商人。' },
      { text: '他忙得连头都不抬——他在数星星。' },
      { text: '走近那个低头数数的人' },
    ];
  }

  _animateEnv(dt) {
    const t = this.clock.elapsedTime;
    faceNPC(this.merchantNPC, this.walker.position, 0.08, dt);
    // 星星缓慢上浮，像被点数过一样
    this.starPile.children.forEach((s, i) => {
      s.position.y = 0.25 + ((t * 0.12 + i * 0.13) % 1.1);
      s.rotation.y = t * 0.9 + i;
    });
    // 账页翻动
    this.ledgers.forEach((l, i) => {
      l.rotation.z = Math.sin(t * 1.3 + i) * 0.02;
    });
  }

  onInteract(id) {
    if (id === 'drawer') {
      this._say([
        { text: '抽屉锁着。里面是写着星星总数的纸。' },
        { speaker: '商人', text: '五亿零一百六十二万二千七百三十一颗。少一颗我都睡不着。' },
        { text: '没有人抬头看那些星星。它们只活在纸上。' },
      ]);
      return;
    }
    if (id === 'merchant') {
      this._markGoal(0);
      this._markGoal(1);
      this.stage = 1;
      this._say([
        { text: '你在那儿干什么？' },
        { speaker: '商人', text: '我在数星星。' },
        { text: '数星星做什么？' },
        { speaker: '商人', text: '因为它们都归我所有。' },
        { text: '星星怎么会归你呢？' },
        { speaker: '商人', text: '因为在我之前，从没有人想到要占有它们。' },
      ], () => {
        this._markGoal(2);
        this.addInteract({ id: 'ask', dir: this.deskDir, radius: 1.65, label: '反问他', priority: -1 });
      });
      return;
    }
    if (id === 'ask') {
      this.stage = 2;
      this.interactables = this.interactables.filter((i) => i.id !== 'ask');
      this._say([
        { text: '可是你拿星星做什么用呢？' },
        { speaker: '商人', text: '我把它们记下来，记在纸上，然后把纸锁进抽屉。' },
        { text: '而我，我拥有火山，我会为它们清扫。我拥有一朵花，我每天给她浇水。' },
        { text: '你对星星做过什么呢？' },
        { speaker: '商人', text: '……' },
        { text: '小王子觉得没意思，就走了。' },
      ], () => {
        this._markGoal(3);
        this.game.completeChapter('merchant');
      });
    }
  }
}

/**
 * 第六章：点灯人的星球（329 号小行星）
 * 原著要点：星球小得只放得下一盏路灯和一个点灯人；
 * 点灯人每分钟点一次灯、熄一次灯——他忠于职守，却累得不行。
 * 小王子觉得他「做的事情有意义」，但星球太小，容不下两个人。
 */

const R$2 = 3.4; // 全篇最小的星球

class LampChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R$2, spinSpeed: 0.03, fog: 0x101830, fogDensity: 0.012, palette: 'lamp' });
    // 柔光地表：一颗只够放一盏灯的小星球，几点冷草
    this.biome = {
      grass: 70,
      grassColors: [0x7d8a7a, 0x93a08c, 0x6e7c76],
      flowers: 6,
      flowerColors: [0xdce8ff, 0xc9dcf6],
      motes: 120,
      motesColor: 0xcfe4ff,
      shafts: 0,
      seed: 63,
    };
    this.root.rotation.z = 0.2;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R$2, color: 0x5b6377, detail: 32, bump: 0.024 });
    this.root.add(this.planet);

    // 路灯：全章的视觉中心
    this.lampDir = D$1(85, 18);
    this.lamp = makeStreetLamp();
    placeOnSphere(this.lamp, this.lampDir, 0, R$2);
    this.lamp.scale.setScalar(1.15);
    this.root.add(this.lamp);

    // 点灯人的小凳子
    this.stoolDir = D$1(40, 4);
    const stool = makeChair();
    stool.scale.setScalar(0.85);
    placeOnSphere(stool, this.stoolDir, 0, R$2);
    this.root.add(stool);

    this.lamplighterNPC = makeLamplighterNPC();
    placeNPC(this.lamplighterNPC, besideDir(this.lampDir, R$2, 0.55, 90), R$2 + 0.02, this.walker.position);
    this.root.add(this.lamplighterNPC);

    this.addInteract({ id: 'lamplighter', dir: this.lampDir, radius: 1.5, label: '和点灯人说话', priority: 0 });
    // 原著小事：小王子想帮点灯人点灯
    this.helpDir = besideDir(this.lampDir, R$2, 1.15, -100);
    this.addInteract({ id: 'light', dir: this.helpDir, radius: 1.2, label: '替他把灯点上', priority: 6 });

    // 这是第一颗「已经入夜」的星球
    this.sunAngle = 0.08;
    this._spawnNearTarget('lamplighter', 36);
  }

  _buildState() {
    this.goals = ['走近那盏路灯', '看点灯人点灯', '看点灯人熄灯', '和他道别'];
    this.goalsDone = new Set();
    this.stage = 0;
    this.lit = true;
    this.timer = 0;
    this.cycle = 6; // 每 6 秒一个昼夜（原著是每分钟一次，玩游戏不能等）
  }

  opening() {
    return [
      { text: '329 号小行星。这是最小的一颗星球，只放得下一盏路灯和一个点灯人。' },
      { text: '点灯人每分钟点一次灯，又熄一次灯。' },
      { text: '走近那盏路灯' },
    ];
  }

  _animateEnv(dt) {
    const time = this.clock.elapsedTime;
    faceNPC(this.lamplighterNPC, this.walker.position, 0.08, dt);
    // 灯亮暗呼吸
    const g = this.lamp.userData.glass;
    g.material.emissiveIntensity = this.lit ? 1.4 + Math.sin(time * 3) * 0.25 : 0.05;
    g.material.opacity = this.lit ? 0.85 : 0.35;
    this.lamp.userData.halo.material.opacity = this.lit ? 0.16 + Math.sin(time * 2.2) * 0.04 : 0.0;
    this.lamp.userData.light.intensity = this.lit ? 1.2 + Math.sin(time * 2.5) * 0.2 : 0;

    // 自动昼夜循环（点灯人自己也一直在干活）
    this.timer += dt;
    if (this.timer >= this.cycle) {
      this.timer = 0;
      this._toggleLamp(true);
    }
  }

  _toggleLamp(auto) {
    this.lit = !this.lit;
    this.sunAngle = this.lit ? 0.42 : -0.16;
    this._applySun();
    audio.chime(this.lit ? 660 : 392);
    if (auto) return;
  }

  onInteract(id) {
    if (id === 'light') {
      if (!this.lit) this._toggleLamp(false);
      this._say([
        { text: '（小王子伸手，替他把灯点亮）' },
        { speaker: '点灯人', text: '谢谢你。可再过一会儿，我又得把它熄掉。' },
        { text: '他守着一条谁也说不清从哪儿来的规矩。' },
      ]);
      return;
    }
    if (id === 'lamplighter') {
      this._markGoal(0);
      this.stage = 1;
      this._say([
        { text: '你好。你的灯怎么灭得这么快？' },
        { speaker: '点灯人', text: '命令就是命令。早安。' },
        { text: '（他把灯点亮了）' },
        { speaker: '点灯人', text: '……晚安。' },
        { text: '（他又把灯熄了）' },
      ], () => {
        this._markGoal(1);
        this.addInteract({ id: 'why2', dir: this.lampDir, radius: 1.5, label: '问他的辛苦', priority: -1 });
      });
      return;
    }
    if (id === 'why2') {
      this.stage = 2;
      this.interactables = this.interactables.filter((i) => i.id !== 'why2');
      this._say([
        { text: '你的星球这么小，一分钟就能转一圈，你连歇一会儿的工夫都没有。' },
        { speaker: '点灯人', text: '命令就是命令。这是规矩。' },
        { text: '这就是规矩？' },
        { speaker: '点灯人', text: '是啊。我点灯，熄灯。点灯，熄灯。' },
        { text: '我明白。' },
        { text: '这个人做着一件有意义的事——他点亮的不是一盏灯，是别人的路。' },
      ], () => {
        this._markGoal(2);
        this.addInteract({ id: 'bye', dir: this.lampDir, radius: 1.5, label: '向他道别', priority: -1 });
      });
      return;
    }
    if (id === 'bye') {
      this.interactables = this.interactables.filter((i) => i.id !== 'bye');
      this._say([
        { text: '我要走了。' },
        { speaker: '点灯人', text: '晚安。' },
        { text: '我想留下来陪他。可这颗星球太小了，容不下两个人。' },
        { text: '小王子离开了 329 号小行星。' },
      ], () => {
        this._markGoal(3);
        this.game.completeChapter('lamp');
      });
    }
  }
}

/**
 * 第七章：地理学家的星球（330 号小行星）
 * 原著要点：地理学家记录山川湖海，却从不离开书桌；
 * 「花是转瞬即逝的」——他这么一说，小王子第一次为留在家里的玫瑰担心。
 */

const R$1 = 5.2;

class GeoChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R$1, spinSpeed: 0.009, palette: 'geo' });
    // 柔光地表：地理学家的星球寸草不生 —— 他只记录山河，从不种花
    this.biome = { grass: 0, flowers: 0, motes: 150, motesColor: 0xffeecb, shafts: 4, seed: 71 };
    this.root.rotation.z = -0.04;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R$1, color: 0x6f6a5a, detail: 38, bump: 0.028 });
    this.root.add(this.planet);

    // 书桌 + 地图册
    this.deskDir = D$1(80, 26);
    const desk = new Group();
    const wood = new MeshStandardMaterial({ color: 0x4f3d29, roughness: 0.92, flatShading: true });
    const top = new Mesh(new BoxGeometry(0.8, 0.05, 0.5), wood);
    top.position.y = 0.36;
    top.castShadow = true;
    desk.add(top);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new Mesh(new CylinderGeometry(0.022, 0.022, 0.36, 6), wood);
      leg.position.set(sx * 0.34, 0.18, sz * 0.2);
      desk.add(leg);
    }
    placeOnSphere(desk, this.deskDir, 0, R$1);
    this.root.add(desk);

    this.books = [];
    for (let i = 0; i < 5; i++) {
      const b = makeLedger();
      placeOnSphere(b, this.deskDir, 0.41, R$1);
      b.translateX((i - 2) * 0.13);
      b.translateZ(((i % 2) - 0.5) * 0.08);
      this.root.add(b);
      this.books.push(b);
    }

    // 望远镜：他从不亲自去看，只用它「记录」
    this.scopeDir = D$1(10, 6);
    const scope = makeTelescope();
    placeOnSphere(scope, this.scopeDir, 0, R$1);
    scope.scale.setScalar(1.2);
    this.root.add(scope);

    // 地球仪：他研究的对象
    this.globeDir = D$1(-90, 12);
    const stand = new Group();
    const brass = new MeshStandardMaterial({ color: 0xb08d3a, roughness: 0.4, metalness: 0.8 });
    const sphere = new Mesh(
      new SphereGeometry(0.17, 18, 14),
      new MeshStandardMaterial({ color: 0x3f6b8a, roughness: 0.5, metalness: 0.2 })
    );
    sphere.position.y = 0.4;
    sphere.castShadow = true;
    stand.add(sphere);
    const ring = new Mesh(new TorusGeometry(0.19, 0.008, 5, 24), brass);
    ring.position.y = 0.4;
    ring.rotation.x = Math.PI / 2.4;
    stand.add(ring);
    const foot = new Mesh(new CylinderGeometry(0.09, 0.11, 0.05, 10), brass);
    stand.add(foot);
    const stem = new Mesh(new CylinderGeometry(0.014, 0.014, 0.24, 6), brass);
    stem.position.y = 0.16;
    stand.add(stem);
    placeOnSphere(stand, this.globeDir, 0, R$1);
    this.root.add(stand);
    this.globe = sphere;

    this.geographerNPC = makeGeographerNPC();
    placeNPC(this.geographerNPC, besideDir(this.deskDir, R$1, 0.6, 90), R$1 + 0.02, this.walker.position);
    this.root.add(this.geographerNPC);

    this.addInteract({ id: 'geo', dir: this.deskDir, radius: 1.7, label: '请教地理学家', priority: 0 });
    this.addInteract({ id: 'record', dir: this.scopeDir, radius: 1.3, label: '看看他在记录什么', priority: 6 });

    this._spawnNearTarget('geo', 34);
  }

  _buildState() {
    this.goals = [
      '走近那位伏案的地理学家',
      '请他记下这颗星球',
      '问他地球在哪里',
      '关心留在家里的那朵花',
      '启程去地球',
    ];
    this.goalsDone = new Set();
    this.stage = 0;
  }

  opening() {
    return [
      { text: '330 号小行星。这里住着一位地理学家。' },
      { text: '他写着一本很厚的书，却从没离开过这张书桌。' },
      { text: '走近那位伏案的地理学家' },
    ];
  }

  _animateEnv(dt) {
    const t = this.clock.elapsedTime;
    faceNPC(this.geographerNPC, this.walker.position, 0.08, dt);
    this.globe.rotation.y = t * 0.25;
    this.books.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.8 + i) * 0.015;
    });
  }

  onInteract(id) {
    if (id === 'record') {
      this._say([
        { text: '望远镜对着远处那座山。' },
        { speaker: '地理学家', text: '我在记那座山。它不会变。' },
        { text: '那花呢？' },
        { speaker: '地理学家', text: '花是转瞬即逝的。我不记转瞬即逝的东西。' },
        { text: '小王子第一次觉得，不被记录的东西，才最容易被忘记。' },
      ]);
      return;
    }
    if (id === 'geo') {
      this._markGoal(0);
      this._markGoal(1);
      this.stage = 1;
      this._say([
        { speaker: '地理学家', text: '你从哪儿来？' },
        { text: '从 B-612 号小行星来。' },
        { speaker: '地理学家', text: '我这里有很多山、很多海。' },
        { text: '这些我都见过。' },
        { speaker: '地理学家', text: '我没见过。我只是记录。' },
      ], () => {
        this._markGoal(2);
        this.addInteract({ id: 'ask2', dir: this.deskDir, radius: 1.7, label: '问他地球', priority: -1 });
      });
      return;
    }
    if (id === 'ask2') {
      this.stage = 2;
      this.interactables = this.interactables.filter((i) => i.id !== 'ask2');
      this._say([
        { text: '听说地球很有名，我们能去看看吗？' },
        { speaker: '地理学家', text: '地球啊。它是有名的。那里有一百一十一个国王，七千个地理学家……' },
        { text: '那你去过地球吗？' },
        { speaker: '地理学家', text: '我没有去。地理学家很重要，不能到处乱跑。' },
        { text: '你的花呢？它也是转瞬即逝的吗？' },
      ], () => {
        this.addInteract({ id: 'flower', dir: this.deskDir, radius: 1.7, label: '问问「转瞬即逝」', priority: -1 });
      });
      return;
    }
    if (id === 'flower') {
      this.interactables = this.interactables.filter((i) => i.id !== 'flower');
      this.stage = 3;
      this._say([
        { speaker: '地理学家', text: '花是转瞬即逝的。' },
        { text: '转瞬即逝，是什么意思？' },
        { speaker: '地理学家', text: '就是很快就会消失的意思。' },
        { text: '我的花很快就会消失吗？' },
        { text: '我把她一个人留在家里了！她只有四根刺，要对付整个世界！' },
        { text: '他第一次后悔出来。他决定去地球看看。' },
      ], () => {
        this._markGoal(3);
        this._markGoal(4);
        this.addInteract({ id: 'bye', dir: this.deskDir, radius: 1.7, label: '启程去地球', priority: -1 });
      });
      return;
    }
    if (id === 'bye') {
      this.interactables = this.interactables.filter((i) => i.id !== 'bye');
      this._say([{ text: '小王子离开了 330 号小行星，前往地球。' }], () =>
        this.game.completeChapter('geo')
      );
    }
  }
}

/**
 * 第八章 地球：全部场景与建模代码。
 * 一条 214 米长的沙路横穿星球，从落地点一直走到坠机处；
 * 沿途依次是蛇、小花、雪山、玫瑰园、狐狸、车站与火车、麦田与稻草人、
 * 卖药片的商摊、水井、飞机。尺度按「漫长旅途」设计，不是一圈小景。
 *
 * 坐标系（placeByRoute）：物体的局部 +X 沿路方向，+Z 朝向小径，
 * 所以所有模型都按「正面朝 +Z」来搭。
 */

const R = 100.0;

/** 路线方向：沿赤道前进 distance 米，side 为横向偏移（米，正为路线右侧）。 */
function routeDir(distance, side = 0) {
  const angle = distance / R;
  const forward = new Vector3(Math.sin(angle), 0, Math.cos(angle));
  return forward.multiplyScalar(Math.cos(side / R)).add(new Vector3(0, Math.sin(side / R), 0)).normalize();
}

/** 把物体立在路线旁并朝向小径。 */
function placeByRoute(obj, distance, side, radius = R) {
  const n = routeDir(distance, side);
  const a = distance / radius;
  const t = new Vector3(Math.cos(a), 0, -Math.sin(a));
  t.addScaledVector(n, -t.dot(n)).normalize();
  const z = new Vector3().crossVectors(t, n);
  if (side < 0) { t.negate(); z.negate(); }
  obj.position.copy(n).multiplyScalar(radius);
  obj.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(t, n, z));
  return n;
}

/** 整条旅途的坐标表（米）。改这里就能整体挪动某个事件区。 */
const EARTH = {
  snake: { d: 13, s: 1.6 },
  flower: { d: 29, s: -2 },
  mountain: { d: 48, s: -46, h: 26 },
  echo: { d: 47, s: -2.2 },
  garden: { d: 74, s: -14, w: 34, l: 24 },
  gardenGate: { d: 74, s: -1.9 },
  fox: { d: 106, s: 2.0 },
  station: { d: 132},
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
function M(color, roughness = 0.92, metalness = 0, extra) {
  const key = `${color}|${roughness}|${metalness}|${''}`;
  let m = MATS.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness, metalness, flatShading: true, ...({}) });
    MATS.set(key, m);
  }
  return m;
}

/** 自发光材质（灯、窗、岩浆等），单独存，避免和普通材质混淆。 */
function E(color, intensity = 1, opacity = 1) {
  const key = `e:${color}|${intensity}|${opacity}`;
  let m = MATS.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color, roughness: 0.6, metalness: 0,
      emissive: new Color(color).multiplyScalar(intensity),
      emissiveIntensity: 1,
      transparent: opacity < 1, opacity,
      flatShading: true,
    });
    MATS.set(key, m);
  }
  return m;
}

function B(parent, size, pos, material, ry = 0, shadow = true) {
  const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.y = ry;
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  parent.add(mesh);
  return mesh;
}

function C(parent, rTop, rBot, h, seg, pos, material, shadow = true) {
  const mesh = new Mesh(new CylinderGeometry(rTop, rBot, h, seg), material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  parent.add(mesh);
  return mesh;
}

function S(parent, r, pos, material, scale = [1, 1, 1], detail = 0) {
  const geo = detail ? new IcosahedronGeometry(r, detail) : new SphereGeometry(r, 8, 6);
  const mesh = new Mesh(geo, material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 批量实例：items = [{ p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz], c:color }] */
function inst(parent, geometry, material, items, shadow = false) {
  const mesh = new InstancedMesh(geometry, material, items.length);
  const dummy = new Object3D();
  const useColor = items.some((it) => it.c != null);
  if (useColor) mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(items.length * 3), 3);
  const col = new Color();
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
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 在路线两侧撒点，返回 [{ d, s }]。 */
function scatter(random, count, dMin, dMax, sMin, sMax) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({ d: dMin + random() * (dMax - dMin), s: sMin + random() * (sMax - sMin) });
  }
  return list;
}

// ---------------------------------------------------------------- 球面贴地工具

/** 球面上的一小块曲面（圆盘），比平面圆盘贴地，不会在边缘悬空。 */
function capMesh(dir, radiusMeters, color, lift = 0.012) {
  const angle = Math.min(1.3, radiusMeters / R);
  const geo = new SphereGeometry(R + lift, 30, 9, 0, Math.PI * 2, 0, angle);
  const mesh = new Mesh(geo, M(color, 1));
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  mesh.receiveShadow = true;
  return mesh;
}

/** frameAt 的一件：位置 + 朝向 + 缩放，用于实例化。 */
function FS(F, lx, ly, lz, sx = 1, sy = 1, sz = 1, ry = 0) {
  const m = F.mat(lx, ly, lz, ry);
  if (sx !== 1 || sy !== 1 || sz !== 1) m.multiply(new Matrix4().makeScale(sx, sy, sz));
  return m;
}

/** 实例化材质：颜色交给 instanceColor，基色必须为白。 */
function IM(roughness = 0.92, metalness = 0) {
  return new MeshStandardMaterial({ color: 0xffffff, roughness, metalness, flatShading: true });
}

/**
 * 以路线上的 (centerD, centerS) 为原点，建立一个「沿球面」的局部坐标系：
 * lx 沿路方向、lz 横向（正为朝小径）、ly 为离地高度（米）。
 * 所有大型建筑都通过它逐件摆放，保证每一件都立在地面上而不是切平面里。
 */
function frameAt(centerD, centerS) {
  const n = routeDir(centerD, centerS);
  const a = centerD / R;
  const t = new Vector3(Math.cos(a), 0, -Math.sin(a));
  t.addScaledVector(n, -t.dot(n)).normalize();
  const zAxis = new Vector3().crossVectors(t, n).normalize();
  if (centerS < 0) { t.negate(); zAxis.negate(); }
  const Y = new Vector3(0, 1, 0);
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
      const xx = new Vector3().crossVectors(up, zz).normalize(); // 右手系：X × Y = Z
      const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(xx, up, zz));
      if (ry) q.multiply(new Quaternion().setFromAxisAngle(Y, ry));
      return q;
    },
    mat(lx, ly, lz, ry = 0) {
      const up = api.dir(lx, lz);
      return new Matrix4().compose(up.multiplyScalar(R + ly), api.quat(lx, lz, ry), new Vector3(1, 1, 1));
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
function makeGroundPatches() {
  const g = new Group();
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
function pathSide(d) {
  return Math.sin(d * 0.055) * 1.7 + Math.sin(d * 0.021 + 1.3) * 0.9;
}

/**
 * 小径：一整条贴着地面的沙土小路（不再是凸起的石板）。
 * 用沿路线采样的带状网格，宽度 1.6 m，比地面色带高 2 cm 避免 z-fighting；
 * 中间略深、两侧略浅，看起来像被踩实的一条路。
 */
function makePath() {
  const g = new Group();
  const HALF = 0.8;          // 半宽（米）
  const STEP = 0.6;          // 采样步长（米）
  const LIFT = 0.02;         // 抬离地面，避免与地面色带打架
  const random = rng(5);
  const base = new Color(0xa98f66); // 踩实的土路：比四周沙地深一档，远看也认得出
  const pos = [];
  const col = [];
  const idx = [];
  const edgeLift = new Vector3();
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
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  // 绕序修正：球面上的带状网格如果整体绕反了，会被背面剔除——路就「消失」了。
  // 按三角形质心处的几何法线与向外的径向比较，整体反过来（不改单点法线，否则会撕裂）。
  const a1 = new Vector3(), b1 = new Vector3(), c1 = new Vector3();
  const ab = new Vector3(), ac = new Vector3(), nrmT = new Vector3();
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
  const mat = new MeshStandardMaterial({
    vertexColors: true, roughness: 0.97, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const ribbon = new Mesh(geo, mat);
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
  const chipGeo = new DodecahedronGeometry(1, 0);
  inst(g, chipGeo, new MeshStandardMaterial({ color: 0xa79572, roughness: 1, flatShading: true }), chips, false);
  return g;
}

/** 沿路的石堆路标（每 17 米一堆），强化「走了很久」。 */
function makeCairns() {
  const g = new Group();
  const geo = new DodecahedronGeometry(1, 0);
  const items = [];
  for (let d = 18; d < 210; d += 17) {
    const wobble = Math.sin(d * 0.055) * 1.7 + Math.sin(d * 0.021 + 1.3) * 0.9;
    const side = wobble + (d % 34 < 17 ? 1.5 : -1.5);
    const n = routeDir(d, side);
    const base = new Vector3(n.x * R, n.y * R, n.z * R);
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
  inst(g, geo, new MeshStandardMaterial({ color: 0x9d8b64, roughness: 1, flatShading: true }), items, true);
  return g;
}

/** 段式木栅栏：只在几段路上出现，避免全程雷同。 */
function makeRopeFence() {
  const g = new Group();
  const postMat = M(0x7d6242);
  const ropeMat = M(0xbb9a63);
  const spans = [[22, 40, -4.2], [62, 66, 3.6], [96, 104, -3.4], [176, 186, 3.4]];
  for (const [d0, d1, side] of spans) {
    const step = 2.4;
    for (let d = d0; d <= d1; d += step) {
      const n = routeDir(d, side);
      const post = C(g, 0.06, 0.07, 0.9, 5, [n.x * R, n.y * R + 0.45, n.z * R], postMat, false);
      const up = n;
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up);
      post.quaternion.copy(q);
      if (d + step <= d1) {
        const n2 = routeDir(d + step, side);
        const a = new Vector3(n.x * R, n.y * R + 0.72, n.z * R);
        const b = new Vector3(n2.x * R, n2.y * R + 0.72, n2.z * R);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = a.distanceTo(b);
        const rope = new Mesh(new CylinderGeometry(0.022, 0.022, len, 4), ropeMat);
        rope.position.copy(mid);
        rope.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.add(rope);
      }
    }
  }
  return g;
}

/** 散落岩石：大块放在远处做剪影，小块点缀路边。 */
function makeRockField() {
  const g = new Group();
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
function makeDunes() {
  const g = new Group();
  const random = rng(31);
  const duneMat = M(0xd3b57e, 1);
  const list = scatter(random, 30, 6, 214, -60, -8).concat(scatter(random, 18, 6, 214, 12, 58));
  for (const p of list) {
    const n = routeDir(p.d, p.s);
    const dune = new Mesh(new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), duneMat);
    const w = 3.5 + random() * 6;
    dune.scale.set(w, 0.5 + random() * 0.9, w * (0.6 + random() * 0.5));
    dune.position.set(n.x * R, n.y * R - 0.15, n.z * R);
    dune.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), n);
    dune.receiveShadow = true;
    g.add(dune);
  }
  return g;
}

/** 干枯灌木与枯树，点缀旅途。 */
function makeDryBrush() {
  const g = new Group();
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
  inst(g, new ConeGeometry(1, 1, 4), new MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, vertexColors: false }), bushItems, false);

  // 枯树：主干 + 三四根歪枝
  const bare = [[36, -9], [88, 12], [120, -8], [164, 10], [198, -12]];
  for (const [d, s] of bare) {
    const tree = new Group();
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
function makePalmTree(height = 4.2, lean = 0.16) {
  const g = new Group();
  const trunkMat = M(0x8d7448);
  const leafMat = M(0x6f8f45, 0.95);
  const trunk = C(g, 0.14, 0.26, height, 6, [0, height / 2, 0], trunkMat);
  trunk.rotation.z = lean;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const leaf = new Mesh(new ConeGeometry(0.42, 2.3, 4), leafMat);
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
function makeSnake() {
  const g = new Group();
  const rock = makeRock(1.15);
  rock.scale.set(1.5, 0.75, 1.3);
  rock.position.y = 0.1;
  g.add(rock);
  const gold = new MeshStandardMaterial({ color: 0xe8c25a, roughness: 0.35, metalness: 0.55, flatShading: true });
  // 盘绕的曲线
  const pts = [];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const a = t * Math.PI * 3.2;
    const r = 0.72 - t * 0.42;
    pts.push(new Vector3(Math.cos(a) * r, 0.28 + t * 0.16, Math.sin(a) * r));
  }
  const body = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.075, 6, false), gold);
  body.castShadow = true;
  g.add(body);
  const neck = C(g, 0.055, 0.075, 0.42, 6, [0.35, 0.68, 0.1], gold);
  neck.rotation.set(-0.35, 0, -0.5);
  const head = new Mesh(new SphereGeometry(0.11, 8, 6), gold);
  head.scale.set(1.5, 0.85, 1);
  head.position.set(0.52, 0.86, 0.24);
  head.castShadow = true;
  g.add(head);
  const eyeMat = M(0x2a1c10, 0.4);
  for (const sx of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.022, 6, 4), eyeMat);
    eye.position.set(0.58, 0.9, 0.24 + sx * 0.05);
    g.add(eye);
  }
  const tongue = new Mesh(new CylinderGeometry(0.008, 0.012, 0.16, 4), M(0xb2453f));
  tongue.position.set(0.66, 0.85, 0.24);
  tongue.rotation.z = Math.PI / 2;
  g.add(tongue);
  return g;
}

/** 三瓣小花：原著里那朵「人没有根」的花。 */
function makeThreePetalFlower() {
  const g = new Group();
  const stemMat = M(0x5f7f3c);
  C(g, 0.018, 0.026, 0.4, 5, [0, 0.2, 0], stemMat, false);
  const petalMat = new MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.7, emissive: 0x332f26, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const petal = new Mesh(new SphereGeometry(0.11, 8, 6), petalMat);
    petal.scale.set(1, 0.5, 1.35);
    petal.position.set(Math.cos(a) * 0.09, 0.43, Math.sin(a) * 0.09);
    petal.rotation.set(0.5, -a, 0);
    petal.castShadow = true;
    g.add(petal);
  }
  S(g, 0.05, [0, 0.42, 0], M(0xe6c766), [1, 0.8, 1]);
  for (const sx of [-1, 1]) {
    const leaf = new Mesh(new SphereGeometry(0.1, 6, 5), stemMat);
    leaf.scale.set(0.5, 0.12, 1);
    leaf.position.set(sx * 0.12, 0.16, 0);
    leaf.rotation.z = sx * 0.5;
    g.add(leaf);
  }
  // 脚边三块碎石与干草
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28 + 0.6;
    const peb = new Mesh(new DodecahedronGeometry(0.07 + i * 0.02, 0), M(0x9f8c66));
    peb.position.set(Math.cos(a) * 0.22, 0.04, Math.sin(a) * 0.22);
    g.add(peb);
  }
  return g;
}

/** 雪山：旅途的地标，26 米高，山顶积雪。 */
function makeMountain(height = 26) {
  const g = new Group();
  const rockMat = new MeshStandardMaterial({ color: 0x9a8c72, roughness: 0.98, flatShading: true });
  const snowMat = new MeshStandardMaterial({ color: 0xf3f4f2, roughness: 0.7, emissive: 0x2b3340, flatShading: true });
  const random = rng(9);

  const pts = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * height;
    const r = (1 - t) * (1 - t) * 15 + 1.2 + Math.sin(i * 2.3) * 1.5;
    pts.push(new Vector2(Math.max(0.6, r), y));
  }
  const body = new Mesh(new LatheGeometry(pts, 11), rockMat);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // 山脊：几块斜插的岩板
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const y = height * (0.35 + random() * 0.4);
    const r = (1 - y / height) * 11;
    const ridge = new Mesh(new ConeGeometry(1.6 + random() * 1.4, 7 + random() * 5, 4), rockMat);
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
    snowPts.push(new Vector2(Math.max(0.5, r), y));
  }
  const cap = new Mesh(new LatheGeometry(snowPts, 11), snowMat);
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
function makeRose(bloomColor = 0xd8384f, scale = 1) {
  const g = new Group();
  const stemMat = M(0x4f6f38);
  const leafMat = M(0x5c7f3f, 0.95);
  const petalMat = new MeshStandardMaterial({
    color: bloomColor, roughness: 0.62, emissive: new Color(bloomColor).multiplyScalar(0.18), flatShading: true,
  });
  const stem = C(g, 0.022, 0.032, 1.05, 5, [0, 0.52, 0], stemMat, false);
  stem.rotation.z = 0.05;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28 + 0.8;
    const leaf = new Mesh(new SphereGeometry(0.12, 6, 4), leafMat);
    leaf.scale.set(0.55, 0.16, 1.2);
    leaf.position.set(Math.cos(a) * 0.14, 0.36 + i * 0.2, Math.sin(a) * 0.14);
    leaf.rotation.set(0.35, -a, 0.2);
    g.add(leaf);
  }
  // 花萼
  const sepals = new Mesh(new ConeGeometry(0.11, 0.16, 5), leafMat);
  sepals.position.y = 1.0;
  g.add(sepals);
  // 花瓣：三层，越外越大、越平
  for (let layer = 0; layer < 3; layer++) {
    const n = 4 + layer;
    const rad = 0.1 - layer * 0.018;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + layer * 0.5;
      const petal = new Mesh(new SphereGeometry(rad, 7, 5), petalMat);
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
function makeRoseGarden(centerD, centerS, width = 34, depth = 24) {
  const g = new Group();
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
  inst(g, new BoxGeometry(1, 0.02, 1), IM(1), pathItems, false);

  // 围墙：两层砌块，前墙留 6.4 米门洞
  const wallItems = [];
  const blockGeo = new BoxGeometry(1.15, 0.52, 0.5);
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
      const pil = new Group();
      B(pil, [0.95, 1.9, 0.95], [0, 0.95, 0], stone);
      B(pil, [1.2, 0.2, 1.2], [0, 1.98, 0], stoneDark);
      S(pil, 0.32, [0, 2.24, 0], stoneDark, [1, 0.9, 1]);
      F.place(pil, sx * hw, 0, sz * hd);
      g.add(pil);
    }
  }

  // 大门：门柱 + 半圆拱 + 拱顶石
  const gate = new Group();
  for (const sx of [-1, 1]) {
    B(gate, [1.15, 4.1, 1.15], [sx * 3.2, 2.05, 0], stone);
    B(gate, [1.5, 0.24, 1.5], [sx * 3.2, 4.22, 0], stoneDark);
    S(gate, 0.3, [sx * 3.2, 4.6, 0], stoneDark, [1, 0.9, 1]);
  }
  const arch = new Mesh(new TorusGeometry(3.2, 0.34, 8, 24, Math.PI), stoneDark);
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
  inst(g, new IcosahedronGeometry(1, 0), IM(0.8), vineItems, false);

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
  inst(g, new BoxGeometry(1, 1, 1), IM(0.98), borderItems, false);
  inst(g, new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), IM(1), soilItems, false);
  inst(g, new IcosahedronGeometry(1, 1), IM(0.85), bushItems, false);
  inst(g, new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, emissive: 0x2a1418, flatShading: true }), bloomItems, false);

  // 中央喷泉
  const fountain = new Group();
  const basin = new Mesh(new CylinderGeometry(2.5, 2.7, 0.7, 18), stone);
  basin.position.y = 0.35;
  basin.castShadow = true;
  basin.receiveShadow = true;
  fountain.add(basin);
  const water = new Mesh(new CircleGeometry(2.25, 20), new MeshStandardMaterial({ color: 0x8fc9d8, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.62;
  fountain.add(water);
  C(fountain, 0.22, 0.44, 1.6, 8, [0, 1.0, 0], stone);
  const top = new Mesh(new CylinderGeometry(1.05, 0.75, 0.22, 14), stoneDark);
  top.position.y = 1.85;
  fountain.add(top);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28;
    const jet = new Mesh(new CylinderGeometry(0.02, 0.06, 0.72, 5), new MeshStandardMaterial({ color: 0xdff2f6, transparent: true, opacity: 0.55, roughness: 0.2 }));
    jet.position.set(Math.cos(a) * 0.55, 1.55, Math.sin(a) * 0.55);
    fountain.add(jet);
  }
  F.place(fountain, 0, 0, 0);
  g.add(fountain);

  // 后方凉架
  const pergola = new Group();
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
  inst(pergola, new IcosahedronGeometry(1, 0), IM(0.8), pergolaRoses, false);
  F.place(pergola, 0, 0, -hd + 3.4);
  g.add(pergola);

  // 六盏园灯
  const lampPosts = [];
  const lampGlobes = [];
  for (const [x, z] of [[-3.8, 6.6], [3.8, 6.6], [-3.8, -2.4], [3.8, -2.4], [-3.8, -8.6], [3.8, -8.6]]) {
    lampPosts.push({ m: FS(F, x, 0.95, z, 1, 1, 1), c: 0x8d8067 });
    lampGlobes.push({ m: FS(F, x, 2.02, z, 1, 1, 1) });
  }
  inst(g, new CylinderGeometry(0.07, 0.1, 1.9, 6), IM(0.9), lampPosts, false);
  inst(g, new SphereGeometry(0.2, 8, 6), new MeshStandardMaterial({ color: 0xffd89a, emissive: 0xffb25c, emissiveIntensity: 1.4, roughness: 0.5 }), lampGlobes, false);

  // 两条石凳
  for (const [x, z] of [[-7.4, 6.4], [7.4, -6.4]]) {
    const bench = new Group();
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
    const rose = makeRose(roseColors[i % roseColors.length], 1.2 + (i % 3) * 0.12);
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
function makeFox() {
  const g = new Group();
  const fur = new MeshStandardMaterial({ color: 0xd9863f, roughness: 0.85, emissive: 0x2a1a0c, flatShading: true });
  const lightFur = new MeshStandardMaterial({ color: 0xf2e2cf, roughness: 0.85, flatShading: true });
  const dark = M(0x2a1f18, 0.6);

  const body = new Mesh(new CapsuleGeometry(0.24, 0.42, 5, 8), fur);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.4, 0);
  body.castShadow = true;
  g.add(body);
  S(g, 0.2, [0.14, 0.42, 0], lightFur, [1, 0.85, 0.9]);

  // 头
  const head = new Group();
  head.position.set(0.44, 0.6, 0);
  S(head, 0.19, [0, 0, 0], fur, [1, 0.95, 1]);
  const muzzle = new Mesh(new ConeGeometry(0.1, 0.26, 6), lightFur);
  muzzle.rotation.z = -Math.PI / 2;
  muzzle.position.set(0.2, -0.03, 0);
  head.add(muzzle);
  S(head, 0.03, [0.32, -0.04, 0], dark);
  for (const sz of [-1, 1]) {
    const ear = new Mesh(new ConeGeometry(0.09, 0.24, 4), fur);
    ear.position.set(-0.03, 0.19, sz * 0.1);
    ear.rotation.set(sz * 0.2, 0, -0.1);
    head.add(ear);
    const eye = new Mesh(new SphereGeometry(0.026, 6, 4), dark);
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
  const tail = new Group();
  tail.position.set(-0.38, 0.5, 0);
  const tailMesh = new Mesh(new CapsuleGeometry(0.13, 0.52, 5, 7), fur);
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
function makeStation() {
  const g = new Group();
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
  const house = new Group();
  house.position.set(0, 0.34, -4.2);
  B(house, [8.4, 1.1, 5.2], [0, 0.55, 0], stone);
  B(house, [8.0, 2.4, 4.8], [0, 2.3, 0], timber);
  // 木饰横条
  for (const y of [1.4, 2.5, 3.3]) B(house, [8.05, 0.12, 4.85], [0, y, 0], M(0x6a472d), 0, false);
  // 山墙（三角）
  const gable = new Mesh(new CylinderGeometry(0.001, 2.75, 1.7, 3), timber);
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
  const clock = new Group();
  clock.position.set(0, 4.3, 2.42);
  const face = new Mesh(new CylinderGeometry(0.62, 0.62, 0.1, 18), M(0xf1e9d4, 0.6));
  face.rotation.x = Math.PI / 2;
  clock.add(face);
  const rim = new Mesh(new TorusGeometry(0.62, 0.06, 6, 20), metal);
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
    const bench = new Group();
    bench.position.set(sx * 3.5, 0.34, 0.7);
    for (const bx of [-0.75, 0.75]) B(bench, [0.12, 0.44, 0.5], [bx, 0.22, 0], metal, 0, false);
    B(bench, [1.9, 0.1, 0.5], [0, 0.46, 0], woodBench());
    B(bench, [1.9, 0.4, 0.09], [0, 0.7, -0.2], woodBench());
    g.add(bench);
  }

  // 三盏站台灯
  for (const x of [-5.2, 0, 5.2]) {
    C(g, 0.07, 0.11, 2.7, 6, [x, 1.35, 0.2], metal);
    const head = new Mesh(new SphereGeometry(0.22, 8, 6), E(0xffd79a, 1.7));
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
function makeTrain() {
  const black = M(0x2f3336, 0.55, 0.25);
  const red = M(0x8b3a35, 0.7);
  const green = M(0x3f5b46, 0.65);
  const brass = M(0xc9a24d, 0.35, 0.7);
  const steel = M(0x6e7377, 0.5, 0.5);
  const windowMat = E(0xffd79a, 1.0);
  const wheelMat = M(0x33373a, 0.6, 0.3);
  const wheelGeo = new CylinderGeometry(0.44, 0.44, 0.16, 12);

  function addWheels(group, xs, r = 0.44) {
    for (const x of xs) {
      for (const sz of [-0.72, 0.72]) {
        const w = new Mesh(wheelGeo, wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, r, sz);
        group.add(w);
      }
    }
  }

  // 车头（局部 +X 为前进方向）
  const loco = new Group();
  B(loco, [7.2, 0.3, 2.4], [0, 0.62, 0], black);
  const boiler = new Mesh(new CylinderGeometry(0.85, 0.85, 4.6, 14), black);
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(0.9, 1.5, 0);
  boiler.castShadow = true;
  loco.add(boiler);
  for (const x of [0.1, 1.5, 2.9]) {
    const band = new Mesh(new TorusGeometry(0.88, 0.06, 5, 16), brass);
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
  const cow = new Mesh(new CylinderGeometry(0.02, 0.9, 1.1, 3), black);
  cow.rotation.z = -Math.PI / 2;
  cow.position.set(3.55, 0.55, 0);
  loco.add(cow);
  S(loco, 0.19, [3.3, 2.1, 0], E(0xffe6b0, 2.0));
  for (const sz of [-0.8, 0.8]) {
    const buf = new Mesh(new CylinderGeometry(0.16, 0.16, 0.4, 8), steel);
    buf.rotation.z = Math.PI / 2;
    buf.position.set(3.75, 0.85, sz);
    loco.add(buf);
  }
  addWheels(loco, [-1.6, -0.4, 0.8]);

  // 煤水车
  const tender = new Group();
  B(tender, [3.2, 2.0, 2.3], [0, 1.35, 0], green);
  B(tender, [3.3, 0.14, 2.45], [0, 2.4, 0], black, 0, false);
  B(tender, [2.8, 0.4, 1.9], [0, 2.55, 0], M(0x23272a), 0, false);
  for (const sz of [-0.9, 0.9]) B(tender, [3.22, 0.1, 0.1], [0, 1.75, sz], brass, 0, false);
  addWheels(tender, [-1, 1.0]);

  // 两节车厢
  const cars = [];
  for (const idx of [0, 1]) {
    const car = new Group();
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
function makeWheatField(centerD, centerS, width = 34, depth = 26, count = 1400) {
  const g = new Group();
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
  inst(g, new CylinderGeometry(0.014, 0.024, 1, 3), IM(0.95), culms, false);
  inst(g, new ConeGeometry(0.055, 0.36, 4), IM(0.9), heads, false);
  // 田埂
  const ridges = [];
  for (let x = -width / 2; x <= width / 2; x += 3.4) ridges.push({ m: FS(F, x, 0.06, 0, 0.3, 1, depth), c: 0xa98f63 });
  inst(g, new BoxGeometry(1, 0.14, 1), IM(1), ridges, false);
  return g;
}

/** 稻草人：麦田中间那个歪着的家伙。 */
function makeScarecrow() {
  const g = new Group();
  const wood = M(0x7b5c3a);
  const cloth = M(0x9a6b4a);
  const hatMat = M(0x6d5433);
  C(g, 0.07, 0.09, 2.2, 6, [0, 1.1, 0], wood);
  B(g, [1.5, 0.12, 0.12], [0, 1.72, 0], wood);
  // 身体（麻袋）
  const body = new Mesh(new CylinderGeometry(0.26, 0.38, 0.95, 8), cloth);
  body.position.set(0, 1.35, 0);
  body.castShadow = true;
  g.add(body);
  // 补丁
  B(g, [0.2, 0.2, 0.04], [0.1, 1.3, 0.28], M(0x7d5236), 0, false);
  // 手臂布
  for (const sx of [-1, 1]) {
    const sleeve = new Mesh(new CylinderGeometry(0.09, 0.11, 0.55, 6), cloth);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(sx * 0.55, 1.66, 0);
    g.add(sleeve);
  }
  // 头与帽
  S(g, 0.21, [0, 2.0, 0], M(0xd9c39a), [1, 1.1, 1]);
  const brim = new Mesh(new CylinderGeometry(0.42, 0.42, 0.04, 10), hatMat);
  brim.position.set(0, 2.14, 0);
  g.add(brim);
  C(g, 0.16, 0.22, 0.26, 8, [0, 2.27, 0], hatMat);
  // 眼睛
  for (const sx of [-1, 1]) S(g, 0.03, [sx * 0.08, 2.02, 0.19], M(0x2a2118));
  return g;
}

/** 商贩摊：红白条纹遮阳棚、柜台、货架与小秤。 */
function makeMerchantStall() {
  const g = new Group();
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
  const awn = new Group();
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
  inst(g, new CylinderGeometry(0.09, 0.1, 0.18, 8), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true }), jars, false);

  // 托盘上的橙色药片（原著那瓶止渴药）
  const pills = [];
  const random = rng(88);
  for (let i = 0; i < 22; i++) {
    pills.push({ p: [(random() - 0.5) * 0.9, 1.03, 0.55 + (random() - 0.5) * 0.4], s: [1, 0.5, 1], c: random() > 0.5 ? 0xe08a4a : 0xf0b070 });
  }
  inst(g, new CylinderGeometry(0.05, 0.05, 0.03, 8), new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true }), pills, false);

  // 木箱与麻袋
  B(g, [0.9, 0.7, 0.8], [-2.6, 0.35, 0.9], woodDark);
  B(g, [0.9, 0.7, 0.8], [-2.6, 1.05, 0.9], wood);
  const sack = new Mesh(new CylinderGeometry(0.3, 0.42, 0.9, 8), M(0xb59b71));
  sack.position.set(2.6, 0.45, 0.9);
  g.add(sack);
  // 吊秤
  C(g, 0.02, 0.02, 0.5, 4, [1.7, 2.2, 1.2], tin, false);
  const pan = new Mesh(new CylinderGeometry(0.22, 0.22, 0.05, 10), tin);
  pan.position.set(1.7, 1.9, 1.2);
  g.add(pan);
  // 招牌
  B(g, [1.6, 0.5, 0.08], [0, 2.96, 1.5], woodDark, 0, false);
  return g;
}

/** 一口石砌水井：轱辘、绳、木桶、井台石。 */
function makeWell() {
  const g = new Group();
  const stone = M(0xa3937a);
  const stoneDark = M(0x85775f);
  const wood = M(0x7d5b39);
  const metal = M(0x5a5a58, 0.5, 0.4);

  // 井台
  const ring = new Mesh(new CylinderGeometry(1.5, 1.7, 0.85, 14, 1, true), stone);
  ring.position.y = 0.42;
  ring.castShadow = true;
  ring.receiveShadow = true;
  g.add(ring);
  const inner = new Mesh(new CylinderGeometry(1.24, 1.42, 0.9, 14, 1, true), stoneDark);
  inner.position.y = 0.42;
  g.add(inner);
  const rim = new Mesh(new TorusGeometry(1.36, 0.14, 6, 18), stone);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.86;
  g.add(rim);
  const water = new Mesh(new CircleGeometry(1.18, 14), new MeshStandardMaterial({ color: 0x4f8fa3, roughness: 0.15, metalness: 0.25 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.55;
  g.add(water);

  // 辘轳架
  for (const sz of [-1, 1]) {
    B(g, [0.18, 2.3, 0.18], [0, 1.9, sz * 1.35], wood);
  }
  B(g, [0.16, 0.16, 3.1], [0, 3.0, 0], wood, 0, false);
  const drum = new Mesh(new CylinderGeometry(0.16, 0.16, 2.2, 10), wood);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(0, 2.6, 0);
  g.add(drum);
  // 摇柄
  const crank = B(g, [0.07, 0.07, 0.5], [0.3, 2.6, 1.35], metal, 0, false);
  crank.rotation.x = Math.PI / 2;
  B(g, [0.07, 0.07, 0.28], [0.3, 2.6, 1.72], metal, 0, false);
  // 绳与桶
  C(g, 0.012, 0.012, 1.7, 4, [0, 1.75, 0], M(0xcbb37d), false);
  const bucket = new Mesh(new CylinderGeometry(0.22, 0.18, 0.34, 10, 1, true), wood);
  bucket.position.set(0, 0.9, 0);
  g.add(bucket);
  const hoop = new Mesh(new TorusGeometry(0.21, 0.02, 4, 12), metal);
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
function makePlane() {
  const g = new Group();
  const bodyMat = M(0xd8ad4e, 0.6, 0.25);
  const wingMat = M(0xe6cf8f, 0.65);
  const darkMat = M(0x4d4a44, 0.6, 0.3);
  const metal = M(0x8d8f8a, 0.45, 0.55);
  const glass = new MeshStandardMaterial({ color: 0x9fc4cf, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 });

  // 机身：前段粗、后段收细
  const fus = new Mesh(new CylinderGeometry(0.52, 0.22, 4.4, 10), bodyMat);
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
  const prop = new Group();
  prop.position.set(2.8, 1.25, 0);
  prop.rotation.z = 0.35;
  for (let i = 0; i < 3; i++) {
    const blade = new Mesh(new BoxGeometry(0.14, 1.05, 0.06), darkMat);
    blade.position.y = 0.5;
    blade.rotation.z = (i / 3) * Math.PI * 2;
    const holder = new Group();
    holder.rotation.x = (i / 3) * Math.PI * 2;
    holder.add(blade);
    prop.add(holder);
  }
  S(prop, 0.16, [0, 0, 0], metal);
  g.add(prop);
  // 起落架
  for (const sz of [-1, 1]) {
    C(g, 0.05, 0.05, 0.9, 5, [1.1, 1.25, sz * 0.75], metal, false);
    const wheel = new Mesh(new TorusGeometry(0.28, 0.09, 6, 12), darkMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(1.1, 0.5, sz * 0.95);
    g.add(wheel);
  }
  // 尾轮
  S(g, 0.16, [-2.1, 0.28, 0], darkMat);
  // 沙堆：机头陷进沙里
  const sand = new Mesh(new SphereGeometry(1, 12, 8, 0, 6.28, 0, Math.PI / 2), M(0xd2b47c, 1));
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
function makeSignpost(leftText = 0, angle = 0) {
  const g = new Group();
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
function makeRailway(centerD, centerS, length = 46) {
  const g = new Group();
  const F = frameAt(centerD, centerS);
  const ballast = [];
  const sleepers = [];
  const rails = [];
  for (let x = -length / 2; x < length / 2; x += 1.6) {
    ballast.push({ m: FS(F, x + 0.8, 0.04, 0, 1.7, 1, 3.4), c: 0x8b7d63 });
    sleepers.push({ m: FS(F, x, 0.11, 0, 0.32, 1, 2.1), c: 0x6f5a41 });
    for (const sz of [-0.72, 0.72]) rails.push({ m: FS(F, x + 0.8, 0.18, sz, 1.62, 1, 1), c: 0x6e7377 });
  }
  inst(g, new BoxGeometry(1, 0.08, 1), IM(1), ballast, false);
  inst(g, new BoxGeometry(1, 0.1, 1), IM(0.9), sleepers, false);
  inst(g, new BoxGeometry(1, 0.1, 0.12), IM(0.5, 0.5), rails, false);
  return g;
}

/**
 * 第八章：地球。
 * 一条 216 米长的沙路，从落地点一直走到坠机处：蛇、小花、雪山（回声）、
 * 玫瑰园、狐狸、车站与火车、麦田与稻草人、卖药片的商摊、水井、飞机。
 * 建模与摆放全部在 ../earth-scene.js，这里只负责把事件区串成一段旅途。
 */

// 回家路标离飞机多远（太远会让结尾变成一段枯燥的长走）
const HOME_BACK = 12;

class EarthChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R, spinSpeed: 0, fog: 0xc4a876, fogDensity: 0.0022, palette: 'earth' });
    this.biome = { grass: 0, flowers: 0, motes: 260, motesColor: 0xfff0cd, shafts: 5, seed: 87 };
    this.root.rotation.z = 0;
    this._buildScene();
    this._buildState();
    this._applySun();
    this.root.add(this.sun.target);
    this.walker.lookToward(new Vector3(1, 0, 0));
  }

  _buildScene() {
    // 平坦的沙色星球（地球章是平地，不是小球）
    this.planet = makePlanet({ radius: R, color: 0xd4b87a, detail: 20, bump: 0 });
    this.root.add(this.planet);

    // 地表色带、石板路、石堆路标、木栅段、岩石、沙丘、枯木
    this.root.add(makeGroundPatches());
    this.path = makePath();
    this.path.name = 'path';
    this.root.add(this.path);
    this.root.add(makeCairns());
    this.root.add(makeRopeFence());
    this.root.add(makeRockField());
    this.root.add(makeDunes());
    this.root.add(makeDryBrush());

    // ── 13 m：蛇
    this.snake = makeSnake();
    this.snakeDir = placeByRoute(this.snake, EARTH.snake.d, EARTH.snake.s, R);
    this.root.add(this.snake);

    // ── 29 m：三瓣小花
    this.flower = makeThreePetalFlower();
    // 根茎最低点在原点下方 6 cm，落地点抬高一点免得陷进沙里
    this.flowerDir = placeByRoute(this.flower, EARTH.flower.d, EARTH.flower.s, R + 0.06);
    this.root.add(this.flower);

    // ── 48 m：雪山，交互点在山脚路边
    this.mountain = makeMountain(EARTH.mountain.h);
    const mountainBase = placeByRoute(this.mountain, EARTH.mountain.d, EARTH.mountain.s, R);
    this.mountain.position.addScaledVector(mountainBase, -0.55); // 山脚埋进沙里，避免边缘悬空
    this.echoDir = routeDir(EARTH.echo.d, EARTH.echo.s);
    this.root.add(this.mountain);

    // ── 74 m：玫瑰园（34 × 24 米，围合式）
    this.garden = makeRoseGarden(EARTH.garden.d, EARTH.garden.s, EARTH.garden.w, EARTH.garden.l);
    this.root.add(this.garden);
    this.gardenDir = routeDir(EARTH.gardenGate.d, EARTH.gardenGate.s);

    // ── 106 m：狐狸
    this.fox = makeFox();
    this.foxDir = placeByRoute(this.fox, EARTH.fox.d, EARTH.fox.s, R);
    this.foxTail = this.fox.userData.tail;
    this.root.add(this.fox);

    // ── 134 m：车站、站台、铁轨、火车
    this.station = makeStation();
    placeByRoute(this.station, EARTH.platform.d, EARTH.platform.s, R);
    this.stationDir = routeDir(EARTH.station.d, -1.5);
    this.root.add(this.station);

    this.railway = makeRailway(EARTH.train.d, EARTH.train.s, 54);
    this.root.add(this.railway);

    const train = makeTrain();
    this.train = new Group();
    const vehicles = [
      [train.loco, EARTH.train.d + 1.2],
      [train.tender, EARTH.train.d - 3.6],
      [train.cars[0], EARTH.train.d - 9.2],
      [train.cars[1], EARTH.train.d - 17.0],
    ];
    for (const [obj, d] of vehicles) {
      placeByRoute(obj, d, EARTH.train.s, R);
      obj.position.addScaledVector(obj.position.clone().normalize(), 0.16);
      this.train.add(obj);
    }
    this.root.add(this.train);
    this.trainDir = routeDir(EARTH.train.d + 1, 0.4);

    // ── 152 m：麦田与稻草人
    this.wheat = makeWheatField(EARTH.wheat.d, EARTH.wheat.s, EARTH.wheat.w, EARTH.wheat.l, 1500);
    this.root.add(this.wheat);
    this.scarecrow = makeScarecrow();
    placeByRoute(this.scarecrow, EARTH.scarecrow.d, EARTH.scarecrow.s, R);
    this.root.add(this.scarecrow);

    // ── 168 m：商贩摊
    this.cart = makeMerchantStall();
    this.merchantDir = placeByRoute(this.cart, EARTH.merchant.d, EARTH.merchant.s, R);
    this.root.add(this.cart);
    this.merchantNPC = makeNPC({ coat: 0x4d6581, trim: 0xd1b876, pants: 0x35363d, hat: 'beret', hatColor: 0x4a4650, scale: 1.03 });
    placeNPC(this.merchantNPC, besideDir(this.merchantDir, R, 1.15, 90), R + 0.02, routeDir(EARTH.merchant.d - 1.6, 0));
    this.root.add(this.merchantNPC);

    // ── 192 m：水井与三棵棕榈
    this.well = makeWell();
    this.wellDir = placeByRoute(this.well, EARTH.well.d, EARTH.well.s, R);
    this.root.add(this.well);
    const palms = [[EARTH.well.d - 2.8, -1.9, 4.6, 0.18], [EARTH.well.d + 3.2, -2.6, 3.9, 0.1], [EARTH.well.d + 1.4, 2.8, 4.3, -0.14]];
    for (const [d, side, h, lean] of palms) {
      const palm = makePalmTree(h, lean);
      placeOnSphere(palm, routeDir(d, side), 0, R);
      this.root.add(palm);
    }

    // ── 214 m：坠毁的双翼飞机与飞行员
    this.plane = makePlane();
    this.pilotDir = placeByRoute(this.plane, EARTH.plane.d, EARTH.plane.s, R);
    this.root.add(this.plane);
    this.pilotNPC = makeNPC({ coat: 0x456b78, trim: 0xc79a4b, pants: 0x35383a, hat: 'pilot', hatColor: 0x8b7953, scale: 1.02 });
    placeNPC(this.pilotNPC, routeDir(EARTH.pilot.d, EARTH.pilot.s), R + 0.02, routeDir(EARTH.plane.d - 2, 0));
    this.pilotNPC.rotation.z = -0.32;
    this.root.add(this.pilotNPC);

    // 三块木牌路标，给长路一点方向感
    for (const [d, a] of [[36, 0.25], [96, -0.3], [172, 0.15]]) {
      const sign = makeSignpost(0, a);
      placeByRoute(sign, d, 2.8, R);
      this.root.add(sign);
    }

    // 沙漠里只有两处绿：玫瑰园门口的草地、井边的绿洲
    this.oasis = [];
    const apron = makeGrassField({
      radius: R + 0.012, count: 460, seed: 91,
      region: { dir: this.gardenDir, spread: 0.11 },
      colors: [0x9fcf6e, 0x86c05a, 0xc6dd8c], bladeH: 0.34,
    });
    this.root.add(apron);
    this.oasis.push(apron);
    const apronFlowers = makeFlowerField({
      radius: R + 0.012, count: 60, seed: 92,
      region: { dir: this.gardenDir, spread: 0.1 },
      palette: [0xff9fb0, 0xffd2dd, 0xfff0d0, 0xf7c1e0], size: 1.1,
    });
    this.root.add(apronFlowers);
    this.oasis.push(apronFlowers);
    const wellGrass = makeGrassField({
      radius: R + 0.012, count: 220, seed: 93,
      region: { dir: this.wellDir, spread: 0.13 },
      colors: [0x93c46a, 0xb0cf78], bladeH: 0.32,
    });
    this.root.add(wellGrass);
    this.oasis.push(wellGrass);

    // 交互点：用「路边的锚点」而不是道具本身的坐标，
    // 这样沿着沙路走就会一个个遇见（道具可以退到更远处构图）。
    this.addInteract({ id: 'snake', dir: routeDir(13, 0.8), radius: 2.2, label: '和蛇说话', priority: 0 });
    this.addInteract({ id: 'flower', dir: routeDir(29, -0.9), radius: 2.0, label: '看看小花', priority: 1 });
    this.addInteract({ id: 'echo', dir: routeDir(47, -1), radius: 3.0, label: '在山脚喊一声', priority: 2 });
    this.addInteract({ id: 'garden', dir: routeDir(EARTH.gardenGate.d, -1.2), radius: 3.0, label: '走进玫瑰园', priority: 3 });
    this.addInteract({ id: 'fox', dir: routeDir(106, 1.0), radius: 2.2, label: '和狐狸说话', priority: 4 });
    this.addInteract({ id: 'station', dir: routeDir(EARTH.station.d, -1.6), radius: 3.2, label: '看看车站', priority: 5 });
    this.addInteract({ id: 'merchant', dir: routeDir(EARTH.merchant.d, 1.7), radius: 2.6, label: '和商贩说话', priority: 6 });
    this.addInteract({ id: 'well', dir: routeDir(EARTH.well.d, -1.5), radius: 2.6, label: '去井边', priority: 7 });
    this.addInteract({ id: 'pilot', dir: routeDir(EARTH.plane.d, 1.2), radius: 3.2, label: '去看飞行员', priority: 8 });

    this.walker.spawn(routeDir(0));
    this.walker.sync(true);
  }

  _buildState() {
    this.goals = [
      '在沙漠里走一走', '遇见蛇', '看看那朵小花', '在高山下喊一声',
      '看看玫瑰园', '和狐狸做朋友', '驯服狐狸', '看看火车站',
      '和商贩聊聊', '去井边', '找到飞行员', '回去找你的玫瑰',
    ];
    this.goalsDone = new Set();
    this.stage = 0;
  }

  opening() {
    return [
      { text: '他落在了地球上。一片沙漠，一个人也没有。' },
      { text: '地球上有一百一十一个国王、七千个地理学家、九十多万个商人……' },
      { text: '在沙漠里走一走' },
      { text: '（沿着沙路一直往前走，地球比想象中大得多。走到有东西的地方，右下会出现按钮）' },
    ];
  }

  /** 结局用的路标：落地点上的一束光，让玩家看得见该往哪里走。 */
  _makeHomeBeacon() {
    const g = new Group();
    const beamMat = new MeshBasicMaterial({
      color: 0xbfe4ff, transparent: true, opacity: 0.09,
      depthWrite: false, side: DoubleSide, blending: AdditiveBlending,
    });
    const beam = new Mesh(new CylinderGeometry(0.45, 1.0, 7.5, 14, 1, true), beamMat);
    beam.position.y = 3.7;
    g.add(beam);
    const glowMat = new MeshBasicMaterial({
      color: 0xd6efff, transparent: true, opacity: 0.32,
      depthWrite: false, blending: AdditiveBlending,
    });
    const ring = new Mesh(new RingGeometry(0.9, 1.4, 32), glowMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const mote = new Mesh(new SphereGeometry(0.04, 6, 5), glowMat);
      mote.position.set(Math.cos(a) * 1.05, 0.25 + i * 0.62, Math.sin(a) * 1.05);
      g.add(mote);
    }
    g.userData.ring = ring;
    g.userData.beam = beam;
    placeByRoute(g, EARTH.plane.d - HOME_BACK, 0, R);
    return g;
  }

  _extraTick(dt) {
    if (this.sun && this.walker) {
      this.sun.target.position.copy(this.walker.position);
      this.sun.position.copy(this.walker.position).addScaledVector(this.sunDir, 28);
      this.sun.target.updateMatrixWorld();
      this.sun.shadow.camera.far = 70;
    }
    this._animateEnv(dt);
  }

  _animateEnv(dt) {
    const t = this.clock.elapsedTime;
    if (this.flower) this.flower.rotation.y = Math.sin(t * 0.48) * 0.09;
    if (this.foxTail) this.foxTail.rotation.z = 0.72 + Math.sin(t * 1.5) * 0.12;
    if (this.fox) this.fox.userData.head.rotation.y = Math.sin(t * 0.7) * 0.12;
    faceNPC(this.merchantNPC, this.walker.position, 0.08, dt);
    faceNPC(this.pilotNPC, this.walker.position, 0.08, dt);
    if (this.garden) {
      const hero = this.garden.userData.hero || [];
      for (let i = 0; i < hero.length; i++) {
        hero[i].scale.setScalar(1 + Math.sin(t * 0.9 + i * 0.8) * 0.014);
      }
      const fountain = this.garden.userData.fountain;
      if (fountain && fountain.userData.water) {
        fountain.userData.water.material.opacity = 0.82 + Math.sin(t * 1.9) * 0.04;
      }
    }
    if (this.homeBeacon) {
      const { ring, beam } = this.homeBeacon.userData;
      ring.rotation.z = t * 0.55;
      ring.scale.setScalar(1 + Math.sin(t * 1.7) * 0.06);
      beam.material.opacity = 0.07 + (Math.sin(t * 1.6) * 0.5 + 0.5) * 0.05;
    }
  }

  onInteract(id) {
    if (id === 'snake' && !this.snakeDone) {
      this.snakeDone = true;
      this._markGoal(1);
      audio.chime(220);
      this._say([
        { text: '（一条金色的蛇，在沙子里抬起头）' },
        { speaker: '蛇', text: '地球上，在非洲。' },
        { speaker: '蛇', text: '你这么弱小，落在这花岗岩的地球上，我可怜你。' },
        { speaker: '蛇', text: '哪天你太想念你的星球，我可以帮你。' },
        { text: '我不需要你。我需要我的花。' },
      ]);
      return;
    }
    if (id === 'flower' && !this.flowerDone) {
      this.flowerDone = true;
      this._markGoal(2);
      audio.chime(246.94);
      this._say([
        { text: '（一朵三个花瓣的小花）' },
        { text: '你好！' },
        { speaker: '小花', text: '你好……' },
        { text: '人在哪儿？' },
        { speaker: '小花', text: '人？风吹着他们到处走。他们没有根，这让他们很难办。' },
      ]);
      return;
    }
    if (id === 'echo' && !this.echoDone) {
      this.echoDone = true;
      this._markGoal(3);
      audio.chime(293.66);
      this._say([
        { text: '（在高山脚下）' },
        { text: '你好！做我的朋友吧，我很孤独。' },
        { text: '你好……我很孤独……' },
        { text: '我很孤独……' },
        { text: '（只有回声）' },
      ]);
      return;
    }
    if (id === 'garden' && !this.gardenDone) {
      this.gardenDone = true;
      this._markGoal(4);
      this.avatar.headTilt = -0.6;
      this._say([
        { text: '（推开园门：石墙、喷泉、爬满花的拱门，五千朵一模一样的玫瑰）' },
        { text: '你们是谁？' },
        { speaker: '玫瑰们', text: '我们是玫瑰。' },
        { text: '我还以为我有一朵独一无二的花，原来只是一朵普通的玫瑰。' },
        { text: '（小王子趴在草地上，哭了）', onShow: () => { this.avatar.headTilt = 0; } },
      ]);
      return;
    }
    if (id === 'fox' && !this.tamed) {
      if (!this.foxStarted) {
        this.foxStarted = true;
        this._markGoal(5);
        this._say([
          { text: '来和我玩吧。我很难过……' },
          { speaker: '狐狸', text: '我不能和你玩。我没有被驯养。' },
          { text: '「驯养」是什么意思？' },
          { speaker: '狐狸', text: '就是「建立联系」。' },
          { speaker: '狐狸', text: '对我来说，你还只是一个小男孩，和十万个小男孩一模一样。' },
          { speaker: '狐狸', text: '可如果你驯养了我，你对我就是世上唯一的。' },
          { text: '我开始明白了。有一朵花……我想她驯养了我……' },
          { speaker: '狐狸', text: '再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。' },
        ], () => this.addInteract({ id: 'tame', dir: routeDir(106, 1.0), radius: 2.2, label: '驯服狐狸', priority: -1 }));
      }
      return;
    }
    if (id === 'tame') {
      this.tamed = true;
      this.interactables = this.interactables.filter((item) => item.id !== 'tame');
      this._markGoal(6);
      audio.chime(523.25);
      this._say([
        { text: '（小王子每天在同一时间来。狐狸慢慢地靠近他）' },
        { text: '你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。' },
        { speaker: '狐狸', text: '这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。' },
        { speaker: '狐狸', text: '是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。' },
        { speaker: '狐狸', text: '你要永远为你驯养的东西负责。你要对你的玫瑰负责……' },
        { text: '我要对我的玫瑰负责……' },
      ]);
      return;
    }
    if (id === 'station' && !this.stationDone) {
      this.stationDone = true;
      this._markGoal(7);
      audio.chime(349.23);
      this._say([
        { text: '（一个小车站，一列火车）' },
        { text: '（火车驶过）' },
        { text: '他们这么急，在找什么呢？' },
        { text: '（没有人回答）' },
      ]);
      return;
    }
    if (id === 'merchant' && !this.merchantDone) {
      this.merchantDone = true;
      this._markGoal(8);
      audio.chime(392);
      this._say([
        { text: '（一个卖药片的商人）' },
        { speaker: '商贩', text: '这药片能解渴，一星期吃一粒就行。' },
        { text: '你为什么卖这个？' },
        { speaker: '商贩', text: '可以节省时间。专家算过，一星期可以省五十三分钟。' },
        { text: '如果我有五十三分钟，我会悠闲地走向一口井……' },
      ]);
      return;
    }
    if (id === 'well' && !this.wellDone) {
      this.wellDone = true;
      this._markGoal(9);
      audio.chime(440);
      this._say([
        { text: '（一口井）' },
        { text: '让沙漠变美的，是它在什么地方藏着一口井……' },
        { text: '真正重要的东西，眼睛是看不见的。' },
      ]);
      return;
    }
    if (id === 'pilot' && !this.pilotDone) {
      this.pilotDone = true;
      this._markGoal(10);
      audio.chime(493.88);
      this._say([
        { text: '（一架坠毁的飞机，飞行员在修理）' },
        { text: '啊！你的回忆真美。可你还没修好飞机。' },
        { speaker: '飞行员', text: '今天夜里，就满一年了。你的星星，会正好在你去年落下的地方上空……' },
        { text: '我该回去了。我的花在等我。' },
        { speaker: '蛇', text: '我会帮你的。' },
        { speaker: '蛇', text: '你落下来的地方，沙上还留着你的脚印。今夜我在那儿等你。' },
        { text: '（往回走。石路的尽头，有一点光。）' },
      ], () => {
        // 旅途到此为止：清掉沿路的旧提示（蛇、花、车站……），只留下回家的路标，
        // 否则玩家走回来时会先看到「和蛇说话」，点了却没反应。
        this.interactables = [];
        this.homeBeacon = this._makeHomeBeacon();
        this.root.add(this.homeBeacon);
        this.addInteract({ id: 'home', dir: routeDir(EARTH.plane.d - HOME_BACK, 0.8), radius: 3.0, label: '回到落下来的地方', priority: -1 });
      });
      return;
    }
    if (id === 'home') {
      this.interactables = this.interactables.filter((item) => item.id !== 'home');
      this._markGoal(11);
      audio.chime(659.25);
      this._say([
        { text: '（他回到了自己落下来的那片沙地。四下里只有风，和头顶那颗星。）' },
        { text: '他抬起头。B-612 就在那里，小得像一粒光。' },
        { speaker: '小王子', text: '狐狸说得对。时间是我给她的——浇水、挡风、听她抱怨，还假装没听见她的骄傲。' },
        { speaker: '小王子', text: '我一直以为她需要的是一个玻璃罩。其实她需要的是我肯留下来，站在她旁边，什么也不做也可以。' },
        { text: '他蹲下去，把手贴在沙上，像是隔着很远的距离，摸到了那四根刺。' },
        { speaker: '小王子', text: '我要回去。不是因为怕她枯萎，是因为我想看着她长大。' },
        { speaker: '小王子', text: '我会把椅子搬到她旁边。日落的时候，我们一起看。' },
        { text: '沙地上没有新的脚印，只有风。可他知道回去的路了。' },
        { text: '（夜里抬头看星星——如果你也抬头，会看见其中一颗在笑。）' },
      ], () => this.game.completeChapter('earth'));
      return;
    }
  }
}

/**
 * 章节注册表：id → 章节类。
 * game.js 只认这张表，不再硬编码某一颗星球，
 * 未注册的星球在地图上显示为「还在建造中」。
 */

const CHAPTERS = {
  b612: B612Chapter,
  king: KingChapter,
  vanity: VanityChapter,
  bar: BarChapter,
  merchant: MerchantChapter,
  lamp: LampChapter,
  geo: GeoChapter,
  earth: EarthChapter,
};

function chapterIds() {
  return Object.keys(CHAPTERS);
}

function createChapter(id, game) {
  const Cls = CHAPTERS[id];
  if (!Cls) return null;
  return new Cls(game);
}

/**
 * 资源 URL 解析。
 * 本地开发时页面在 / 上，构建后可能挂在任意子目录；
 * 统一用相对于当前文档的路径，避免写死前导斜杠。
 */
const base = (() => {
  // 构建脚本会注入 window.__LP_BASE；默认按文档所在目录解析
  if (typeof window !== 'undefined' && window.__LP_BASE) return window.__LP_BASE;
  const path = location.pathname;
  const dir = path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
  return dir || '/';
})();

function asset(p) {
  return base + 'assets/' + String(p).replace(/^\/+/, '');
}

/**
 * 旅程地图 v2：星座式航线 + 星球徽章 + 章节进度。
 *
 * 交互设计针对 iOS（沿用旧版的两段式点击，测试脚本依赖这个行为）：
 *   - 第一次点星球：选中，底部升起卡片（章号 / 名字 / 一句话 / 探索度）
 *   - 第二次点同一颗（或点卡片按钮）：降落
 *   - 未实现的星球仍然可以点，卡片会说明「还在建造中」
 *
 * 视觉全部程序化：星空 canvas、SVG 航线、CSS 光晕，不新增任何图片资源。
 */
// 用注册表派生「可玩」标记：注册表加一章，地图就自动解锁一颗，不需要改两处
applyBuilt(chapterIds());

/** 稳定的伪随机：同一个种子画出同一片星空，窗口尺寸变化时不会「换一片天」 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 过点生成平滑曲线（Catmull-Rom → 三次贝塞尔），坐标是像素 */
function curveThrough(pts, tension = 0.55) {
  if (!pts || pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

class JourneyMap {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('map');
    this.listEl = document.getElementById('map-planets');
    this.captionEl = document.getElementById('map-caption');
    this.cardEl = document.getElementById('map-card');
    this.actEl = document.getElementById('map-act');
    this.starsEl = document.getElementById('map-stars');
    this.routeEl = document.getElementById('map-route');
    this.routeBase = document.getElementById('route-base');
    this.routeLit = document.getElementById('route-lit');
    this.progressEl = document.getElementById('map-progress');
    this.meterEl = document.getElementById('map-meter-fill');
    this.badgesPanel = document.getElementById('map-badges-panel');
    this.badgesList = document.getElementById('badges-list');
    this.selected = null;
    this.built = false;
    this._unit = 80;

    this._bindParallax();
  }

  // ------------------------------------------------------------ 构建
  build() {
    if (this.built) return;
    this.built = true;
    this.listEl.innerHTML = '';

    PLANETS.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.className = 'planet';
      btn.dataset.id = p.id;
      btn.style.left = p.x * 100 + '%';
      btn.style.top = p.y * 100 + '%';
      btn.style.animationDelay = i * 70 + 'ms';

      const halo = document.createElement('span');
      halo.className = 'halo';
      btn.appendChild(halo);

      const img = document.createElement('img');
      img.src = asset('img/planets/' + p.thumb + '.webp');
      img.alt = '';
      img.decoding = 'async';
      img.loading = i < 3 ? 'eager' : 'lazy';
      btn.appendChild(img);

      const no = document.createElement('span');
      no.className = 'planet-no';
      no.textContent = String(i + 1).padStart(2, '0');
      btn.appendChild(no);

      const tag = document.createElement('span');
      tag.className = 'planet-tag';
      tag.textContent = t('下一站');
      btn.appendChild(tag);

      const label = document.createElement('span');
      label.className = 'planet-label';
      label.textContent = t(p.name);
      btn.appendChild(label);

      btn.addEventListener('click', () => this.pick(p.id));
      this.listEl.appendChild(btn);
      p._el = btn;
    });

    this._buildBadges();
    this.layout();
    this.refresh();
  }

  /** 尺寸变化时重新算星球大小与航线（航线是像素坐标，必须跟着重画） */
  layout() {
    if (!this.el) return;
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    const base = Math.min(w, h);
    const unit = Math.max(54, Math.min(112, base * 0.155));
    this._unit = unit;

    for (const p of PLANETS) {
      if (!p._el) continue;
      p._el.style.setProperty('--sz', unit * p.size + 'px');
    }

    if (this.starsEl) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.starsEl.width = Math.round(w * dpr);
      this.starsEl.height = Math.round(h * dpr);
      this.starsEl.style.width = w + 'px';
      this.starsEl.style.height = h + 'px';
      this._paintStars(w, h, dpr);
    }

    if (this.routeEl) {
      this.routeEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
      this.routeEl.setAttribute('width', w);
      this.routeEl.setAttribute('height', h);
      this._routeW = w;
      this._routeH = h;
      this.refresh();
    }
  }

  /** 星空：一次性画到 canvas，靠 CSS 呼吸不重绘，几乎不耗电 */
  _paintStars(w, h, dpr) {
    const c = this.starsEl;
    if (!c) return;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const rnd = mulberry32(20250601);
    const count = Math.round((w * h) / 5200);
    for (let i = 0; i < count; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = rnd() < 0.86 ? 0.5 + rnd() * 0.9 : 1.3 + rnd() * 1.4;
      const a = 0.18 + rnd() * 0.62;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = `rgba(244, 236, 216, ${a.toFixed(2)})`;
      g.fill();
      if (r > 1.3) {
        const grad = g.createRadialGradient(x, y, 0, x, y, r * 5);
        grad.addColorStop(0, `rgba(255, 236, 196, ${(a * 0.5).toFixed(2)})`);
        grad.addColorStop(1, 'rgba(255, 236, 196, 0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, r * 5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  _points(upTo) {
    const w = this._routeW || this.el.clientWidth || window.innerWidth;
    const h = this._routeH || this.el.clientHeight || window.innerHeight;
    const list = upTo == null ? PLANETS : PLANETS.slice(0, upTo);
    return list.map((p) => ({ x: p.x * w, y: p.y * h }));
  }

  _buildBadges() {
    if (!this.badgesList) return;
    this.badgesList.innerHTML = '';
    for (const b of BADGES) {
      const li = document.createElement('li');
      li.className = 'badge-item';
      li.dataset.id = b.id;
      const img = document.createElement('img');
      img.src = asset('img/ui/' + b.img + '.webp');
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      const box = document.createElement('div');
      box.className = 'badge-text';
      const name = document.createElement('b');
      name.textContent = t(b.name);
      const note = document.createElement('span');
      note.textContent = t(b.note);
      box.appendChild(name);
      box.appendChild(note);
      const state = document.createElement('em');
      state.textContent = t('尚未解锁');
      li.appendChild(img);
      li.appendChild(box);
      li.appendChild(state);
      this.badgesList.appendChild(li);
    }
  }

  // ------------------------------------------------------------ 状态刷新
  refresh() {
    const visited = this.game.progress.visited || [];
    const next = PLANETS.find((p) => p.built && !visited.includes(p.id));

    for (const p of PLANETS) {
      if (!p._el) continue;
      const seen = visited.includes(p.id);
      p._el.classList.toggle('is-visited', seen);
      p._el.classList.toggle('is-next', !!next && next.id === p.id);
      p._el.classList.toggle('is-locked', !p.built);
      p._el.classList.toggle('is-sel', this.selected === p.id);
    }

    // 航线：走过多少颗，就把航段亮到那里
    if (this.routeBase && this.routeLit) {
      const all = this._points();
      this.routeBase.setAttribute('d', curveThrough(all));
      let last = -1;
      PLANETS.forEach((p, i) => {
        if (visited.includes(p.id)) last = Math.max(last, i);
      });
      const lit = last >= 0 ? this._points(last + 1) : [];
      this.routeLit.setAttribute('d', lit.length > 1 ? curveThrough(lit) : '');
    }

    const total = PLANETS.length;
    if (this.progressEl) {
      this.progressEl.textContent = `${t('已拜访')} ${visited.length} / ${total} ${t('颗星球')}`;
    }
    if (this.meterEl) this.meterEl.style.width = (visited.length / total) * 100 + '%';

    // 徽章
    const got = earnedBadges(visited).map((b) => b.id);
    if (this.badgesList) {
      for (const li of this.badgesList.children) {
        const on = got.includes(li.dataset.id);
        li.classList.toggle('is-earned', on);
        const em = li.querySelector('em');
        if (em) em.textContent = on ? t('已解锁') : t('尚未解锁');
      }
    }
  }

  // ------------------------------------------------------------ 交互
  pick(id) {
    const p = PLANETS.find((x) => x.id === id);
    if (!p) return;

    // 先选中
    if (this.selected !== id) {
      audio.click();
      this.selected = id;
      this._showCaption(p);
      this.refresh();
      return;
    }
    // 再点一次 = 进入
    this.enter(id);
  }

  _showCaption(p) {
    const visited = (this.game.progress.visited || []).includes(p.id);
    const pct = this.game.explorePct ? this.game.explorePct(p.id) : 0;
    let meta = t(p.chapter);
    if (visited) meta += ` · ${t('已拜访')}`;
    if (pct > 0) meta += ` · ${t('探索')} ${pct}%`;

    let text = '';
    if (!p.built) text = t('这颗星球还在建造中，暂时还不能降落。');
    else if (visited) text = t(p.visitedNote || p.intro);
    else text = t(p.intro);

    this.captionEl.innerHTML = `<em>${meta}</em>${t(p.tagline)}<br><span class="map-card-line">${text}</span>`;
    this.cardEl.classList.add('show');

    if (p.built) {
      this.actEl.hidden = false;
      this.actEl.textContent = visited ? t('再去看看') : t(p.action);
      this.actEl.onclick = (e) => {
        e.stopPropagation();
        this.enter(p.id);
      };
    } else {
      this.actEl.hidden = true;
    }
  }

  enter(id) {
    const p = PLANETS.find((x) => x.id === id);
    if (!p) return;
    audio.chime(392);
    if (!p.built) {
      this.captionEl.innerHTML = `<em>${t(p.chapter)}</em>${t('这颗星球还在建造中，暂时还不能降落。')}`;
      this.cardEl.classList.add('show');
      return;
    }
    this.hide();
    this.game.startChapter(id);
  }

  show() {
    this.build();
    this.layout();
    this.refresh();
    // 用 setVisible 同时清 class 与 hidden 属性：
    // 样式表里的 [hidden]{display:none!important} 会让「只删 class」的元素永远不显示。
    setVisible(this.el, true);
    this.selected = null;
    this.cardEl.classList.remove('show');
    this.actEl.hidden = true;
    for (const p of PLANETS) if (p._el) p._el.classList.remove('is-sel');
    setVisible(this.badgesPanel, false);
  }

  hide() {
    this.cardEl.classList.remove('show');
    setVisible(this.el, false);
  }

  get isOpen() {
    return !this.el.hidden;
  }

  toggleBadges(on) {
    const next = on == null ? this.badgesPanel.hidden : on;
    setVisible(this.badgesPanel, next);
    if (next) audio.click();
  }

  /** 指尖掠过星空时，星球层轻微位移，制造一点纵深 */
  _bindParallax() {
    if (!this.el) return;
    let raf = 0;
    this.el.addEventListener(
      'pointermove',
      (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const nx = e.clientX / window.innerWidth - 0.5;
          const ny = e.clientY / window.innerHeight - 0.5;
          this.listEl.style.setProperty('--px', (nx * -10).toFixed(1) + 'px');
          this.listEl.style.setProperty('--py', (ny * -8).toFixed(1) + 'px');
        });
      },
      { passive: true }
    );
  }
}

/**
 * 主控：渲染循环、生命周期、章节切换、设置、进度。
 * 设计要点（iOS）：
 *   - 像素比上限 2，低端机按帧时间自动降档（动态分辨率）
 *   - 切到后台立刻停渲染（省电、避免 iOS 回收）
 *   - 章节切换时彻底 dispose 旧场景
 */

const PROGRESS_KEY = 'lp.progress';

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setClearColor(0x0b1026, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.dprCap = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = this.dprCap;

    this.progress = this._loadProgress();
    this.chapter = null;
    this.chapterId = null;
    this.paused = false;

    this.input = new Input({
      stickEl: document.getElementById('stick'),
      knobEl: document.getElementById('stick-knob'),
      lookEl: document.getElementById('lookpad'),
      canvas: this.canvas,
    });
    this.map = new JourneyMap(this);

    this._bindUi();
    this._resize();
    addEventListener('resize', () => this._resize());
    addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120));
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      if (!document.hidden) this.last = performance.now();
    });

    this.clock = new Clock();
    this.last = performance.now();
    this.frames = 0;
    this.fpsAccum = 0;
    this._fpsCheck = 0;
    this.lastFps = 0;

    // 用 requestAnimationFrame 自己驱动：WebGLRenderer.setAnimationLoop 在无头/后台标签页
    // 有时不会回调，导致「画面静止但逻辑照常」的假死。rAF 行为更可预期。
    const loop = () => {
      this._tick();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ 进度
  _loadProgress() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && Array.isArray(p.visited)) {
          if (!p.explored || typeof p.explored !== 'object') p.explored = {};
          return p;
        }
      }
    } catch (e) {
      /* 忽略损坏的进度 */
    }
    return { visited: [], explored: {}, version: 2 };
  }

  // ------------------------------------------------------------ 探索度
  /**
   * 记录「第一次发现某个地点」。
   * 返回 true 表示是新发现（调用方可以弹提示 + 撒星光）。
   * total 是该章的发现点数，用于地图上的探索百分比。
   */
  markExplored(cid, key, total) {
    if (!cid || !key) return false;
    const all = this.progress.explored || (this.progress.explored = {});
    const rec = all[cid] || (all[cid] = { ids: [], total: 0 });
    if (total) rec.total = total;
    if (rec.ids.includes(key)) return false;
    rec.ids.push(key);
    this._saveProgress();
    return true;
  }

  exploredCount(cid) {
    const rec = (this.progress.explored || {})[cid];
    return rec ? rec.ids.length : 0;
  }

  explorePct(cid) {
    const rec = (this.progress.explored || {})[cid];
    if (!rec || !rec.total) return 0;
    return Math.min(100, Math.round((rec.ids.length / rec.total) * 100));
  }

  _saveProgress() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.progress));
    } catch (e) {
      /* 隐私模式写入失败可忽略 */
    }
  }

  // ------------------------------------------------------------ 生命周期
  /** 用户手势内的启动：解锁音频 → 淡出首屏 → 打开旅程地图 */
  async start() {
    await audio.start();
    audio.setVolume(audio.volume);
    this.bootBar(100);
    this.bootDone();
    await new Promise((r) => setTimeout(r, 320));
    this.map.show();
  }

  bootBar(pct) {
    const fill = document.getElementById('boot-fill');
    if (fill) fill.style.width = Math.min(100, pct) + '%';
  }

  bootDone() {
    const boot = document.getElementById('boot');
    boot.classList.add('is-leaving');
    boot.style.pointerEvents = 'none';
    setTimeout(() => setVisible(boot, false), 520);
  }

  async startChapter(id) {
    const meta = planetById(id);
    if (!meta) return;

    this.showChapterCard(meta);
    await new Promise((r) => setTimeout(r, 1500));

    const card = document.getElementById('chapter-card');
    setVisible(card, false);

    // 卸载旧章节
    this._teardownChapter();

    // 章节由注册表创建；未注册的星球显示「建造中」
    const chapter = createChapter(id, this);
    if (chapter) {
      this.chapter = chapter;
      this.chapter.resize(window.innerWidth, window.innerHeight);
    } else {
      this.showChapterCard({
        chapter: t(meta.chapter),
        name: t(meta.name),
        intro: t('这颗星球还在建造中，暂时还不能降落。'),
      });
      await new Promise((r) => setTimeout(r, 1600));
      setVisible(document.getElementById('chapter-card'), false);
      this.map.show();
      return;
    }

    this.chapterId = id;
    this.map.hide();
    this.chapter.onEnter();
    this.renderGoals(this.chapter.goals, this.chapter.goalsDone, this.chapter.stage);
  }

  showChapterCard(meta) {
    const card = document.getElementById('chapter-card');
    document.getElementById('cc-no').textContent = t(meta.chapter);
    document.getElementById('cc-title').textContent = t(meta.name);
    document.getElementById('cc-sub').textContent = t(meta.intro);
    setVisible(card, true);
    const inner = card.querySelector('.chapter-inner');
    inner.style.animation = 'none';
    void inner.offsetWidth;
    inner.style.animation = '';
  }

  /**
   * 卸载当前章节。除了章节自己的 dispose（几何体/材质/贴图），
   * 还必须清掉 renderer 的渲染列表缓存 —— 它会按场景缓存对象引用，
   * 不清的话每进出一次就留一份，iOS 上连续玩几章就会明显涨内存。
   */
  _teardownChapter() {
    if (!this.chapter) return;
    this.chapter.onExit && this.chapter.onExit();
    this.chapter.dispose && this.chapter.dispose();
    if (this.renderer) {
      // 渲染列表、着色器程序缓存都按场景/材质缓存对象引用，
      // 不清的话每进出一次章节就留一份（实测每轮 +4 MB）
      this.renderer.renderLists && this.renderer.renderLists.dispose();
      if (this.renderer.info) this.renderer.info.reset();
    }
    this.chapter = null;
  }

  returnToMap() {
    this._teardownChapter();
    this.chapterId = null;
    this.showHud(false);
    this.map.show();
  }

  completeChapter(id) {
    if (!this.progress.visited.includes(id)) this.progress.visited.push(id);
    this._saveProgress();
    audio.swell();
    this.returnToMap();
    this.map.refresh();
  }

  // ------------------------------------------------------------ HUD
  showHud(on) {
    setVisible(document.getElementById('hud'), on);
    // 摇杆只在有章节时出现
    setVisible(document.getElementById('stick'), on);
    if (!on) {
      setVisible(document.getElementById('prompt'), false);
      setVisible(document.getElementById('goals'), false);
      setVisible(document.getElementById('hud-goal'), false);
    }
  }

  renderGoals(goals, done, current, chapterId) {
    document.getElementById('goals');
    const title = document.getElementById('goals-title');
    const list = document.getElementById('goals-list');
    const sub = document.getElementById('goals-sub');
    const cid = chapterId || this.chapterId;
    title.textContent = t('本章目标');
    if (sub) {
      const pct = cid ? this.explorePct(cid) : 0;
      sub.textContent = `${t('任务')} ${done.size}/${goals.length} · ${t('探索')} ${pct}%`;
    }
    list.innerHTML = '';
    goals.forEach((g, i) => {
      const li = document.createElement('li');
      li.textContent = t(g);
      if (done.has(i)) li.classList.add('done');
      else if (i === current) li.classList.add('current');
      list.appendChild(li);
    });
    // 当前目标的「去哪儿」提示，让玩家知道下一步该往哪走
    if (cid && current >= 0) {
      const hint = hintFor(cid, current);
      if (hint) {
        const h = document.createElement('li');
        h.className = 'goal-hint';
        h.textContent = t(hint);
        list.appendChild(h);
      }
    }
  }

  // ------------------------------------------------------------ UI 绑定
  _bindUi() {
    // 启动
    document.getElementById('boot-start').addEventListener('click', () => this.start());

    // 交互提示按钮
    document.getElementById('prompt').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.chapter) this.chapter.interact();
    });

    // 目标清单展开
    const goalChip = document.getElementById('hud-goal');
    const goalsPanel = document.getElementById('goals');
    goalChip.addEventListener('click', () => {
      const open = goalsPanel.hidden;
      setVisible(goalsPanel, open);
      goalChip.setAttribute('aria-expanded', String(open));
    });

    // 返回地图
    document.getElementById('hud-map').addEventListener('click', () => {
      audio.click();
      this.openSettings(true);
    });

    // 设置
    document.getElementById('map-settings').addEventListener('click', () => this.openSettings());
    document.getElementById('set-close').addEventListener('click', () => this.closeSettings());

    // 徽章册
    const badgesBtn = document.getElementById('map-badges');
    if (badgesBtn) badgesBtn.addEventListener('click', () => this.map.toggleBadges());
    const badgesClose = document.getElementById('badges-close');
    if (badgesClose) badgesClose.addEventListener('click', () => this.map.toggleBadges(false));

    const langSel = document.getElementById('set-lang');
    for (const l of getLanguages()) {
      const o = document.createElement('option');
      o.value = l.code;
      o.textContent = l.name;
      langSel.appendChild(o);
    }
    langSel.value = getLang();
    langSel.addEventListener('change', () => {
      setLang(langSel.value);
      applyDom();
      this.map.refresh();
      const act = document.getElementById('map-act');
      if (act) act.hidden = true;
      if (this.chapter) {
        this.renderGoals(this.chapter.goals, this.chapter.goalsDone, this.chapter.stage);
        this.chapter._updateGoalChip && this.chapter._updateGoalChip();
      }
    });

    const vol = document.getElementById('set-vol');
    vol.value = String(audio.volume);
    vol.addEventListener('input', () => audio.setVolume(Number(vol.value)));

    const look = document.getElementById('set-look');
    look.value = String(this.input.lookSensitivity);
    look.addEventListener('input', () => {
      this.input.lookSensitivity = Number(look.value);
    });

    const fs = document.getElementById('set-fs');
    fs.addEventListener('change', () => {
      if (fs.checked) {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
      }
    });

    document.getElementById('set-clear').addEventListener('click', () => {
      if (!confirm(t('确定清除？'))) return;
      this.progress = { visited: [], explored: {}, version: 2 };
      this._saveProgress();
      this.map.refresh();
      this.closeSettings();
    });

    // 平台标记，供样式区分
    document.documentElement.classList.add('ios');
  }

  openSettings(fromHud) {
    this._settingsFrom = fromHud ? 'hud' : 'map';
    setVisible(document.getElementById('settings'), true);
  }

  closeSettings() {
    setVisible(document.getElementById('settings'), false);
    if (this._settingsFrom === 'hud') {
      this.returnToMap();
    }
    this._settingsFrom = null;
  }

  // ------------------------------------------------------------ 循环
  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    if (this.chapter) this.chapter.resize(w, h);
    // 地图布局依赖尺寸：星球尺寸、航线路径、星空 canvas 都在 layout() 里重算
    if (this.map && this.map.layout) this.map.layout();
  }

  _tick() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt)) dt = 0.016;
    dt = Math.min(dt, 0.05); // 防止切回前台时的大跳

    if (this.paused) return;
    if (!this.chapter) {
      // 地图状态不渲染 3D，省电
      return;
    }

    this.chapter.update(dt);
    // 天空背景层（全屏三角形）先画，再画主场景
    if (this.chapter.skyScene && this.chapter.skyCamera) {
      this.renderer.autoClear = false;
      this.renderer.clear(true, true, true);
      const u = this.chapter.sky.userData.uniforms;
      if (u) {
        if (u.centerDir) u.centerDir.value.copy(this.chapter.walker.up);
        if (u.worldUp) {
          // 相机是星球 root 的子节点，视线方向是世界坐标；walk.up 是 root 局部坐标，
          // 必须一并转到世界空间，否则渐变轴会被 root 的倾斜带偏。
          u.worldUp.value.copy(this.chapter.walker.up).transformDirection(this.chapter.root.matrixWorld);
        }
        // 注意用「主相机」的矩阵：背景层走的是正交相机，
        // 拿它自己的矩阵会被展平成常量，天空就变成一块纯色。
        if (u.camWorld && u.camProjInv) {
          const cam = this.chapter.camera;
          // 相机的父级（root）每帧都在转，必须连祖先一起更新，否则取到上一帧的矩阵
          cam.updateWorldMatrix(true, false);
          cam.updateProjectionMatrix();
          u.camWorld.value.copy(cam.matrixWorld);
          u.camProjInv.value.copy(cam.projectionMatrixInverse);
        }
      }
      this.renderer.render(this.chapter.skyScene, this.chapter.skyCamera);
      this.renderer.render(this.chapter.scene, this.chapter.camera);
      this.renderer.autoClear = true;
    } else {
      this.renderer.render(this.chapter.scene, this.chapter.camera);
    }

    // ---- 动态分辨率：连续掉帧就降档
    this.frames++;
    this.fpsAccum += dt;
    this._fpsCheck += dt;
    if (this._fpsCheck > 1.5) {
      const fps = this.frames / this.fpsAccum;
      this.lastFps = Math.round(fps);
      if (fps < 42 && this.dpr > 1) {
        this.dpr = Math.max(1, this.dpr - 0.35);
        this._resize();
      } else if (fps > 58 && this.dpr < this.dprCap) {
        this.dpr = Math.min(this.dprCap, this.dpr + 0.2);
        this._resize();
      }
      this.frames = 0;
      this.fpsAccum = 0;
      this._fpsCheck = 0;
    }
  }
}

/**
 * 入口：先做能力检测与首屏准备，再启动游戏。
 * 加载策略借鉴原站 loading.js 的经验：
 *   - 首屏只加载必要的字体与 3 张星球缩略图
 *   - 其余缩略图和地图底图延迟加载
 */

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function supportsWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

async function preloadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const faces = ['400 20px LPSerif', 'italic 400 20px LPSerif', '600 20px LPSerif'];
  // 字体不可用或加载过慢时不能卡住启动：整体 1.2 秒超时后放行
  const timeout = new Promise((r) => setTimeout(r, 1200));
  await Promise.race([
    Promise.all(faces.map((f) => document.fonts.load(f, t('小王子的旅程')).catch(() => null))),
    timeout,
  ]);
}

function setStatus(text) {
  const el = document.getElementById('boot-status');
  if (el) el.textContent = text;
}

function setBar(pct) {
  const el = document.getElementById('boot-fill');
  if (el) el.style.width = pct + '%';
}

async function boot() {
  applyDom();
  document.documentElement.classList.toggle('is-ios', isIOS());

  setBar(12);
  setStatus(t('正在准备画面'));

  await preloadFonts();
  setBar(42);

  if (!supportsWebGL2()) {
    setStatus('这个浏览器不支持 WebGL，无法显示 3D 画面。');
    return;
  }

  // 预加载首屏星球缩略图（地图打开即可见）；同样限时，不能阻塞启动
  const firstImgs = ['b612', 'king', 'theater'];
  await Promise.race([
    Promise.all(
      firstImgs.map(
        (n) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = img.onerror = resolve;
            img.src = asset('img/planets/' + n + '.webp');
          })
      )
    ),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  setBar(78);

  const game = new Game();
  window.__game = game; // 便于调试
  setBar(100);
  setStatus('');

  // 测试钩子：URL hash 带 #test=<js> 时在启动后执行（仅本地验证用）
  const m = /#test=(.+)$/.exec(location.hash);
  if (m) {
    try {
      // 延迟执行，给首屏与资源一点时间
      setTimeout(() => {
        // eslint-disable-next-line no-new-func
        new Function(decodeURIComponent(m[1]))();
      }, 60);
    } catch (e) {
      console.error('test hook failed', e);
    }
  }

  // iOS 需要用户手势才能出声，启动按钮就是那个手势
  const startBtn = document.getElementById('boot-start');
  startBtn.hidden = false;
  startBtn.addEventListener(
    'click',
    async () => {
      await audio.start();
      await game.start();
    },
    { once: true }
  );

  // 错误兜底
  game.renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setStatus('画面中断了，请刷新页面。');
  });
}

boot().catch((err) => {
  console.error(err);
  setStatus('启动失败：' + err.message);
});
