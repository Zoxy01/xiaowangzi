/**
 * 方向审计（纯 Node，无浏览器）：
 *   1) 摇杆右推，角色是不是往「屏幕右」走？
 *   2) 角色模型的脸（局部 +Z）有没有对着前进方向？
 *   3) 抬头/低头时相机上向量与视线是否一致？
 * 只跑真实 PlanetWalker + 真实 PerspectiveCamera 的投影。
 *   node tools/orient-audit.mjs
 */
import * as THREE from 'three';

const R = 6.0;
const { PlanetWalker } = await import('../src/planet-walker.js');

function makeWalker(dir = new THREE.Vector3(0, 0, 1)) {
  const avatar = new THREE.Object3D();
  const w = new PlanetWalker(avatar, R, { standHeight: 0.02 });
  w.camDist = 4.2;
  w.spawn(dir);
  return w;
}

/** 相机坐标系里「屏幕右」的世界向量（标准视锥：r = forward × up） */
function screenRight(camera) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  return new THREE.Vector3().crossVectors(f, u).normalize();
}

function screenUp(camera) {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
}

function settle(w, camera, frames = 90) {
  for (let i = 0; i < frames; i++) w.updateCamera(camera, 1 / 60);
  camera.updateMatrixWorld();
}

function ndcOf(camera, p) {
  return p.clone().project(camera);
}

const cam = new THREE.PerspectiveCamera(52, 393 / 852, 0.05, 1400);
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

// ---------- 1. 右推摇杆是否往屏幕右走 ----------
{
  const w = makeWalker();
  const camA = cam.clone();
  w.updateCamera(camA, 1 / 60);
  settle(w, camA);
  const before = w.position.clone();
  const rightBefore = screenRight(camA);
  // 只给一帧的横向输入，看位移方向
  w.update(1 / 60, { x: 1, y: 0 }, { x: 0, y: 0 }, false);
  const delta = w.position.clone().sub(before);
  const dot = delta.clone().normalize().dot(rightBefore);
  check(
    '摇杆右推 → 角色朝屏幕右侧移动',
    dot > 0.9,
    `位移·屏幕右 = ${dot.toFixed(3)}（应接近 +1）`
  );
}

// ---------- 2. 左推摇杆 ----------
{
  const w = makeWalker();
  const camA = cam.clone();
  settle(w, camA);
  const before = w.position.clone();
  const rightBefore = screenRight(camA);
  w.update(1 / 60, { x: -1, y: 0 }, { x: 0, y: 0 }, false);
  const dot = w.position.clone().sub(before).normalize().dot(rightBefore);
  check('摇杆左推 → 角色朝屏幕左侧移动', dot < -0.9, `位移·屏幕右 = ${dot.toFixed(3)}（应接近 -1）`);
}

// ---------- 3. 上推摇杆是否远离相机（屏幕里往上走） ----------
{
  const w = makeWalker();
  const camA = cam.clone();
  settle(w, camA);
  const before = w.position.clone();
  const ndcBefore = ndcOf(camA, before);
  // 走 12 帧，位移够大才不会被浮点噪声左右
  for (let i = 0; i < 12; i++) w.update(1 / 60, { x: 0, y: 1 }, { x: 0, y: 0 }, false);
  camA.updateMatrixWorld();
  const ndcAfter = ndcOf(camA, w.position.clone());
  // 球面是弯的，位移向量与相机 up 轴本来就不平行，
  // 所以这里直接比较屏幕坐标：往屏幕上方走 = NDC y 变大。
  const dy = ndcAfter.y - ndcBefore.y;
  const dot = w.position.clone().sub(before).normalize().dot(screenUp(camA));
  check(
    '摇杆上推 → 角色朝屏幕上方移动',
    dy > 0.05,
    `NDC y ${ndcBefore.y.toFixed(3)} → ${ndcAfter.y.toFixed(3)}（位移·屏幕上 = ${dot.toFixed(3)}）`
  );
}

