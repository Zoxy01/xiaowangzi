/**
 * 第五章：商人的星球（328 号小行星）
 * 原著要点：他一刻不停地数星星，说它们都归他所有（因为没人想到要占有它们）；
 * 小王子反问：我拥有火山和花，我会给花浇水、给火山清扫——你为星星做了什么？
 */
import * as THREE from 'three';
import { Chapter, D } from './chapter.js';
import { makePlanet, makeLedger, placeOnSphere } from '../world.js';
import { makeBusinessmanNPC, placeNPC, faceNPC, besideDir } from '../npc.js';

const R = 4.8;

export class MerchantChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R, spinSpeed: 0.02, palette: 'merchant' });
    // 柔光地表：账本星球，稀疏的草与冷白色的光尘
    this.biome = {
      grass: 150,
      grassColors: [0x8f9a72, 0xa8a87e, 0x7f8d68],
      flowers: 16,
      flowerColors: [0xf4efd8, 0xe6ddc0],
      motes: 170,
      motesColor: 0xfff2cf,
      shafts: 4,
      seed: 57,
    };
    this.root.rotation.z = -0.1;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R, color: 0x857a63, detail: 36, bump: 0.026 });
    this.root.add(this.planet);

    // 计数台：一堆账本
    this.deskDir = D(75, 22);
    const desk = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 0.9, flatShading: true });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.44), wood);
    top.position.y = 0.34;
    top.castShadow = true;
    desk.add(top);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 6), wood);
      leg.position.set(sx * 0.3, 0.17, sz * 0.17);
      desk.add(leg);
    }
    placeOnSphere(desk, this.deskDir, 0, R);
    this.root.add(desk);

    this.ledgers = [];
    for (let i = 0; i < 4; i++) {
      const led = makeLedger();
      placeOnSphere(led, this.deskDir, 0.39, R);
      // 沿切平面微调，别叠成一摞
      led.translateX((i - 1.5) * 0.16);
      led.translateZ(((i % 2) - 0.5) * 0.1);
      this.root.add(led);
      this.ledgers.push(led);
    }

    // 漫天「属于他」的星星：一小片金色光点，越数越多
    this.starPile = new THREE.Group();
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), starMat);
      const a = Math.random() * Math.PI * 2;
      const rr = 0.4 + Math.random() * 0.9;
      s.position.set(Math.cos(a) * rr, 0.25 + Math.random() * 1.1, Math.sin(a) * rr);
      this.starPile.add(s);
    }
    placeOnSphere(this.starPile, this.deskDir, 0.1, R);
    this.root.add(this.starPile);

    this.merchantNPC = makeBusinessmanNPC();
    placeNPC(this.merchantNPC, besideDir(this.deskDir, R, 0.72, 90), R + 0.02, this.walker.position);
    this.root.add(this.merchantNPC);

    this.addInteract({ id: 'merchant', dir: this.deskDir, radius: 1.65, label: '问他在数什么', priority: 0 });
    // 原著小事：星星记在纸上，纸锁进抽屉
    this.drawerDir = besideDir(this.deskDir, R, 1.35, -75);
    const drawer = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.16, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x5d4630, roughness: 0.9, flatShading: true })
    );
    box.position.y = 0.08;
    drawer.add(box);
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc7a45a, roughness: 0.4, metalness: 0.7 })
    );
    knob.position.set(0, 0.08, 0.105);
    drawer.add(knob);
    placeOnSphere(drawer, this.drawerDir, 0, R);
    this.root.add(drawer);
    this.addInteract({ id: 'drawer', dir: this.drawerDir, radius: 1.2, label: '看看那只抽屉', priority: 6 });

    this._spawnNearTarget('merchant', 34);
  }

  _buildState() {
    this.goals = ['走近那个低头数数的人', '问他在数什么', '听他说「星星都归我」', '反问：你为它们做了什么'];
    this.goalsDone = new Set();
    this.stage = 0;
  }

  opening() {
    return [
      { text: '328 号小行星。这里住着一个商人。' },
      { text: '他忙得连头都不抬——他在数星星。' },
      { text: '走近那个低头数数的人' },
    ];
  }

  _animateEnv(dt) {
    const t = this.clock.elapsedTime;
    faceNPC(this.merchantNPC, this.walker.position, 0.08, dt);
    // 星星缓慢上浮，像被点数过一样
    this.starPile.children.forEach((s, i) => {
      s.position.y = 0.25 + ((t * 0.12 + i * 0.13) % 1.1);
      s.rotation.y = t * 0.9 + i;
    });
    // 账页翻动
    this.ledgers.forEach((l, i) => {
      l.rotation.z = Math.sin(t * 1.3 + i) * 0.02;
    });
  }

  onInteract(id) {
    if (id === 'drawer') {
      this._say([
        { text: '抽屉锁着。里面是写着星星总数的纸。' },
        { speaker: '商人', text: '五亿零一百六十二万二千七百三十一颗。少一颗我都睡不着。' },
        { text: '没有人抬头看那些星星。它们只活在纸上。' },
      ]);
      return;
    }
    if (id === 'merchant') {
      this._markGoal(0);
      this._markGoal(1);
      this.stage = 1;
      this._say([
        { text: '你在那儿干什么？' },
        { speaker: '商人', text: '我在数星星。' },
        { text: '数星星做什么？' },
        { speaker: '商人', text: '因为它们都归我所有。' },
        { text: '星星怎么会归你呢？' },
        { speaker: '商人', text: '因为在我之前，从没有人想到要占有它们。' },
      ], () => {
        this._markGoal(2);
        this.addInteract({ id: 'ask', dir: this.deskDir, radius: 1.65, label: '反问他', priority: -1 });
      });
      return;
    }
    if (id === 'ask') {
      this.stage = 2;
      this.interactables = this.interactables.filter((i) => i.id !== 'ask');
      this._say([
        { text: '可是你拿星星做什么用呢？' },
        { speaker: '商人', text: '我把它们记下来，记在纸上，然后把纸锁进抽屉。' },
        { text: '而我，我拥有火山，我会为它们清扫。我拥有一朵花，我每天给她浇水。' },
        { text: '你对星星做过什么呢？' },
        { speaker: '商人', text: '……' },
        { text: '小王子觉得没意思，就走了。' },
      ], () => {
        this._markGoal(3);
        this.game.completeChapter('merchant');
      });
    }
  }
}
