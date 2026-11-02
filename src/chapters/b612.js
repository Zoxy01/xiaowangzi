/**
 * 第一章：B-612 · 家园
 * 原站事件链（LPStrings 5.1）：
 *   四处走走 → 去看看玫瑰花 → 去工具棚拿水壶 → 去泉眼打水 →
 *   最后一次给她浇水 → 看最后一场日落 → 去星球边上的椅子坐下 → 启程
 */
import * as THREE from 'three';
import {
  R,
  INTERACT_REACH,
  makeChair,
  makeWateringCan,
  makeStars,
  makeSkyDome,
  placeOnSphere,
  sphereDir,
} from '../world.js';
import {
  B612,
  GLOBE_DIR,
  FENCE_DIR,
  b612HeightAt,
  makeB612Planet,
  makeB612Volcano,
  makeB612Rose,
  makeB612Globe,
  makeB612Pedestal,
  makeB612Fence,
  makeB612Shed,
  makeB612Spring,
  makeB612Grass,
  makeB612Boulder,
  makeB612Flowers,
  makeB612Nook,
  makeBaobabSprout,
  makeB612Pebbles,
  makeB612Fireflies,
} from '../b612-scene.js';
import { PrinceAvatar } from '../avatar.js';
import { PlanetWalker } from '../planet-walker.js';
import { Dialogue } from '../dialogue.js';
import { audio } from '../audio.js';
import { t } from '../i18n.js';
import { setVisible, toast } from '../ui.js';
import { FxPool } from '../fx.js';
import { Chapter } from './chapter.js';
import { paletteOf, dressPlanet, aimArt } from '../art.js';

const D = (az, lat) => sphereDir((az * Math.PI) / 180, (lat * Math.PI) / 180);

