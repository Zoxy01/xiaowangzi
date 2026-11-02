/**
 * 对话：纯 DOM + 逐字揭示（原站 JourneyTmpReveal 的效果）。
 * - 每个字一个 <span>，用 opacity 过渡，避免 reflow 抖动
 * - 首次点击/轻触：立即显示整句；再次点击：进入下一句
 * - 支持 speaker（人物名牌）与旁白（无 speaker）
 */
import { t, typingDelay } from './i18n.js';
import { setVisible } from './ui.js';

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

export class Dialogue {
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
