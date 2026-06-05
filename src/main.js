/**
 * main.js
 * Word Island Builder — 入口
 * preloadAssets → initDB → load → 挂载组件 → 游戏循环
 */

import { preloadAssets } from './core/asset-loader.js';
import { initDB, saveGameData, loadGameData } from './core/storage.js';
import { initVocabulary } from './core/vocab-engine.js';
import { tickIncome, tickIncomeWithBuffs, calculateOfflineIncome, mergeResources, deductResources, canAfford, formatElapsed, formatIncome, calculateCapacity, capResources } from './core/economy.js';
import { createIslandEngine } from './core/island-engine.js';
import { createPickupSystem } from './core/pickup-system.js';
import { createStarEconomy } from './core/star-economy.js';
import { createResourceBar } from './components/ResourceBar.js';
import { createVocabOverlay } from './components/VocabOverlay.js';
import { createBuildDrawer } from './components/BuildDrawer.js';
import { createTreasureChest } from './components/TreasureChest.js';
import { createSettingsPanel } from './components/SettingsPanel.js';
import { createRoadmapPanel } from './components/RoadmapPanel.js';
import { createToast } from './components/Toast.js';
import { createTutorialGuide } from './components/TutorialGuide.js';
import { transition, getState } from './core/state.js';
import { STARTING_RESOURCES, ECONOMY_TICK, CELL_SIZE, AppState, DEFAULT_ISLAND_TERRAIN } from './data/constants.js';
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
      island: { level: 1, buildings: [], terrainMap: structuredClone(DEFAULT_ISLAND_TERRAIN), lastOnline: Date.now() },
      stats: { streak: 0, lastActive: new Date().toISOString().split('T')[0],
               wordsCorrect: 0, tickIncomeCount: 0 },
      achievements: [],
      timeOffset: 0,
      roadmapRewards: { buildings: [], vocab: 0 }
    };
  }

  // 兼容旧存档
  if (!data.island.terrainMap) {
    data.island.terrainMap = structuredClone(DEFAULT_ISLAND_TERRAIN);
  }
  if (!data.stats.tickIncomeCount) data.stats.tickIncomeCount = 0;
  if (!data.achievements) data.achievements = [];
  if (!data.timeOffset) data.timeOffset = 0;
  if (!data.roadmapRewards) data.roadmapRewards = { buildings: [], vocab: 0 };

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

  // 星星经济
  const starEcon = createStarEconomy();
  if (data.starEcon) starEcon.loadState(data.starEcon);

  // ─── 有效时间（跳时间机制）───
  function getEffectiveNow() {
    return Date.now() + (data.timeOffset || 0);
  }
  function getEffectiveDate() {
    return new Date(getEffectiveNow()).toISOString().split('T')[0];
  }

  // ─── 全局星星激励动画 ───
  function animateStarReward(starCount) {
    const styleId = 'star-anim-style-' + Date.now();
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ${styleId}-fly {
        0%   { left:50%; top:50%; margin-left:-30px; margin-top:-30px; transform:scale(0.3); opacity:1; }
        15%  { left:50%; top:50%; margin-left:-30px; margin-top:-30px; transform:scale(1.1); opacity:1; }
        40%  { left:50%; top:50%; margin-left:-30px; margin-top:-30px; transform:scale(0.8); opacity:1; }
        55%  { left:50%; top:50%; margin-left:-30px; margin-top:-30px; transform:scale(0.3); opacity:1; }
        82%  { left:4%;  top:4%;  margin-left:-12px; margin-top:-12px; transform:scale(0.5); opacity:1; }
        100% { left:4%;  top:4%;  margin-left:-12px; margin-top:-12px; transform:scale(0.3); opacity:0; }
      }
    `;
    document.head.appendChild(style);

    const star = document.createElement('div');
    star.textContent = '⭐';
    star.style.cssText = `
      position:fixed; left:50%; top:50%; margin-left:-30px; margin-top:-30px;
      width:60px; height:60px;
      font-size:50px; line-height:60px; text-align:center;
      pointer-events:none; z-index:1001;
      filter: drop-shadow(0 0 12px #FFD700);
      animation: ${styleId}-fly 1400ms cubic-bezier(0.34,1.56,0.64,1) forwards;
    `;
    document.body.appendChild(star);
    star.addEventListener('animationend', () => {
      star.remove();
      style.remove();
    });

    // "+N" 飘字 — 飞到后才出现
    const plusText = document.createElement('span');
    plusText.textContent = `+${starCount}`;
    plusText.style.cssText = `
      position:fixed; left:4%; top:3%;
      font-size:22px; font-weight:900; color:#FFD700;
      pointer-events:none; z-index:1001;
      text-shadow: 0 0 8px rgba(0,0,0,0.7);
      opacity:0;
      animation: starPlusPopup 1200ms 900ms ease-out forwards;
    `;
    document.body.appendChild(plusText);

    if (!document.getElementById('star-plus-keyframes')) {
      const kfStyle = document.createElement('style');
      kfStyle.id = 'star-plus-keyframes';
      kfStyle.textContent = `
        @keyframes starPlusPopup {
          0%   { opacity:0; transform:translateY(15px) scale(0.4); }
          25%  { opacity:1; transform:translateY(0) scale(1.3); }
          70%  { opacity:1; transform:translateY(-15px) scale(1); }
          100% { opacity:0; transform:translateY(-45px) scale(0.7); }
        }
      `;
      document.head.appendChild(kfStyle);
    }

    plusText.addEventListener('animationend', () => plusText.remove());
  }

  // ─── Roadmap 里程碑奖励 ───
  const VOCAB_MILESTONES = [1, 10, 50, 100, 200, 500, 1000];

  function countLearned(vocab) {
    return (vocab || []).filter(w => w.learnedAt !== null).length;
  }

  function checkRoadmapRewards(buildingId) {
    let rewarded = false;
    // 建筑：首次建造该类型 → +1 ⭐
    if (buildingId && !data.roadmapRewards.buildings.includes(buildingId)) {
      data.roadmapRewards.buildings.push(buildingId);
      data.resources = mergeResources(data.resources, { star: 1 });
      rewarded = true;
    }
    // 词汇：跨过新里程碑 → +1 ⭐
    const learned = countLearned(data.vocabulary);
    const lastMilestone = data.roadmapRewards.vocab;
    for (const m of VOCAB_MILESTONES) {
      if (learned >= m && m > lastMilestone) {
        data.roadmapRewards.vocab = m;
        data.resources = mergeResources(data.resources, { star: 1 });
        rewarded = true;
      }
    }
    return rewarded;
  }

  // 拾取物系统
  const pickupSystem = createPickupSystem();
  if (data.pickupSystem) pickupSystem.loadState(data.pickupSystem);
  pickupSystem.setRockImage(assets.icons);
  // 每日刷新石材
  pickupSystem.trySpawn(getEffectiveDate(), data.island.buildings);
  pickupSystem.setRenderFn(() => island.render());

  const island = createIslandEngine(islandContainer, assets, pickupSystem);
  islandContainer.appendChild(island.canvas);
  // 迁移旧存档：没有 treeVariant 的树建筑随机补上
  for (const b of data.island.buildings) {
    if (b.id === 'tree' && b.treeVariant === undefined) {
      b.treeVariant = Math.floor(Math.random() * 7);
    }
  }
  island.setBuildings(data.island.buildings);
  island.setTerrainMap(data.island.terrainMap);
  island.render();

  // 动画循环 — 持续渲染以驱动拾取物动画
  (function animLoop() {
    island.render();
    requestAnimationFrame(animLoop);
  })();

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

  // 笔记式计数 — 背词过程中实时累加
  const onStarEarned = (count) => {
    data.resources = mergeResources(data.resources, { star: count });
    resourceBar.update(data.resources, data.island.level);
    animateStarReward(count);
  };

  // 背词覆盖层
  const vocabOverlay = createVocabOverlay(assets, data.vocabulary, (rewards, allSessionWords, sessionResults) => {
    // 基础奖励不立即合并，留给宝箱动画结束后统一处理
    if (rewards.star) data.stats.wordsCorrect = (data.stats.wordsCorrect || 0) + rewards.star;
    // 星星经济已由 VocabOverlay 逐题实时结算
    // Roadmap 里程碑奖励（词汇）
    if (checkRoadmapRewards(null)) {
      toast.show(`⭐ Roadmap 里程碑达成！+1 星星`);
      data.resources = mergeResources(data.resources, { star: 1 });
      resourceBar.update(data.resources, data.island.level);
      animateStarReward(1);
    }
    saveGameData(data);
    treasureChest.show(rewards, data.vocabulary);
  }, undefined, getEffectiveNow, onStarEarned, starEcon);
  vocabOverlay.setToast(toast);
  app.appendChild(vocabOverlay.element);

  // ─── 宝箱资源飞行动画 ───
  const RES_ICONS = { gold: '🪙', wood: '🪵', stone: '🪨', star: '⭐' };
  const RES_COLORS = { gold: '#FFD700', wood: '#CD853F', stone: '#A0A0A0', star: '#FFD700' };
  const CAPACITY_BUILDERS = { wood: '伐木场', gold: '小屋', stone: '采石场' };

  function animateRewardFly(rewards, onDone) {
    console.log('[animateRewardFly] rewards:', JSON.stringify(rewards));
    const entries = Object.entries(rewards).filter(([, v]) => v > 0);
    console.log('[animateRewardFly] entries:', entries);
    if (entries.length === 0) { onDone(); return; }

    let done = 0;
    const targets = { star: 6, gold: 17, wood: 43, stone: 60 };

    entries.forEach(([key, count], i) => {
      setTimeout(() => {
        const styleId = 'res-fly-' + Date.now() + '-' + i;
        const style = document.createElement('style');
        style.id = styleId;
        const targetLeft = targets[key] || 5;
        style.textContent = `
          @keyframes ${styleId}-fly {
            0%   { left:50%; top:50%; margin-left:-30px; margin-top:-30px; transform:scale(0.3); opacity:1; }
            15%  { left:50%; top:50%; margin-left:-30px; margin-top:-30px; transform:scale(1.1); opacity:1; }
            35%  { left:50%; top:50%; margin-left:-30px; margin-top:-30px; transform:scale(0.6); opacity:1; }
            55%  { left:${targetLeft}%; top:20%; margin-left:-12px; margin-top:-12px; transform:scale(0.7); opacity:1; }
            80%  { left:${targetLeft}%; top:4%; margin-left:-12px; margin-top:-12px; transform:scale(0.5); opacity:1; }
            100% { left:${targetLeft}%; top:4%; margin-left:-12px; margin-top:-12px; transform:scale(0.3); opacity:0; }
          }
        `;
        document.head.appendChild(style);

        const el = document.createElement('div');
        el.textContent = RES_ICONS[key] || '?';
        el.style.cssText = `
          position:fixed; left:50%; top:50%; margin-left:-30px; margin-top:-30px;
          width:60px; height:60px;
          font-size:50px; line-height:60px; text-align:center;
          pointer-events:none; z-index:1001;
          filter: drop-shadow(0 0 12px ${RES_COLORS[key] || '#fff'});
          animation: ${styleId}-fly 1400ms cubic-bezier(0.34,1.56,0.64,1) forwards;
        `;
        document.body.appendChild(el);

        // "+N" 飘字
        const plusEl = document.createElement('span');
        plusEl.textContent = `+${count}`;
        plusEl.style.cssText = `
          position:fixed; left:${targetLeft}%; top:3%;
          font-size:22px; font-weight:900; color:${RES_COLORS[key] || '#fff'};
          pointer-events:none; z-index:1001;
          text-shadow: 0 0 8px rgba(0,0,0,0.7);
          opacity:0;
          animation: starPlusPopup 1200ms 900ms ease-out forwards;
        `;
        document.body.appendChild(plusEl);

        el.addEventListener('animationend', () => {
          el.remove();
          style.remove();
        });
        plusEl.addEventListener('animationend', () => {
          plusEl.remove();
          done++;
          if (done >= entries.length) onDone();
        });
      }, i * 200);
    });
  }

  // ─── 宝箱系统 ───
  const treasureChest = createTreasureChest((rewards) => {
    console.log('[treasureChest onComplete] rewards:', JSON.stringify(rewards));
    animateRewardFly(rewards, () => {
      data.resources = mergeResources(data.resources, rewards);
      const { capped, overflow } = capResources(data.resources, calculateCapacity(data.island.buildings));
      data.resources = capped;
      resourceBar.update(data.resources, data.island.level);
      for (const [k, v] of Object.entries(overflow)) {
        const icon = RES_ICONS[k] || k;
        const bldName = CAPACITY_BUILDERS[k] || '';
        toast.show(`${icon} 容量已满，多建${bldName}扩容`, 2500);
      }
      saveGameData(data);
      // 新手引导 step 1：背完 5 词后触发
      if (!tutStep1Done) {
        const learned = data.vocabulary.filter(w => w.learnedAt !== null).length;
        if (learned >= 5) {
          tutStep1Done = true;
          setTimeout(() => tutorial.show(1), 600);
        }
      }
    });
  });
  app.appendChild(treasureChest.element);

  // ─── 设置面板 ───
  const settingsPanel = createSettingsPanel();
  settingsPanel.setOnTimeChange((newOffset) => {
    data.timeOffset = newOffset;
    saveGameData(data);
    toast.show('⏩ 已跳到下一天');
  });
  settingsPanel.setOnAddWords((count) => {
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      data.vocabulary.push({
        word: `test_${Date.now()}_${i}`,
        translation: `测试词${i}`,
        box: 1,
        learnedAt: now,
        nextReview: now + 86400000,
        reviewCount: 0
      });
    }
    saveGameData(data);
    toast.show(`📖 +${count} 测试词`);
  });
  app.appendChild(settingsPanel.element);

  // ─── 路线图面板 ───
  const roadmapPanel = createRoadmapPanel();
  app.appendChild(roadmapPanel.element);

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
    const buildable = island.isBuildableFor(previewBuilding.id, x, y);
    const affordable = canAfford(data.resources, previewBuilding.cost);
    const valid = inBounds && !occupied && buildable && affordable;
    island.setGhost(previewBuilding, x, y, valid);
  });

  const buildDrawer = createBuildDrawer(
    assets, () => data.resources, () => data.resources.star || 0, data.vocabulary, data.island.level, island,
    (building) => {
      // 选择建筑 → 进入预览模式
      transition(AppState.PREVIEW);
      // 树建筑预先生成随机变体用于 ghost 预览
      if (building.id === 'tree') {
        building._ghostVariant = Math.floor(Math.random() * 7);
      }
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

  // ─── 拾取物点击事件 ───
  pickupSystem.setOnPickup((reward) => {
    data.resources = mergeResources(data.resources, reward);
    resourceBar.update(data.resources, data.island.level);
    toast.show(`🪨 拾取石材 +${reward.stone}！`);
    saveGameData(data);
  });

  // ─── 岛屿点击（拾取物检测 + 建造放置）───
  island.canvas.addEventListener('click', (e) => {
    if (island.wasPanning) { island.resetPanFlag(); return; }

    const rect = island.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = island.screenToGrid(sx, sy);

    // 拾取物检测（非预览模式）
    if (getState() !== AppState.PREVIEW) {
      const hitItem = island.hitTestPickup(sx, sy);
      if (hitItem) {
        pickupSystem.pickup(hitItem.gx, hitItem.gy);
        return;
      }
    }

    if (getState() !== AppState.PREVIEW || !previewBuilding) return;

    if (!island.isInBounds(x, y) || island.isOccupied(x, y) || !island.isBuildableFor(previewBuilding.id, x, y)) {
      toast.show('此处无法建造');
      return;
    }

    if (!canAfford(data.resources, previewBuilding.cost)) {
      toast.show('资源不足');
      return;
    }

    // 放置
    data.resources = deductResources(data.resources, previewBuilding.cost);
    const newBuilding = {
      id: previewBuilding.id,
      name: previewBuilding.name,
      icon: previewBuilding.icon,
      spriteIndex: previewBuilding.spriteIndex,
      x, y
    };
    if (previewBuilding.id === 'tree') {
      newBuilding.treeVariant = previewBuilding._ghostVariant ?? Math.floor(Math.random() * 7);
      delete previewBuilding._ghostVariant;
    }
    island.addBuilding(newBuilding);
    data.island.buildings = island.getBuildings();

    // 新手引导 step 2：放下第一个建筑
    if (!tutStep2Done && data.island.buildings.length === 1) {
      tutStep2Done = true;
      setTimeout(() => tutorial.show(2), 800);
    }

    resourceBar.update(data.resources, data.island.level);
    toast.show(`${previewBuilding.icon} ${previewBuilding.name} 建成！`);
    // Roadmap 里程碑奖励
    if (checkRoadmapRewards(previewBuilding.id)) {
      toast.show(`⭐ Roadmap 里程碑达成！+1 星星`);
      resourceBar.update(data.resources, data.island.level);
      animateStarReward(1);
    }
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

  const roadmapBtn = document.createElement('button');
  roadmapBtn.className = 'btn-pixel';
  roadmapBtn.textContent = '🗺️ 星图';
  roadmapBtn.onclick = () => {
    roadmapPanel.show(data.island.buildings, data.vocabulary, data.resources.star || 0);
  };

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'btn-pixel';
  settingsBtn.textContent = '⚙️ 设置';
  settingsBtn.onclick = () => {
    settingsPanel.show(data.timeOffset);
  };

  buttonBar.append(vocabBtn, buildBtn, roadmapBtn, settingsBtn, resetBtn);
  app.appendChild(buttonBar);

  // ─── 新手引导（RPG 对话框 + 事件驱动，仅新游戏）───
  let tutorial = null;
  let tutStep1Done = true;
  let tutStep2Done = true;
  if (isNewGame) {
    tutorial = createTutorialGuide('/src/assets/images/IslandMaster.png',
      () => ({ vocabBtn, buildBtn, roadmapBtn })
    );
    tutStep1Done = false;
    tutStep2Done = false;
    setTimeout(() => tutorial.show(0), 800);
  }

  // ─── 5. 更新资源栏 ───
  resourceBar.update(data.resources, data.island.level);

  // ─── 6. 资源飞入动画 ───
  function animateTickIncome(buildingsWithIncome) {
    const bar = document.querySelector('.resource-bar');
    const barRect = bar?.getBoundingClientRect();
    const targetY = barRect ? barRect.top + barRect.height / 2 : 48;

    buildingsWithIncome.forEach(b => {
      const screen = island.gridToScreen(b.x, b.y);
      const canvasRect = island.canvas.getBoundingClientRect();
      const px = canvasRect.left + screen.x + CELL_SIZE / 2;
      const py = canvasRect.top + screen.y;

      const icons = { gold: '🪙', wood: '🪵', stone: '🪨', food: '🌾' };
      Object.entries(b.income).filter(([,v]) => v > 0).forEach(([res, val], idx) => {
        const el = document.createElement('span');
        el.textContent = `+${val}${icons[res] || res}`;
        const offsetY = idx * 16;
        const dy = targetY - (py + offsetY);
        el.style.cssText = `
          position:fixed; left:${px}px; top:${py + offsetY}px;
          font-size:14px; color:var(--color-correct);
          pointer-events:none; z-index:999;
        `;
        document.body.appendChild(el);
        const anim = el.animate([
          { opacity: 1, transform: 'scale(1) translate(0, 0)' },
          { opacity: 0, transform: `scale(0.3) translate(${idx * 16 - 8}px, ${dy}px)` }
        ], { duration: 1200, easing: 'ease-out', fill: 'forwards' });
        anim.onfinish = () => el.remove();
      });
    });
  }

  // ─── 7. 离线收入 + 打卡 ───
  // 打卡逻辑（使用有效日期）
  const today = getEffectiveDate();
  let streakReward = null;
  if (data.stats.lastActive !== today) {
    const yesterday = new Date(getEffectiveNow() - 86400000).toISOString().split('T')[0];
    if (data.stats.lastActive === yesterday) {
      data.stats.streak = (data.stats.streak || 0) + 1;
      // 连续打卡奖励
      const streak = data.stats.streak;
      if (streak >= 7) streakReward = { gold: 50, star: 2 };
      else if (streak >= 3) streakReward = { gold: 20, star: 1 };
      else streakReward = { gold: 5 };
    } else {
      data.stats.streak = 1;
      streakReward = { gold: 5 };
    }
    data.stats.lastActive = today;
    if (streakReward) {
      data.resources = mergeResources(data.resources, streakReward);
      resourceBar.update(data.resources, data.island.level);
    }
  }

  const totalOffline = Object.values(offlineIncome).reduce((s, v) => s + v, 0);
  if (totalOffline > 0) {
    const timeAgo = formatElapsed(oldLastOnline);
    const desc = formatIncome(offlineIncome);
    toast.show(`🕐 离线 ${timeAgo}\n收获: ${desc}`, 3000);
  }
  if (!isNewGame) {
    const rewardText = streakReward ? ` 奖励: ${formatIncome(streakReward)}` : '';
    toast.show(`🔥 连续打卡 ${data.stats.streak} 天！${rewardText}`, 2500);
  }

  // ─── 8. 被动收入 tick（含 Buff + 飞入动画）───
  setInterval(() => {
    const { income, breakdown } = tickIncomeWithBuffs(data.island.buildings, data.stats);
    if (Object.keys(income).length > 0) {
      data.resources = mergeResources(data.resources, income);
      const { capped, overflow } = capResources(data.resources, calculateCapacity(data.island.buildings));
      data.resources = capped;
      data.stats.tickIncomeCount = (data.stats.tickIncomeCount || 0) + 1;
      resourceBar.update(data.resources, data.island.level);
      for (const [k, v] of Object.entries(overflow)) {
        const icon = RES_ICONS[k] || k;
        const bldName = CAPACITY_BUILDERS[k] || '';
        toast.show(`${icon} 容量已满，多建${bldName}扩容`, 2500);
      }
      if (breakdown.length > 0) animateTickIncome(breakdown);
      updateLevel();
    }
  }, ECONOMY_TICK);

  // ─── 9. 自动存档（30s）───
  setInterval(() => {
    data.island.buildings = island.getBuildings();
    data.island.lastOnline = Date.now();
    data.pickupSystem = pickupSystem.getState();
    data.starEcon = starEcon.getState();
    saveGameData(data);
  }, 30000);

  console.log('Word Island Builder ready', data);
}

bootstrap().catch(err => {
  document.getElementById('app').innerHTML = `<div style="padding:40px;color:red">启动失败: ${err.message}</div>`;
  console.error('Bootstrap failed:', err);
});