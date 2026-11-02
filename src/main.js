/**
 * 入口：先做能力检测与首屏准备，再启动游戏。
 * 加载策略借鉴原站 loading.js 的经验：
 *   - 首屏只加载必要的字体与 3 张星球缩略图
 *   - 其余缩略图和地图底图延迟加载
 */
import './styles.css';
import { Game } from './game.js';
import { applyDom, t } from './i18n.js';
import { audio } from './audio.js';
import { asset } from './assets.js';

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function supportsWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

async function preloadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const faces = ['400 20px LPSerif', 'italic 400 20px LPSerif', '600 20px LPSerif'];
  // 字体不可用或加载过慢时不能卡住启动：整体 1.2 秒超时后放行
  const timeout = new Promise((r) => setTimeout(r, 1200));
  await Promise.race([
    Promise.all(faces.map((f) => document.fonts.load(f, t('小王子的旅程')).catch(() => null))),
    timeout,
  ]);
}

function setStatus(text) {
  const el = document.getElementById('boot-status');
  if (el) el.textContent = text;
}

function setBar(pct) {
  const el = document.getElementById('boot-fill');
  if (el) el.style.width = pct + '%';
}

async function boot() {
  applyDom();
  document.documentElement.classList.toggle('is-ios', isIOS());

  setBar(12);
  setStatus(t('正在准备画面'));

  await preloadFonts();
  setBar(42);

  if (!supportsWebGL2()) {
    setStatus('这个浏览器不支持 WebGL，无法显示 3D 画面。');
    return;
  }

  // 预加载首屏星球缩略图（地图打开即可见）；同样限时，不能阻塞启动
  const firstImgs = ['b612', 'king', 'theater'];
  await Promise.race([
    Promise.all(
      firstImgs.map(
        (n) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = img.onerror = resolve;
            img.src = asset('img/planets/' + n + '.webp');
          })
      )
    ),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  setBar(78);

  const game = new Game();
  window.__game = game; // 便于调试
  setBar(100);
  setStatus('');

  // 测试钩子：URL hash 带 #test=<js> 时在启动后执行（仅本地验证用）
  const m = /#test=(.+)$/.exec(location.hash);
  if (m) {
    try {
      // 延迟执行，给首屏与资源一点时间
      setTimeout(() => {
        // eslint-disable-next-line no-new-func
        new Function(decodeURIComponent(m[1]))();
      }, 60);
    } catch (e) {
      console.error('test hook failed', e);
    }
  }

  // iOS 需要用户手势才能出声，启动按钮就是那个手势
  const startBtn = document.getElementById('boot-start');
  startBtn.hidden = false;
  startBtn.addEventListener(
    'click',
    async () => {
      await audio.start();
      await game.start();
    },
    { once: true }
  );

  // 错误兜底
  game.renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setStatus('画面中断了，请刷新页面。');
  });
}

boot().catch((err) => {
  console.error(err);
  setStatus('启动失败：' + err.message);
});
