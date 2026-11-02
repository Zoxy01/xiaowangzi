/**
 * 量一下角色模型（纯 Node，不开浏览器）：
 *   总高、脚底是否在 y=0、包围盒、网格数/三角面数、各部件（头/手/靴/围巾）的高度范围。
 *   node tools/avatar-measure.mjs
 */
import * as THREE from 'three';
import { PrinceAvatar } from '../src/avatar.js';

const a = new PrinceAvatar();
a.root.updateMatrixWorld(true);

const all = new THREE.Box3().setFromObject(a.root);
const V = new THREE.Vector3();
let meshes = 0;
let tris = 0;
a.root.traverse((o) => {
  if (!o.isMesh) return;
  meshes++;
  const geo = o.geometry;
  const n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  tris += n;
});

const box = (obj) => {
  const b = new THREE.Box3().setFromObject(obj);
  return { lo: +b.min.y.toFixed(3), hi: +b.max.y.toFixed(3), w: +Math.max(b.max.x - b.min.x, b.max.z - b.min.z).toFixed(3) };
};

console.log('尺寸：高 %s  y 从 %s 到 %s  横向 %s × %s',
  (all.max.y - all.min.y).toFixed(3), all.min.y.toFixed(3), all.max.y.toFixed(3),
  (all.max.x - all.min.x).toFixed(3), (all.max.z - all.min.z).toFixed(3));
console.log('规模：mesh %d  tris %d', meshes, Math.round(tris));
console.log('头部：', JSON.stringify(box(a.head)));
console.log('右手：', JSON.stringify(box(a.arms[1].pivot)));
console.log('左靴：', JSON.stringify(box(a.legs[0].pivot)));
console.log('围巾飘带：', JSON.stringify(box(a.scarfTail)));
console.log('头身比：1 / %s', (all.max.y / (box(a.head).hi - box(a.head).lo)).toFixed(2));
const feetOk = Math.abs(all.min.y) < 0.006;
const heightOk = Math.abs(all.max.y - 0.9) < 0.03;
console.log('脚底贴地：%s   总高≈0.9：%s', feetOk ? '✓' : `✗ (${all.min.y.toFixed(3)})`, heightOk ? '✓' : `✗ (${all.max.y.toFixed(3)})`);
if (!feetOk || !heightOk) process.exitCode = 1;