export class B612Chapter {
  constructor(game) {
    this.game = game;
    // 基类与调试工具都按 this.radius 找星球半径，这里显式暴露出来
    this.radius = R;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1a2244, 0.006);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 1400);
    this.clock = new THREE.Clock();

    // 世界根（包含星球与所有物体），自转轴略微倾斜
    this.root = new THREE.Group();
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
    this.sunDir = new THREE.Vector3(0.75, 0.35, 0.55).normalize();
    const sun = new THREE.DirectionalLight(0xffe2b8, 2.5);
    sun.position.copy(this.sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.0012;
    this.root.add(sun);
    this.sun = sun;

    const amb = new THREE.HemisphereLight(0x6f7fc4, 0x2a2418, 1.05);
    this.root.add(amb);
    this.hemi = amb;

    // 天空与星空：天空作为背景层单独渲染（见 Game._tick）
    this.sky = makeSkyDome();
    this.skyScene = new THREE.Scene();
    this.skyScene.add(this.sky);
    this.skyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
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
      placeOnSphere(g, dir, b612HeightAt(dir), R);
      this.root.add(g);
      this.grass.push(g);
    }

    // 三座火山：两座活着的、一座熄灭的（层状剖面 + 火山口环 + 烟雾）
    this.volcanoes = [];
    for (const v of B612.volcanoes) {
      const g = makeB612Volcano(v.scale, v.alive);
      placeOnSphere(g, v.dir, b612HeightAt(v.dir) - 0.02, R);
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
    this.roseGroup = new THREE.Group();
    this.rose = makeB612Rose();
    this.roseGroup.add(this.rose);
    placeOnSphere(this.roseGroup, this.roseDir, b612HeightAt(this.roseDir) - 0.005, R);
    this.root.add(this.roseGroup);

    this.fence = makeB612Fence();
    placeOnSphere(this.fence, FENCE_DIR, b612HeightAt(FENCE_DIR) - 0.01, R);
    this._faceTangent(this.fence, FENCE_DIR, B612.rose);
    this.root.add(this.fence);

    this.pedestal = makeB612Pedestal();
    placeOnSphere(this.pedestal, GLOBE_DIR, b612HeightAt(GLOBE_DIR) - 0.005, R);
    this.root.add(this.pedestal);

    this.globeGroup = new THREE.Group();
    this.globe = makeB612Globe();
    this.globe.visible = true;
    this.globeGroup.add(this.globe);
    // 玻璃罩坐在石座上：石座高 0.24 m
    placeOnSphere(this.globeGroup, GLOBE_DIR, b612HeightAt(GLOBE_DIR) + 0.235, R);
    this.root.add(this.globeGroup);
    this.globeOn = true;
    this.watered = false;

    // 工具棚
    this.shedDir = B612.shed.clone();
    this.shed = makeB612Shed();
    placeOnSphere(this.shed, this.shedDir, b612HeightAt(this.shedDir) - 0.01, R);
    this.root.add(this.shed);

    // 泉眼
    this.springDir = B612.spring.clone();
    this.spring = makeB612Spring();
    placeOnSphere(this.spring, this.springDir, b612HeightAt(this.springDir) - 0.01, R);
    this.root.add(this.spring);

    // 水壶（初始在工具棚旁边）
    this.canHome = B612.can.clone();
    this.can = makeWateringCan();
    this.canPos = this.canHome.clone();
    placeOnSphere(this.can, this.canPos, b612HeightAt(this.canPos) + 0.01, R);
    this.root.add(this.can);
    this.carried = false;
    this.filled = false;

    // 椅子（星球边缘，面向日落方向）
    this.chairDir = B612.chair.clone();
    this.chair = makeChair();
    placeOnSphere(this.chair, this.chairDir, b612HeightAt(this.chairDir) - 0.005, R);
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
      placeOnSphere(b, dir, b612HeightAt(dir) - 0.02, R);
      b.rotation.y = az * 0.07;
      this.root.add(b);
      this.boulders.push(b);
    }

    this.nook = makeB612Nook();
    placeOnSphere(this.nook, B612.nook, b612HeightAt(B612.nook) - 0.005, R);
    this.root.add(this.nook);

    // 小径两侧的碎石、要趁早拔掉的猴面包树幼苗、夜里绕在玫瑰与泉眼旁的萤火
    this.pebbles = makeB612Pebbles(110);
    this.root.add(this.pebbles);
    this.baobabs = [];
    for (const dir of [D(-74, -22), D(-16, 12), D(104, -34)]) {
      const s = makeBaobabSprout();
      placeOnSphere(s, dir, b612HeightAt(dir), R);
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
    this.walker = new PlanetWalker(this.avatar.root, R, { standHeight: 0.02, heightAt: b612HeightAt });
    // 角色补光（跟随角色的柔和方向光）：黄昏/夜晚保证主角从背景里分离出来。
    // 实测日落时角色与两侧背景亮度差只有 -1.1，人几乎消失在画面里。
    this.fillLight = new THREE.DirectionalLight(0xfff0d6, 0);
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
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.34, 28),
      new THREE.MeshBasicMaterial({ color: 0xe8c87a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })
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
      THREE.MathUtils.clamp((THREE.MathUtils.clamp(this.sunAngle, -0.5, 1.2) + 0.22) / 0.64, 0, 1);
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
        if (aim.length() < R * 0.12) {
          const away = new THREE.Vector3(0, 1, 0).cross(this.walker.up);
          if (away.lengthSq() < 1e-6) away.set(1, 0, 0).cross(this.walker.up);
          this.walker.position.addScaledVector(away.normalize(), R * 0.35);
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
      const wpos = dir.clone().normalize().multiplyScalar(R + b612HeightAt(dir));
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
      this.ring.position.copy(n).multiplyScalar(R + b612HeightAt(n) + 0.02);
      this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
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
      default:
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
    const x = new THREE.Vector3().crossVectors(n, f).normalize();
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, n, f));
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
    const right = new THREE.Vector3().crossVectors(n, tangentSun).normalize();
    const m = new THREE.Matrix4().makeBasis(right, n, tangentSun);
    this.chair.quaternion.setFromRotationMatrix(m);
  }

  _applySun() {
    // 太阳方向：在 XY 平面上由高度角决定
    const a = this.sunAngle;
    const el = THREE.MathUtils.clamp(a, -0.5, 1.2);
    this.sunDir.set(Math.cos(el) * 0.86, Math.sin(el), Math.cos(el) * 0.42).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(60);

    const u = this.sky.userData.uniforms;
    u.sunDir.value.copy(this.sunDir);

    const k = THREE.MathUtils.clamp((el + 0.22) / 0.64, 0, 1); // 0 = 入夜, 1 = 白天
    // 三段调色：夜（深靛） → 黄昏（粉橙，参考图的色调） → 白天（柔蓝 + 暖地平线）
    const nightTop = new THREE.Color(0x161c40);
    const nightMid = new THREE.Color(0x2b2f5e);
    const nightBot = new THREE.Color(0x6b3a4a);
    const duskTop = new THREE.Color(0x494a88);
    const duskMid = new THREE.Color(0xd98f9e);
    const duskBot = new THREE.Color(0xf7a978);
    const dayTop = new THREE.Color(0x5c9ad4);
    const dayMid = new THREE.Color(0xb6d6e8);
    const dayBot = new THREE.Color(0xf3ddb8);
    const top = new THREE.Color();
    const mid = new THREE.Color();
    const bot = new THREE.Color();
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
    u.glowColor.value.set(0xff9a5a).lerp(new THREE.Color(0xffe0b0), k);
    // 地平线雾光：白天薄、黄昏暖，别把中段天空洗成一片奶白
    if (u.hazeAmount) {
      u.hazeAmount.value = 0.14 + k * 0.24;
      u.hazeColor.value.copy(bot).lerp(new THREE.Color(0xfff2dc), 0.55);
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
