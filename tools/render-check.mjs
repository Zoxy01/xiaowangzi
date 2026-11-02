/**
 * 渲染快照检查：用 Chromium 的 --screenshot 抓首屏。
 *
 * 注意：--screenshot 在页面 load 事件后立即截，来不及执行 #test= 注入的脚本，
 * 所以这里只验证「首屏这一张」有真实内容。需要分阶段（地图/章节/走动/对话/
 * 日落）的证据请用 tools/stage-shots.mjs —— 它走 CDP，等状态到位后再截图。
 *
 *   node tools/render-check.mjs [url]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const CHROME = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!CHROME) {
  console.error('没找到 Edge/Chrome');
  process.exit(2);
}

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const OUT = 'test-shots';
const OUT_ABS = resolve(process.cwd(), OUT).replace(/\//g, '\\');
mkdirSync(OUT, { recursive: true });

function shoot(name) {
  return new Promise((resolveShot) => {
    const shot = `${OUT_ABS}\\${name}.png`;
    try {
      rmSync(shot, { force: true });
    } catch {}
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=390,844',
      '--force-device-scale-factor=2',
      `--screenshot=${shot}`,
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${OUT_ABS}\\..\\.tmp\\render-profile-${name}`,
      url,
    ];
    const p = spawn(CHROME, args, { stdio: 'ignore' });
    p.on('error', () => resolveShot(shot));
    p.on('exit', () => resolveShot(shot));
  });
}

/** 用 Pillow 统计颜色多样性：纯色画面的 uniq 会接近 1 */
function stats(path) {
  const py = `
import sys
from PIL import Image
im = Image.open(r'${path}').convert('RGB')
px = list(im.resize((90,190)).getdata())
lum = [0.299*r+0.587*g+0.114*b for r,g,b in px]
avg = sum(lum)/len(lum)
std = (sum((l-avg)**2 for l in lum)/len(lum))**0.5
print('%d %.1f %.1f %d' % (im.size[0], avg, std, len(set(px))))
`;
  const out = execFileSync('python', ['-c', py], { encoding: 'utf8' }).trim().split(' ');
  return { w: +out[0], avg: +out[1], std: +out[2], uniq: +out[3] };
}

console.log('渲染检查，目标', url);
const shot = await shoot('01-boot');
if (!existsSync(shot)) {
  console.log('  ✗ 截图没生成');
  process.exit(1);
}
const bytes = readFileSync(shot).length;
const s = stats(shot);
const ok = bytes > 3000 && s.uniq > 50 && s.std > 3;
console.log(
  `  ${ok ? '✓' : '✗'} 01-boot  ${(bytes / 1024).toFixed(1)} KB  ` +
    `${s.w}px  avgLum=${s.avg.toFixed(1)} std=${s.std.toFixed(1)} uniq=${s.uniq}`
);
if (!ok) {
  console.log('\n首屏画面疑似空白（纯色 / 无层次）');
  process.exitCode = 1;
} else {
  console.log('\n首屏渲染正常；分阶段证据见 tools/stage-shots.mjs');
}

