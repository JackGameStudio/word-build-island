/**
 * Toast.js
 * 像素风通知组件 — 自动队列 + 2秒消失
 */

export function createToast() {
  const container = document.createElement('div');
  container.className = 'toast-container';

  const queue = [];
  let active = false;

  function showNext() {
    if (queue.length === 0) { active = false; return; }
    active = true;
    const { msg, duration } = queue.shift();

    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = msg;
    el.style.animationDuration = `${duration}ms`;
    container.appendChild(el);

    setTimeout(() => {
      el.remove();
      showNext();
    }, duration);
  }

  document.body.appendChild(container);

  return {
    container,
    /** @param {string} msg @param {number} [duration=2000] */
    show(msg, duration = 2000) {
      queue.push({ msg, duration });
      if (!active) showNext();
    }
  };
}