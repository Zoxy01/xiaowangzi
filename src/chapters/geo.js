/**
 * 第七章：地理学家的星球（330 号小行星）
 * 原著要点：地理学家记录山川湖海，却从不离开书桌；
 * 「花是转瞬即逝的」——他这么一说，小王子第一次为留在家里的玫瑰担心。
 */
import * as THREE from 'three';
import { Chapter, D } from './chapter.js';
import { makePlanet, makeTelescope, makeLedger, placeOnSphere } from '../world.js';
import { makeGeographerNPC, placeNPC, faceNPC, besideDir } from '../npc.js';

const R = 5.2;

export class GeoChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R, spinSpeed: 0.009, palette: 'geo' });
    // 柔光地表：地理学家的星球寸草不生 —— 他只记录山河，从不种花
    this.biome = { grass: 0, flowers: 0, motes: 150, motesColor: 0xffeecb, shafts: 4, seed: 71 };
    this.root.rotation.z = -0.04;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R, color: 0x6f6a5a, detail: 38, bump: 0.028 });
    this.root.add(this.planet);

    // 书桌 + 地图册
    this.deskDir = D(80, 26);
    const desk = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4f3d29, roughness: 0.92, flatShading: true });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.5), wood);
    top.position.y = 0.36;
    top.castShadow = true;
    desk.add(top);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 6), wood);
      leg.position.set(sx * 0.34, 0.18, sz * 0.2);
      desk.add(leg);
    }
    placeOnSphere(desk, this.deskDir, 0, R);
    this.root.add(desk);

    this.books = [];
    for (let i = 0; i < 5; i++) {
      const b = makeLedger();
      placeOnSphere(b, this.deskDir, 0.41, R);
      b.translateX((i - 2) * 0.13);
      b.translateZ(((i % 2) - 0.5) * 0.08);
      this.root.add(b);
      this.books.push(b);
    }

    // 望远镜：他从不亲自去看，只用它「记录」
    this.scopeDir = D(10, 6);
    const scope = makeTelescope();
    placeOnSphere(scope, this.scopeDir, 0, R);
    scope.scale.setScalar(1.2);
    this.root.add(scope);

    // 地球仪：他研究的对象
    this.globeDir = D(-90, 12);
    const stand = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08d3a, roughness: 0.4, metalness: 0.8 });
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x3f6b8a, roughness: 0.5, metalness: 0.2 })
    );
    sphere.position.y = 0.4;
    sphere.castShadow = true;
    stand.add(sphere);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.008, 5, 24), brass);
    ring.position.y = 0.4;
    ring.rotation.x = Math.PI / 2.4;
    stand.add(ring);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.05, 10), brass);
    stand.add(foot);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 6), brass);
    stem.position.y = 0.16;
    stand.add(stem);
    placeOnSphere(stand, this.globeDir, 0, R);
    this.root.add(stand);
    this.globe = sphere;

    this.geographerNPC = makeGeographerNPC();
    placeNPC(this.geographerNPC, besideDir(this.deskDir, R, 0.6, 90), R + 0.02, this.walker.position);
    this.root.add(this.geographerNPC);

    this.addInteract({ id: 'geo', dir: this.deskDir, radius: 1.7, label: '请教地理学家', priority: 0 });
    this.addInteract({ id: 'record', dir: this.scopeDir, radius: 1.3, label: '看看他在记录什么', priority: 6 });

    this._spawnNearTarget('geo', 34);
  }

  _buildState() {
    this.goals = [
      '走近那位伏案的地理学家',
      '请他记下这颗星球',
      '问他地球在哪里',
      '关心留在家里的那朵花',
      '启程去地球',
    ];
    this.goalsDone = new Set();
    this.stage = 0;
  }

  opening() {
    return [
      { text: '330 号小行星。这里住着一位地理学家。' },
      { text: '他写着一本很厚的书，却从没离开过这张书桌。' },
      { text: '走近那位伏案的地理学家' },
    ];
  }

  _animateEnv(dt) {
    const t = this.clock.elapsedTime;
    faceNPC(this.geographerNPC, this.walker.position, 0.08, dt);
    this.globe.rotation.y = t * 0.25;
    this.books.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.8 + i) * 0.015;
    });
  }

  onInteract(id) {
    if (id === 'record') {
      this._say([
        { text: '望远镜对着远处那座山。' },
        { speaker: '地理学家', text: '我在记那座山。它不会变。' },
        { text: '那花呢？' },
        { speaker: '地理学家', text: '花是转瞬即逝的。我不记转瞬即逝的东西。' },
        { text: '小王子第一次觉得，不被记录的东西，才最容易被忘记。' },
      ]);
      return;
    }
    if (id === 'geo') {
      this._markGoal(0);
      this._markGoal(1);
      this.stage = 1;
      this._say([
        { speaker: '地理学家', text: '你从哪儿来？' },
        { text: '从 B-612 号小行星来。' },
        { speaker: '地理学家', text: '我这里有很多山、很多海。' },
        { text: '这些我都见过。' },
        { speaker: '地理学家', text: '我没见过。我只是记录。' },
      ], () => {
        this._markGoal(2);
        this.addInteract({ id: 'ask2', dir: this.deskDir, radius: 1.7, label: '问他地球', priority: -1 });
      });
      return;
    }
    if (id === 'ask2') {
      this.stage = 2;
      this.interactables = this.interactables.filter((i) => i.id !== 'ask2');
      this._say([
        { text: '听说地球很有名，我们能去看看吗？' },
        { speaker: '地理学家', text: '地球啊。它是有名的。那里有一百一十一个国王，七千个地理学家……' },
        { text: '那你去过地球吗？' },
        { speaker: '地理学家', text: '我没有去。地理学家很重要，不能到处乱跑。' },
        { text: '你的花呢？它也是转瞬即逝的吗？' },
      ], () => {
        this.addInteract({ id: 'flower', dir: this.deskDir, radius: 1.7, label: '问问「转瞬即逝」', priority: -1 });
      });
      return;
    }
    if (id === 'flower') {
      this.interactables = this.interactables.filter((i) => i.id !== 'flower');
      this.stage = 3;
      this._say([
        { speaker: '地理学家', text: '花是转瞬即逝的。' },
        { text: '转瞬即逝，是什么意思？' },
        { speaker: '地理学家', text: '就是很快就会消失的意思。' },
        { text: '我的花很快就会消失吗？' },
        { text: '我把她一个人留在家里了！她只有四根刺，要对付整个世界！' },
        { text: '他第一次后悔出来。他决定去地球看看。' },
      ], () => {
        this._markGoal(3);
        this._markGoal(4);
        this.addInteract({ id: 'bye', dir: this.deskDir, radius: 1.7, label: '启程去地球', priority: -1 });
      });
      return;
    }
    if (id === 'bye') {
      this.interactables = this.interactables.filter((i) => i.id !== 'bye');
      this._say([{ text: '小王子离开了 330 号小行星，前往地球。' }], () =>
        this.game.completeChapter('geo')
      );
    }
  }
}
