/**
 * 主控：渲染循环、生命周期、章节切换、设置、进度。
 * 设计要点（iOS）：
 *   - 像素比上限 2，低端机按帧时间自动降档（动态分辨率）
 *   - 切到后台立刻停渲染（省电、避免 iOS 回收）
 *   - 章节切换时彻底 dispose 旧场景
 */
import * as THREE from 'three';
import { Input } from './input.js';
import { JourneyMap } from './map.js';
import { createChapter } from './chapters/index.js';
import { planetById } from './planets-data.js';
import { audio } from './audio.js';
import { applyDom, setLang, getLanguages, getLang, t } from './i18n.js';
import { setVisible } from './ui.js';
import { hintFor } from './quests.js';

const PROGRESS_KEY = 'lp.progress';

export class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setClearColor(0x0b1026, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
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

    this.clock = new THREE.Clock();
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
    const panel = document.getElementById('goals');
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
    void panel;
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
