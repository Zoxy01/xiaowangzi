/**
 * 星球目录：8 章，数据全部来自原站 LPStrings（中文源句 + 各语言译文）。
 * x/y 是旅程地图上的相对位置（0..1），缩略图尺寸来自 srcSet 权重。
 */
export const PLANETS = [
  {
    id: 'b612',
    thumb: 'b612',
    x: 0.28,
    y: 0.6,
    size: 1.24, // 相对基准尺寸
    chapter: '第一章',
    name: 'B-612 · 家园',
    tagline: '玫瑰在这里',
    intro: '有一颗只比房子大一点的星球，上面住着一位小王子。',
    action: '走进家园',
    visitedNote: '他从这里出发',
    built: true,
  },
  {
    id: 'king',
    thumb: 'king',
    x: 0.43,
    y: 0.3,
    size: 0.95,
    chapter: '第二章',
    name: '国王的星球',
    tagline: '325 号小行星',
    intro: '这里住着一位国王。在他眼里，人人都是臣民，连星星也听他的。',
    action: '前去拜访',
    visitedNote: '国王要任命他做大使，他还是走了。',
    built: true,
  },
  {
    id: 'vanity',
    thumb: 'theater',
    x: 0.55,
    y: 0.52,
    size: 0.88,
    chapter: '第三章',
    name: '爱虚荣者的星球',
    tagline: '326 号小行星',
    intro: '这里住着一个爱虚荣的人，他只听得见赞美。',
    action: '前去拜访',
    visitedNote: '他拍了两次手。那个人只想听掌声，他就走了。',
    built: false,
  },
  {
    id: 'bar',
    thumb: 'bar',
    x: 0.67,
    y: 0.29,
    size: 0.9,
    chapter: '第四章',
    name: '酒鬼的星球',
    tagline: '327 号小行星',
    intro: '这里住着一个酒鬼。他喝酒，是为了忘掉让他难为情的事——喝酒。',
    action: '前去拜访',
    visitedNote: '他问了几句，没有得到答案，坐了一会儿就走了。',
    built: false,
  },
  {
    id: 'merchant',
    thumb: 'counting',
    x: 0.78,
    y: 0.55,
    size: 0.9,
    chapter: '第五章',
    name: '商人的星球',
    tagline: '328 号小行星',
    intro: '这里住着一个商人，他一刻不停地数星星，说它们都归他所有。',
    action: '前去拜访',
    visitedNote: '他说完自己的花和火山，商人找不到话回答。',
    built: false,
  },
  {
    id: 'lamp',
    thumb: 'lamp',
    x: 0.34,
    y: 0.78,
    size: 0.78,
    chapter: '第六章',
    name: '点灯人的星球',
    tagline: '329 号小行星',
    intro: '这是最小的一颗星球，只放得下一盏路灯和一个点灯人。',
    action: '前去拜访',
    visitedNote: '他想留下来陪点灯人，可这颗星球太小，容不下两个人。',
    built: false,
  },
  {
    id: 'geo',
    thumb: 'geo',
    x: 0.52,
    y: 0.79,
    size: 0.92,
    chapter: '第七章',
    name: '地理学家的星球',
    tagline: '330 号小行星',
    intro: '这里住着一位地理学家，他从不出门，却记下了别处的山和海。',
    action: '前去拜访',
    visitedNote: '他第一次担心起留在家里的花，然后去了地理学家说的地球。',
    built: false,
  },
  {
    id: 'earth',
    thumb: 'earth',
    x: 0.76,
    y: 0.8,
    size: 1.0,
    chapter: '第八章',
    name: '地球',
    tagline: '第七颗星球',
    intro: '这里是地球。一片沙漠，头顶有一颗格外亮的星。',
    action: '前往地球',
    visitedNote: '他在这里',
    built: false,
  },
];

/**
 * 「哪些星球能玩」的唯一真相是 chapters/index.js 的注册表。
 * 这里只提供查询函数，不反向 import 章节（否则会形成循环依赖，
 * 表现为 markBuilt 在模块求值期间拿到未初始化的数组而静默失效）。
 */
export function planetById(id) {
  return PLANETS.find((p) => p.id === id);
}

export function applyBuilt(ids) {
  for (const p of PLANETS) p.built = ids.includes(p.id);
  return PLANETS;
}
