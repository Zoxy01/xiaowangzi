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
import { PLANETS, applyBuilt } from './planets-data.js';
import { chapterIds } from './chapters/index.js';
// 用注册表派生「可玩」标记：注册表加一章，地图就自动解锁一颗，不需要改两处
applyBuilt(chapterIds());
import { t } from './i18n.js';
import { audio } from './audio.js';
import { asset } from './assets.js';
import { setVisible } from './ui.js';
import { BADGES, earnedBadges } from './quests.js';

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

export class JourneyMap {
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
