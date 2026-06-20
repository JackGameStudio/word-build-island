/**
 * BuildDrawer.js
 * 底部建造抽屉 — 九宫格面板 + 建筑列表 + 解锁/灰显 + 可升级建筑升级入口
 */

import { BUILDINGS, canBuild, countLearnedWords, getBuildingById, upgradeCost } from '../data/buildings.js';
import { canAfford } from '../core/economy.js';
import { getState, transition } from '../core/state.js';
import { AppState } from '../data/constants.js';

export function createBuildDrawer(assets, getResources, getStars, vocab, islandLevel, island, getBuildings, onBuild, onUpgrade) {
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
    const resources = getResources();
    const placed = getBuildings();
    grid.innerHTML = '';

    BUILDINGS.forEach(building => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;';

      // 已放置数量统计（用于可重复建造 / 可升级建筑）
      const placedCount = placed.filter(b => b.id === building.id).length;

      // 图标 + 名称 + 需求标签
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const lvTag = building.levelRequired > 1
        ? ` <span style="font-size:9px;color:#fbbf24;">Lv.${building.levelRequired}</span>` : '';
      const costTag = Object.entries(building.cost)
        .filter(([,v]) => v > 0)
        .map(([k,v]) => `<span style="font-size:9px;color:#e2e8f0;">${COST_ICONS[k]}${v}</span>`).join('');
      const wordTag = building.wordRequired > 0
        ? ` <span style="font-size:9px;color:#fbbf24;">📖${building.wordRequired}</span>` : '';
      const starTag = building.starRequired > 0
        ? ` <span style="font-size:9px;color:#fbbf24;">⭐${building.starRequired}</span>` : '';
      const countTag = placedCount > 0
        ? ` <span style="font-size:10px;color:#a78bfa;">×${placedCount}</span>` : '';
      info.innerHTML = `${building.icon} <b>${building.name}</b>${lvTag} ${costTag}${wordTag}${starTag}${countTag} <span style="font-size:10px;color:var(--color-muted);">${building.description}</span>`;

      // ── 按钮区域 ──
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';

      // 建造按钮
      const buildBtn = document.createElement('button');
      buildBtn.className = 'btn-pixel';
      buildBtn.style.cssText = 'font-size:11px;padding:4px 10px;min-width:auto;';

      const check = canBuild(building, resources, localLevel, totalWords, stars, placed);
      if (!check.ok) {
        buildBtn.classList.add('disabled');
        if (check.reason === '资源不足') {
          const missing = Object.entries(building.cost)
            .filter(([res, cost]) => (resources[res] || 0) < cost)
            .map(([res]) => COST_ICONS[res] || res)
            .join('');
          buildBtn.textContent = `缺${missing}`;
        } else {
          buildBtn.textContent = '🔒';
        }
        buildBtn.title = check.reason;
      } else {
        buildBtn.textContent = '建造';
      }

      buildBtn.onclick = () => {
        if (!check.ok) return;
        hide(true);
        onBuild?.(building);
      };

      btnRow.appendChild(buildBtn);

      // 升级按钮（仅可升级且已放置的建筑）
      if (building.upgradeable && placedCount > 0) {
        // 取第一个已放置实例的等级
        const placedInstance = placed.find(b => b.id === building.id);
        const currentLv = placedInstance?.level || 1;
        const cost = upgradeCost(building, currentLv);

        if (cost) {
          const upgradeBtn = document.createElement('button');
          upgradeBtn.className = 'btn-pixel';
          upgradeBtn.style.cssText = 'font-size:11px;padding:4px 10px;min-width:auto;background:#7c3aed;';
          upgradeBtn.textContent = `Lv${currentLv}→${currentLv + 1}`;

          const canUpgrade = canAfford(resources, cost);
          if (!canUpgrade) {
            upgradeBtn.classList.add('disabled');
            upgradeBtn.title = '资源不足';
          }

          upgradeBtn.onclick = () => {
            if (!canUpgrade) return;
            onUpgrade?.(placedInstance.id, cost, currentLv + 1);
          };

          btnRow.appendChild(upgradeBtn);
        }
      }

      row.append(info, btnRow);
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