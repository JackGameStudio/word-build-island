/**
 * BuildDrawer.js
 * 底部建造抽屉 — 九宫格面板 + 建筑列表 + 解锁/灰显
 */

import { BUILDINGS, canBuild, countLearnedWords } from '../data/buildings.js';
import { canAfford } from '../core/economy.js';
import { getState, transition } from '../core/state.js';
import { AppState } from '../data/constants.js';

export function createBuildDrawer(assets, resources, vocab, island, onBuild) {
  let stars = resources.star || 0;
  let totalWords = countLearnedWords(vocab);

  // ─── DOM ───
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'slide-panel panel-9slice';
  panel.style.cssText = 'padding:12px;overflow-y:auto;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'text-align:center;font-size:14px;margin-bottom:8px;';
  titleEl.textContent = '建造';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-pixel';
  closeBtn.textContent = '✕ 关闭';
  closeBtn.style.cssText = 'margin-top:8px;width:100%;font-size:12px;';

  panel.append(titleEl, grid, closeBtn);
  overlay.appendChild(panel);

  // ─── 渲染建筑列表 ───
  function render() {
    stars = resources.star || 0;
    totalWords = countLearnedWords(vocab);
    grid.innerHTML = '';

    BUILDINGS.forEach(building => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';

      // 图标 + 名称
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      info.innerHTML = `${building.icon} <b>${building.name}</b> <span style="font-size:10px;color:var(--color-muted);">${building.description}</span>`;

      // 花费
      const costEl = document.createElement('div');
      costEl.style.cssText = 'font-size:10px;color:var(--color-muted);min-width:60px;';
      costEl.textContent = formatCost(building.cost);

      // 建造按钮
      const btn = document.createElement('button');
      btn.className = 'btn-pixel';
      btn.textContent = '建造';
      btn.style.cssText = 'font-size:11px;padding:4px 10px;min-width:auto;';

      const check = canBuild(building, resources, stars, totalWords);
      if (!check.ok) {
        btn.classList.add('disabled');
        btn.textContent = '🔒';
        btn.title = check.reason;
      }

      btn.onclick = () => {
        if (!check.ok) return;
        hide();
        onBuild?.(building);
      };

      row.append(info, costEl, btn);
      grid.appendChild(row);
    });
  }

  function formatCost(cost) {
    const icons = { gold: '🪙', wood: '🪵', stone: '🪨', food: '🌾' };
    return Object.entries(cost).map(([k, v]) => `${icons[k]}${v}`).join(' ');
  }

  // ─── 事件 ───
  closeBtn.onclick = hide;
  overlay.onclick = (e) => {
    if (e.target === overlay) hide();
  };

  function show() {
    render();
    overlay.style.display = 'block';
    overlay.classList.add('visible');
    requestAnimationFrame(() => panel.classList.add('open'));
  }

  function hide() {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    transition(AppState.IDLE);
  }

  return { element: overlay, show, hide, refresh: render };
}