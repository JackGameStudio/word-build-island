/**
 * BarracksPanel.js
 * 兵营招募面板 — 点击兵营弹出
 */

import { getBuildingById } from '../data/buildings.js';

export function createBarracksPanel(container, callbacks) {
  const { onRecruit, onDemolish, onClose } = callbacks;

  const panel = document.createElement('div');
  panel.style.cssText = `
    position:absolute; bottom:60px; left:50%; transform:translateX(-50%);
    width:260px; padding:12px;
    background:var(--color-surface); border:2px solid #555;
    z-index:25; font-size:11px; display:none;
  `;

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span><b id="bp-title"></b></span>
      <button id="bp-close" style="background:none;border:none;color:#999;cursor:pointer;font-size:14px;">✕</button>
    </div>
    <div id="bp-soldier-info" style="margin-bottom:8px;color:#aaa;"></div>
    <div style="display:flex;gap:8px;">
      <button id="bp-recruit" class="btn-pixel" style="flex:1;font-size:11px;padding:6px 10px;"></button>
      <button id="bp-demolish" class="btn-pixel" style="font-size:11px;padding:6px 10px;border-color:#e55;">拆除</button>
    </div>
    <div id="bp-queue" style="margin-top:6px;font-size:10px;color:#facc15;display:none;"></div>
  `;

  container.appendChild(panel);

  let currentBuilding = null;
  let currentIndex = -1;
  let trainingQueue = []; // { soldierId, remainingTicks }

  const titleEl = panel.querySelector('#bp-title');
  const infoEl = panel.querySelector('#bp-soldier-info');
  const recruitBtn = panel.querySelector('#bp-recruit');
  const demolishBtn = panel.querySelector('#bp-demolish');
  const closeBtn = panel.querySelector('#bp-close');
  const queueEl = panel.querySelector('#bp-queue');

  closeBtn.onclick = () => {
    panel.style.display = 'none';
    onClose?.();
  };

  demolishBtn.onclick = () => {
    panel.style.display = 'none';
    onDemolish?.(currentBuilding, currentIndex);
  };

  recruitBtn.onclick = () => {
    if (!currentBuilding) return;
    onRecruit?.(currentBuilding, currentIndex);
  };

  function getTierStats(building) {
    const def = getBuildingById('barracks');
    if (!def?.tierLevels) return null;
    const lvl = building?.level || 1;
    return def.tierLevels.find(t => t.level === lvl) || def.tierLevels[0];
  }

  function update(building, index, soldiers) {
    currentBuilding = building;
    currentIndex = index;
    const tier = getTierStats(building);
    if (!tier) return;

    const barrackSoldiers = soldiers.filter(s => s.barrackId === building.id && s.alive);
    const count = barrackSoldiers.length;
    const cap = tier.capacity;

    titleEl.textContent = `⚔️ 兵营 Lv.${building.level || 1}`;
    infoEl.textContent = `士兵：${count} / ${cap}  |  ATK ${tier.soldierATK}  HP ${tier.soldierHP}`;
    recruitBtn.textContent = `招募 (${tier.recruitGold}金)`;
    recruitBtn.disabled = count >= cap;

    const trainingCount = trainingQueue.filter(t => !t.done).length;
    queueEl.style.display = trainingCount > 0 ? 'block' : 'none';
    if (trainingCount > 0) {
      queueEl.textContent = `训练中… 剩余 ${trainingCount} tick`;
    }

    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
  }

  function hide() {
    panel.style.display = 'none';
  }

  return { update, hide, panel };
}
