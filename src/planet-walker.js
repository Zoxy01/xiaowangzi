/**
 * 球面行走：星球是一个球，玩家永远站在球面上。
 *   position = normalize(position) * radius
 *   相机 / 角色的「上」= 球面法线
 * 这是原站 B612.Core PlayerController + ThirdPersonCamera 的最小可行复刻。
 */
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class PlanetWalker {
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

    this.position = new THREE.Vector3(0, 0, 1).multiplyScalar(radius); // 世界坐标
    this.up = new THREE.Vector3(0, 0, 1); // 当前法线
    this.heading = 0; // 朝向角（相对切平面）
    this.velocityY = 0; // 跳/落
    this.onGround = true;
    this.speed = 2.6; // 单位/秒（星球半径约 6）
    this.runSpeed = 4.6;
    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();

    // 相机环绕参数（由玩家拖动控制）
    this.camYaw = 0;
    this.camPitch = 0.24;
    this.camDist = 4.2;

    this.spawn(new THREE.Vector3(0, 0, 1));
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
      const ref = Math.abs(u.y) > 0.92 ? new THREE.Vector3(0, 0, 1) : UP;
      this._right.crossVectors(ref, u).normalize();
      this._basisReady = true;
    } else {
      // 平行传输：去掉法线方向的分量
      this._right.addScaledVector(u, -this._right.dot(u));
      if (this._right.lengthSq() < 1e-8) {
        const ref = Math.abs(u.y) > 0.92 ? new THREE.Vector3(0, 0, 1) : UP;
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
  getCameraForward(out = new THREE.Vector3()) {
    this._buildBasis();
    const yaw = this.camYaw;
    out.copy(this._fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(this._right, Math.sin(yaw));
    return out.normalize();
  }

  getCameraRight(out = new THREE.Vector3()) {
    const f = this.getCameraForward(new THREE.Vector3());
    // 屏幕右 = forward × up。早先这里多了一个 negate()，导致「摇杆右推往左走」。
    return out.crossVectors(f, this.up).normalize();
  }

  update(dt, move, look, jump) {
    // ---- 视角
    this.camYaw += look.x;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + look.y, -0.35, 1.05);

    // ---- 移动方向（相机相对）
    const fwd = this.getCameraForward(new THREE.Vector3());
    // 同 getCameraRight：屏幕右是 forward × up，不能取反
    const right = new THREE.Vector3().crossVectors(fwd, this.up).normalize();
    const wish = new THREE.Vector3().addScaledVector(fwd, move.y).addScaledVector(right, move.x);
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
    if (!this.avatar.basePos) this.avatar.basePos = new THREE.Vector3();
    this.avatar.basePos.copy(this.position);
    this.avatar.baseUp = this.up;

    const yAxis = this.up;
    const zAxis = this.getFacing(this._faceTmp || (this._faceTmp = new THREE.Vector3()));
    // 朝向必须在切平面内（getFacing 已保证，这里再保险一次）
    zAxis.addScaledVector(yAxis, -zAxis.dot(yAxis));
    if (zAxis.lengthSq() < 1e-8) zAxis.copy(this.getCameraForward(new THREE.Vector3()));
    zAxis.normalize();
    const xAxis = (this._xTmp || (this._xTmp = new THREE.Vector3())).crossVectors(yAxis, zAxis).normalize();

    const m = this._mTmp || (this._mTmp = new THREE.Matrix4());
    m.makeBasis(xAxis, yAxis, zAxis);
    const q = this._qTmp || (this._qTmp = new THREE.Quaternion());
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

    const fwd = this.getCameraForward(new THREE.Vector3());
    // 相机相对角色的偏移方向 = 身后 + 抬高。
    // 注意符号：早年写成 fwd*cos + up*sin 再取负，等于「pitch 越大相机越往下」，
    // 拖一下视角相机就钻到地面以下，于是被球体夹住、画面乱跳。
    const pitch = THREE.MathUtils.clamp(this.camPitch, -0.35, 1.05);
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
  getFacing(out = new THREE.Vector3()) {
    this._buildBasis();
    return out
      .copy(this._fwd)
      .multiplyScalar(Math.cos(this.heading))
      .addScaledVector(this._right, Math.sin(this.heading))
      .normalize();
  }
}
