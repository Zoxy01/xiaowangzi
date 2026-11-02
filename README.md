# 小王子 · 星辰之旅（iOS 网页版）

一个可以在 iPhone Safari 里直接打开、走进 B-612 小行星并拜访另外七颗星球的
3D 叙事小游戏。用 **Three.js + 原生 DOM** 重写，不依赖 Unity、不依赖 WebGPU。

八章全部可玩：B-612、国王、爱虚荣的人、酒鬼、商人、点灯人、地理学家、地球。

---

## 快速开始

```bash
cd web
npm install --ignore-scripts     # 见「已知环境坑」
node tools/build-plain.mjs       # 产出 dist/
node tools/serve.mjs 4173        # 本地服务器
```

打开 <http://127.0.0.1:4173/>。

**在 iPhone 上试玩**：电脑与手机连同一个 Wi-Fi，用手机访问
`http://<电脑局域网 IP>:4173/`。加到主屏幕后是全屏（无 Safari 地址栏）。

> 必须是 `http://` 或 `https://`，不能用 `file://` 直接打开 —— ES Module 与
> `fetch` 在 `file://` 下会被浏览器拦截。

---

## 部署到服务器

`dist/` 已经是可直接托管的静态产物（已随仓库提交），服务器上不需要 Node：

```bash
git clone https://github.com/Zoxy01/xiaowangzi.git
# nginx：root 指向 xiaowangzi/dist，index 指向 index.html
```

```nginx
server {
  listen 443 ssl http2;
  server_name your.domain;
  root /var/www/xiaowangzi/dist;

  # 入口与脚本不缓存，资源可长缓存（文件名没有 hash，改版后建议清一次 CDN）
  location = /index.html { add_header Cache-Control "no-store"; }
  location ~* \.(?:js|css)$ { add_header Cache-Control "no-cache"; }
  location /assets/ { add_header Cache-Control "public, max-age=604800"; }

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
}
```

- **必须走 HTTPS**：`manifest.webmanifest`、加到主屏幕的全屏模式、Web Audio 都要求安全上下文
  （`localhost` 例外）。没有证书时 iOS 上会退化成普通网页。
- 想改代码后重新构建：服务器装 Node 18+，`cd web && npm install --ignore-scripts && node tools/build-plain.mjs`。
- 首屏 gzip ≈ 1.76 MB（`three.js` 占 382 KB），首次加载在 4G 上大约 1–2 秒；之后走缓存。
- 站点全部用相对路径，放在子目录（如 `https://host/prince/`）也能正常工作。

### 挂在子路径（实测：http://111.229.202.106/xwz/）

站点全部用相对路径，所以可以只挂一个 `/xwz/`，根路径留给别的项目。把这段放进
**已有站点**的 `server {}` 里（`include /etc/nginx/snippets/xwz.conf;`），
不要新建 `server` 块，否则同一台机器上的其他站点会被抢走默认站点：

```nginx
location = /xwz { return 301 /xwz/; }

location /xwz/ {
    alias /var/www/xwz/repo/dist/;
    index index.html;
    location = /xwz/index.html { add_header Cache-Control "no-store"; }
    location ~* ^/xwz/.*\.(?:js|css)$ { add_header Cache-Control "no-cache"; }
    location ~* ^/xwz/assets/ { add_header Cache-Control "public, max-age=604800"; }
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}

location = /xwz/manifest.webmanifest {
    alias /var/www/xwz/repo/dist/manifest.webmanifest;
    default_type application/manifest+json;
    add_header Cache-Control "no-cache";
}
```

更新线上内容：`cd /var/www/xwz/repo && git pull`（`dist/` 已入库，不需要在服务器上构建）。
改完跑一次 `node tools/deploy-check.mjs`，它会用 iPhone 视口打开线上地址，
走「开始 → 地图 → 第一章」，并报告 4xx/5xx 请求与控制台异常。

---

## 目录结构

