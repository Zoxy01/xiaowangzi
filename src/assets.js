/**
 * 资源 URL 解析。
 * 本地开发时页面在 / 上，构建后可能挂在任意子目录；
 * 统一用相对于当前文档的路径，避免写死前导斜杠。
 */
const base = (() => {
  // 构建脚本会注入 window.__LP_BASE；默认按文档所在目录解析
  if (typeof window !== 'undefined' && window.__LP_BASE) return window.__LP_BASE;
  const path = location.pathname;
  const dir = path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
  return dir || '/';
})();

export function asset(p) {
  return base + 'assets/' + String(p).replace(/^\/+/, '');
}
