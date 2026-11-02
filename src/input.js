/**
 * 输入：虚拟摇杆（移动）+ 右侧拖动（视角）+ 键盘（桌面调试）。
 * 全部用 Pointer Events，iOS Safari 13+ 支持，且自动覆盖触摸/鼠标。
 */

export class Input {
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