```
web/
├─ index.html            所有 DOM UI（首屏/地图/章节卡/HUD/设置）
├─ public/
│  ├─ assets/fonts/      3 个 woff2（Cormorant Garamond，来自原始包）
│  ├─ assets/img/planets/ 8 张星球缩略图（原美术资源）
│  ├─ assets/img/ui/     旅程地图底图、徽章、PWA 图标
│  └─ manifest.webmanifest
├─ src/
│  ├─ main.js            入口：平台检测、字体预加载、启动
│  ├─ game.js            主控：渲染器、渲染循环、章节切换、HUD
│  ├─ world.js           程序化几何：星球、火山、玫瑰、玻璃罩、星空、天空
│  ├─ avatar.js          程序化小王子模型（绿外套金扣、金腰带、卷发、围巾，12454 面）
│  ├─ npc.js             程序化 NPC：六个专属模型（国王/爱虚荣者/酒鬼/商人/点灯人/地理学家）+ 通用 makeNPC（地球商贩、飞行员）
│  ├─ planet-walker.js   球面行走 + 第三人称相机（核心）
│  ├─ dialogue.js        DOM 逐字打字机对话
│  ├─ input.js           虚拟摇杆 + 视角拖动（pointer 事件）
│  ├─ audio.js           Web Audio 程序化音效（零音频文件）
│  ├─ map.js             旅程地图 v2：星空 canvas + 星座航线 + 星球徽章 + 章节底卡 + 徽章册
│  ├─ i18n.js            8 语言
│  ├─ planets-data.js    8 颗星球的元数据（名字/坐标/配色）
│  ├─ ui.js              显隐工具（见「踩过的坑」）+ 顶部轻提示 toast()
│  ├─ art.js             「光遇」式柔光层：每章一套天空调色 + 太阳光晕 / 体积光柱 / 光尘 / 草叶 / 野花
│  ├─ fx.js              3D 反馈特效：目标完成星光爆 / 发现地点冲击环（共享一张柔光贴图）
│  ├─ quests.js          每章每个目标的「去哪儿」提示 + 5 枚徽章的解锁条件
│  ├─ chapters/
│  │  ├─ chapter.js      章节基类：光照/天空/角色/交互/目标/对话/资源释放
│  │  ├─ index.js        章节注册表
│  │  ├─ b612.js         B-612：玫瑰、火山、玻璃罩、日落（7 个目标）
│  │  ├─ b612-scene.js   只给 B-612 用：起伏地形 / 土路 / 火山 / 木棚 / 泉眼 / 野花
│  │  ├─ king.js         325 号：国王
│  │  ├─ vanity.js       326 号：爱虚荣的人
│  │  ├─ bar.js          327 号：酒鬼
│  │  ├─ merchant.js     328 号：商人
│  │  ├─ lamp.js         329 号：点灯人（最小的星球，自动昼夜）
│  │  ├─ geo.js          330 号：地理学家
│  │  ├─ earth.js        地球：216 m 沙路上的旅途编排与剧情（11 个目标）
│  │  └─ earth-scene.js  只给地球用：玫瑰园 / 车站 / 蒸汽火车 / 麦田 / 商摊 / 井 / 双翼机 / 蛇 / 高山
│  └─ generated/strings.json  352 条 × 8 语言文案
└─ tools/                构建、测试、验收脚本
```

**8 颗星球全部可玩**，每章 2–7 个目标，从地图点进去就能一路玩到结尾并自动返回地图。
通关进度存在 `localStorage` 的 `lp.progress`，重开浏览器仍然保留。

> **结局**：地球的最后一个任务是「回去找你的玫瑰」——不是重播第一张星球的浇水流程，
> 而是走回落地的沙地（那里会亮起一束光当作路标），触发一段新的独白：他明白自己一直
> 想给玫瑰一个玻璃罩，其实她需要的是他肯留下来；他要回去，不是为了怕她枯萎，而是想
> 看着她长大。原著没有写这一段，是按「好好照顾他的玫瑰」这个结局补写的。

---

## 旅程地图与任务体验

地图不是一张静态示意图，而是整个旅程的进度面板：

- **星空与航线**：星空是一次性画到 `#map-stars` canvas 上的 700 多颗星（用固定种子，窗口尺寸变化不会「换一片天」），靠 CSS 呼吸动画制造闪烁；八颗星球由 `curveThrough()` 生成的 Catmull-Rom→贝塞尔曲线串成星座航线，`#route-lit` 只画到最后一个已拜访星球，走过的路会亮起来。
- **星球状态**：`is-visited`（金色描边 + 编号变金）、`is-next`（呼吸光晕 + 「下一站」标签）、`is-locked`（灰度，未注册的章节）、`is-sel`（放大 + 强光）。两段式点击保留不变：第一次选中升卡，第二次（或点卡片按钮）降落。
- **底部卡片**：章号 / 已拜访 / 探索百分比 / 一句话介绍 / 降落按钮，`#map-card` 用 `translateY + opacity` 升起（走 GPU 合成，不加 blur 层动画）。
- **徽章册**：五枚徽章（玫瑰 / 狐狸 / 玫瑰园 / 蛇 / 飞行员）按已拜访章节解锁，`quests.js` 的 `BADGES[].needs` 是唯一规则来源。
- **任务栏**：`#goals-sub` 显示「任务 x/y · 探索 z%」，`#hud-goal` 常驻当前目标，目标清单底部多一行 `li.goal-hint`，告诉玩家这一步该往哪走（文案在 `quests.js` 的 `HINTS`，八章全覆盖）。
- **探索度**：走到某个交互点范围内即记一次 `progress.explored[chapterId]`，`Game.markExplored()` 去重并落盘；第一次发现会扩散一圈光环、弹 `发现 · xxx` 提示。

## 技术要点

### 球面行走

角色位置恒为 `normalize(pos) * (R + standHeight)`，`up` 等于表面法线；
移动方向由「相机前向 / 右向」在切平面上投影得到。相机绕角色做球坐标位移，
并对「星球」做射线求交，保证镜头永远在球外。

`R = 6.0`，角色身高约 1.0，星球周长约 38 单位。

### 渲染

- 三通道场景：**天空背景层 → 主场景**（`autoClear = false` 手动清屏）
- 天空是一个**全屏三角形 + 正交相机**，不是包住世界的大球（原因见下）
- 动态分辨率：连续掉帧时降 DPR（上限 2），省 iPhone 的填充率与发热
- `visibilitychange` 时暂停渲染

### B-612 的地形

