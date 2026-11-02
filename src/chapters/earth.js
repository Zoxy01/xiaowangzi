/**
 * 第八章：地球。
 * 一条 216 米长的沙路，从落地点一直走到坠机处：蛇、小花、雪山（回声）、
 * 玫瑰园、狐狸、车站与火车、麦田与稻草人、卖药片的商摊、水井、飞机。
 * 建模与摆放全部在 ../earth-scene.js，这里只负责把事件区串成一段旅途。
 */
import * as THREE from 'three';
import { Chapter } from './chapter.js';
import { makePlanet, placeOnSphere } from '../world.js';
import { audio } from '../audio.js';
import { makeNPC, placeNPC, faceNPC, besideDir } from '../npc.js';
import { makeGrassField, makeFlowerField } from '../art.js';
import {
  R, routeDir, placeByRoute, EARTH,
  makeGroundPatches, makePath, makeCairns, makeRopeFence, makeRockField,
  makeDunes, makeDryBrush, makePalmTree,
  makeSnake, makeThreePetalFlower, makeMountain, makeRoseGarden, makeFox,
  makeStation, makeTrain, makeRailway, makeWheatField, makeScarecrow,
  makeMerchantStall, makeWell, makePlane, makeSignpost,
} from '../earth-scene.js';

// 回家路标离飞机多远（太远会让结尾变成一段枯燥的长走）
const HOME_BACK = 12;

export class EarthChapter extends Chapter {
  constructor(game) {
    super(game, { radius: R, spinSpeed: 0, fog: 0xc4a876, fogDensity: 0.0022, palette: 'earth' });
    this.biome = { grass: 0, flowers: 0, motes: 260, motesColor: 0xfff0cd, shafts: 5, seed: 87 };
    this.root.rotation.z = 0;
    this._buildScene();
    this._buildState();
    this._applySun();
    this.root.add(this.sun.target);
    this.walker.lookToward(new THREE.Vector3(1, 0, 0));
  }

