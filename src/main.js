/**
 * main.js
 * Word Island Builder — 入口
 * preloadAssets → initDB → load → 挂载组件 → 游戏循环
 */

import { preloadAssets } from './core/asset-loader.js';
import { initDB, saveGameData, loadGameData } from './core/storage.js';
import { initVocabulary } from './core/vocab-engine.js';
import { tickIncome, tickIncomeWithBuffs, calculateOfflineIncome, mergeResources, deductResources, canAfford, formatElapsed, formatIncome } from './core/economy.js';
import { createIslandEngine } from './core/island-engine.js';
import { createResourceBar } from './components/ResourceBar.js';
import { createVocabOverlay } from './components/VocabOverlay.js';
import { createBuildDrawer } from './components/BuildDrawer.js';
import { createToast } from './components/Toast.js';
import { transition, getState } from './core/state.js';
import { STARTING_RESOURCES, ECONOMY_TICK, CELL_SIZE, AppState } from './data/constants.js';
import { getBuildingById, countLearnedWords } from './data/buildings.js';
import { checkAchievements } from './data/achievements.js';

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
      stats: { streak: 0, lastActive: new Date().toISOString().split('T')[0],
               wordsCorrect: 0, tickIncomeCount: 0 },
      achievements: []
    };
  }

  // 兼容旧存档
  if (!data.stats.wordsCorrect) data.stats.wordsCorrect = 0;
  if (!data.stats.tickIncomeCount) data.stats.tickIncomeCount = 0;
  if (!data.achievements) data.achievements = [];

  // ─── 2. 离线收入结算 ───
  const oldLastOnline = data.island.lastOnline || Date.now();
  let offlineIncome = {};
  if (!isNewGame && oldLastOnline) {
    offlineIncome = calculateOfflineIncome(data.island.buildings, oldLastOnline);
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

  // ─── 等级计算 ───
  function calcLevel() {
    const stars = data.resources.star || 0;
    const bCount = data.island.buildings.length;
    return Math.floor(stars / 5) + Math.floor(bCount / 2) + 1;
  }

  function updateLevel() {
    const newLevel = calcLevel();
    if (newLevel > data.island.level) {
      data.island.level = newLevel;
      buildDrawer.setLevel(newLevel);
      toast.show(`🎉 岛屿升级！Lv.${newLevel}`, 2500);
      resourceBar.update(data.resources, data.island.level);
    }
  }

  // ─── 成就检查 ───
  function checkAchievementsForStats() {
    const stats = {
      buildings: data.island.buildings.length,
      wordsCorrect: data.stats.wordsCorrect,
      tickIncomeCount: data.stats.tickIncomeCount
    };
    const newAchs = checkAchievements(stats, data.achievements);
    newAchs.forEach(a => {
      data.achievements.push(a.id);
      toast.show(`${a.icon} 成就解锁: ${a.name}！\n${a.desc}`, 3000);
      if (a.reward) {
        data.resources = mergeResources(data.resources, a.reward);
        resourceBar.update(data.resources, data.island.level);
      }
    });
    updateLevel();
  }

  // 背词覆盖层
  const vocabOverlay = createVocabOverlay(assets, data.vocabulary, (rewards) => {
    data.resources = mergeResources(data.resources, rewards);
    resourceBar.update(data.resources, data.island.level);
    // 统计答对数（rewards 里的 star 来自正确答题）
    if (rewards.star) data.stats.wordsCorrect = (data.stats.wordsCorrect || 0) + 1;
    checkAchievementsForStats();
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
    if (getState() === AppState.PREVIEW) transition(AppState.IDLE);
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
    assets, () => data.resources, data.vocabulary, data.island.level, island,
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
    checkAchievementsForStats();
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

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-pixel';
  resetBtn.textContent = '🔧 重置';
  resetBtn.style.cssText = 'background-image:url("/src/assets/images/btn-hover.png");font-size:10px;';
  resetBtn.onclick = async () => {
    if (!confirm('清除所有存档数据，重新开始？')) return;
    const { clearDB } = await import('./core/storage.js');
    await clearDB();
    location.reload();
  };
  resetBtn.ondblclick = async () => {
    // 双击 = 直接重置（跳过确认）
    const { clearDB } = await import('./core/storage.js');
    await clearDB();
    location.reload();
  };

  buttonBar.append(vocabBtn, buildBtn, resetBtn);
  app.appendChild(buttonBar);

  // ─── 5. 更新资源栏 ───
  resourceBar.update(data.resources, data.island.level);

  // ─── 6. 资源飞入动画 ───
  function animateTickIncome(buildingsWithIncome) {
    buildingsWithIncome.forEach(b => {
      const screen = island.gridToScreen(b.x, b.y);
      const canvasRect = island.canvas.getBoundingClientRect();
      const px = canvasRect.left + screen.x + CELL_SIZE / 2;
      const py = canvasRect.top + screen.y;

      Object.entries(b.income).forEach(([res, val]) => {
        const el = document.createElement('span');
        const icons = { gold: '🪙', wood: '🪵', stone: '🪨', food: '🌾' };
        el.textContent = `+${val}${icons[res] || res}`;
        el.style.cssText = `
          position:fixed; left:${px}px; top:${py}px;
          font-size:14px; color:var(--color-correct);
          pointer-events:none; z-index:999;
          animation: fly-to-bar 1.2s ease-out forwards;
        `;
        document.body.appendChild(el);
        el.addEventListener('animationend', () => el.remove());
      });
    });
  }

  // ─── 7. 离线收入 + 打卡 ───
  // 打卡逻辑
  const today = new Date().toISOString().split('T')[0];
  if (data.stats.lastActive !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (data.stats.lastActive === yesterday) {
      data.stats.streak = (data.stats.streak || 0) + 1;
    } else {
      data.stats.streak = 1;
    }
    data.stats.lastActive = today;
  }

  const totalOffline = Object.values(offlineIncome).reduce((s, v) => s + v, 0);
  if (totalOffline > 0) {
    const timeAgo = formatElapsed(oldLastOnline);
    const desc = formatIncome(offlineIncome);
    toast.show(`🕐 离线 ${timeAgo}\n收获: ${desc}`, 3000);
  }
  if (!isNewGame) {
    toast.show(`🔥 连续打卡 ${data.stats.streak} 天！`, 2000);
  }

  // ─── 8. 被动收入 tick（含 Buff + 飞入动画）───
  setInterval(() => {
    const { income, breakdown } = tickIncomeWithBuffs(data.island.buildings, data.stats);
    if (Object.keys(income).length > 0) {
      data.resources = mergeResources(data.resources, income);
      data.stats.tickIncomeCount = (data.stats.tickIncomeCount || 0) + 1;
      resourceBar.update(data.resources, data.island.level);
      if (breakdown.length > 0) animateTickIncome(breakdown);
      updateLevel();
    }
  }, ECONOMY_TICK);

  // ─── 9. 自动存档（30s）───
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