其余七章是「光滑球 + 道具」，只有 B-612 单独做了地形（`src/b612-scene.js`）：

- `b612HeightAt(dir)` 返回该方向上地面相对 `R` 的起伏（正向鼓包、负向下陷），
  `PlanetWalker` 通过构造参数 `heightAt` 用它贴地行走，不会穿山也不会悬空
- 星球用 `SphereGeometry(R, 160, 120)` 顶点位移 + 顶点色（草甸 / 苔痕 / 露岩 / 土路 / 浮岛岩壁），
  必须用**带索引**的球体再 `computeVertexNormals()`，换成立方球会全是棱面
- 土路由方向插值采样铺出来，据点（玫瑰、木棚、泉眼、椅子）用小半径「压平区」保证道具不歪
- 地平线以下不做云海：小屏上噪声云会糊成一片，最后改回干净的天空渐变（试过的方案记在踩坑表）

### 地球：216 米的沙路

地球不是一颗小球（`R = 100`，几乎是平地），旅途沿赤道铺成 216 米长的沙路，
所有建模与摆放集中在 `src/earth-scene.js`，`src/chapters/earth.js` 只负责编排与剧情。

- 路线坐标用 `routeDir(distance, side)`：`distance` 是沿路走了多少米（= `R × 弧度`），
  `side` 是离路中心线的横向米数（沿世界 Y）。道具与交互点都用这两个数描述，改路线长度只要改数字。
- 大型建筑（34 m 宽的玫瑰园、12 m 站台、34×26 m 麦田）不能整体贴到球面上——
  R=100 时一块 34 m 的平板两端会离地 1.4 m。所以 `earth-scene.js` 的 `frameAt(centerD, centerS)`
  先求该点的切平面坐标系，再用 `F.place()` / `FS()` / `inst()` 把**每一个零件**按它自己的
  距离与高度落到球面上；麦田 1400 株麦子也是逐株算矩阵（一个 `InstancedMesh`，一次绘制）。
- 地面色带用 `capMesh()`：`SphereGeometry(R+lift, 30, 9, ...)` 只取一段球冠，天然贴合曲面。
- 小径是一整条**连续带状网格**（`makePath()`，0.6 m 采样 × 1.6 m 宽），顶点全部落在 `R+0.02`，
  所以踩上去是平的；早先用凸起石板拼路，走起来像踩台阶，已按反馈去掉。
  带状网格的绕序要整体检查一遍（三角形法线与径向点乘），否则会被背面剔除，路就“看不见”了。
- 交互点用的是「路边的锚点」而不是道具坐标（`routeDir(13, 0.8)` 之类），
  这样沿着沙路一直走就能依次遇见蛇 → 花 → 高山 → 玫瑰园 → 狐狸 → 车站 → 商贩 → 井 → 飞行员，
  而道具本身可以退到 2～14 米外去做构图。
- 玫瑰园是这一章的门面：双层砌块围墙 + 半圆拱门 + 120 株拱上爬藤 + 24 个花圃（约 950 朵玫瑰）
  + 中央喷泉 + 凉架 + 6 盏园灯；`userData.hero/fountain/bloomCount` 供动画与统计使用。
  参考图里玻璃罩中的那朵玫瑰是「小王子的玫瑰」，按用户要求**没有**出现在地球章。

### 柔光美术（光遇风格）

美术方向参考《Sky: 光遇》的视觉语言：天空是三层柔和渐变加地平线暖雾，太阳是一团没有硬边的光晕，
地面铺满会在光里发亮的草叶与零星野花，空气里永远有缓慢上升的暖色光尘。**玩法仍然完全是原著的叙事**，
不做收集、背包、数值这类系统。

- `art.js` 里的 `PALETTES` 给八章各配一套 `{night, dusk, day, glow, haze, fog}`；`chapter.js` 的 `_applySun()`
  在「夜 → 黄昏 → 白天」之间做三段插值，同时驱动天空三段色、雾色、太阳/半球光/补光、星空透明度与地平线雾光。
- 每章的柔光层在 `onEnter()` 时由 `_dressBiome()` 铺一次，参数写在章节构造里的 `this.biome`：
  `grass` / `flowers` 是实例数（`0` 表示不长），`motes` 是光尘数，`shafts` 是体积光柱片数，
  `grassColors` / `flowerColors` 给色彩，`seed` 固定布局。
  草与花都是 `InstancedMesh`（几十个实例一次绘制调用），离地高度读 `walker.heightAt`，所以在 B-612 的起伏地面上也是贴着坡长的。
- 沙漠/岩地不铺草：酒鬼、地理学家 `grass: 0`；地球 `grass: 0`，只在玫瑰园与井边用 `region: { dir, spread }`
  限定球冠范围种两片绿洲（`earth.js` 的 `this.oasis`）。
- B-612 不继承 `Chapter`，所以它自己调用 `dressPlanet(this, {...})`，并在 `update()` 里跑 `_artTick`、
  在 `_applySun()` 末尾调 `aimArt(this)` 重新对准太阳（日落在第一章是真的会移动的）。
