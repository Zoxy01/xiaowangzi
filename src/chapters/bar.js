/**
 * 第四章：酒鬼的星球（327 号小行星）
 * 原著要点：他在喝酒；为什么喝？为了忘记；忘记什么？忘记羞愧；
 * 羞愧什么？羞愧喝酒。小王子默默走了。
 */
import * as THREE from 'three';
import { Chapter, D } from './chapter.js';
import { makePlanet, makeBarrel, makeBottle, placeOnSphere } from '../world.js';
import { makeTipplerNPC, placeNPC, faceNPC, besideDir } from '../npc.js';

const R = 4.4;

export class BarChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R, spinSpeed: 0.008, fog: 0x241a2a, fogDensity: 0.01, palette: 'bar' });
    // 柔光地表：这颗星球不长草，只有灯下慢慢飘的尘埃
    this.biome = { grass: 0, flowers: 0, motes: 90, motesColor: 0xffc98a, shafts: 0, seed: 41 };
    this.root.rotation.z = 0.12;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R, color: 0x574a66, detail: 34, bump: 0.03 });
    this.root.add(this.planet);

    // 酒桶与空瓶散落一地
    this.barrelDir = D(70, 20);
    const barrel = makeBarrel();
    placeOnSphere(barrel, this.barrelDir, 0, R);
    this.root.add(barrel);

    this.drunkNPC = makeTipplerNPC();
    placeNPC(this.drunkNPC, besideDir(this.barrelDir, R, 0.7, 90), R + 0.02, this.walker.position);
    this.root.add(this.drunkNPC);

    this.bottles = [];
    for (const [az, lat, col] of [
      [-30, 4, 0x2c5b3a],
      [20, -8, 0x6b3a2c],
      [140, 10, 0x2c5b3a],
      [-90, -14, 0x3a3a5b],
      [200, 6, 0x6b3a2c],
    ]) {
      const b = makeBottle(col);
      placeOnSphere(b, D(az, lat), 0, R);
      b.rotation.y = Math.random() * 3;
      this.root.add(b);
      this.bottles.push(b);
    }

    // 一盏很暗的灯
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffca80,
      emissive: 0xff9a40,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.8,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lampMat);
    const lampDir = D(160, 26);
    placeOnSphere(lamp, lampDir, 0.4, R);
    this.root.add(lamp);
    const glow = new THREE.PointLight(0xffab55, 0.9, 3, 2);
    glow.position.copy(lamp.position).multiplyScalar(1.06);
    this.root.add(glow);
    this.lampGlow = glow;

    this.addInteract({ id: 'drunk', dir: this.barrelDir, radius: 1.6, label: '问他为什么喝酒', priority: 0 });
    // 原著小事：地上散着的空瓶，是「他忘记了多久」的刻度
    this.addInteract({ id: 'bottles', dir: D(20, -8), radius: 1.3, label: '数一数他的空瓶', priority: 6 });

    this._spawnNearTarget('drunk', 34);
  }

  _buildState() {
    this.goals = ['走近那个低头喝酒的人', '问他：你在喝什么', '问他：为什么喝酒', '沉默地离开'];
    this.goalsDone = new Set();
    this.stage = 0;
  }

  opening() {
    return [
      { text: '327 号小行星。这里住着一个酒鬼。' },
      { text: '他坐在一堆空瓶中间，沉默地喝着。' },
      { text: '走近那个低头喝酒的人' },
    ];
  }

  _animateEnv(dt) {
    const time = this.clock.elapsedTime;
    faceNPC(this.drunkNPC, this.walker.position, 0.08, dt);
    for (let i = 0; i < this.bottles.length; i++) {
      this.bottles[i].rotation.z = Math.sin(time * 0.5 + i * 2) * 0.03;
    }
    // 灯忽明忽暗
    this.lampGlow.intensity = 0.7 + Math.sin(time * 1.7) * 0.25;
  }

  onInteract(id) {
    if (id === 'bottles') {
      this._say([
        { text: '空瓶子一共四十七个，摆得很整齐。' },
        { speaker: '酒鬼', text: '别数了。数完也不会少。' },
        { text: '每一瓶都是他忘掉的一天。' },
      ]);
      return;
    }
    if (id === 'drunk') {
      this._markGoal(0);
      this._markGoal(1);
      this.stage = 1;
      this._say([
        { text: '你在那儿干什么？' },
        { speaker: '酒鬼', text: '我在喝酒。' },
        { text: '你为什么喝酒？' },
        { speaker: '酒鬼', text: '为了忘记。' },
        { text: '忘记什么呢？' },
      ], () => {
        this.addInteract({ id: 'why', dir: this.barrelDir, radius: 1.6, label: '继续问下去', priority: -1 });
      });
      return;
    }
    if (id === 'why') {
      this._markGoal(2);
      this.stage = 2;
      this.interactables = this.interactables.filter((i) => i.id !== 'why');
      this._say([
        { speaker: '酒鬼', text: '忘记我的羞愧。' },
        { text: '羞愧什么呢？' },
        { speaker: '酒鬼', text: '羞愧我喝酒。' },
        { text: '……' },
        { text: '大人们真是奇怪。' },
        { text: '小王子默默地走开了。' },
      ], () => {
        this._markGoal(3);
        this.game.completeChapter('bar');
      });
      return;
    }
  }
}
