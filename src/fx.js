/**
 * 3D 反馈特效：目标完成时的星光爆、交互时的冲击环。
 * 全部程序化生成 + AdditiveBlending，单次特效顶点数极少，用完立刻 dispose，
 * 不会占用首屏预算，也不会在章节之间留下残留几何体/材质。
 */
import * as THREE from 'three';

let _glowTex = null;

/**
 * 柔光点贴图：Points 默认是方块，加一张径向渐变贴图才像星光。
 * 全局只生成一次并被所有章节共享，因此标记 userData.shared —— 章节 dispose 会跳过它。
 */
function glowTexture() {
  if (_glowTex) return _glowTex;
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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  _glowTex = tex;
  return tex;
}

export class FxPool {
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
    let t1 = new THREE.Vector3(0, 1, 0).cross(n);
    if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0).cross(n);
    t1.normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();

    const geo = new THREE.BufferGeometry();
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
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));

    const mat = new THREE.PointsMaterial({
      color,
      size,
      map: this.texture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
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
    const geo = new THREE.RingGeometry(0.86, 1, 44);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(pos);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
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