- 每个 NPC 章节都补了 1 个「原著小事」互动（不进目标列表，只是可探索的风味）：
  国王笼子里被审判的老鼠、爱虚荣者擦得发亮的镜子、酒鬼的四十七个空瓶、商人锁进抽屉的纸、
  点灯人想让人替他点的那盏灯、地理学家只肯记录不会变的山。
- 第二章的国王是**坐着**的：`makeKingNPC({ seated: true })` 会生成一套「胯部正好落在王座座面
  （`userData.seatY = 0.27`）、大腿朝前、小腿垂在座前、袍子朝前摊开」的坐姿，并且把国王和笼子
  都挂成 `throne` 的子节点，朝向天然对齐；`_orientThrone()` 再把王座绕自身法线转到正对玩家降落的方位。
  坐着的 NPC 用 `faceHeadOnly()` 只转头看你（身体不动），`node tools/king-seat-check.mjs` 会校验
  「胯压座面 / 脚落地 / 头露在椅背上方 / 没穿地 / 笼子落在座旁」。

### 小王子自己

主角按设计稿重做了一次，全部是 `avatar.js` 里用球、圆柱、车削体拼出来的程序化模型（`LatheGeometry`
做外套轮廓，`SphereGeometry` 做卷发），没有导入任何原作网格：

- 配色：薄荷绿立领外套 `0x6f9558` + 三颗金扣、金黄腰带 `0xe9b84c`、同色绿长裤、棕色系带短靴、
  金色卷发 `0xe8c473`、肤色 `0xf6d8b8`。
- 头发是 34 颗压扁的小球沿球面布点：刘海一圈、头顶一圈、太阳穴到后脑的中圈（`|az| < 0.92` 跳过，
  保证不糊住脸）、后颈一圈，再加一撮呆毛。
- 围巾 `0xf3b945` 绕两圈 + 一个结 + 四条飘带（`scarfStrips`，段数 5/5/3/3），走路时会摆动。
- 尺寸与预算：总高 **0.925**、脚底正好在 `y=0`、112 个 mesh / **12454 个三角面 / 269 KB 顶点数据**。
  主角是唯一的近景高模，远景 NPC 仍走 `makeNPC` 低模；相机构图按 `addScaledVector(w.up, 0.95)` 取头位，
  所以身高变了要重跑相机关卡。
- 对外接口没变：`root` / `head` / `headTilt` / `arms[i].pivot` / `legs` / `scarfStrips` / `scarfTail` /
  `update(dt, moveMag, moving)` / `lookAtPoint()`；B-612 的水壶还挂在 `arms[1].pivot` 的 `(0, -0.26, 0.02)`。
- `node tools/avatar-measure.mjs` 是不开浏览器的量尺寸脚本（总高/脚底/头身比/面数，并断言脚底≈0、总高≈0.9）；
  `node tools/avatar-shot.mjs` 拍正面/侧面/背面三视图，`node tools/avatar-check.mjs` 检查面数、手的位置、
  头部俯仰方向与动画是否产生 NaN。**tools 下的脚本 import 要写 `'../src/avatar.js'`**。

### 章节与资源释放

所有章节继承 `chapters/chapter.js` 的 `Chapter`，公共部分（光照、天空、星空、
角色、相机、交互探测、光圈、目标推进、对话锁、补光跟随、自转）只写一次，
`_buildScene()` 里只搭各自的道具。

`dispose()` 是这套架构里最容易出事的一环 —— 章节切换必须把 GPU 与 JS 两侧
都放干净，否则玩几章就会被 iOS 杀掉。它做四件事：

1. 遍历主场景与天空场景，`geometry.dispose()`、`material.dispose()`
2. 材质上所有 `isTexture` 属性与 `uniforms` 里的贴图，去重后释放
3. **光照的 `shadow.map` 单独释放**（它是 `WebGLRenderTarget`，不在材质里）
4. 释放前把每个 attribute 的 `array` 换成空数组 —— `dispose()` 只放 GPU 侧，
   `Float32Array` 仍被 `BufferAttribute` 持有

`game.js` 的 `_teardownChapter()` 再把 `renderer.renderLists.dispose()` 与
`renderer.info.reset()` 一起做掉，最后把章节对 `game` 的引用置空。

### iOS 适配

- `viewport-fit=cover` + `env(safe-area-inset-*)` 避开刘海与 Home 条
- `touch-action: none`、禁用回弹滚动、禁用长按选择与放大
- 所有可点区域 ≥ 44×44（自动化验证：`targetsUnder44: []`）
- 无音频文件，全部用 OscillatorNode 合成，首屏体积可控
- 首屏预算：**gzip 后 1.69 MB**（上限 8 MB）

---

## 验证

