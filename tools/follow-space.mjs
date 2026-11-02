/**
 * 「相机跟随」的世界空间单元验证（Node 端，无需浏览器）。
 *
 * 背景：角色挂在 root（有倾斜 + 自转）下，walker.position 是 root 局部坐标。
 * 旧实现把相机留在世界坐标里、却用局部坐标算位置，root 一转角色就被推出画面。
 * 现在相机作为 root 子节点求解，任何旋转下角色都必须留在画面中心。
 *   node tools/follow-space.mjs
 */
import * as THREE from 'three';
import { PlanetWalker } from '../src/planet-walker.js';

function makeWalker(radius) {
  // 用一个空 Group 冒充 avatar，避免依赖 DOM
  const avatar = new THREE.Group();
  const root = new THREE.Group();
  root.add(avatar);
  const walker = new PlanetWalker(avatar, radius, { standHeight: 0.02 });
  walker.camDist = 4.0;
  walker.spawn(new THREE.Vector3(0.4, 0.3, 0.86).normalize().multiplyScalar(radius));
  return { avatar, root, walker };
}

function ndcOf(walker, camera) {
  if (camera.parent) camera.parent.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);
  camera.updateProjectionMatrix();
  const w = new THREE.Vector3();
  walker.avatar.getWorldPosition(w);
  return w.project(camera).clone();
}

// 脚底原点在画面偏下是设计如此（视线看向胸口上方 0.12m），
// 关键是横向必须居中、纵向不能漂出画面。
const center = (n) => Math.abs(n.x) < 0.25 && n.y > -0.75 && n.y < 0.15;

let fail = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};

// --- 修复后的实现：相机挂 root，root 倾斜 + 自转若干角度都不能漂 ---
for (const [zTilt, ySpin] of [
  [0.16, 0.0],
  [0.16, 0.9],
  [0.2, 2.4],
  [-0.1, 4.1],
]) {
  const { root, walker } = makeWalker(6);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 1400);
  camera.root = root;
  root.add(camera);
  root.rotation.z = zTilt;
  root.rotation.y = ySpin;
  for (let i = 0; i < 60; i++) walker.updateCamera(camera, 0.016);
  const n = ndcOf(walker, camera);
  console.log(
    `   root[z=${zTilt} y=${ySpin}] 角色世界 NDC [${n.x.toFixed(2)}, ${n.y.toFixed(2)}]`
  );
  check(center(n), `root[z=${zTilt} y=${ySpin}] 角色仍在画面中央`);
}

// --- 对照：旧行为（相机在世界坐标）在同样旋转下会漂出画面 ---
{
  const { root, walker } = makeWalker(6);
  const scene = new THREE.Scene();
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 1400);
  scene.add(camera);
  root.updateMatrixWorld(true);
  for (let i = 0; i < 60; i++) walker.updateCamera(camera, 0.016);
  root.rotation.z = 0.16;
  root.rotation.y = 1.4;
  const before = ndcOf(walker, camera);
  root.rotation.y = 2.2;
  const after = ndcOf(walker, camera);
  const drift = Math.hypot(after.x - before.x, after.y - before.y);
  console.log(`   对照（相机在世界坐标）root 再转 0.8rad 后 NDC 漂移 ${drift.toFixed(2)}`);
  check(drift > 0.2, '（对照）相机在世界坐标时 root 旋转会让角色漂出画面');
}

// --- 相机距离稳定：不能因为 root 旋转而忽远忽近 ---
{
  const { root, walker } = makeWalker(6);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 1400);
  camera.root = root;
  root.add(camera);
  const dists = [];
  const cw = new THREE.Vector3();
  for (let f = 0; f < 240; f++) {
    root.rotation.y += 0.012;
    root.rotation.z = 0.16;
    walker.updateCamera(camera, 0.016);
    root.updateMatrixWorld(true);
    camera.getWorldPosition(cw);
    const w = new THREE.Vector3();
    walker.avatar.getWorldPosition(w);
    dists.push(cw.distanceTo(w));
  }
  const tail = dists.slice(60);
  const min = Math.min(...tail);
  const max = Math.max(...tail);
  console.log(`   4 秒自转过程中相机距离 ${min.toFixed(2)}–${max.toFixed(2)} m`);
  check(max - min < 0.35, '相机距离在自转中保持稳定（抖动 < 0.35 m）');
}

process.exit(fail ? 1 : 0);
