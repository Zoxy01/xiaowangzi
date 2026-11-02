/**
 * 显隐与轻提示工具：同时维护 class 与 HTML hidden 属性。
 *
 * 为什么需要它：样式表里有 `[hidden]{display:none!important}` 这条全局保险
 * （防止某个模块的 display 覆盖 hidden 属性而整屏遮挡）。
 * 一旦某处只 `classList.remove('hidden')` 而没有清掉 hidden 属性，
 * 元素就会永远不显示——地图曾经因此只剩背景色。
 * 统一走这里，两边永远一致。
 */
export function setVisible(el, on) {
  if (!el) return;
  el.classList.toggle('hidden', !on);
  el.hidden = !on;
}

export function setHidden(el, on) {
  setVisible(el, !on);
}

let _toastTimer = 0;
let _toastEl = null;

/**
 * 屏幕上方的轻提示：任务完成、发现新地点、收集到徽章。
 * 复用同一个节点，避免每次都往 DOM 里塞新元素（也避免动画队列堆积）。
 * @param {string} text
 * @param {'goal'|'find'|'badge'} kind
 */
export function toast(text, kind = 'goal') {
  if (!_toastEl) _toastEl = document.getElementById('toast');
  if (!_toastEl || !text) return;
  _toastEl.textContent = text;
  _toastEl.dataset.kind = kind;
  // 先在无动画状态下重排，才能重放同一条 CSS 动画
  _toastEl.classList.remove('show');
  void _toastEl.offsetWidth;
  _toastEl.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => _toastEl.classList.remove('show'), 1900);
}
