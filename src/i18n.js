/**
 * 本地化：中文是源句，其它语言查表。
 * 表来自 build_game_assets.py 解析的 LPStrings_<lang>.txt（原站真实文案）。
 */
import table from './generated/strings.json';
const LANGS = [
  { code: 'zh', name: '中文', html: 'zh-CN' },
  { code: 'en', name: 'English', html: 'en' },
  { code: 'fr', name: 'Français', html: 'fr' },
  { code: 'es', name: 'Español', html: 'es' },
  { code: 'de', name: 'Deutsch', html: 'de' },
  { code: 'pt', name: 'Português', html: 'pt-BR' },
  { code: 'ja', name: '日本語', html: 'ja' },
  { code: 'ko', name: '한국어', html: 'ko' },
];

const STORAGE_KEY = 'lp.lang';

/**
 * 新 UI（旅程手册、徽章、提示）用的少量补充文案。
 * 原站文案表 strings.json 里没有这些词，这里只补短标签；
 * 查不到时仍然回落到中文源句，和原站 Loc 的行为一致。
 */
const EXTRA = {
  en: {
    旅程手册: 'Journal',
    任务: 'Quests',
    探索: 'Explored',
    已拜访: 'Visited',
    颗星球: 'planets',
    下一站: 'Next stop',
    徽章: 'Badges',
    目标完成: 'Objective complete',
    发现: 'Discovered',
    已解锁: 'Unlocked',
    尚未解锁: 'Locked',
    旅程从这里开始: 'The journey begins here',
    看看笼子里的老鼠: 'Look at the mouse in the cage',
    看看他的镜子: 'Look at his mirror',
    数一数他的空瓶: 'Count his empty bottles',
    看看那只抽屉: 'Look at that drawer',
    替他把灯点上: 'Light the lamp for him',
    看看他在记录什么: 'See what he is writing down'
  },
  fr: {
    旅程手册: 'Journal de voyage',
    任务: 'Quêtes',
    探索: 'Exploré',
    已拜访: 'Visités',
    颗星球: 'planètes',
    下一站: 'Prochaine étape',
    徽章: 'Insignes',
    目标完成: 'Objectif accompli',
    发现: 'Découvert',
    已解锁: 'Débloqué',
    尚未解锁: 'Verrouillé',
    旅程从这里开始: 'Le voyage commence ici',
    看看笼子里的老鼠: 'Regarder la souris dans la cage',
    看看他的镜子: 'Regarder son miroir',
    数一数他的空瓶: 'Compter ses bouteilles vides',
    看看那只抽屉: 'Regarder ce tiroir',
    替他把灯点上: 'Allumer la lanterne pour lui',
    看看他在记录什么: "Voir ce qu'il note"
  },
  es: {
    旅程手册: 'Diario de viaje',
    任务: 'Misiones',
    探索: 'Explorado',
    已拜访: 'Visitados',
    颗星球: 'planetas',
    下一站: 'Próxima parada',
    徽章: 'Insignias',
    目标完成: 'Objetivo cumplido',
    发现: 'Descubierto',
    已解锁: 'Desbloqueado',
    尚未解锁: 'Bloqueado',
    旅程从这里开始: 'El viaje empieza aquí',
    看看笼子里的老鼠: 'Mirar el ratón en la jaula',
    看看他的镜子: 'Mirar su espejo',
    数一数他的空瓶: 'Contar sus botellas vacías',
    看看那只抽屉: 'Mirar ese cajón',
    替他把灯点上: 'Encender la farola por él',
    看看他在记录什么: 'Ver qué está anotando'
  },
  de: {
    旅程手册: 'Reisetagebuch',
    任务: 'Aufgaben',
    探索: 'Erkundet',
    已拜访: 'Besucht',
    颗星球: 'Planeten',
    下一站: 'Nächster Halt',
    徽章: 'Abzeichen',
    目标完成: 'Ziel erreicht',
    发现: 'Entdeckt',
    已解锁: 'Freigeschaltet',
    尚未解锁: 'Noch gesperrt',
    旅程从这里开始: 'Die Reise beginnt hier',
    看看笼子里的老鼠: 'Die Maus im Käfig ansehen',
    看看他的镜子: 'Seinen Spiegel ansehen',
    数一数他的空瓶: 'Seine leeren Flaschen zählen',
    看看那只抽屉: 'Diese Schublade ansehen',
    替他把灯点上: 'Die Laterne für ihn anzünden',
    看看他在记录什么: 'Sehen, was er notiert'
  },
  pt: {
    旅程手册: 'Diário de viagem',
    任务: 'Missões',
    探索: 'Explorado',
    已拜访: 'Visitados',
    颗星球: 'planetas',
    下一站: 'Próxima parada',
    徽章: 'Emblemas',
    目标完成: 'Objetivo cumprido',
    发现: 'Descoberto',
    已解锁: 'Desbloqueado',
    尚未解锁: 'Bloqueado',
    旅程从这里开始: 'A viagem começa aqui',
    看看笼子里的老鼠: 'Olhar o rato na gaiola',
    看看他的镜子: 'Olhar o espelho dele',
    数一数他的空瓶: 'Contar as garrafas vazias',
    看看那只抽屉: 'Olhar aquela gaveta',
    替他把灯点上: 'Acender o lampião para ele',
    看看他在记录什么: 'Ver o que ele está anotando'
  },
  ja: {
    旅程手册: '旅の手帳',
    任务: '任務',
    探索: '探索',
    已拜访: '訪問済み',
    颗星球: '個の星',
    下一站: '次の星',
    徽章: 'バッジ',
    目标完成: '目標達成',
    发现: '発見',
    已解锁: '解放済み',
    尚未解锁: '未解放',
    旅程从这里开始: '旅はこの星から始まる',
    看看笼子里的老鼠: '檻の中のネズミを見る',
    看看他的镜子: '彼の鏡を見る',
    数一数他的空瓶: '空き瓶を数える',
    看看那只抽屉: 'あの引き出しを見る',
    替他把灯点上: '彼の代わりに灯をともす',
    看看他在记录什么: '何を記録しているか見る'
  },
  ko: {
    旅程手册: '여행 수첩',
    任务: '임무',
    探索: '탐험',
    已拜访: '방문함',
    颗星球: '개의 별',
    下一站: '다음 행성',
    徽章: '휘장',
    目标完成: '목표 달성',
    发现: '발견',
    已解锁: '해금됨',
    尚未解锁: '잠김',
    旅程从这里开始: '여행은 이 별에서 시작된다',
    看看笼子里的老鼠: '우리 안의 쥐를 보다',
    看看他的镜子: '그의 거울을 보다',
    数一数他的空瓶: '빈 병을 세어 보다',
    看看那只抽屉: '저 서랍을 보다',
    替他把灯点上: '그를 대신해 등불을 켜다',
    看看他在记录什么: '무엇을 기록하는지 보다'
  },
};

