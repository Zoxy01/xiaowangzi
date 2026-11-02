/**
 * 第二章：国王是否真的坐在王座上（纯 Node，不开浏览器）。
 * 检查：国王与王座的相对位置、胯部是否压住座面、脚是否落地、头是否露在椅背上方、
 * 身体有没有挡住王座正面、笼子是否在座位旁且落地。
 *   node tools/king-seat-check.mjs
 */
import * as THREE from 'three';
import { makeThrone } from '../src/world.js';
import { makeKingNPC } from '../src/npc.js';

const throne = makeThrone();
const king = makeKingNPC({ seated: true });
throne.add(king);
king.position.set(0, 0, -0.03);

// 笼子（与 king.js 一致）
const cage = new THREE.Group();
const cageMat = new THREE.MeshStandardMaterial({ color: 0x6b5a42 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.2), cageMat);
floor.position.y = 0.01;
cage.add(floor);
const lid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.015, 0.22), cageMat);
lid.position.y = 0.2;
cage.add(lid);
throne.add(cage);
cage.position.set(0.58, 0, 0.1);

throne.updateMatrixWorld(true);
const box = (o) => new THREE.Box3().setFromObject(o);
const kb = box(king);
const tb = box(throne);
const cb = box(cage);

const seatY = throne.userData.seatY; // 0.27
const seat = new THREE.Box3(new THREE.Vector3(-0.2, seatY - 0.03, -0.18), new THREE.Vector3(0.2, seatY, 0.18));
const thigh = new THREE.Vector3(0.09, 0.34, 0.1);
const thighWorld = king.localToWorld(thigh.clone());

const rows = [];
const push = (name, ok, detail) => rows.push({ name, ok, detail });

push('国王坐在座位正上方', Math.abs(king.position.x) < 0.06 && Math.abs(king.position.z + 0.03) < 0.12,
  `位置 (${king.position.x}, ${king.position.y}, ${king.position.z})`);
push('胯部压住座面', thighWorld.y - 0.062 <= seatY + 0.01 && thighWorld.y - 0.062 >= seatY - 0.06,
  `大腿底面 ${(thighWorld.y - 0.062).toFixed(3)} vs 座面 ${seatY}`);
push('脚落地（不悬空、不陷地）', Math.abs(kb.min.y) < 0.02, `包围盒最低 ${kb.min.y.toFixed(3)}`);
push('头露在椅背上方', kb.max.y > 0.78 + 0.02, `头顶 ${kb.max.y.toFixed(3)} vs 椅背顶 0.78`);
push('没有穿到地面以下', tb.min.y > -0.02, `整体最低 ${tb.min.y.toFixed(3)}`);
push('笼子落在座旁地上', Math.abs(cb.min.y) < 0.02 && cb.min.x > 0.4, `笼底 ${cb.min.y.toFixed(3)} x ${cb.min.x.toFixed(2)}`);
push('镜头高度内（整体 < 1.1 m）', tb.max.y < 1.1, `最高 ${tb.max.y.toFixed(3)}`);

let fails = 0;
for (const r of rows) {
  if (!r.ok) fails++;
  console.log(`${r.ok ? '✓' : '✗'} ${r.name} — ${r.detail}`);
}
console.log(fails ? `\n${fails} 项不通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