  _buildScene() {
    // 平坦的沙色星球（地球章是平地，不是小球）
    this.planet = makePlanet({ radius: R, color: 0xd4b87a, detail: 20, bump: 0 });
    this.root.add(this.planet);

    // 地表色带、石板路、石堆路标、木栅段、岩石、沙丘、枯木
    this.root.add(makeGroundPatches());
    this.path = makePath();
    this.path.name = 'path';
    this.root.add(this.path);
    this.root.add(makeCairns());
    this.root.add(makeRopeFence());
    this.root.add(makeRockField());
    this.root.add(makeDunes());
    this.root.add(makeDryBrush());

    // ── 13 m：蛇
    this.snake = makeSnake();
    this.snakeDir = placeByRoute(this.snake, EARTH.snake.d, EARTH.snake.s, R);
    this.root.add(this.snake);

    // ── 29 m：三瓣小花
    this.flower = makeThreePetalFlower();
    // 根茎最低点在原点下方 6 cm，落地点抬高一点免得陷进沙里
    this.flowerDir = placeByRoute(this.flower, EARTH.flower.d, EARTH.flower.s, R + 0.06);
    this.root.add(this.flower);

    // ── 48 m：雪山，交互点在山脚路边
    this.mountain = makeMountain(EARTH.mountain.h);
    const mountainBase = placeByRoute(this.mountain, EARTH.mountain.d, EARTH.mountain.s, R);
    this.mountain.position.addScaledVector(mountainBase, -0.55); // 山脚埋进沙里，避免边缘悬空
    this.echoDir = routeDir(EARTH.echo.d, EARTH.echo.s);
    this.root.add(this.mountain);

    // ── 74 m：玫瑰园（34 × 24 米，围合式）
    this.garden = makeRoseGarden(EARTH.garden.d, EARTH.garden.s, EARTH.garden.w, EARTH.garden.l);
    this.root.add(this.garden);
    this.gardenDir = routeDir(EARTH.gardenGate.d, EARTH.gardenGate.s);

    // ── 106 m：狐狸
    this.fox = makeFox();
    this.foxDir = placeByRoute(this.fox, EARTH.fox.d, EARTH.fox.s, R);
    this.foxTail = this.fox.userData.tail;
    this.root.add(this.fox);

    // ── 134 m：车站、站台、铁轨、火车
    this.station = makeStation();
    placeByRoute(this.station, EARTH.platform.d, EARTH.platform.s, R);
    this.stationDir = routeDir(EARTH.station.d, -1.5);
    this.root.add(this.station);

    this.railway = makeRailway(EARTH.train.d, EARTH.train.s, 54);
    this.root.add(this.railway);

    const train = makeTrain();
    this.train = new THREE.Group();
    const vehicles = [
      [train.loco, EARTH.train.d + 1.2],
      [train.tender, EARTH.train.d - 3.6],
      [train.cars[0], EARTH.train.d - 9.2],
      [train.cars[1], EARTH.train.d - 17.0],
    ];
    for (const [obj, d] of vehicles) {
      placeByRoute(obj, d, EARTH.train.s, R);
      obj.position.addScaledVector(obj.position.clone().normalize(), 0.16);
      this.train.add(obj);
    }
    this.root.add(this.train);
    this.trainDir = routeDir(EARTH.train.d + 1, 0.4);

    // ── 152 m：麦田与稻草人
    this.wheat = makeWheatField(EARTH.wheat.d, EARTH.wheat.s, EARTH.wheat.w, EARTH.wheat.l, 1500);
    this.root.add(this.wheat);
    this.scarecrow = makeScarecrow();
    placeByRoute(this.scarecrow, EARTH.scarecrow.d, EARTH.scarecrow.s, R);
    this.root.add(this.scarecrow);

    // ── 168 m：商贩摊
    this.cart = makeMerchantStall();
    this.merchantDir = placeByRoute(this.cart, EARTH.merchant.d, EARTH.merchant.s, R);
    this.root.add(this.cart);
    this.merchantNPC = makeNPC({ coat: 0x4d6581, trim: 0xd1b876, pants: 0x35363d, hat: 'beret', hatColor: 0x4a4650, scale: 1.03 });
    placeNPC(this.merchantNPC, besideDir(this.merchantDir, R, 1.15, 90), R + 0.02, routeDir(EARTH.merchant.d - 1.6, 0));
    this.root.add(this.merchantNPC);

    // ── 192 m：水井与三棵棕榈
    this.well = makeWell();
    this.wellDir = placeByRoute(this.well, EARTH.well.d, EARTH.well.s, R);
    this.root.add(this.well);
    const palms = [[EARTH.well.d - 2.8, -1.9, 4.6, 0.18], [EARTH.well.d + 3.2, -2.6, 3.9, 0.1], [EARTH.well.d + 1.4, 2.8, 4.3, -0.14]];
    for (const [d, side, h, lean] of palms) {
      const palm = makePalmTree(h, lean);
      placeOnSphere(palm, routeDir(d, side), 0, R);
      this.root.add(palm);
    }

    // ── 214 m：坠毁的双翼飞机与飞行员
    this.plane = makePlane();
    this.pilotDir = placeByRoute(this.plane, EARTH.plane.d, EARTH.plane.s, R);
    this.root.add(this.plane);
    this.pilotNPC = makeNPC({ coat: 0x456b78, trim: 0xc79a4b, pants: 0x35383a, hat: 'pilot', hatColor: 0x8b7953, scale: 1.02 });
    placeNPC(this.pilotNPC, routeDir(EARTH.pilot.d, EARTH.pilot.s), R + 0.02, routeDir(EARTH.plane.d - 2, 0));
    this.pilotNPC.rotation.z = -0.32;
    this.root.add(this.pilotNPC);

    // 三块木牌路标，给长路一点方向感
    for (const [d, a] of [[36, 0.25], [96, -0.3], [172, 0.15]]) {
      const sign = makeSignpost(0, a);
      placeByRoute(sign, d, 2.8, R);
      this.root.add(sign);
    }

    // 沙漠里只有两处绿：玫瑰园门口的草地、井边的绿洲
    this.oasis = [];
    const apron = makeGrassField({
      radius: R + 0.012, count: 460, seed: 91,
      region: { dir: this.gardenDir, spread: 0.11 },
      colors: [0x9fcf6e, 0x86c05a, 0xc6dd8c], bladeH: 0.34,
    });
    this.root.add(apron);
    this.oasis.push(apron);
    const apronFlowers = makeFlowerField({
      radius: R + 0.012, count: 60, seed: 92,
      region: { dir: this.gardenDir, spread: 0.1 },
      palette: [0xff9fb0, 0xffd2dd, 0xfff0d0, 0xf7c1e0], size: 1.1,
    });
    this.root.add(apronFlowers);
    this.oasis.push(apronFlowers);
    const wellGrass = makeGrassField({
      radius: R + 0.012, count: 220, seed: 93,
      region: { dir: this.wellDir, spread: 0.13 },
      colors: [0x93c46a, 0xb0cf78], bladeH: 0.32,
    });
    this.root.add(wellGrass);
    this.oasis.push(wellGrass);

    // 交互点：用「路边的锚点」而不是道具本身的坐标，
    // 这样沿着沙路走就会一个个遇见（道具可以退到更远处构图）。
    this.addInteract({ id: 'snake', dir: routeDir(13, 0.8), radius: 2.2, label: '和蛇说话', priority: 0 });
    this.addInteract({ id: 'flower', dir: routeDir(29, -0.9), radius: 2.0, label: '看看小花', priority: 1 });
    this.addInteract({ id: 'echo', dir: routeDir(47, -1.0), radius: 3.0, label: '在山脚喊一声', priority: 2 });
    this.addInteract({ id: 'garden', dir: routeDir(EARTH.gardenGate.d, -1.2), radius: 3.0, label: '走进玫瑰园', priority: 3 });
    this.addInteract({ id: 'fox', dir: routeDir(106, 1.0), radius: 2.2, label: '和狐狸说话', priority: 4 });
    this.addInteract({ id: 'station', dir: routeDir(EARTH.station.d, -1.6), radius: 3.2, label: '看看车站', priority: 5 });
    this.addInteract({ id: 'merchant', dir: routeDir(EARTH.merchant.d, 1.7), radius: 2.6, label: '和商贩说话', priority: 6 });
    this.addInteract({ id: 'well', dir: routeDir(EARTH.well.d, -1.5), radius: 2.6, label: '去井边', priority: 7 });
    this.addInteract({ id: 'pilot', dir: routeDir(EARTH.plane.d, 1.2), radius: 3.2, label: '去看飞行员', priority: 8 });

    this.walker.spawn(routeDir(0));
    this.walker.sync(true);
  }

