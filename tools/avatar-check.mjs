// Node 端检查小王子模型：三角面数、包围盒、手的位置、头部俯仰方向、动画不产生 NaN。
import * as THREE from 'three';
import { PrinceAvatar } from '../src/avatar.js';

const a = new PrinceAvatar();
let tris = 0, meshes = 0;
const geos = new Set(), mats = new Set();
a.root.traverse((o) => {
  if (!o.isMesh) return;
  meshes++;
  const g = o.geometry;
  geos.add(g); mats.add(o.material);
  tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
});
let bytes = 0;
for (const g of geos) for (const k in g.attributes) bytes += g.attributes[k].array.byteLength;
for (const g of geos) if (g.index) bytes += g.index.array.byteLength;

a.root.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(a.root);
const hand = new THREE.Vector3(0, -0.2, 0);
a.arms[1].pivot.localToWorld(hand);

// 头部方向：headTilt=1 应抬头（脸的 +Z 朝上偏），-1 低头
const faceY = (tilt) => {
  a.headTilt = tilt;
  for (let i = 0; i < 60; i++) a.update(1 / 60, 0, false);
  a.root.updateMatrixWorld(true);
  const f = new THREE.Vector3(0, 0, 1).transformDirection(a.head.matrixWorld);
  return f.y;
};
const up = faceY(1), down = faceY(-1);
a.headTilt = 0;

let nan = false;
for (let i = 0; i < 300; i++) {
  a.update(1 / 60, 1, i < 200);
  a.root.traverse((o) => { if (!Number.isFinite(o.rotation.x + o.position.y)) nan = true; });
}
// 围巾尖端应在身后（-Z）
a.root.updateMatrixWorld(true);
const tip = new THREE.Vector3();
const s0 = a.scarfStrips[0].segs.at(-1);
s0.localToWorld(tip.set(0, -0.08, 0));

const res = {
  meshes, tris, geoKB: +(bytes / 1024).toFixed(1), materials: mats.size,
  height: +box.max.y.toFixed(3), minY: +box.min.y.toFixed(3),
  width: +(box.max.x - box.min.x).toFixed(3),
  hand: hand.toArray().map((v) => +v.toFixed(3)),
  faceYup: +up.toFixed(3), faceYdown: +down.toFixed(3),
  scarfTip: tip.toArray().map((v) => +v.toFixed(3)),
  nan,
};
console.log(JSON.stringify(res));
// 主角是唯一的近景高模：12454 面 / 112 个 mesh 仍在预算内（远景 NPC 走 makeNPC 低模）。
const ok = tris < 16000 && meshes < 130 && up > 0.15 && down < -0.15 && !nan && tip.z < -0.05 && res.height < 1.0 && res.height > 0.8;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
