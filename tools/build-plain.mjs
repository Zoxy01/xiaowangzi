/**
 * 无子进程构建（沙箱友好）。
 * Vite 在这台机器的沙箱里会 spawn EPERM（它用子进程做 safe-realpath 和 esbuild），
 * 所以这里用 rollup 的 JS API 直接打包 ES 模块：
 *   1. src/styles.css  → dist/app.css（原样输出，开发时也是同一份）
 *   2. src/main.js     → dist/app.js （rollup tree-shake + three 合并）
 *   3. index.html      → dist/index.html（把 module script 换成 app.js）
 *   4. public/**       → dist/（字体、贴图、台词表 JSON 已被 import 打进 js）
 *
 * 注意：这是一条「可以离开 Vite 也能构建」的兜底路径，
 * 在有完整权限的机器上依然可以直接 `npm run build`（见 package.json）。
 */
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { readFile, writeFile, mkdir, cp, rm, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// ---- 1. CSS（dist 里 CSS 位于根目录，字体在 ./assets/ 下，需重写 ../assets/）
const css = await readFile(join(root, 'src/styles.css'), 'utf8').then((s) => s.replace(/\.\.\/assets\//g, './assets/'));
await writeFile(join(dist, 'app.css'), css);
const cssBytes = css.length;
console.log('css   ', (css.length / 1024).toFixed(1) + ' KB');

// ---- 2. JS（rollup）
const bundle = await rollup({
  // 额外加一个 three 入口，确保它被拆成独立 chunk（首屏 CSS/HTML 不必等它）
  input: {
    app: join(root, 'src/main.js'),
    three: join(root, 'node_modules/three/build/three.module.js'),
  },
  plugins: [
    {
      name: 'json',
      transform(code, id) {
        if (!id.endsWith('.json')) return null;
        return { code: `export default ${code.trim()};`, map: null };
      },
    },
    {
      name: 'css-ignore',
      // 入口 main.js 里 import './styles.css'，交给上面的 CSS 步骤处理
      resolveId(source, importer) {
        if (source.endsWith('.css')) return '\0css:' + source;
        return null;
      },
      load(id) {
        if (id.startsWith('\0css:')) return 'export default "";';
        return null;
      },
    },
    nodeResolve({ browser: true, extensions: ['.js', '.mjs', '.json'] }),
  ],
});

const { output } = await bundle.generate({
  format: 'es',
  sourcemap: false,
  chunkFileNames: '[name].js',
  manualChunks(id) {
    if (id.includes('node_modules/three')) return 'three';
    return undefined;
  },
});
await bundle.close();

let jsTotal = 0;
const chunkFiles = [];
for (const chunk of output) {
  if (chunk.type !== 'chunk') continue;
  // 入口 app 固定叫 app.js，其余按 chunk 名（three.js 等）
  const out = chunk.name === 'app' ? 'app.js' : chunk.name + '.js';
  await writeFile(join(dist, out), chunk.code);
  chunkFiles.push(out);
  jsTotal += chunk.code.length;
  console.log('js    ', out.padEnd(10), (chunk.code.length / 1024).toFixed(1) + ' KB');
}

// ---- 3. HTML（注意：dist 是平的，所有引用都要相对当前目录，不能出现 ../）
let html = await readFile(join(root, 'index.html'), 'utf8');
html = html.replace(/(\.\/)?src\/styles\.css/g, './app.css');
html = html.replace(/(\.\/)?src\/main\.js/g, './app.js');
html = html.replace(/href="\/assets\//g, 'href="./assets/');
html = html.replace(/src="\/assets\//g, 'src="./assets/');
await writeFile(join(dist, 'index.html'), html);

// 资源路径：代码里写的是 /assets/...，构建后用相对目录，所以在 app.js 前面注入 BASE
const basePrefix = '<script>window.__LP_BASE="./";</script>\n    ';
html = html.replace('<script type="module"', basePrefix + '<script type="module"');
await writeFile(join(dist, 'index.html'), html);
console.log('html  ', (html.length / 1024).toFixed(1) + ' KB');

// ---- 4. 静态资源
await mkdir(join(dist, 'assets'), { recursive: true });
await cp(join(root, 'public/assets'), join(dist, 'assets'), { recursive: true });
// manifest 也要进 dist（之前只复制了 assets，PWA 装不上）
try {
  await cp(join(root, 'public/manifest.webmanifest'), join(dist, 'manifest.webmanifest'));
} catch {
  console.log('warn  public/manifest.webmanifest 不存在，跳过');
}

// ---- 5. 报告
const files = ['app.js', 'three.js', 'app.css', 'index.html'];
let total = 0;
for (const f of files) {
  const p = join(dist, f);
  try {
    const st = await stat(p);
    const buf = readFileSync(p);
    const gz = gzipSync(buf, { level: 9 }).length;
    total += gz;
    console.log(`  ${f.padEnd(11)} ${String(Math.round(st.size / 1024)).padStart(5)} KB  (gzip ${Math.round(gz / 1024)} KB)`);
  } catch {
    /* 忽略缺失 */
  }
}
// 计算 assets 目录总量
async function dirSize(p) {
  let s = 0;
  const { readdirSync, statSync } = await import('node:fs');
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const fp = join(p, e.name);
    if (e.isDirectory()) s += await dirSize(fp);
    else s += statSync(fp).size;
  }
  return s;
}
const assetsSize = await dirSize(join(dist, 'assets'));
console.log(`  assets/     ${String(Math.round(assetsSize / 1024)).padStart(5)} KB`);
// total 已经是「gzip 后的字节数」，assetsSize 是原始字节；两者都换算成 MB 再相加
const mb = (b) => (b / 1048576).toFixed(2);
console.log(
  `总首屏 ≈ ${mb(total + assetsSize)} MB（gzip 后；未压缩 ${mb(jsTotal + cssBytes + assetsSize)} MB）`
);
