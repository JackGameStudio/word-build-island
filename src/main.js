/**
 * main.js
 * Word Island Builder — 入口
 * preloadAssets → initDB → load → 挂载组件 → 游戏循环
 */

import { preloadAssets } from './core/asset-loader.js';
import { initDB, saveGameData, loadGameData } from './core/storage.js';
import { initVocabulary } from './core/vocab-engine.js';
import { tickIncome, calculateOfflineIncome, mergeResources, deductResources, canAfford } from './core/economy.js';
import { createIslandEngine } from './core/island-engine.js';
import { createResourceBar } from './components/ResourceBar.js';
import { createVocabOverlay } from './components/VocabOverlay.js';
import { createBuildDrawer } from './components/BuildDrawer.js';
import { createToast } from './components/Toast.js';
import { transition, getState } from './core/state.js';
import { STARTING_RESOURCES, ECONOMY_TICK, AppState } from './data/constants.js';
import { getBuildingById, countLearnedWords } from './data/buildings.js';

async function bootstrap() {
  // ─── 0. 预加载图片 ───
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;font-size:14px;';
  loadingEl.textContent = '加载中...';
  document.getElementById('app').appendChild(loadingEl);

  const assets = await preloadAssets(p => {
    loadingEl.textContent = `加载中... ${Math.round(p * 100)}%`;
  });

  // ─── 1. 加载/初始化数据 ───
  await initDB();
  let data = await loadGameData();

  const isNewGame = !data;

  if (isNewGame) {
    data = {
      resources: { ...STARTING_RESOURCES },
      vocabulary: initVocabulary(),
      island: { level: 1, buildings: [], lastOnline: Date.now() },
      stats: { streak: 0, lastActive: new Date().toISOString().split('T')[0] }
    };
  }

  // ─── 2. 离线收入结算 ───
  let offlineIncome = {};
  if (!isNewGame && data.island.lastOnline) {
    offlineIncome = calculateOfflineIncome(data.island.buildings, data.island.lastOnline);
    data.resources = mergeResources(data.resources, offlineIncome);
  }
  data.island.lastOnline = Date.now();

  // ─── 3. 清理 loading + 构建 UI ───
  loadingEl.remove();

  const app = document.getElementById('app');
  const toast = createToast();

  // 资源栏
  const resourceBar = createResourceBar(assets);
  app.appendChild(resourceBar.element);

  // 岛屿 Canvas
  const islandContainer = document.createElement('div');
  islandContainer.className = 'island-container';
  app.appendChild(islandContainer);

  const island = createIslandEngine(islandContainer, assets);
  islandContainer.appendChild(island.canvas);
  island.setBuildings(data.island.buildings);
  island.render();

  // 背词覆盖层
  const vocabOverlay = createVocabOverlay(assets, data.vocabulary, (rewards) => {
    data.resources = mergeResources(data.resources, rewards);
    resourceBar.update(data.resources, data.island.level);
    saveGameData(data);
  });
  vocabOverlay.setToast(toast);
  app.appendChild(vocabOverlay.element);

  // 建造抽屉
  // ─── 预览模式状态 ───
  let previewBuilding = null;
  let cancelBarEl = null;

  // 浮动取消栏（幽灵预览时显示）
  function showCancelBar(building) {
    if (!cancelBarEl) {
      cancelBarEl = document.createElement('div');
      cancelBarEl.style.cssText = `
        position:absolute; bottom:60px; left:50%; transform:translateX(-50%);
        display:flex; gap:8px; padding:8px 16px;
        background:var(--color-surface); border:2px solid #555;
        z-index:25; font-size:11px;
      `;
    }
    cancelBarEl.innerHTML = `
      <span>${building.icon} ${building.name} — 点击地图放置</span>
      <button class="btn-pixel" id="cancel-build" style="font-size:11px;padding:2px 8px;min-width:auto;">✕ 取消</button>
    `;
    islandContainer.appendChild(cancelBarEl);
    cancelBarEl.querySelector('#cancel-build').onclick = cancelPreview;
    cancelBarEl.style.display = 'flex';
  }

  function hideCancelBar() {
    if (cancelBarEl) cancelBarEl.style.display = 'none';
  }

  function cancelPreview() {
    previewBuilding = null;
    island.clearGhost();
    islandContainer.style.cursor = '';
    hideCancelBar();
    transition(AppState.IDLE);
  }

  // 幽灵预览 — 鼠标/触摸跟随
  island.canvas.addEventListener('pointermove', (e) => {
    if (getState() !== AppState.PREVIEW || !previewBuilding) return;
    const rect = island.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = island.screenToGrid(sx, sy);
    const inBounds = island.isInBounds(x, y);
    const occupied = island.isOccupied(x, y);
    const affordable = canAfford(data.resources, previewBuilding.cost);
    const valid = inBounds && !occupied && affordable;
    island.setGhost(previewBuilding, x, y, valid);
  });

  const buildDrawer = createBuildDrawer(
    assets, data.resources, data.vocabulary, island,
    (building) => {
      // 选择建筑 → 进入预览模式
      transition(AppState.PREVIEW);
      previewBuilding = building;
      islandContainer.style.cursor = 'none';
      showCancelBar(building);

      // 立即渲染初始幽灵（位置在屏幕中心）
      const center = island.screenToGrid(
        islandContainer.clientWidth / 2,
        islandContainer.clientHeight / 2
      );
      island.setGhost(building, center.x, center.y, island.isInBounds(center.x, center.y));
    }
  );
  app.appendChild(buildDrawer.element);

  // ─── 放置建筑（点击事件）───
  island.canvas.addEventListener('click', (e) => {
    if (getState() !== AppState.PREVIEW || !previewBuilding) return;
    if (island.wasPanning) { island.resetPanFlag(); return; }

    const rect = island.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = island.screenToGrid(sx, sy);

    if (!island.isInBounds(x, y) || island.isOccupied(x, y)) {
      toast.show('此处无法建造');
      return;
    }

    if (!canAfford(data.resources, previewBuilding.cost)) {
      toast.show('资源不足');
      return;
    }

    // 放置
    data.resources = deductResources(data.resources, previewBuilding.cost);
    island.addBuilding({
      id: previewBuilding.id,
      name: previewBuilding.name,
      icon: previewBuilding.icon,
      spriteIndex: previewBuilding.spriteIndex,
      x, y
    });
    data.island.buildings = island.getBuildings();

    resourceBar.update(data.resources, data.island.level);
    toast.show(`${previewBuilding.icon} ${previewBuilding.name} 建成！`);
    saveGameData(data);

    cancelPreview();
  });

  // ESC 取消
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && getState() === AppState.PREVIEW) {
      cancelPreview();
    }
  });

  // ─── 4. 底部按钮栏 ───
  const buttonBar = document.createElement('div');
  buttonBar.style.cssText = `
    display:flex; gap:8px; padding:8px 16px;
    background:var(--color-surface);
    border-top:2px solid #444;
    flex-shrink:0; z-index:10;
  `;

  const vocabBtn = document.createElement('button');
  vocabBtn.className = 'btn-pixel';
  vocabBtn.textContent = '📖 背词';
  vocabBtn.onclick = () => {
    if (transition(AppState.VOCAB)) vocabOverlay.show();
  };

  const buildBtn = document.createElement('button');
  buildBtn.className = 'btn-pixel';
  buildBtn.textContent = '🏗️ 建造';
  buildBtn.onclick = () => {
    if (transition(AppState.BUILD)) {
      buildDrawer.refresh();
      buildDrawer.show();
    }
  };

  buttonBar.append(vocabBtn, buildBtn);
  app.appendChild(buttonBar);

  // ─── 5. 更新资源栏 ───
  resourceBar.update(data.resources, data.island.level);

  // ─── 6. 离线收入 Toast ───
  const totalOffline = Object.values(offlineIncome).reduce((s, v) => s + v, 0);
  if (totalOffline > 0) {
    const icons = { gold: '🪙', wood: '🪵', stone: '🪨', food: '🌾' };
    const desc = Object.entries(offlineIncome)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${icons[k] || k}+${v}`)
      .join(' ');
    toast.show(`欢迎回来！离线获得 ${desc}`);
  }

  // ─── 7. 被动收入 tick ───
  setInterval(() => {
    const income = tickIncome(data.island.buildings);
    if (Object.keys(income).length > 0) {
      data.resources = mergeResources(data.resources, income);
      resourceBar.update(data.resources, data.island.level);
    }
  }, ECONOMY_TICK);

  // ─── 8. 自动存档（30s）───
  setInterval(() => {
    data.island.buildings = island.getBuildings();
    data.island.lastOnline = Date.now();
    saveGameData(data);
  }, 30000);

  console.log('Word Island Builder ready', data);
}

bootstrap().catch(err => {
  document.getElementById('app').innerHTML = `<div style="padding:40px;color:red">启动失败: ${err.message}</div>`;
  console.error('Bootstrap failed:', err);
});