// 列出所有未写 speaker 的台词被判为「旁白」还是「小王子」，便于人工核对。
import fs from 'node:fs';
import path from 'node:path';
const src = fs.readFileSync(new URL('../src/dialogue.js', import.meta.url), 'utf8');
const re = new RegExp(src.match(/const NARRATION = \/(.+)\/;/)[1]);
const isNarr = (s) => !s.trim() || re.test(s.trim()) || s.includes('小王子');
const dir = new URL('../src/chapters/', import.meta.url);
for (const f of fs.readdirSync(dir)) {
  const txt = fs.readFileSync(path.join(dir.pathname.replace(/^\/(\w:)/, '$1'), f), 'utf8');
  for (const m of txt.matchAll(/\{ text: '([^']*)'(?![^}]*speaker)/g)) {
    console.log((isNarr(m[1]) ? '旁白  ' : '小王子') + ' | ' + f + ' | ' + m[1]);
  }
}