function detect() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && table[saved]) return saved;
  const nav = (navigator.languages || [navigator.language || 'zh']).map((l) => l.toLowerCase());
  for (const l of nav) {
    const hit = LANGS.find((x) => l.startsWith(x.code));
    if (hit) return hit.code;
  }
  return 'zh';
}

let lang = detect();
const listeners = new Set();

export function getLang() {
  return lang;
}

export function getLanguages() {
  return LANGS;
}

/** 翻译一条中文源句。找不到时回落到中文本身（原站的 Loc 行为）。 */
export function t(zh) {
  if (lang === 'zh') return zh;
  const extra = EXTRA[lang];
  if (extra && extra[zh]) return extra[zh];
  const dict = table[lang];
  return (dict && dict[zh]) || zh;
}

/** 句子里有 {0}/{1} 占位符时用它格式化。 */
export function tf(zh, ...args) {
  let s = t(zh);
  args.forEach((a, i) => {
    s = s.replace(new RegExp('\\{' + i + '\\}', 'g'), a);
  });
  return s;
}

/** 扫描所有带 data-i18n 的节点并替换文本。 */
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  document.documentElement.lang = (LANGS.find((x) => x.code === lang) || LANGS[0]).html;
}

export function setLang(code) {
  if (!table[code]) return;
  lang = code;
  localStorage.setItem(STORAGE_KEY, code);
  applyDom();
  listeners.forEach((fn) => fn(code));
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 逐字揭示的每字时长（毫秒）。
 * 原站 LPLanguages.txt 的 typing 策略：中日韩按字形计时，拉丁按源句长度计时。
 * 中文源句平均 10.6 字，取 glyph=62ms 与拉丁 source 的换算比例一致。
 */
export function typingDelay(text) {
  const glyphLangs = new Set(['zh', 'ja', 'ko']);
  const isCJK = glyphLangs.has(lang);
  const per = isCJK ? 62 : 34;
  const total = Math.min(2600, Math.max(420, text.length * per));
  return { per, total };
}
