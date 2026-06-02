/**
 * BuildDrawer.js
 * 底部建造抽屉 — 九宫格面板 + 建筑列表 + 解锁/灰显
 */

import { BUILDINGS, canBuild, countLearnedWords } from '../data/buildings.js';
import { canAfford } from '../core/economy.js';
import { getState, transition } from '../core/state.js';
import { AppState } from '../data/constants.js';

export function createBuildDrawer(assets, getResources, getStars, vocab, islandLevel, island, onBuild) {
  let localLevel = islandLevel;
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
  titleEl.textContent = `建造  Lv.${localLevel}`;

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-pixel';
  closeBtn.textContent = '✕ 关闭';
  closeBtn.style.cssText = 'margin-top:8px;width:100%;font-size:12px;';

  panel.append(titleEl, grid, closeBtn);
  overlay.appendChild(panel);

  // ─── 渲染建筑列表 ───
  const COST_ICONS = { gold: '🪙', wood: '🪵', stone: '🪨' };

  function render() {
    totalWords = countLearnedWords(vocab);
    const stars = getStars ? getStars() : 0;
    grid.innerHTML = '';

    BUILDINGS.forEach(building => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';;

      // 图标 + 名称 + ⭐需求
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const lvTag = building.levelRequired > 1 ? ` <span style="font-size:9px;color:#fbbf24;">Lv.${building.levelRequired}</span>` : '';
      const costTag = Object.entries(building.cost).filter(([,v]) => v > 0).map(([k,v]) => `<span style="font-size:9px;color:#e2e8f0;">${COST_ICONS[k]}${v}</span>`).join('');
      const wordTag = building.wordRequired > 0 ? ` <span style="font-size:9px;color:#fbbf24;">📖${building.wordRequired}</span>` : '';
      const starTag = building.starRequired > 0 ? ` <span style="font-size:9px;color:#fbbf24;">⭐${building.starRequired}</span>` : '';
      info.innerHTML = `${building.icon} <b>${building.name}</b>${lvTag} ${costTag}${wordTag}${starTag} <span style="font-size:10px;color:var(--color-muted);">${building.description}</span>`;

      // 建造按钮
      const btn = document.createElement('button');
      btn.className = 'btn-pixel';
      btn.textContent = '建造';
      btn.style.cssText = 'font-size:11px;padding:4px 10px;min-width:auto;';

      const check = canBuild(building, getResources(), localLevel, totalWords, stars);
      if (!check.ok) {
        btn.classList.add('disabled');
        // 资源不足 → 显示缺什么；等级/词不足 → 显示 🔒
        if (check.reason === '资源不足') {
          const missing = Object.entries(building.cost)
            .filter(([res, cost]) => (getResources()[res] || 0) < cost)
            .map(([res]) => res === 'gold' ? '🪙' : res === 'wood' ? '🪵' : res === 'stone' ? '🪨' : res)
            .join('');
          btn.textContent = `缺${missing}`;
        } else {
          btn.textContent = '🔒';
        }
        btn.title = check.reason;
      }

      btn.onclick = () => {
        if (!check.ok) return;
        hide(true);
        onBuild?.(building);
      };

      row.append(info, btn);
      grid.appendChild(row);
    });
  }

  function setLevel(lv) { localLevel = lv; titleEl.textContent = `建造  Lv.${lv}`; }

  // ─── 事件 ───
  closeBtn.onclick = () => hide();
  overlay.onclick = (e) => {
    if (e.target === overlay) hide();
  };

  function show() {
    render();
    overlay.style.display = 'block';
    overlay.classList.add('visible');
    requestAnimationFrame(() => panel.classList.add('open'));
  }

  function hide(skipTransition = false) {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    if (!skipTransition) transition(AppState.IDLE);
  }

  return { element: overlay, show, hide, refresh: render, setLevel };
}