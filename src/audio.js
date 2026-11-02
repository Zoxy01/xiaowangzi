/**
 * Web Audio 程序化音频：不下载任何音频文件（iOS 首屏预算）。
 * - noise 缓冲复用（初始化一次）：泉声、风声
 * - 加法合成的八音盒旋律（C 大调五声），致敬原站 ChapterMusic
 * - iOS 必须用户手势后 resume()，这里由 start() 统一处理
 */
export class AudioEngine {
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

export const audio = new AudioEngine();
