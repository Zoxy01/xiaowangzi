/**
 * 第二章：国王的星球（325 号小行星）
 * 原著要点：国王宣称统治一切，包括星星；要小王子打哈欠，又说「不能强人所难」；
 * 任命他做大法官/大使，小王子还是走了。
 */
import * as THREE from 'three';
import { Chapter, D } from './chapter.js';
import { makePlanet, makeThrone, makeCape, placeOnSphere } from '../world.js';
import { makeKingNPC, faceNPC, faceHeadOnly } from '../npc.js';

const R = 5.0;

export class KingChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R, spinSpeed: 0.01, palette: 'king' });
    // 柔光地表：国王的星球很荒，草稀稀拉拉，风里带一点灰绿色的光尘
    this.biome = {
      grass: 220,
      grassColors: [0x9aa36a, 0xb3b077, 0x8d9a63],
      flowers: 18,
      flowerColors: [0xf1d9a8, 0xe8c9b6],
      motes: 150,
      motesColor: 0xffe9c2,
      shafts: 4,
      seed: 21,
    };
    this.root.rotation.z = 0.08;
    this._buildScene();
    this._buildState();
    this._applySun();
    this._faceFirstTarget();
  }

  _buildScene() {
    this.planet = makePlanet({ radius: R, color: 0x9a8a6c, detail: 40, bump: 0.03 });
    this.root.add(this.planet);

    // 王座、国王、披风：三者挂在同一棵子树里，朝向和座面天然对齐
    this.throneDir = D(90, 30);
    this.throne = makeThrone();
    placeOnSphere(this.throne, this.throneDir, 0, R);
    this.root.add(this.throne);

    // 国王坐在王座上（坐姿模型的坐标系就是王座局部坐标，位移近似 0）
    this.kingNPC = makeKingNPC({ seated: true });
    this.throne.add(this.kingNPC);
    this.kingNPC.position.set(0, 0, -0.03);

    this.cape = makeCape();
    this.throne.add(this.cape);
    this.cape.position.set(0, 0.1, -0.2);

    // 星球边缘的一小片「领地」标记：几根旗杆
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3128, roughness: 0.9, flatShading: true });
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0x8c1d2c,
      roughness: 0.95,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this.flags = [];
    for (const az of [-60, 0, 180, 240]) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), poleMat);
      pole.position.y = 0.3;
      g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), flagMat);
      flag.position.set(0.11, 0.52, 0);
      g.add(flag);
      placeOnSphere(g, D(az, 0), 0, R);
      this.root.add(g);
      this.flags.push(flag);
    }

    // 原著小事：国王说「我审判过一只老鼠」——王座旁真放一个关老鼠的小笼子
    const cage = new THREE.Group();
    const cageMat = new THREE.MeshStandardMaterial({ color: 0x6b5a42, roughness: 0.85, flatShading: true });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.2), cageMat);
    floor.position.y = 0.01;
    cage.add(floor);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5), cageMat);
      bar.position.set(sx * 0.12, 0.1, sz * 0.08);
      cage.add(bar);
    }
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.015, 0.22), cageMat);
    lid.position.y = 0.2;
    cage.add(lid);
    this.rat = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.05, 1),
      new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.9, flatShading: true })
    );
    this.rat.scale.set(1.3, 0.8, 1);
    this.rat.position.set(0, 0.06, 0);
    cage.add(this.rat);
    this.throne.add(cage);
    cage.position.set(0.58, 0, 0.1);

    this._spawnNearTarget('throne', 34);
    // 让王座正面（+Z）转向玩家降落的方位；国王和笼子都跟着转
    this._orientThrone();

    // 笼子的朝向：王座局部偏移转到 root 局部再归一化，得到球面上的方向
    const off = new THREE.Vector3(0.58, 0, 0.1).applyQuaternion(this.throne.quaternion);
    this.ratDir = this.throne.position.clone().add(off).normalize();

    // 登记
    this.addInteract({ id: 'throne', dir: this.throneDir, radius: 1.5, label: '拜见国王', priority: 0 });
    this.addInteract({ id: 'rat', dir: this.ratDir, radius: 1.3, label: '看看笼子里的老鼠', priority: 6 });
  }

  /** 把王座绕自身法线转到正对玩家降落的方向（朝 +Z 看人）。 */
  _orientThrone() {
    const up = this.throneDir.clone().normalize();
    const to = this.walker.position.clone().sub(this.throne.position);
    to.addScaledVector(up, -to.dot(up));
    if (to.lengthSq() < 1e-8) return;
    to.normalize();
    const x = new THREE.Vector3().crossVectors(up, to).normalize();
    const m = new THREE.Matrix4().makeBasis(x, up, to);
    this.throne.quaternion.setFromRotationMatrix(m);
  }

  _buildState() {
    this.goals = ['走近王座，拜见国王', '打一个哈欠（国王的命令）', '听国王的裁决', '告别国王，继续旅程'];
    this.goalsDone = new Set();
    this.stage = 0;
    this.yawned = false;
    this.judged = false;
  }

  opening() {
    return [
      { text: '325 号小行星。这里住着一位国王。' },
      { text: '他穿着紫貂皮袍，坐在一个很简单的宝座上，却觉得自己统治着一切。' },
      { text: '走近王座，拜见国王' },
    ];
  }

  _animateEnv(dt) {
    const time = this.clock.elapsedTime;
    // 旗帜轻微飘动
    for (let i = 0; i < this.flags.length; i++) {
      this.flags[i].rotation.y = Math.sin(time * 1.6 + i) * 0.18;
    }
    if (this.rat) this.rat.rotation.y = time * 1.4;
    // 坐着的人身体不动，只转头看你
    faceNPC(this.kingNPC, null, 0, dt);
    faceHeadOnly(this.kingNPC, this.root.localToWorld(this.walker.position.clone()), 0.07);
    // 披风呼吸
    this.cape.scale.y = 1 + Math.sin(time * 0.8) * 0.012;
  }

  onInteract(id) {
    if (id === 'rat') {
      this._say([
        { text: '笼子里关着一只灰老鼠，正在原地打转。' },
        { speaker: '国王', text: '我审判过它。我判它死刑，可每次都得赦免它。' },
        { speaker: '国王', text: '这颗星球上，只有它一个人可以被审判。' },
        { text: '国王需要有人可以被审判，才能证明自己是国王。' },
      ]);
      return;
    }
    if (id === 'yawn') {
      this._doYawn();
      return;
    }
    if (id === 'throne') {
      if (this.stage === 0) this._meetKing();
      else if (this.judged) this._farewell();
      else this._meetKing();
    }
  }

  _doYawn() {
    this.yawned = true;
    // 打哈欠这条交互用完即撤，回到「拜见国王」
    this.interactables = this.interactables.filter((i) => i.id !== 'yawn');
    this.nearest = null;
    this.avatar.headTilt = 0.5;
    this._say(
      [
        { text: '（小王子张开嘴，打了一个哈欠）' },
        { speaker: '国王', text: '好，我命令你，再打一个。' },
        { text: '我实在打不出来。' },
        { speaker: '国王', text: '那么……你就在这儿住下吧，我任命你做我的大臣。' },
      ],
      () => {
        this.avatar.headTilt = 0;
        this._judge();
      }
    );
  }

  _meetKing() {
    this._markGoal(0);
    this._say(
      [
        { speaker: '国王', text: '啊！来了一个臣民。' },
        { speaker: '国王', text: '过来，让我好好看看你。' },
        { speaker: '国王', text: '你从哪里来？' },
        { text: '从一个很远的地方。' },
        { speaker: '国王', text: '啊！那么，你是从别的星球来的。' },
        { speaker: '国王', text: '我是这里的国王，我命令你……我命令你打一个哈欠。' },
        { text: '我打不出哈欠……我有点紧张。' },
        { speaker: '国王', text: '那……我命令你有时候打哈欠，有时候不打。' },
        {
          speaker: '国王',
          text: '权威首先要建立在理智上。我命令你打哈欠，是因为我确定你能打。',
        },
      ],
      () => {
        this._markGoal(1);
        this.yawned = false;
        // 国王说完后，把提示改成「打哈欠」，形成第二次交互
        this.addInteract({ id: 'yawn', dir: this.throneDir, radius: 1.5, label: '打一个哈欠', priority: -1 });
      }
    );
  }

  /** 玩家在交互按钮的第二次点击里完成「打哈欠」 */
  _judge() {
    this._markGoal(2);
    this.judged = true;
    this._say([
      { speaker: '国王', text: '我任命你做我的大法官。' },
      { text: '可是这里只有您一个人呀。' },
      { speaker: '国王', text: '那你就审判自己吧。审判自己，比审判别人难得多。' },
      { speaker: '国王', text: '你要是能正确地审判自己，你就是真正有智慧的人。' },
      { text: '我可以在任何地方审判自己。' },
      { speaker: '国王', text: '嗯……我想你该走了。我任命你做我的大使。' },
    ]);
  }

  _farewell() {
    this._markGoal(3);
    this._say(
      [
        { speaker: '国王', text: '我任命你做我的大使。' },
        { text: '大人们真是奇怪。' },
        { text: '小王子离开了 325 号小行星。' },
      ],
      () => this.game.completeChapter('king')
    );
  }
}
