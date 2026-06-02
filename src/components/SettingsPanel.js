/**
 * SettingsPanel.js
 * 设置弹窗 — 重置数据 + 跳时间
 */

import { clearDB } from '../core/storage.js';

export function createSettingsPanel() {
  let timeOffset = 0;
  let offsetDaysEl = null;
  let onTimeChange = null;
  let onAddWords = null;

  // ─── DOM ───
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: var(--color-surface, #2a2a3e);
    border: 2px solid #555;
    padding: 16px;
    width: 260px;
    max-width: 90vw;
  `;

  const title = document.createElement('div');
  title.style.cssText = 'text-align:center;font-size:14px;margin-bottom:12px;';
  title.textContent = '⚙️ 设置';

  // 跳时间区
  const timeSection = document.createElement('div');
  timeSection.style.cssText = 'margin-bottom:12px;';

  const timeLabel = document.createElement('div');
  timeLabel.style.cssText = 'font-size:11px;color:var(--color-muted);margin-bottom:4px;';
  timeLabel.textContent = '调试用：跳到下一天';

  offsetDaysEl = document.createElement('div');
  offsetDaysEl.style.cssText = 'text-align:center;font-size:13px;margin-bottom:4px;';
  offsetDaysEl.textContent = '当前已跳过 0 天';

  const skipBtn = document.createElement('button');
  skipBtn.className = 'btn-pixel';
  skipBtn.textContent = '⏩ 跳到下一天';
  skipBtn.style.cssText = 'width:100%;font-size:12px;';
  skipBtn.onclick = () => {
    timeOffset += 86400000;
    offsetDaysEl.textContent = `当前已跳过 ${Math.floor(timeOffset / 86400000)} 天`;
    onTimeChange?.(timeOffset);
  };

  timeSection.append(timeLabel, offsetDaysEl, skipBtn);

  // 临时测试：+50 词
  const testBtn = document.createElement('button');
  testBtn.className = 'btn-pixel';
  testBtn.textContent = '📖 +50 学会词语';
  testBtn.style.cssText = 'width:100%;font-size:12px;margin-top:6px;';
  testBtn.onclick = () => onAddWords?.(50);
  timeSection.appendChild(testBtn);

  // 分隔线
  const divider = document.createElement('hr');
  divider.style.cssText = 'border:none;border-top:1px solid #555;margin:12px 0;';

  // 重置区
  const resetSection = document.createElement('div');
  resetSection.style.cssText = 'margin-bottom:12px;';

  const resetLabel = document.createElement('div');
  resetLabel.style.cssText = 'font-size:11px;color:#f87171;margin-bottom:4px;';
  resetLabel.textContent = '⚠️ 不可恢复';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-pixel btn-danger';
  resetBtn.textContent = '🔄 重置所有数据';
  resetBtn.style.cssText = 'width:100%;font-size:12px;';
  resetBtn.onclick = async () => {
    if (!confirm('确定要清除所有存档数据并重新开始？\n\n此操作不可恢复！')) return;
    await clearDB();
    location.reload();
  };

  resetSection.append(resetLabel, resetBtn);

  // 关闭
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-pixel';
  closeBtn.textContent = '✕ 关闭';
  closeBtn.style.cssText = 'width:100%;font-size:12px;';
  closeBtn.onclick = hide;

  panel.append(title, timeSection, divider, resetSection, closeBtn);
  overlay.appendChild(panel);

  function show(currentOffset = 0) {
    timeOffset = currentOffset;
    offsetDaysEl.textContent = `当前已跳过 ${Math.floor(timeOffset / 86400000)} 天`;
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.classList.add('visible');
  }

  function hide() {
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
  }

  function setOnTimeChange(fn) { onTimeChange = fn; }

  function setOnAddWords(fn) { onAddWords = fn; }

  return {
    element: overlay,
    show,
    hide,
    setOnTimeChange,
    setOnAddWords,
    getTimeOffset: () => timeOffset
  };
}