/**
 * 构建脚本（走 Vite 的 JS API）。
 * 不用 `vite build` CLI 与 vite.config.js 的原因：
 * 配置文件的打包会走 esbuild 子进程 + 管道 stdio，在某些受限沙箱里 spawn EPERM。
 * 这里把等价配置直接内联，并设置 optimizeDeps.noDiscovery 以免启动时探测依赖。
 */
import { build } from 'vite';

await build({
  root: process.cwd(),
  configFile: false,
  base: './',
  logLevel: 'info',
  esbuild: { legalComments: 'none' },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 2048,
    cssCodeSplit: false,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
});
