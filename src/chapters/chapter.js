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
import * as THREE from 'three';
import { makeStars, makeSkyDome, sphereDir, INTERACT_REACH } from '../world.js';
import { PrinceAvatar } from '../avatar.js';
import { PlanetWalker } from '../planet-walker.js';
import { Dialogue } from '../dialogue.js';
import { audio } from '../audio.js';
import { t } from '../i18n.js';
import { setVisible, toast } from '../ui.js';
import { FxPool } from '../fx.js';
import { hintFor } from '../quests.js';
import { paletteOf, dressPlanet, aimArt } from '../art.js';

/** 方位角/纬度（度）→ 单位向量 */
export const D = (az, lat) => sphereDir((az * Math.PI) / 180, (lat * Math.PI) / 180);

export class Chapter {
  constructor(game, { radius, spinSpeed = 0.012, fog = 0x1a2244, fogDensity = 0.006, palette = 'b612' }) {
    this.game = game;
    this.radius = radius;
    this.paletteName = palette;
    this.palette = paletteOf(palette);
    this.biome = {};
    this.art = null;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(fog, fogDensity);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 1400);
    this.clock = new THREE.Clock();

    this.root = new THREE.Group();
    this.scene.add(this.root);
    // 相机必须和角色挂在同一个 root 下：walker.position 是 root 局部坐标，
    // 若相机留在场景（世界坐标）里，root 的倾斜与自转会让角色世界位置偏出画面，
    // 表现为「相机不跟随人物」。
    this.root.add(this.camera);

    this.spin = 0;
    this.spinSpeed = spinSpeed;

    // 每帧由 Game 用来渲染天空背景层
    this.sky = makeSkyDome();
    this.skyScene = new THREE.Scene();
    this.skyScene.add(this.sky);
    this.skyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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

    this.hemi = new THREE.HemisphereLight(0x6f7fc4, 0x2a2418, 1.05);
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
    this.fillLight = new THREE.DirectionalLight(0xfff0d6, 0.6);
    this.fillLight.castShadow = false;
    this.root.add(this.fillLight);
    this.root.add(this.fillLight.target);

    // 交互光圈
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.34, 28),
      new THREE.MeshBasicMaterial({
        color: 0xe8c87a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
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
    const axis = new THREE.Vector3(0, 1, 0).cross(d);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0).cross(d);
    axis.normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
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
      const away = new THREE.Vector3(0, 1, 0).cross(w.up);
      if (away.lengthSq() < 1e-6) away.set(1, 0, 0).cross(w.up);
      w.position.addScaledVector(away.normalize(), this.radius * 0.35);
      w.sync(true);
      aim.copy(target.pos).addScaledVector(w.up, -target.pos.dot(w.up));
    }
    w.lookToward(aim);
  }

  /** 配色在白天/夜晚之间插值 */
  _dayK() {
    return THREE.MathUtils.clamp((this.sunAngle + 0.22) / 0.64, 0, 1);
  }

  _applySun() {
    const el = THREE.MathUtils.clamp(this.sunAngle, -0.5, 1.2);
    this.sunDir.set(Math.cos(el) * 0.86, Math.sin(el), Math.cos(el) * 0.42).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(60);

    const u = this.sky.userData.uniforms;
    u.sunDir.value.copy(this.sunDir);

    const k = this._dayK();
    // 柔光调色：night / dusk / day 三段，k 越高越亮。
    // 用两段 lerp 而不是一条直线，黄昏才有「粉紫 → 杏金」的过渡。
    const pal = this.palette || paletteOf('b612');
    const night = pal.night.map((h) => new THREE.Color(h));
    const dusk = pal.dusk.map((h) => new THREE.Color(h));
    const day = pal.day.map((h) => new THREE.Color(h));
    const bands = [night, dusk, day];
    const pick = (i) => {
      const c = new THREE.Color();
      if (k > 0.45) {
        const t = THREE.MathUtils.clamp((k - 0.45) / 0.55, 0, 1);
        c.copy(bands[1][i]).lerp(bands[2][i], t);
      } else {
        const t = THREE.MathUtils.clamp(k / 0.45, 0, 1);
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
    this.hemi.color.copy(pick(1)).lerp(new THREE.Color(0xffffff), 0.35);
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
      this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
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
    void hintFor;
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