```bash
node tools/map-check.mjs     # 地图 v2：星空/航线/底卡/徽章册/任务栏副标题 + 发现特效
node tools/verify.mjs        # 18 条单元/集成测试
node tools/all-chapters.mjs  # 8 章逐章通关（真实交互驱动）
node tools/aim-check.mjs     # 每章降落后，目标是否真的在画面里
node tools/ios-full.mjs      # iPhone 视口：8 章、内存、可访问性
node tools/ios-check.mjs     # iPhone 视口 + 触摸 + 横竖屏
node tools/mem-check.mjs     # 内存：反复进出章节不泄漏
node tools/render-check.mjs  # 首屏渲染判空
node tools/npc-check.mjs     # 每章 NPC 是否存在、站在地面上、投影在画面内
node tools/king-seat-check.mjs # 第二章：国王是否坐在王座座面上（胯/脚/头顶/笼子）
node tools/king-shot.mjs     # 第二章：王座正面与近景截图 + 王座局部坐标里的身高核对
node tools/deploy-check.mjs  # 线上地址冒烟：iPhone 视口打开、启动条、地图、第一章，收集 4xx 与控制台异常
node tools/avatar-measure.mjs # 主角模型尺寸（纯 Node）：总高/脚底/头身比/面数，并断言脚底≈0、总高≈0.9
node tools/avatar-check.mjs   # 主角模型：面数、手的位置、头部俯仰方向、动画不产生 NaN
node tools/art-check.mjs     # 每章柔光层：光晕/光柱/光尘/草/花是否生效 + 三段天空色
node tools/b612-shot.mjs     # B-612 七个机位截图 + 场景统计（面数 / 绘制调用 / 道具离地）
node tools/b612-layers.mjs   # 逐层隐藏大气壳 / 天空，定位画面异常来源
node tools/chair-check.mjs   # B-612 的椅子是否竖直、椅面是否朝着日落
node tools/touch-real.mjs    # 真实触摸事件驱动：摇杆、视角、按钮命中
node tools/earth-route-check.mjs # 地球：沿小径走，互动点是否按顺序触发
node tools/earth-walk.mjs    # 地球：一直往前走到 216 m，九个事件区与结尾回家路标是否都能遇到
node tools/earth-scene-check.mjs # 地球：场景统计 + 各建筑贴地范围 + 关键地点截图
node tools/earth-path-check.mjs  # 地球：同机位拍「有路/无路」两张，确认小径真的画出来了
node tools/earth-diag.mjs    # 地球：逐个零件列世界半径与尺寸，找悬空/陷地的件
node tools/mem-objects.mjs   # 存活对象计数（章节实例是否被回收）
node tools/mem-retainers.mjs # 堆快照 + 引用链，查旧章节被谁留住
node tools/stage-shots.mjs   # 全流程分阶段截图与状态
node tools/stick-e2e.mjs     # 虚拟摇杆 + 视角拖动端到端
node tools/follow-space.mjs  # 相机跟在 root 局部坐标系里的纯数学单测（无需浏览器）
node tools/follow-check.mjs  # 真实驱动角色前进/转视角/侧移，看角色是否留在画面里
node tools/aim-drift.mjs     # 星球自转 12 秒，角色世界坐标 NDC 是否会漂移
node tools/gallery.mjs       # 生成交付截图到 test-shots/gallery/
```

当前状态：**18/18 单元测试通过；8/8 章通关；8/8 章降落后目标在画面内；8/8 章真实触摸驱动通过；每章 NPC 均存在且入画；iPhone 14 Pro 视口下 117–144 FPS；运行时零错误。**

| 指标 | 实测 | 预算 |
|---|---|---|
| 首屏体积（gzip） | **1.72 MB** | ≤ 8 MB |
| 单章堆内存（GC 后） | **45.7 – 52.0 MB** | ≤ 60 MB |
| 章节往返 8 次堆增长（b612 / king） | **2.24 / 1.64 MB** | 不应线性增长 |
| 章节往返 16 次堆增长（earth） | **≈ 11.6 MB（每轮 0.77 MB）⚠ 未达标** | 应稳定 |
| 残留几何体 / 贴图 | **0 / 0**（earth 稳定；b612 仍残留 4 张贴图 ⚠） | 0 |
| 小于 44 px 的触摸目标 | **0 个** | 0 |
| 横屏 canvas | 852×393 → 1704×786 | 跟随视口 |
| 降落后可见的交互目标 | **8/8 章** | 8/8 |
| 章节 NPC | **7 章 + 地球 2 人，全部入画**；六颗星球各一个专属模型 | 每章可见、可区分 |

> 内存一栏是**如实记录**：`Dialogue` 监听器泄漏（每次进出章节都往共享的 `#dialogue`
> 上挂一个 `pointerdown`）已经修好，earth 的章节实例大部分能被回收，但 `mem-check earth 16`
> 仍有约 0.77 MB/轮的残余增长，b612 还会漏 4 张贴图，原因尚未定位。上线前建议再查一轮。

测试覆盖了：球面吸附、位移连续性、朝向一致性、跳跃落地、星球背面、
相机不穿模、相机俯仰时角色不出画、**相机在 root 倾斜+自转下仍紧跟角色**、
对话逐字时序、8 语言文案完整性、
章节注册表与道具构造器、构建产物路径不越界、资源预算、8 章通关、
降落后目标可见、章节切换不泄漏。

---

## 踩过的坑（都已成为回归测试）

