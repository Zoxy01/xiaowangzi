/**
 * 章节注册表：id → 章节类。
 * game.js 只认这张表，不再硬编码某一颗星球，
 * 未注册的星球在地图上显示为「还在建造中」。
 */
import { B612Chapter } from './b612.js';
import { KingChapter } from './king.js';
import { VanityChapter } from './vanity.js';
import { BarChapter } from './bar.js';
import { MerchantChapter } from './merchant.js';
import { LampChapter } from './lamp.js';
import { GeoChapter } from './geo.js';
import { EarthChapter } from './earth.js';

export const CHAPTERS = {
  b612: B612Chapter,
  king: KingChapter,
  vanity: VanityChapter,
  bar: BarChapter,
  merchant: MerchantChapter,
  lamp: LampChapter,
  geo: GeoChapter,
  earth: EarthChapter,
};

export function chapterIds() {
  return Object.keys(CHAPTERS);
}

export function hasChapter(id) {
  return Object.prototype.hasOwnProperty.call(CHAPTERS, id);
}

export function createChapter(id, game) {
  const Cls = CHAPTERS[id];
  if (!Cls) return null;
  return new Cls(game);
}