  _buildState() {
    this.goals = [
      '在沙漠里走一走', '遇见蛇', '看看那朵小花', '在高山下喊一声',
      '看看玫瑰园', '和狐狸做朋友', '驯服狐狸', '看看火车站',
      '和商贩聊聊', '去井边', '找到飞行员', '回去找你的玫瑰',
    ];
    this.goalsDone = new Set();
    this.stage = 0;
  }

  opening() {
    return [
      { text: '他落在了地球上。一片沙漠，一个人也没有。' },
      { text: '地球上有一百一十一个国王、七千个地理学家、九十多万个商人……' },
      { text: '在沙漠里走一走' },
      { text: '（沿着沙路一直往前走，地球比想象中大得多。走到有东西的地方，右下会出现按钮）' },
    ];
  }

  /** 结局用的路标：落地点上的一束光，让玩家看得见该往哪里走。 */
  _makeHomeBeacon() {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xbfe4ff, transparent: true, opacity: 0.09,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.0, 7.5, 14, 1, true), beamMat);
    beam.position.y = 3.7;
    g.add(beam);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xd6efff, transparent: true, opacity: 0.32,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 32), glowMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const mote = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), glowMat);
      mote.position.set(Math.cos(a) * 1.05, 0.25 + i * 0.62, Math.sin(a) * 1.05);
      g.add(mote);
    }
    g.userData.ring = ring;
    g.userData.beam = beam;
    placeByRoute(g, EARTH.plane.d - HOME_BACK, 0, R);
    return g;
  }

  _extraTick(dt) {
    if (this.sun && this.walker) {
      this.sun.target.position.copy(this.walker.position);
      this.sun.position.copy(this.walker.position).addScaledVector(this.sunDir, 28);
      this.sun.target.updateMatrixWorld();
      this.sun.shadow.camera.far = 70;
    }
    this._animateEnv(dt);
  }

  _animateEnv(dt) {
    const t = this.clock.elapsedTime;
    if (this.flower) this.flower.rotation.y = Math.sin(t * 0.48) * 0.09;
    if (this.foxTail) this.foxTail.rotation.z = 0.72 + Math.sin(t * 1.5) * 0.12;
    if (this.fox) this.fox.userData.head.rotation.y = Math.sin(t * 0.7) * 0.12;
    faceNPC(this.merchantNPC, this.walker.position, 0.08, dt);
    faceNPC(this.pilotNPC, this.walker.position, 0.08, dt);
    if (this.garden) {
      const hero = this.garden.userData.hero || [];
      for (let i = 0; i < hero.length; i++) {
        hero[i].scale.setScalar(1 + Math.sin(t * 0.9 + i * 0.8) * 0.014);
      }
      const fountain = this.garden.userData.fountain;
      if (fountain && fountain.userData.water) {
        fountain.userData.water.material.opacity = 0.82 + Math.sin(t * 1.9) * 0.04;
      }
    }
    if (this.homeBeacon) {
      const { ring, beam } = this.homeBeacon.userData;
      ring.rotation.z = t * 0.55;
      ring.scale.setScalar(1 + Math.sin(t * 1.7) * 0.06);
      beam.material.opacity = 0.07 + (Math.sin(t * 1.6) * 0.5 + 0.5) * 0.05;
    }
  }

  onInteract(id) {
    if (id === 'snake' && !this.snakeDone) {
      this.snakeDone = true;
      this._markGoal(1);
      audio.chime(220);
      this._say([
        { text: '（一条金色的蛇，在沙子里抬起头）' },
        { speaker: '蛇', text: '地球上，在非洲。' },
        { speaker: '蛇', text: '你这么弱小，落在这花岗岩的地球上，我可怜你。' },
        { speaker: '蛇', text: '哪天你太想念你的星球，我可以帮你。' },
        { text: '我不需要你。我需要我的花。' },
      ]);
      return;
    }
    if (id === 'flower' && !this.flowerDone) {
      this.flowerDone = true;
      this._markGoal(2);
      audio.chime(246.94);
      this._say([
        { text: '（一朵三个花瓣的小花）' },
        { text: '你好！' },
        { speaker: '小花', text: '你好……' },
        { text: '人在哪儿？' },
        { speaker: '小花', text: '人？风吹着他们到处走。他们没有根，这让他们很难办。' },
      ]);
      return;
    }
    if (id === 'echo' && !this.echoDone) {
      this.echoDone = true;
      this._markGoal(3);
      audio.chime(293.66);
      this._say([
        { text: '（在高山脚下）' },
        { text: '你好！做我的朋友吧，我很孤独。' },
        { text: '你好……我很孤独……' },
        { text: '我很孤独……' },
        { text: '（只有回声）' },
      ]);
      return;
    }
    if (id === 'garden' && !this.gardenDone) {
      this.gardenDone = true;
      this._markGoal(4);
      this.avatar.headTilt = -0.6;
      this._say([
        { text: '（推开园门：石墙、喷泉、爬满花的拱门，五千朵一模一样的玫瑰）' },
        { text: '你们是谁？' },
        { speaker: '玫瑰们', text: '我们是玫瑰。' },
        { text: '我还以为我有一朵独一无二的花，原来只是一朵普通的玫瑰。' },
        { text: '（小王子趴在草地上，哭了）', onShow: () => { this.avatar.headTilt = 0; } },
      ]);
      return;
    }
    if (id === 'fox' && !this.tamed) {
      if (!this.foxStarted) {
        this.foxStarted = true;
        this._markGoal(5);
        this._say([
          { text: '来和我玩吧。我很难过……' },
          { speaker: '狐狸', text: '我不能和你玩。我没有被驯养。' },
          { text: '「驯养」是什么意思？' },
          { speaker: '狐狸', text: '就是「建立联系」。' },
          { speaker: '狐狸', text: '对我来说，你还只是一个小男孩，和十万个小男孩一模一样。' },
          { speaker: '狐狸', text: '可如果你驯养了我，你对我就是世上唯一的。' },
          { text: '我开始明白了。有一朵花……我想她驯养了我……' },
          { speaker: '狐狸', text: '再去看看那些玫瑰吧。你会明白，你的那朵是世上唯一的。' },
        ], () => this.addInteract({ id: 'tame', dir: routeDir(106, 1.0), radius: 2.2, label: '驯服狐狸', priority: -1 }));
      }
      return;
    }
    if (id === 'tame') {
      this.tamed = true;
      this.interactables = this.interactables.filter((item) => item.id !== 'tame');
      this._markGoal(6);
      audio.chime(523.25);
      this._say([
        { text: '（小王子每天在同一时间来。狐狸慢慢地靠近他）' },
        { text: '你们很美，可你们是空的。她一个，就比你们全部都重要，因为她是我浇过水的。因为她是我的玫瑰。' },
        { speaker: '狐狸', text: '这是我的秘密，很简单：只有用心才能看清。真正重要的东西，眼睛是看不见的。' },
        { speaker: '狐狸', text: '是你为你的玫瑰花费的时间，才使你的玫瑰变得这么重要。' },
        { speaker: '狐狸', text: '你要永远为你驯养的东西负责。你要对你的玫瑰负责……' },
        { text: '我要对我的玫瑰负责……' },
      ]);
      return;
    }
    if (id === 'station' && !this.stationDone) {
      this.stationDone = true;
      this._markGoal(7);
      audio.chime(349.23);
      this._say([
        { text: '（一个小车站，一列火车）' },
        { text: '（火车驶过）' },
        { text: '他们这么急，在找什么呢？' },
        { text: '（没有人回答）' },
      ]);
      return;
    }
    if (id === 'merchant' && !this.merchantDone) {
      this.merchantDone = true;
      this._markGoal(8);
      audio.chime(392);
      this._say([
        { text: '（一个卖药片的商人）' },
        { speaker: '商贩', text: '这药片能解渴，一星期吃一粒就行。' },
        { text: '你为什么卖这个？' },
        { speaker: '商贩', text: '可以节省时间。专家算过，一星期可以省五十三分钟。' },
        { text: '如果我有五十三分钟，我会悠闲地走向一口井……' },
      ]);
      return;
    }
    if (id === 'well' && !this.wellDone) {
      this.wellDone = true;
      this._markGoal(9);
      audio.chime(440);
      this._say([
        { text: '（一口井）' },
        { text: '让沙漠变美的，是它在什么地方藏着一口井……' },
        { text: '真正重要的东西，眼睛是看不见的。' },
      ]);
      return;
    }
    if (id === 'pilot' && !this.pilotDone) {
      this.pilotDone = true;
      this._markGoal(10);
      audio.chime(493.88);
      this._say([
        { text: '（一架坠毁的飞机，飞行员在修理）' },
        { text: '啊！你的回忆真美。可你还没修好飞机。' },
        { speaker: '飞行员', text: '今天夜里，就满一年了。你的星星，会正好在你去年落下的地方上空……' },
        { text: '我该回去了。我的花在等我。' },
        { speaker: '蛇', text: '我会帮你的。' },
        { speaker: '蛇', text: '你落下来的地方，沙上还留着你的脚印。今夜我在那儿等你。' },
        { text: '（往回走。石路的尽头，有一点光。）' },
      ], () => {
        // 旅途到此为止：清掉沿路的旧提示（蛇、花、车站……），只留下回家的路标，
        // 否则玩家走回来时会先看到「和蛇说话」，点了却没反应。
        this.interactables = [];
        this.homeBeacon = this._makeHomeBeacon();
        this.root.add(this.homeBeacon);
        this.addInteract({ id: 'home', dir: routeDir(EARTH.plane.d - HOME_BACK, 0.8), radius: 3.0, label: '回到落下来的地方', priority: -1 });
      });
      return;
    }
    if (id === 'home') {
      this.interactables = this.interactables.filter((item) => item.id !== 'home');
      this._markGoal(11);
      audio.chime(659.25);
      this._say([
        { text: '（他回到了自己落下来的那片沙地。四下里只有风，和头顶那颗星。）' },
        { text: '他抬起头。B-612 就在那里，小得像一粒光。' },
        { speaker: '小王子', text: '狐狸说得对。时间是我给她的——浇水、挡风、听她抱怨，还假装没听见她的骄傲。' },
        { speaker: '小王子', text: '我一直以为她需要的是一个玻璃罩。其实她需要的是我肯留下来，站在她旁边，什么也不做也可以。' },
        { text: '他蹲下去，把手贴在沙上，像是隔着很远的距离，摸到了那四根刺。' },
        { speaker: '小王子', text: '我要回去。不是因为怕她枯萎，是因为我想看着她长大。' },
        { speaker: '小王子', text: '我会把椅子搬到她旁边。日落的时候，我们一起看。' },
        { text: '沙地上没有新的脚印，只有风。可他知道回去的路了。' },
        { text: '（夜里抬头看星星——如果你也抬头，会看见其中一颗在笑。）' },
      ], () => this.game.completeChapter('earth'));
      return;
    }
  }
}
