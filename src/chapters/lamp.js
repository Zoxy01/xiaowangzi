/**
 * 第六章：点灯人的星球（329 号小行星）
 * 原著要点：星球小得只放得下一盏路灯和一个点灯人；
 * 点灯人每分钟点一次灯、熄一次灯——他忠于职守，却累得不行。
 * 小王子觉得他「做的事情有意义」，但星球太小，容不下两个人。
 */
import * as THREE from 'three';
import { Chapter, D } from './chapter.js';
import { makePlanet, makeStreetLamp, makeChair, placeOnSphere } from '../world.js';
import { audio } from '../audio.js';
import { makeLamplighterNPC, placeNPC, faceNPC, besideDir } from '../npc.js';

const R = 3.4; // 全篇最小的星球

export class LampChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R, spinSpeed: 0.03, fog: 0x101830, fogDensity: 0.012, palette: 'lamp' });
    // 柔光地表：一颗只够放一盏灯的小星球，几点冷草
    this.biome = {
      grass: 70,
      grassColors: [0x7d8a7a, 0x93a08c, 0x6e7c76],
      flowers: 6,
      flowerColors: [0xdce8ff, 0xc9dcf6],
      motes: 120,
      motesColor: 0xcfe4ff,
      shafts: 0,
      seed: 63,
    };
    this.root.rotation.z = 0.2;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R, color: 0x5b6377, detail: 32, bump: 0.024 });
    this.root.add(this.planet);

    // 路灯：全章的视觉中心
    this.lampDir = D(85, 18);
    this.lamp = makeStreetLamp();
    placeOnSphere(this.lamp, this.lampDir, 0, R);
    this.lamp.scale.setScalar(1.15);
    this.root.add(this.lamp);

    // 点灯人的小凳子
    this.stoolDir = D(40, 4);
    const stool = makeChair();
    stool.scale.setScalar(0.85);
    placeOnSphere(stool, this.stoolDir, 0, R);
    this.root.add(stool);

    this.lamplighterNPC = makeLamplighterNPC();
    placeNPC(this.lamplighterNPC, besideDir(this.lampDir, R, 0.55, 90), R + 0.02, this.walker.position);
    this.root.add(this.lamplighterNPC);

    this.addInteract({ id: 'lamplighter', dir: this.lampDir, radius: 1.5, label: '和点灯人说话', priority: 0 });
    // 原著小事：小王子想帮点灯人点灯
    this.helpDir = besideDir(this.lampDir, R, 1.15, -100);
    this.addInteract({ id: 'light', dir: this.helpDir, radius: 1.2, label: '替他把灯点上', priority: 6 });

    // 这是第一颗「已经入夜」的星球
    this.sunAngle = 0.08;
    this._spawnNearTarget('lamplighter', 36);
  }

  _buildState() {
    this.goals = ['走近那盏路灯', '看点灯人点灯', '看点灯人熄灯', '和他道别'];
    this.goalsDone = new Set();
    this.stage = 0;
    this.lit = true;
    this.timer = 0;
    this.cycle = 6; // 每 6 秒一个昼夜（原著是每分钟一次，玩游戏不能等）
  }

  opening() {
    return [
      { text: '329 号小行星。这是最小的一颗星球，只放得下一盏路灯和一个点灯人。' },
      { text: '点灯人每分钟点一次灯，又熄一次灯。' },
      { text: '走近那盏路灯' },
    ];
  }

  _animateEnv(dt) {
    const time = this.clock.elapsedTime;
    faceNPC(this.lamplighterNPC, this.walker.position, 0.08, dt);
    // 灯亮暗呼吸
    const g = this.lamp.userData.glass;
    g.material.emissiveIntensity = this.lit ? 1.4 + Math.sin(time * 3) * 0.25 : 0.05;
    g.material.opacity = this.lit ? 0.85 : 0.35;
    this.lamp.userData.halo.material.opacity = this.lit ? 0.16 + Math.sin(time * 2.2) * 0.04 : 0.0;
    this.lamp.userData.light.intensity = this.lit ? 1.2 + Math.sin(time * 2.5) * 0.2 : 0;

    // 自动昼夜循环（点灯人自己也一直在干活）
    this.timer += dt;
    if (this.timer >= this.cycle) {
      this.timer = 0;
      this._toggleLamp(true);
    }
  }

  _toggleLamp(auto) {
    this.lit = !this.lit;
    this.sunAngle = this.lit ? 0.42 : -0.16;
    this._applySun();
    audio.chime(this.lit ? 660 : 392);
    if (auto) return;
  }

  onInteract(id) {
    if (id === 'light') {
      if (!this.lit) this._toggleLamp(false);
      this._say([
        { text: '（小王子伸手，替他把灯点亮）' },
        { speaker: '点灯人', text: '谢谢你。可再过一会儿，我又得把它熄掉。' },
        { text: '他守着一条谁也说不清从哪儿来的规矩。' },
      ]);
      return;
    }
    if (id === 'lamplighter') {
      this._markGoal(0);
      this.stage = 1;
      this._say([
        { text: '你好。你的灯怎么灭得这么快？' },
        { speaker: '点灯人', text: '命令就是命令。早安。' },
        { text: '（他把灯点亮了）' },
        { speaker: '点灯人', text: '……晚安。' },
        { text: '（他又把灯熄了）' },
      ], () => {
        this._markGoal(1);
        this.addInteract({ id: 'why2', dir: this.lampDir, radius: 1.5, label: '问他的辛苦', priority: -1 });
      });
      return;
    }
    if (id === 'why2') {
      this.stage = 2;
      this.interactables = this.interactables.filter((i) => i.id !== 'why2');
      this._say([
        { text: '你的星球这么小，一分钟就能转一圈，你连歇一会儿的工夫都没有。' },
        { speaker: '点灯人', text: '命令就是命令。这是规矩。' },
        { text: '这就是规矩？' },
        { speaker: '点灯人', text: '是啊。我点灯，熄灯。点灯，熄灯。' },
        { text: '我明白。' },
        { text: '这个人做着一件有意义的事——他点亮的不是一盏灯，是别人的路。' },
      ], () => {
        this._markGoal(2);
        this.addInteract({ id: 'bye', dir: this.lampDir, radius: 1.5, label: '向他道别', priority: -1 });
      });
      return;
    }
    if (id === 'bye') {
      this.interactables = this.interactables.filter((i) => i.id !== 'bye');
      this._say([
        { text: '我要走了。' },
        { speaker: '点灯人', text: '晚安。' },
        { text: '我想留下来陪他。可这颗星球太小了，容不下两个人。' },
        { text: '小王子离开了 329 号小行星。' },
      ], () => {
        this._markGoal(3);
        this.game.completeChapter('lamp');
      });
    }
  }
}
