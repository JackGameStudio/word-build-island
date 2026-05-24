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
  const buildDrawer = createBuildDrawer(
    assets, data.resources, data.vocabulary, island,
    (building) => {
      // 选择了建筑 → 进入预览模式（简化版：直接选空地放置）
      transition(AppState.PREVIEW);
      islandContainer.style.cursor = 'crosshair';

      const onClick = (e) => {
        if (island.wasPanning) { island.resetPanFlag(); return; }
        const rect = island.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const { x, y } = island.screenToGrid(sx, sy);

        if (!island.isInBounds(x, y) || island.isOccupied(x, y)) {
          toast.show('此处无法建造');
          return;
        }

        if (!canAfford(data.resources, building.cost)) {
          toast.show('资源不足');
          cleanup();
          return;
        }

        // 放置建筑
        data.resources = deductResources(data.resources, building.cost);
        island.addBuilding({
          id: building.id,
          name: building.name,
          icon: building.icon,
          spriteIndex: building.spriteIndex,
          x, y
        });
        data.island.buildings = island.getBuildings();

        resourceBar.update(data.resources, data.island.level);
        toast.show(`${building.icon} ${building.name} 建成！`);
        saveGameData(data);
        cleanup();
      };

      function cleanup() {
        island.canvas.removeEventListener('click', onClick);
        islandContainer.style.cursor = '';
        transition(AppState.IDLE);
      }

      island.canvas.addEventListener('click', onClick);
    }
  );
  app.appendChild(buildDrawer.element);

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