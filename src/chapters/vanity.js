/**
 * 第三章：爱虚荣者的星球（326 号小行星）
 * 原著要点：他只听得见赞美；让小王子拍手，他脱帽致意；问「你真的觉得我很了不起吗」。
 */
import * as THREE from 'three';
import { Chapter, D } from './chapter.js';
import { makePlanet, makeSparkles, placeOnSphere } from '../world.js';
import { audio } from '../audio.js';
import { makeConceitedNPC, placeNPC, faceNPC, besideDir } from '../npc.js';

const R = 4.6;

export class VanityChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R, spinSpeed: 0.014, palette: 'vanity' });
    // 柔光地表：淡紫地表 + 一圈会被灯光照亮的小花
    this.biome = {
      grass: 180,
      grassColors: [0x9d92b4, 0xb3a6c6, 0x8b84a6],
      flowers: 34,
      flowerColors: [0xf2d8ef, 0xe7c3e2, 0xffe6f4],
      motes: 210,
      motesColor: 0xffe3f0,
      shafts: 4,
      seed: 33,
    };
    this.root.rotation.z = -0.06;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R, color: 0x8d7f9e, detail: 38, bump: 0.028 });
    this.root.add(this.planet);

    // 主角站的高台：一根柱子 + 圆盘
    this.pedestalDir = D(80, 24);
    const stone = new THREE.MeshStandardMaterial({ color: 0x8d8496, roughness: 0.85, flatShading: true });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.5, 12), stone);
    const pedestal = new THREE.Group();
    column.position.y = 0.25;
    column.castShadow = true;
    pedestal.add(column);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 14), stone);
    disc.position.y = 0.53;
    pedestal.add(disc);
    placeOnSphere(pedestal, this.pedestalDir, 0, R);
    this.root.add(pedestal);

    // 一顶高帽（爱虚荣者的标志）
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x2b2b38, roughness: 0.6, flatShading: true });
    const hat = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.014, 14), hatMat);
    hat.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.26, 12), hatMat);
    crown.position.y = 0.13;
    hat.add(crown);
    this.hat = hat;
    placeOnSphere(hat, this.pedestalDir, 0.62, R);
    this.root.add(hat);

    this.vanityNPC = makeConceitedNPC();
    placeNPC(this.vanityNPC, besideDir(this.pedestalDir, R, 0.75, 90), R + 0.02, this.walker.position);
    this.root.add(this.vanityNPC);

    // 掌声的视觉：金色小光点
    this.sparkles = makeSparkles(18, 0.55);
    placeOnSphere(this.sparkles, this.pedestalDir, 0.7, R);
    this.sparkles.visible = false;
    this.root.add(this.sparkles);

    // 镜子（他只看得见自己）
    const mirror = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 20),
      new THREE.MeshStandardMaterial({ color: 0xbfd0dd, roughness: 0.05, metalness: 0.9 })
    );
    this.mirrorDir = D(-40, 8);
    const mount = new THREE.Group();
    mirror.position.y = 0.4;
    mirror.rotation.x = -0.16;
    mount.add(mirror);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x4a4450, roughness: 0.9 });
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), legMat);
      leg.position.set(sx * 0.1, 0.2, 0);
      leg.rotation.z = sx * 0.16;
      mount.add(leg);
    }
    placeOnSphere(mount, this.mirrorDir, 0, R);
    this.root.add(mount);

    this.addInteract({ id: 'clap', dir: this.pedestalDir, radius: 1.6, label: '鼓掌', priority: 0 });
    this.addInteract({ id: 'mirror', dir: this.mirrorDir, radius: 1.3, label: '看看他的镜子', priority: 6 });

    this._spawnNearTarget('clap', 34);
  }

  _buildState() {
    this.goals = [
      '走近那个站在高台上的人',
      '为他鼓掌（他只想听掌声）',
      '再鼓一次掌',
      '问问他「了不起」是什么意思',
    ];
    this.goalsDone = new Set();
    this.stage = 0;
    this.claps = 0;
  }

  opening() {
    return [
      { text: '326 号小行星。这里住着一个爱虚荣的人。' },
      { text: '在他看来，所有的人都崇拜他。' },
      { text: '走近那个站在高台上的人' },
    ];
  }

  _animateEnv(dt) {
    const time = this.clock.elapsedTime;
    faceNPC(this.vanityNPC, this.walker.position, 0.08, dt);
    this.hat.rotation.y = Math.sin(time * 0.6) * 0.1;
    if (this.sparkles.visible) {
      const p = this.sparkles.geometry.getAttribute('position');
      const base = this.sparkles.userData.base;
      for (let i = 0; i < p.count; i++) {
        p.setY(i, base[i * 3 + 1] + Math.sin(time * 2 + i) * 0.04);
      }
      p.needsUpdate = true;
      this.sparkles.rotation.y = time * 0.7;
    }
  }

  onInteract(id) {
    if (id === 'mirror') {
      this._say([
        { text: '镜子擦得很亮，一点灰都没有。' },
        { speaker: '爱虚荣的人', text: '我每天都在练习。练习怎么被人崇拜。' },
        { text: '他在镜子里看了很久，像在看唯一一个观众。' },
      ]);
      return;
    }
    if (id === 'clap') {
      this.claps = 1;
      this._markGoal(0);
      this._markGoal(1);
      this.sparkles.visible = true;
      this.hat.position.y += 0.06; // 脱帽致意
      audio.chime(880);
      this._say([
        { text: '（小王子拍了拍手）' },
        { speaker: '爱虚荣的人', text: '（脱下帽子，谦逊地致意）' },
        { speaker: '爱虚荣的人', text: '这比访问国王有趣多了！' },
        { text: '（于是小王子又拍了拍手）' },
      ]);
      this.addInteract({ id: 'clap2', dir: this.pedestalDir, radius: 1.6, label: '再鼓一次掌', priority: -1 });
      return;
    }
    if (id === 'clap2') {
      this.claps = 2;
      this._markGoal(2);
      this.hat.position.y += 0.06;
      this._say([
        { text: '（小王子又拍了拍手）' },
        { speaker: '爱虚荣的人', text: '（又脱下帽子致意）' },
        { text: '这有什么好玩的呢？' },
        { speaker: '爱虚荣的人', text: '你真的觉得我很了不起吗？' },
        { text: '「了不起」是什么意思？' },
        { speaker: '爱虚荣的人', text: '了不起，就是所有的人都崇拜我。' },
        { text: '可是这里只有你一个人呀。' },
        { speaker: '爱虚荣的人', text: '那你就崇拜我吧！' },
        { text: '大人们真是奇怪。' },
      ], () => {
        this._markGoal(3);
        this.interactables = this.interactables.filter((i) => i.id !== 'clap2');
        this._leave();
      });
      return;
    }
  }

  _leave() {
    this._say([{ text: '小王子离开了 326 号小行星。' }], () => this.game.completeChapter('vanity'));
  }
}