| 现象 | 根因 | 修复 |
|---|---|---|
| 整站只有背景色 | 构建脚本把 CSS 改成 `../app.css`，但 dist 是平铺目录 | 统一改写为 `./app.css`，并加测试校验无 `../` 越界 |
| 地图打开后一片空 | 样式里 `.rotate-hint { display: grid }` 优先于 `hidden` 属性，整屏盖住 | 删除该占位元素，加 `[hidden]{display:none!important}` 保险，并统一用 `setVisible()` 同时维护 class 与属性 |
| 首屏不消失 | 只设了内联 `opacity: 0`，但过渡与 `hidden` 都没生效 | 改为 CSS 类 `is-leaving` 驱动 |
| 启动卡在 42% | `document.fonts.load()` 在无头/弱网下不 resolve | 字体与图片预加载都加超时兜底（1.2s / 2s） |
| 3D 画面大片纯黑 | 天空穹顶用 `BackSide` 大球，相机贴着地面看时中心区被前向剔除 | 换成**全屏三角形**，与相机位置无关 |
| 天空是一整块纯色 | 着色器用「球心方向」算高度，球面行走时视线恒垂直于球心方向 | 改用每帧写入的 `worldUp`（脚下法线）算仰角 |
| 天空渐变仍不出现 | 从屏幕 uv 反投影时用了 z=0（近平面），得到错误方向 | 改用 z=1 远平面并除以 w |
| 俯视时角色掉出画面 | 相机最小距离固定 1.35，容纳不下脚部 | 按 FOV 反算最小距离 3.1，并调整 `lookAt` 目标 |
| 黄昏时角色与背景糊在一起 | 角色与地表受同一光源 | 加跟随相机的补光源 + 材质轻微自发光 |
| 摇杆偶尔「卡死」自己走 | `setPointerCapture` 抛 `NotFoundError` 中断了 pointerdown | try/catch 包裹，并加全局 `pointerup`/`blur`/页面隐藏归零 |
| 玩几章后内存暴涨 | 只有 B-612 写了 `dispose()`，其余 7 章每进出一次漏 37 个 geometry | `dispose()` 提到基类，遍历主场景与天空场景统一释放 |
| 每进出一次固定涨 4.2 MB | 光照的阴影贴图是 `WebGLRenderTarget`（1024²×4B = 4 MB），材质遍历碰不到 | 遍历时单独 `light.shadow.map.dispose()` 并置空 |
| 几何体释放了内存还在涨 | `geometry.dispose()` 只放 GPU 侧，`Float32Array` 仍被 BufferAttribute 持有 | 释放前把每个 attribute 的 `array` 换成空数组 |
| 对话结束后 DOM 越积越多 | `Dialogue.stop()` 没有清空逐字 `<span>` | `stop()` 里清空 `lineEl` 与 `spans` |
| 章节第二段交互永远触发不了 | `onInteract(id)` 开头 `if (id !== '第一段') return;` 把后续分支挡死 | 改成逐分支 `if (id === ...)` 判断（5 个章节都有这个问题） |
| B-612 第 7 个目标无法完成 | 椅子门槛写成 `() => this.sunsetDone`，而该标志正是坐下后才置位 | 改成 `stage >= 5 && !this.sunsetDone` |
| 浇完水又回到「拿水壶」 | 水壶/泉眼门槛只判 `carried`，浇水后 `carried=false` 就回退 | 门槛加 `this.stage < 5` |
| 进入新星球只看到一片空地 | 出生点固定在星球另一侧（弦距约等于直径），目标永远在镜头背后 | 新增 `_spawnNearTarget(id, 34)`：落在目标斜前方 34°，再用 `lookToward` 把镜头转过去 |
| 相机朝向算出来是乱数 | 用 `目标位置 - 角色位置` 当瞄准方向，两者常几乎共线，投到切平面后长度趋零 | 改成投影 `target.pos` 到切平面，长度不足时先沿切向退开 `radius*0.35` |
| 截图里相机停在原点 | 无头 Edge 里页面被判为隐藏，`paused` 让 rAF 停摆，相机 lerp 一次都没跑 | 测试脚本在采样前主动 `chapter.update(0.016) × 60` 帧（真实浏览器不受影响） |
| 走久了角色偏出画面，但内部指标一直显示「完美居中」 | **坐标系混用**：`walker.position` 是 `root` 局部坐标，相机却挂在场景（世界坐标）里；`root.rotation.z`（0.05–0.2）与自转让角色真实位置偏出 1 m，且逐秒漂移 | 把 `camera` 挂进 `this.root`（`chapter.js` 与 `b612.js` 各一处），`updateCamera` 解完局部位置后用 `parent.matrixWorld` 转世界朝向；`camUp` 改用独立缓存避免逐帧自反馈 |
| 天空洗成一片奶白 | 地平线雾光按 `0.35 + k*0.4` 给，黄昏时整段天空都被 `hazeColor` 混白 | 降到 `0.16 + k*0.26`；B-612 再单独压到 `0.14 + k*0.24`，只留地平线附近一层暖雾 |
| 星球表面变成纯白 | `makePlanet` 改成顶点色后材质仍是 `color: base`，顶点色与基色相乘过曝 | 材质 `color` 必须写成 `0xffffff`，颜色全交给 `vertexColors` |
| 加了「收集光点」玩法后要整块拆掉 | 一度按「探索性」加了记忆之光：计数、HUD 光数、`progress.lights`、任务栏统计 | 用户要求贴合原著玩法（m03971），全部回退；`progress` 只剩 `{visited, explored}`，探索性靠「原著小事」互动与地点发现 |
| 相机对准了角色坐标，人却在画面外 | `avatar.update()` 每帧把 `root.position.y` 覆写成呼吸值，把模型从球面上挪开 0.52 | 由 walker 在 `sync()` 里交出 `basePos`/`baseUp`，呼吸与走路起伏改成沿法线叠加偏移 |
| 玩几章后堆内存线性增长，几何体却都释放了 | `Dialogue` 每次 `new` 都往共享的 `#dialogue` 上 `addEventListener('pointerdown')`，且从不移除；回调闭包里握着整个章节 | 用 `AbortController` 的 `signal` 绑定监听，`dispose()` 里 `abort()`；堆快照引用链为 `Window → document → #dialogue → RegisteredEventListener → closure → Chapter` |
| B-612 章节从不释放 | `B612Chapter` 不继承基类 `Chapter`，`game._teardownChapter()` 调不到 `dispose()` | 补一个 `dispose() { Chapter.prototype.dispose.call(this); }` |
| 内存测量脚本自己制造泄漏 | CDP `Runtime.queryObjects` 的返回值被 DevTools 以默认 objectGroup 持有 | 所有 `evaluate`/`queryObjects`/`callFunctionOn` 统一用 `objectGroup: 'memq'`，用完 `releaseObjectGroup` |
| 大半径星球出生点离第一个目标几十米 | 基类 `_spawnNearTarget()` 按**球心角**偏移，`R=100` 时 34° ≈ 60 m；`_faceFirstTarget()` 还会把角色挪 `radius*0.35` = 35 m | 地球章自己用 `routeDir(distance, side)` 按弧长铺路、出生在 `routeDir(0)`、`lookToward` 朝路线切线 |
| 沿小径走到不了任何互动点 | 互动点侧偏 0.6–2.5 m，而触发距离只有 `radius * 0.6`（约 1 m） | 互动点收到路边 0.3–0.5 m，建筑用 `placeByRoute()` 摆到路侧 |
| 「回去找你的玫瑰」永远完不成 | 第 11 个目标放在起点蛇的位置，玩家在 40 m 外的飞机旁，没有任何提示要走回去 | 飞行员对话结束即 `_markGoal(11)` 并 `completeChapter('earth')` |
| 玫瑰园的喷泉 / 凉架 / 长椅全是歪的，实例化零件竖着插进土里 | `frameAt()` 用 `cross(zz, up)` 凑第三轴，得到**左手系**基（行列式 -1），`Matrix4.decompose()` 解出垃圾四元数 | 改成 `cross(up, zz)`（X × Y = Z）；`earth-scene-check` 复测全部零件贴地 0～7.9 m |
| 34 米宽的玫瑰园两端悬空 1.4 m | 平面模型整体贴到球面上（R=100 的曲率） | 大型建筑改用 `frameAt()` + `FS()` / `inst()` 逐件落球面，地面色带用球冠 `capMesh()` |
| 沿路走像在踩台阶 | 小径用一块块 9 cm 厚的石板实例铺成，凸在沙面上 | 改成 `makePath()` 连续带状网格，贴地 2 cm（见上面「地球」小节） |
| 小路画了却看不见 | 带状网格的三角形绕序整体反了，被背面剔除 | 按质心法线与径向点乘判断，整体翻转索引；用 `earth-path-check` 拍「有路/无路」两张对比验证 |
| 沿沙路走完全碰不到交互点 | 交互点用的是道具坐标，道具离路 1.6～3.4 m，超出 `radius × 0.78` 的触发半径 | 交互点改成路边锚点 `routeDir(d, ~1.0)`，道具退回远处做构图 |
| 火车轮子转向不对 | 车轮轴向与行进方向不匹配，`rotation.x` 转起来像在侧滚 | 直接去掉轮子动画（静止更稳），并删掉 `trainWheels` 数组 |
| 每颗星球都只看到道具，没有 NPC | 各章从来只有王座/酒桶/书桌等静物，没有任何人物模型 | 新增 `npc.js`（程序化人物 + `placeNPC`/`faceNPC`/`besideDir`），七章 + 地球各摆一两位，并逐帧转向玩家 |
| 六颗星球的 NPC 长得一模一样 | 全用同一套 `makeNPC({...})` 只换颜色和帽子，远处看是同一批小人 | 改为六个专属模型：国王（貂皮披风+权杖+高冠+白胡子，1.08 m）、爱虚荣者（插羽毛高礼帽+手举镜子+叉腰，1.18 m）、酒鬼（驼背+红鼻子+酒瓶，0.80 m）、商人（西装马甲领带+圆眼镜+账本+耳后铅笔）、点灯人（肩扛长杆+杆头亮灯）、地理学家（长袍+圆眼镜+白长须+腋下厚书+羽毛笔）；地球章的商贩/飞行员仍用通用 `makeNPC` |
| 触摸测试「上推」判定为反向，但真机手感是对的 | 测试把移动前的点投到移动后的相机上，相机一转投影就翻号 | 改用起步相机朝向：`dot(delta, s0.dir) / walked > 0.7` |
| 第一张星球的椅子是歪的 | 给椅子定向时 `makeBasis(right, up, back)` 的 Z 取了 `-(right × up)`，行列式 = **-1**（镜射矩阵），`setFromRotationMatrix()` 解出的是被翻转的姿态 | 改成右手正交基 `makeBasis(up × sun, up, sun)`，Z 直接指向落日；实测 up·法线 = 1.000、行列式 = +1 |
| 互动按钮要贴到物件脸上才出现 | `INTERACT_REACH = 0.6`，配置半径 1.35–1.8 只剩 0.8–1.1 m | 放宽到 `0.78`（1.05–1.7 m），站在物件跟前就出提示 |
| `npc-check` 偶尔报「NPC 在画面外」 | 无头 Edge 的页面被判定为隐藏，`game.paused = true`，相机还停在入场插值的第一帧，人却没动 | 探针前先 `__game.paused = false` 并手动 `ch.update(1/60) × 90`，让相机收敛；实测六章 NPC 的 head NDC 都在 `[0,-0.22]` 左右 |
| 前倾的 NPC 脚陷进球面 | 驼背（`body.rotation.x = 0.16`）或伏案（0.12）绕原点旋转，负 Z 处的书角/衣角被转到地面以下 2–4 cm | 给 `body.position.y` 补 0.02 / 0.04，包围盒底部回到 ≥ 0 |
| 小星球上地平线以下是一整块奶油色 | `R = 6` 时地面只占画面底部三成，视线越过地平线就是太空；天空 shader 只有三段渐变，于是半个屏幕是一块纯色 | 试过在 shader 里画透视云海（3 倍频噪声），小屏上糊成一片、还抢主体亮度，最后**整层去掉**，保留干净渐变 |
| 头顶有一棵树在飘 | 「远景浮空树」按 `dir * R * 2.7` 摆在球外，但从地面抬头看正好悬在头顶，像穿模 | 去掉浮空树与 sprite 云海，远景只留天空与星星 |
| 章节销毁时抛 `Cannot set property array of #<InterleavedBufferAttribute>` | `dispose()` 为回收 JS 侧 typed array 直接给 `attribute.array` 赋空数组，而 Sprite 用的是共享的 interleaved attribute，`array` 是只读 getter | 跳过 `attr.isInterleavedBufferAttribute`（索引同样判断），其余照旧清空 |
| 章节切回地图后，新章节的光点变成黑色方块 | `FxPool` 的柔光贴图是全局共享的 `CanvasTexture`，章节 `dispose()` 遍历材质把它 `dispose()` 了 | 贴图打 `userData.shared = true`，`freeTex` 遇到共享贴图跳过释放 |
| 测试脚本看到的 `nearest` 一直是 `null` | 章节入场对话把 `busy` 置真，`_updateInteraction()` 整段被跳过，站在互动点上也探测不到 | 测试里先 `dialogue.stop(); busy = false` 再采样；真实玩家在对话结束后才会走动 |
| 对话名牌颜色不跟着说话人变 | 只改了 CSS，DOM 上没有可选择的标记 | 名牌写 `data-who`（prince/narrator/rose/fox/snake/king/other），配色全部由 CSS 属性选择器驱动 |
| 云海把相机包住，整屏发白 | 云团放在 `1.35R`，而相机轨道半径约 `R + 4`，镜头直接钻进云里 | 先改成柔边 sprite 压到 `2.25–3.0R`；观感仍不理想，最终整层删除 |