// ---------- 4. 角色朝向：模型脸（+Z）是否对着前进方向 ----------
{
  const w = makeWalker();
  const camA = cam.clone();
  settle(w, camA);
  const before = w.position.clone();
  // 连续走 30 帧让朝向插值收敛
  for (let i = 0; i < 30; i++) w.update(1 / 60, { x: 0.35, y: 1 }, { x: 0, y: 0 }, false);
  const move = w.position.clone().sub(before).normalize();
  // 模型脸部朝向 = 局部 +Z 经过 quaternion
  const face = new THREE.Vector3(0, 0, 1).applyQuaternion(w.avatar.quaternion).normalize();
  // 投到切平面比较（模型略微前倾不算错）
  const faceT = face.clone().addScaledVector(w.up, -face.dot(w.up)).normalize();
  const dot = faceT.dot(move);
  check('角色脸朝前进方向', dot > 0.9, `脸·移动方向 = ${dot.toFixed(3)}（应接近 +1，负数说明在倒着走）`);
}

// ---------- 5. 多角度复核（球面各处） ----------
{
  const dirs = [
    new THREE.Vector3(1, 0.4, -0.6),
    new THREE.Vector3(-0.7, 0.9, 0.3),
    new THREE.Vector3(0.2, -1, 0.1),
    new THREE.Vector3(-0.3, -0.2, -1),
  ];
  let worstFace = 1;
  let worstRight = 1;
  for (const d of dirs) {
    const w = makeWalker(d);
    const camA = cam.clone();
    settle(w, camA);
    // 视角再转 1.1 rad，避免只看 camYaw=0
    w.update(1 / 60, { x: 0, y: 0 }, { x: 0, y: 0 }, false);
    w.camYaw = 1.1;
    settle(w, camA);
    const r0 = screenRight(camA);
    const p0 = w.position.clone();
    w.update(1 / 60, { x: 1, y: 0 }, { x: 0, y: 0 }, false);
    worstRight = Math.min(worstRight, w.position.clone().sub(p0).normalize().dot(r0));

    const w2 = makeWalker(d);
    const camB = cam.clone();
    settle(w2, camB);
    w2.camYaw = 1.1;
    for (let i = 0; i < 40; i++) w2.update(1 / 60, { x: 0.4, y: 1 }, { x: 0, y: 0 }, false);
    w2.updateCamera(camB, 1 / 60);
    const face = new THREE.Vector3(0, 0, 1).applyQuaternion(w2.avatar.quaternion).normalize();
    const faceT = face.addScaledVector(w2.up, -face.dot(w2.up)).normalize();
    const fwd = w2.getCameraForward(new THREE.Vector3());
    w2._buildBasis();
    // 输入是 move = {x: 0.4, y: 1}，而 update 里 wish = fwd*move.y + right*move.x，
    // 其中 right = fwd × up（屏幕右）。这里必须用同一个符号，早先写成 -0.4 是脚本笔误。
    const mv = new THREE.Vector3()
      .addScaledVector(fwd, 1)
      .addScaledVector(new THREE.Vector3().crossVectors(fwd, w2.up).normalize(), 0.4);
    worstFace = Math.min(worstFace, faceT.dot(mv.normalize()));
  }
  check('球面各处右推都在屏幕右', worstRight > 0.9, `最差 ${worstRight.toFixed(3)}`);
  check('球面各处朝向都正确', worstFace > 0.9, `最差 ${worstFace.toFixed(3)}`);
}

// ---------- 6. 相机是否在角色身后（朝向一致） ----------
{
  const w = makeWalker();
  const camA = cam.clone();
  settle(w, camA);
  const toCam = camA.position.clone().sub(w.position).normalize();
  const fwd = w.getCameraForward(new THREE.Vector3());
  const dot = toCam.dot(fwd);
  check('相机在角色身后', dot < -0.3, `(相机-角色)·前 = ${dot.toFixed(3)}（应 < 0）`);
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