---

## 已知限制

- **8 颗星球全部可玩**，但每颗星球都是「一章」的体量：一条主线、2–7 个目标、
  10–30 句对话，走完自动回到地图。这是刻意按手机单次游玩的时长做的取舍。
- 未在真机 iPhone 上跑过（本机无 iOS 设备），验收基于 Chrome/Edge 的
  iPhone 视口模拟 + 真实触摸/指针事件。**上线前请用 Safari 真机复查**。
  手机上打开 Safari 的 Web Inspector（需先在「设置 → Safari → 高级」开启），
  查看控制台与内存即可。
- iOS 的内存预算按 `usedJSHeapSize` 衡量，不包含 WebGL 显存与 Metal 纹理；
  真机上如果出现被系统回收，优先降 `devicePixelRatio` 上限（`game.js` 里 `DPR_CAP`）。
- 美术是程序化生成的低多边形风格，只复用了原始的缩略图、地图底图与字体。
  B-612 是唯一做了起伏地形的一章，其余七章仍是光滑球 + 道具；
  按参考图重做后的观感只在桌面浏览器的 iPhone 视口里核对过（截图 + 色带统计），
  小屏上的最终效果仍需真机确认。
- **内存尚未完全达标**：earth 章反复进出仍约 0.77 MB/轮、b612 残留 4 张贴图。
  已知的最大一处泄漏（`Dialogue` 的全局监听器）已修复，剩下的属于间歇性残留，
  需要再抓一次堆快照确认。追求稳定的话，可以在章节切换后手动调一次
  `game.returnToMap()` 之前先 `location.reload()`（下策），或继续排查。

---

## 版权

`01-text/`、`06-export/` 下的原始资源以及本项目复用的缩略图/地图/字体，
版权归原作者与出版方所有。本仓库仅作技术研究，**请勿分发解包后的原始素材**。
若要公开发布，请替换为自己的美术与字体。
