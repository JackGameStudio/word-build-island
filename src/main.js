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
import { createDailyTasksPanel } from './components/DailyTasksPanel.js';
import { createStreakPanel, STREAK_MILESTONES } from './components/StreakPanel.js';
import { createPirateWarning } from './components/PirateWarning.js';
import { createBarracksPanel } from './ui/BarracksPanel.js';
import { pirateActivationCheck, spawnWave, movePirates, combatTick, checkDestruction, processWaveEnd, getPirateState, spawnShips, moveShips, disembarkShip } from './core/pirate-engine.js';
import { getDailyTasks, createTaskTracker, getTaskById, checkTaskComplete } from './data/tasks.js';
import { transition, getState } from './core/state.js';
import { STARTING_RESOURCES, ECONOMY_TICK, CELL_SIZE, AppState, DEFAULT_ISLAND_TERRAIN, TERRAIN, SOLDIER_BARRACKS_MAX_DIST, PIRATE_EVENT } from './data/constants.js';
import { getBuildingById, countLearnedWords, getUpgradeStats } from './data/buildings.js';
import { createNpcEngine } from './core/npc-engine.js';
import { createNpcQuestPanel } from './components/NpcQuestPanel.js';
import { play as playSound } from './core/sound.js';

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
               wordsCorrect: 0, tickIncomeCount: 0, streakMilestonesClaimed: [] },
      achievements: [],
      timeOffset: 0,
      roadmapRewards: { buildings: [], vocab: 0 },
      dailyTasks: { date: '', taskIds: [], progress: createTaskTracker().progress, claimed: [] },
      pirateState: { phase: 'idle', wave: 0, pirates: [], soldiers: [], towers: [], ships: [], waveTimer: 0 },
      soldiers: []
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
  if (!data.dailyTasks) {
    data.dailyTasks = { date: '', taskIds: [], progress: createTaskTracker().progress, claimed: [] };
  }
  if (!data.dailyTasks.progress) data.dailyTasks.progress = createTaskTracker().progress;
  if (!data.dailyTasks.claimed) data.dailyTasks.claimed = [];
  // 兼容旧存档：streakMilestonesClaimed
  if (!data.stats.streakMilestonesClaimed) {
    data.stats.streakMilestonesClaimed = [];
    // 已有存档：自动标记已达成的里程碑，避免旧自动奖励与新系统重复
    if (!isNewGame) {
      STREAK_MILESTONES.forEach(ms => {
        if (data.stats.streak >= ms.day) {
          data.stats.streakMilestonesClaimed.push(ms.day);
        }
      });
    }
  }
  // 兼容旧存档：NPC 系统
  if (!data.npcs) data.npcs = [];
  // 兼容旧存档：海盗系统
  if (!data.pirateState) data.pirateState = { phase: 'idle', wave: 0, pirates: [], soldiers: [], towers: [], ships: [], projectiles: [], vfx: [], waveTimer: 0 };
  if (!data.soldiers) data.soldiers = [];

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

  // ─── 打卡里程碑领取（提前定义，供 StreakPanel 回调使用）───
  function claimMilestoneReward(day) {
    const ms = STREAK_MILESTONES.find(m => m.day === day);
    if (!ms) return false;
    if (data.stats.streakMilestonesClaimed.includes(day)) return false;
    if (data.stats.streak < day) return false;
    data.resources = mergeResources(data.resources, ms.reward);
    data.stats.streakMilestonesClaimed.push(day);
    resourceBar.update(data.resources, data.island.level);
    saveGameData(data);
    return true;
  }

  // ─── 领取奖励飞入动画 ───
  function animateClaimFly(rewards, sourceEl) {
    try {
      const entries = Object.entries(rewards).filter(([, v]) => v > 0);
      if (entries.length === 0) return;

      const ICON_MAP = { gold: '🪙', star: '⭐', wood: '🪵', stone: '🪨', food: '🌾' };

      // 获取资源栏中各 icon 的位置映射（通过 data-res 属性）
      const targetMap = {};
      document.querySelectorAll('.resource-bar [data-res]').forEach(el => {
        targetMap[el.dataset.res] = el;
      });

      const sourceRect = sourceEl.getBoundingClientRect();
      const startX = sourceRect.left + sourceRect.width / 2;
      const startY = sourceRect.top + sourceRect.height / 2;

      entries.forEach(([key, count], i) => {
        setTimeout(() => {
          const targetCanvas = targetMap[key];
          let targetX = startX;
          let targetY = startY - 60;

          if (targetCanvas) {
            const targetRect = targetCanvas.getBoundingClientRect();
            targetX = targetRect.left + targetRect.width / 2;
            targetY = targetRect.top + targetRect.height / 2;
          }

          const el = document.createElement('span');
          el.textContent = ICON_MAP[key] || key;
          el.style.cssText = `
            position:fixed; left:${startX}px; top:${startY}px;
            font-size:20px; pointer-events:none; z-index:9999;
            opacity:1; transform:translate(-50%,-50%);
            transition: all 600ms cubic-bezier(0.25,0.46,0.45,0.94);
          `;
          document.body.appendChild(el);

          requestAnimationFrame(() => {
            el.style.left = `${targetX}px`;
            el.style.top = `${targetY}px`;
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%,-50%) scale(0.3)';
          });

          el.addEventListener('transitionend', () => el.remove(), { once: true });
        }, i * 80);
      });
    } catch (e) {
      console.warn('animateClaimFly failed:', e);
    }
  }

  // ─── 每日任务 ───
  function updateDailyProgress(delta) {
    Object.entries(delta).forEach(([k, v]) => {
      data.dailyTasks.progress[k] = (data.dailyTasks.progress[k] || 0) + v;
    });
    dailyTasksPanel.update(data.dailyTasks.taskIds, data.dailyTasks.progress, data.dailyTasks.claimed);
  }

  function refreshDailyTasks() {
    const todayStr = getEffectiveDate();
    if (data.dailyTasks.date !== todayStr) {
      const prev = { date: data.dailyTasks.date, taskIds: data.dailyTasks.taskIds };
      const fresh = getDailyTasks(todayStr, prev);
      data.dailyTasks.date = fresh.date;
      data.dailyTasks.taskIds = fresh.taskIds;
      data.dailyTasks.progress = createTaskTracker().progress;
      data.dailyTasks.claimed = [];
      saveGameData(data);
      playSound('daily_refresh');
    }
  }
  refreshDailyTasks();

  const dailyTasksPanel = createDailyTasksPanel();
  dailyTasksPanel.update(data.dailyTasks.taskIds, data.dailyTasks.progress, data.dailyTasks.claimed);
  dailyTasksPanel.setOnClaimReward((taskId) => {
    const task = getTaskById(taskId);
    if (!task) return;
    if (data.dailyTasks.claimed.includes(taskId)) return;
    const { done } = checkTaskComplete(task, data.dailyTasks.progress);
    if (!done) return;

    // 发放奖励
    data.resources = mergeResources(data.resources, task.reward);
    animateClaimFly(task.reward, dailyTasksPanel.element);
    data.dailyTasks.claimed.push(taskId);
    resourceBar.update(data.resources, data.island.level);
    dailyTasksPanel.update(data.dailyTasks.taskIds, data.dailyTasks.progress, data.dailyTasks.claimed);
    playSound('tick_income');
    const rewardDesc = Object.entries(task.reward)
      .map(([k, v]) => `${RES_ICONS[k] || k} +${v}`)
      .join(' ');
    toast.show(`📋 ${task.name} 完成！${rewardDesc}`);
    saveGameData(data);

    // 全部领取后弹提示
    if (data.dailyTasks.claimed.length === 3) {
      data.resources = mergeResources(data.resources, { star: 1 });
      resourceBar.update(data.resources, data.island.level);
      animateStarReward(1);
      setTimeout(() => {
        toast.show('🎉 今日任务全部完成！额外奖励 ⭐ +1', 3000);
      }, 500);
    }
  });
  app.appendChild(dailyTasksPanel.element);

  // ─── 连续打卡面板 ───
  const streakPanel = createStreakPanel();
  streakPanel.update(data.stats.streak, data.stats.streakMilestonesClaimed);
  streakPanel.setOnClaimMilestone((ms) => {
    if (claimMilestoneReward(ms.day)) {
      animateClaimFly(ms.reward, streakPanel.element);
      const rewardText = Object.entries(ms.reward)
        .map(([k, v]) => `${RES_ICONS[k] || k}+${v}`)
        .join(' ');
      playSound('tick_income');
      toast.show(`🔥 ${ms.day}天里程碑达成！${rewardText}`, 2500);
      streakPanel.update(data.stats.streak, data.stats.streakMilestonesClaimed);
    }
  });
  app.appendChild(streakPanel.element);

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

  // ─── NPC 系统 ───
  const stateRef = {
    get data() { return data; },
    get resources() { return data.resources; },
    get buildings() { return data.island.buildings; },
    get stats() { return data.stats; },
    get island() { return data.island; }
  };
  const npcEngine = createNpcEngine(stateRef);
  const hutCount = data.island.buildings.filter(b => b.id === 'cottage').length;
  npcEngine.initFromData(data.npcs, hutCount);
  island.setNPCEngine(npcEngine);

  // 任务弹窗
  const questPanel = createNpcQuestPanel();
  app.appendChild(questPanel.element);
  let npcInteractIndex = -1;

  // 动画循环 — 持续渲染以驱动拾取物动画 + NPC 更新
  // 士兵游走常量（必须在动画循环之前定义，避免 TDZ）
  const SOLDIER_SPEED = 24;          // px/s, 略慢于 NPC(28)
  const SOLDIER_DIRS = ['down', 'up', 'right', 'left'];
  const SOLDIER_DIR_DELTA = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0] };
  const DIR_TO_NUM = { down: 0, left: 1, right: 2, up: 3 };
  const NUM_TO_DIR = { 0: 'down', 1: 'left', 2: 'right', 3: 'up' };
  let lastAnimTime = performance.now();
  (function animLoop(now) {
    const delta = now - lastAnimTime;
    lastAnimTime = now;
    npcEngine.update(delta);
    updateOffDutySoldiers(delta);
    island.setOffDutySoldiers(buildOffDutySoldiers());
    // 战斗平滑移动
    smoothCombatUnits(data.pirateState, delta);
    if (data.pirateState.phase !== 'idle') {
      island.setCombatState(buildCombatRenderState(data.pirateState));
    } else {
      island.render();
    }

    requestAnimationFrame(animLoop);
  })(performance.now());

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
      playSound('level_up');
      toast.show(`🎉 岛屿升级！Lv.${newLevel}`, 2500);
      resourceBar.update(data.resources, data.island.level);
    }
  }

  // 笔记式计数 — 背词过程中实时累加
  const onStarEarned = (count) => {
    playSound('level_up');
    data.resources = mergeResources(data.resources, { star: count });
    resourceBar.update(data.resources, data.island.level);
    animateStarReward(count);
    // 每日任务进度
    updateDailyProgress({ earn_star: count });
  };

  // 背词覆盖层
  const vocabOverlay = createVocabOverlay(assets, data.vocabulary, (rewards, allSessionWords, sessionResults) => {
    // 基础奖励不立即合并，留给宝箱动画结束后统一处理
    const correctCount = sessionResults.filter(r => r.quality >= 3).length;
    data.stats.wordsCorrect = (data.stats.wordsCorrect || 0) + correctCount;
    // 星星经济已由 VocabOverlay 逐题实时结算
    // Roadmap 里程碑奖励（词汇）
    if (checkRoadmapRewards(null)) {
      toast.show(`⭐ Roadmap 里程碑达成！+1 星星`);
      data.resources = mergeResources(data.resources, { star: 1 });
      resourceBar.update(data.resources, data.island.level);
      animateStarReward(1);
    }

    // ─── 每日任务进度更新 ───
    updateDailyProgress({
      review: allSessionWords.length,
      correct: correctCount,
      earn_gold: rewards.gold || 0,
      earn_star: rewards.star || 0
    });

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
  const treasureChest = createTreasureChest(assets, (rewards) => {
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
    refreshDailyTasks();
    dailyTasksPanel.update(data.dailyTasks.taskIds, data.dailyTasks.progress, data.dailyTasks.claimed);
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

  // 移动模式
  let isMoveMode = false;
  let isMovePinned = false; // 松开后冻结幽灵
  let longPressTimer = null;
  let longPressStartPos = null;

  // 移动后防误触
  let justMoved = false;

  // 拆除确认弹窗
  let demolishBarEl = null;

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

  // ─── 移动建筑 ───
  function enterMoveMode(buildingIndex) {
    if (!island.startMoveBuilding(buildingIndex)) return;
    isMoveMode = true;
    isMovePinned = false;
    hideDemolishBar();

    const b = island.getMoveBuilding();
    if (!b) return;
    islandContainer.style.cursor = 'none';

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
      <span>${b.icon || ''} ${b.name || b.id} — 拖到新位置后松开</span>
      <button class="btn-pixel" id="confirm-move" style="font-size:11px;padding:2px 8px;min-width:auto;">✓ 放置</button>
      <button class="btn-pixel" id="cancel-build" style="font-size:11px;padding:2px 8px;min-width:auto;">✕ 取消</button>
    `;
    islandContainer.appendChild(cancelBarEl);
    cancelBarEl.querySelector('#confirm-move').onclick = () => {
      confirmMovePlacement();
    };
    cancelBarEl.querySelector('#cancel-build').onclick = () => {
      island.cancelMoveBuilding();
      cancelMoveUI();
    };
    cancelBarEl.style.display = 'flex';
  }

  function cancelMoveUI() {
    isMoveMode = false;
    isMovePinned = false;
    justMoved = true;
    islandContainer.style.cursor = '';
    hideCancelBar();
  }

  // 点击"放置"按钮确认移动
  function confirmMovePlacement() {
    if (!island.isMoving()) return;
    const ghost = island.getGhost();
    const b = island.getMoveBuilding();
    if (!ghost) {
      island.cancelMoveBuilding();
      cancelMoveUI();
      return;
    }
    if (!ghost.valid) {
      toast.show('此处无法放置');
      return;
    }
    b.x = ghost.gx;
    b.y = ghost.gy;
    island.cancelMoveBuilding();
    data.island.buildings = island.getBuildings();
    playSound('build_place');
    toast.show(`${b.icon || ''} ${b.name || b.id} 已移动`);
    // 每日任务进度
    updateDailyProgress({ move: 1 });
    saveGameData(data);
    cancelMoveUI();
  }

  // ─── 拆除确认弹窗 ───
  function showDemolishConfirm(building, index) {
    if (!demolishBarEl) {
      demolishBarEl = document.createElement('div');
      demolishBarEl.style.cssText = `
        position:absolute; bottom:60px; left:50%; transform:translateX(-50%);
        display:flex; gap:8px; padding:8px 16px;
        background:var(--color-surface); border:2px solid #e55;
        z-index:25; font-size:11px;
      `;
    }
    demolishBarEl.innerHTML = `
      <span>确认拆除 ${building.icon || ''} ${building.name || building.id}？（返还 50% 资源）</span>
      <button class="btn-pixel" id="confirm-demolish" style="font-size:11px;padding:2px 8px;min-width:auto;border-color:#e55;">确认</button>
      <button class="btn-pixel" id="cancel-demolish" style="font-size:11px;padding:2px 8px;min-width:auto;">取消</button>
    `;
    islandContainer.appendChild(demolishBarEl);
    demolishBarEl.querySelector('#confirm-demolish').onclick = () => {
      demolishBuilding(building, index);
      hideDemolishBar();
    };
    demolishBarEl.querySelector('#cancel-demolish').onclick = hideDemolishBar;
    demolishBarEl.style.display = 'flex';
  }

  function hideDemolishBar() {
    if (demolishBarEl) demolishBarEl.style.display = 'none';
  }

  // ─── 拆除建筑 ───
  function demolishBuilding(building, index) {
    const bldDef = getBuildingById(building.id);
    if (!bldDef) return;

    // 返还 50% 资源
    const refund = {};
    Object.entries(bldDef.cost).forEach(([k, v]) => {
      refund[k] = Math.floor(v * 0.5);
    });

    island.removeBuilding(index);
    data.island.buildings = island.getBuildings();
    data.resources = mergeResources(data.resources, refund);
    // 拆除兵营时清理关联士兵
    if (building.id === 'barracks') {
      data.soldiers = data.soldiers.filter(s => s.barrackId !== building.id);
    }
    resourceBar.update(data.resources, data.island.level);
    playSound('build_demolish');
    toast.show(`${building.icon || ''} ${building.name || building.id} 已拆除，返还 50% 资源`);
    // 每日任务进度
    updateDailyProgress({ demolish: 1 });
    saveGameData(data);
  }

  // 幽灵预览 — 鼠标/触摸跟随
  island.canvas.addEventListener('pointermove', (e) => {
    // 常规建造预览
    if (getState() === AppState.PREVIEW && previewBuilding) {
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
      return;
    }

    // 移动建筑预览
    if (island.isMoving() && !isMovePinned) {
      const rect = island.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x, y } = island.screenToGrid(sx, sy);
      const b = island.getMoveBuilding();
      if (!b) return;
      const moveIdx = island.getMoveBuildingIndex();
      const inBounds = island.isInBounds(x, y);
      const occupied = island.isOccupied(x, y, moveIdx);
      const buildable = island.isBuildableFor(b.id, x, y);
      const isValid = inBounds && !occupied && buildable;
      island.setGhost(b, x, y, isValid);
    }
  });

  const buildDrawer = createBuildDrawer(
    assets, () => data.resources, () => data.resources.star || 0, data.vocabulary, data.island.level, island,
    () => data.island.buildings,
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
    },
    // onUpgrade: 建筑升级
    (buildingId, cost, newLevel) => {
      if (!canAfford(data.resources, cost)) return;
      data.resources = deductResources(data.resources, cost);
      const inst = data.island.buildings.find(b => b.id === buildingId);
      if (inst) {
        inst.level = newLevel;
      }
      buildDrawer.refresh();
      resourceBar.update(data.resources, data.island.level);
      saveGameData(data);
    }
  );
  app.appendChild(buildDrawer.element);

  // ─── 海盗警告条 ───
  const pirateWarning = createPirateWarning();
  app.appendChild(pirateWarning.element);

  // ─── 兵营招募面板 ───
  function getBarracksTier(building) {
    const def = getBuildingById('barracks');
    if (!def?.tierLevels) return null;
    const lvl = building?.level || 1;
    return def.tierLevels.find(t => t.level === lvl) || def.tierLevels[0];
  }

  function recruitSoldier(building) {
    const tier = getBarracksTier(building);
    if (!tier) return;
    const barrackSoldiers = data.soldiers.filter(s => s.barrackId === building.id && s.alive);
    if (barrackSoldiers.length >= tier.capacity) {
      toast.show('兵营已满员');
      return;
    }
    if ((data.resources.gold || 0) < tier.recruitGold) {
      toast.show('金币不足');
      return;
    }
    data.resources.gold -= tier.recruitGold;
    const soldier = {
      id: `soldier_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      barrackId: building.id,
      x: building.x, y: building.y,
      hp: tier.soldierHP, maxHp: tier.soldierHP, atk: tier.soldierATK,
      alive: true
    };
    data.soldiers.push(soldier);
    saveGameData(data);
    resourceBar.update(data.resources, data.island.level);
    toast.show(`⚔️ 士兵已招募！ATK ${tier.soldierATK}  HP ${tier.soldierHP}`);
    // 刷新面板
    const idx = island.getBuildings().findIndex(b => b.id === building.id && b.x === building.x && b.y === building.y);
    barracksPanel.update(building, idx, data.soldiers);
  }

  function syncSoldierHP() {
    const ps = data.pirateState;
    for (const cs of ps.soldiers) {
      const stored = data.soldiers.find(s => s.id === cs.id);
      if (stored) {
        if (cs.hp <= 0) {
          stored.alive = false;
        } else {
          stored.hp = cs.hp;
          // 同步战斗位置回持久化，避免切到 idle 后跳位
          stored._px = cs._px;
          stored._py = cs._py;
          stored._direction = typeof cs._direction === 'number' ? NUM_TO_DIR[cs._direction] || 'down' : (cs._direction ?? 'down');
          stored._walkFrame = cs._walkFrame ?? 0;
        }
      }
    }
    // 清理阵亡士兵（保留最近100条记录防止数组膨胀）
    data.soldiers = data.soldiers.filter(s => s.alive);
    saveGameData(data);
  }

  const barracksPanel = createBarracksPanel(app, {
    onRecruit: (building) => recruitSoldier(building),
    onDemolish: (building, index) => demolishBuilding(building, index),
    onClose: () => {}
  });

  // ─── 拾取物点击事件 ───
  pickupSystem.setOnPickup((reward) => {
    playSound('pickup_item');
    data.resources = mergeResources(data.resources, reward);
    resourceBar.update(data.resources, data.island.level);
    toast.show(`🪨 拾取石材 +${reward.stone}！`);
    saveGameData(data);
  });

  // ─── 岛屿点击（NPC + 拆除 + 拾取物检测 + 建造放置）───
  island.canvas.addEventListener('click', (e) => {
    if (island.wasPanning) { island.resetPanFlag(); return; }
    if (justMoved) { justMoved = false; return; }

    const rect = island.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = island.screenToGrid(sx, sy);

    // ─── NPC 交互（像素级命中优先，解决 NPC 上半格偏移导致 miss 的问题）───
    const { x: camX, y: camY } = island.getOffset();
    const s = island.getScale();
    const wpX = (sx - camX) / s;
    const wpY = (sy - camY) / s;
    const interactResult = npcEngine.interactNPCByPixel(wpX, wpY);
    if (interactResult.npcIndex >= 0) {
      const { npc, phase } = interactResult;

      if (phase === 'offer') {
        npcInteractIndex = interactResult.npcIndex;
        questPanel.show(npc, 'offer',
          // onAccept
          () => {
            npcEngine.acceptQuest(npcInteractIndex);
            questPanel.hide();
            npcInteractIndex = -1;
            saveGameData(data);
            toast.show('已接取任务！');
          },
          // onDecline
          () => {
            npcEngine.skipQuest(npcInteractIndex);
            questPanel.hide();
            npcInteractIndex = -1;
            saveGameData(data);
          },
          null, // onClaim — unused in offer phase
          null, // onAbandon — unused in offer phase
          () => npcEngine.getQuestProgress(npcInteractIndex)
        );
      } else if (phase === 'claim') {
        npcInteractIndex = interactResult.npcIndex;
        questPanel.show(npc, 'claim',
          null, null, // onAccept / onDecline unused
          () => {
            const reward = npcEngine.claimQuest(npcInteractIndex);
            if (reward) {
              data.resources = mergeResources(data.resources, reward);
              resourceBar.update(data.resources, data.island.level);
              animateClaimFly(reward, questPanel.element);
              saveGameData(data);
              toast.show('任务完成！奖励已发放');
            }
            questPanel.hide();
            npcInteractIndex = -1;
          },
          null // onAbandon — unused in claim phase
        );
      } else if (phase === 'progress') {
        npcInteractIndex = interactResult.npcIndex;
        questPanel.show(npc, 'progress',
          null, null, null, // onAccept / onDecline / onClaim unused
          // onAbandon
          () => {
            npcEngine.skipQuest(npcInteractIndex);
            questPanel.hide();
            npcInteractIndex = -1;
            saveGameData(data);
            toast.show('已放弃任务');
          },
          () => npcEngine.getQuestProgress(npcInteractIndex)
        );
      } else {
        // idle / cooling / claimed
        const cooldownRemain = npc.cooldownUntil ? Math.max(0, Math.ceil((npc.cooldownUntil - Date.now()) / 1000)) : 0;
        if (cooldownRemain > 0) {
          const mins = Math.ceil(cooldownRemain / 60);
          toast.show(`${npc.name}：稍等片刻…（约${mins}分钟后有新任务）`);
        } else if (npc.quest && npc.quest.claimed) {
          toast.show(`${npc.name}：任务奖励已领取，稍后再来~`);
        } else {
          toast.show(`${npc.name}：正在岛上散步…`);
        }
      }
      return;
    }

    // ─── 建筑交互：兵营 → 招募面板，其他 → 拆除确认 ───
    if (getState() === AppState.IDLE && !isMoveMode) {
      const buildingIdx = island.findBuildingAt(x, y);
      if (buildingIdx >= 0) {
        const building = island.getBuildings()[buildingIdx];
        if (building.id === 'barracks') {
          barracksPanel.update(building, buildingIdx, data.soldiers);
        } else {
          showDemolishConfirm(building, buildingIdx);
        }
        return;
      }
      // 点击空白处 → 关闭面板
      hideDemolishBar();
      barracksPanel.hide();
    }

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
      spriteKey: previewBuilding.spriteKey,
      spriteLevels: previewBuilding.spriteLevels,
      fansSprite: previewBuilding.fansSprite,
      fansPivot: previewBuilding.fansPivot,
      layer: previewBuilding.layer ?? 1,
      level: 1,
      hp: 80,
      x, y
    };
    if (previewBuilding.id === 'tree') {
      newBuilding.treeVariant = previewBuilding._ghostVariant ?? Math.floor(Math.random() * 7);
      delete previewBuilding._ghostVariant;
    }
    island.addBuilding(newBuilding);
    data.island.buildings = island.getBuildings();

    // 小屋建成后检测 NPC 解锁
    if (previewBuilding.id === 'cottage') {
      const huts = data.island.buildings.filter(b => b.id === 'cottage').length;
      const npcUnlocked = npcEngine.unlockNPCs(huts);
      if (npcUnlocked.length > 0) {
        const names = npcUnlocked.map(n => n.name).join('、');
        setTimeout(() => toast.show(`新村民到来：${names}`, 2500), 1200);
      }
    }

    // 新手引导 step 2：放下第一个建筑
    if (!tutStep2Done && data.island.buildings.length === 1) {
      tutStep2Done = true;
      setTimeout(() => tutorial.show(2), 800);
    }

    resourceBar.update(data.resources, data.island.level);
    playSound('build_place');
    toast.show(`${previewBuilding.icon} ${previewBuilding.name} 建成！`);
    // Roadmap 里程碑奖励
    if (checkRoadmapRewards(previewBuilding.id)) {
      playSound('level_up');
      toast.show(`⭐ Roadmap 里程碑达成！+1 星星`);
      resourceBar.update(data.resources, data.island.level);
      animateStarReward(1);
    }
    // 每日任务进度
    updateDailyProgress({ build: 1 });
    saveGameData(data);
    cancelPreview();
  });

  // ESC 取消
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (getState() === AppState.PREVIEW) cancelPreview();
      if (island.isMoving()) { island.cancelMoveBuilding(); cancelMoveUI(); }
    }
    // Ctrl+Shift+D → Demo 战斗测试（避开浏览器 Ctrl+Shift+T 重开标签页冲突）
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setupTestCombat();
    }
  });

  // ─── 长按检测 → 移动建筑 ───
  island.canvas.addEventListener('pointerdown', (e) => {
    if (getState() !== AppState.IDLE || island.isMoving()) return;
    // 拆除确认弹窗显示时禁止移动
    if (demolishBarEl && demolishBarEl.style.display !== 'none') return;

    const rect = island.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = island.screenToGrid(sx, sy);
    longPressStartPos = { gx: x, gy: y };

    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (island.isMoving()) return;
      if (getState() !== AppState.IDLE) return;
      const idx = island.findBuildingAt(longPressStartPos.gx, longPressStartPos.gy);
      if (idx >= 0) enterMoveMode(idx);
    }, 500);
  });

  // 拖拽过程中清除长按计时
  island.canvas.addEventListener('pointermove', (e) => {
    if (island.wasPanning) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  // 松开 → 不再自动放置，停在当前位置等玩家确认
  document.addEventListener('pointerup', (e) => {
    if (!island.isMoving() || isMovePinned) return;

    isMovePinned = true;
    islandContainer.style.cursor = '';

    // 松开时把幽灵固定在当前位置
    const rect = island.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = island.screenToGrid(sx, sy);
    const b = island.getMoveBuilding();
    if (b) {
      const moveIdx = island.getMoveBuildingIndex();
      const inBounds = island.isInBounds(x, y);
      const occupied = island.isOccupied(x, y, moveIdx);
      const buildable = island.isBuildableFor(b.id, x, y);
      const isValid = inBounds && !occupied && buildable;
      island.setGhost(b, x, y, isValid);
    }
  });

  // Canvas 级 pointerup：仅处理非移动模式的收尾
  island.canvas.addEventListener('pointerup', (e) => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
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
    playSound('button_click');
    if (transition(AppState.VOCAB)) vocabOverlay.show();
  };

  const buildBtn = document.createElement('button');
  buildBtn.className = 'btn-pixel';
  buildBtn.textContent = '🏗️ 建造';
  buildBtn.onclick = () => {
    playSound('button_click');
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
    playSound('button_click');
    settingsPanel.show(data.timeOffset);
  };

  const tasksBtn = document.createElement('button');
  tasksBtn.className = 'btn-pixel';
  tasksBtn.textContent = '📋 任务';
  tasksBtn.onclick = () => {
    playSound('button_click');
    refreshDailyTasks();
    dailyTasksPanel.update(data.dailyTasks.taskIds, data.dailyTasks.progress, data.dailyTasks.claimed);
    dailyTasksPanel.show();
  };

  const streakBtn = document.createElement('button');
  streakBtn.className = 'btn-pixel';
  streakBtn.textContent = '🔥 打卡';
  streakBtn.onclick = () => {
    playSound('button_click');
    streakPanel.update(data.stats.streak, data.stats.streakMilestonesClaimed);
    streakPanel.show();
  };

  buttonBar.append(vocabBtn, buildBtn, tasksBtn, streakBtn, roadmapBtn, settingsBtn, resetBtn);
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
      const px = canvasRect.left + screen.x + CELL_SIZE * island.getScale() / 2;
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
  if (data.stats.lastActive !== today) {
    const yesterday = new Date(getEffectiveNow() - 86400000).toISOString().split('T')[0];
    if (data.stats.lastActive === yesterday) {
      data.stats.streak = (data.stats.streak || 0) + 1;
    } else {
      data.stats.streak = 1;
    }
    data.stats.lastActive = today;

    // 自动领取 day 1
    if (data.stats.streak >= 1 && !data.stats.streakMilestonesClaimed.includes(1)) {
      claimMilestoneReward(1);
    }

    // 更新打卡面板数据
    streakPanel.update(data.stats.streak, data.stats.streakMilestonesClaimed);
  }

  const totalOffline = Object.values(offlineIncome).reduce((s, v) => s + v, 0);
  if (totalOffline > 0) {
    const timeAgo = formatElapsed(oldLastOnline);
    const desc = formatIncome(offlineIncome);
    toast.show(`🕐 离线 ${timeAgo}\n收获: ${desc}`, 3000);
  }
  if (!isNewGame) {
    playSound('streak_fire');
    toast.show(`🔥 连续打卡 ${data.stats.streak} 天！`, 2500);
  }

  // ─── 8. 被动收入 tick（含 Buff + 飞入动画 + 海盗状态更新）───
  // 朝向辅助函数
  function findNearestTarget(unit, targets) {
    let best = null, bestDist = Infinity;
    for (const t of targets) {
      const d = Math.abs(unit.x - t.x) + Math.abs(unit.y - t.y);
      if (d < bestDist) { bestDist = d; best = t; }
    }
    return best;
  }

  function directionToward(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 2 : 1; // 右:2, 左:1
    return dy > 0 ? 0 : 3; // 下:0, 上:3
  }

  function moveSoldiers(soldiers, pirates) {
    const alive = pirates.filter(p => p.alive);
    if (alive.length === 0) return;
    for (const s of soldiers) {
      if (s.hp <= 0) continue;
      const t = findNearestTarget(s, alive);
      if (!t) continue;
      const dx = Math.sign(t.x - s.x);
      const dy = Math.sign(t.y - s.y);
      if (Math.abs(t.x - s.x) > Math.abs(t.y - s.y)) {
        s.x += dx;
      } else {
        s.y += dy;
      }
    }
  }

  // 海盗战斗引擎：每 ECONOMY_TICK 执行一个战斗回合
  function pirateTick() {
    const ps = data.pirateState;
    const buildings = data.island.buildings || [];

    switch (ps.phase) {
      case 'idle': {
        // 检查激活条件
        if (pirateActivationCheck(buildings)) {
          ps.phase = 'warning';
          ps.wave = (ps.wave || 0) + 1;
          ps.waveTimer = 5; // 5 tick = 90s 倒计时
          toast.show(`⚠️ 海盗即将来袭！第 ${ps.wave} 波`, 3000);
        }
        break;
      }

      case 'warning': {
        ps.waveTimer--;
        if (ps.waveTimer <= 0) {
          // 生成海盗
          ps.pirates = spawnWave(buildings, ps.wave);
          // 使用已招募的驻守士兵
          const aliveSoldiers = data.soldiers.filter(s => s.alive);
          ps.soldiers = aliveSoldiers.map(s => ({
            id: s.id,
            x: s.x, y: s.y,
            hp: s.hp, maxHp: s.maxHp, atk: s.atk,
            barrackId: s.barrackId
          }));
          // 采集防御塔
          ps.towers = buildings
            .filter(b => b.id === 'defense_tower')
            .map(tw => {
              const stats = getUpgradeStats(getBuildingById('defense_tower'), tw.level || 1);
              const cap = stats?.ammoCapacity || 20;
              return {
                id: tw.id, x: tw.x, y: tw.y,
                level: tw.level || 1,
                arrows: cap, maxArrows: cap
              };
            });
          ps.phase = 'combat';
          toast.show(`⚔️ 第 ${ps.wave} 波海盗来袭！`, 3000);
        }
        break;
      }

      case 'combat': {
        // 快照移动前像素位置（作为 lerp 起点）
        snapshotCombatPrev(ps);
        // 移动海盗（朝向建筑，排除树木建筑）
        const combatBuildings = buildings.filter(b => b.id !== 'tree');
        movePirates(ps.pirates, combatBuildings);
        if (!demoCombatTimer) {
          // 移动士兵（朝向最近海盗）—— Demo 下走实时逐帧移动
          moveSoldiers(ps.soldiers, ps.pirates);
        }
        // 快照移动后像素位置（作为 lerp 终点）
        snapshotCombatTarget(ps);
        if (!demoCombatTimer) {
          // 战斗回合 —— Demo 下走实时近战判定
          const { pirateLog, buildingDamage } = combatTick(
            ps.pirates, ps.soldiers, ps.towers, buildings
          );
          // 建筑破坏
          const { destroyed } = checkDestruction(buildings, buildingDamage);
          if (destroyed.length > 0) {
            const destroyedRefs = new Set(destroyed);
            for (let i = data.island.buildings.length - 1; i >= 0; i--) {
              if (destroyedRefs.has(data.island.buildings[i])) {
                data.island.buildings.splice(i, 1);
                island.removeBuilding(i);
              }
            }
            ps.buildingsDestroyed = (ps.buildingsDestroyed || []).concat(destroyed);
          }
        }

        // 波次结束判定
        const allPiratesDead = ps.pirates.every(p => !p.alive);
        if (allPiratesDead) {
          const { gold } = processWaveEnd({ piratesDefeated: ps.pirates, wave: ps.wave });
          data.resources.gold += gold;
          resourceBar.update(data.resources, data.island.level);
          // 士兵 lerp 回兵营
          for (const s of ps.soldiers) {
            if (s.hp > 0) {
              s._tx = s.x * CELL_SIZE + CELL_SIZE / 2;
              s._ty = s.y * CELL_SIZE + CELL_SIZE;
            }
          }
          ps.pirates = ps.pirates.filter(p => p.alive);
          ps.phase = 'victory';
          toast.show(`✅ 击退海盗！获得 ${gold}💰`, 3000);
          // 同步士兵血量回持久存储
          syncSoldierHP();
          // 波间回血：存活士兵回复 +10 HP
          for (const s of ps.soldiers) {
            if (s.hp > 0) { s.hp = Math.min(s.hp + 10, s.maxHP); }
          }
          setTimeout(() => {
            // 二次同步：将 lerp 回兵营后的最终位置写入 data.soldiers
            for (const s of ps.soldiers) {
              if (s.hp > 0) {
                const stored = data.soldiers.find(ds => ds.id === s.id);
                if (stored) {
                  stored._px = s._px; stored._py = s._py;
                  stored._direction = typeof s._direction === 'number' ? NUM_TO_DIR[s._direction] || 'down' : (s._direction ?? 'down');
                  stored._walkFrame = s._walkFrame ?? 0;
                }
              }
            }
            ps.phase = 'idle'; ps.pirates = []; ps.soldiers = []; ps.towers = []; ps.ships = []; ps.projectiles = []; ps.vfx = []; island.setCombatState({ phase: 'idle', pirates: [], soldiers: [], ships: [] }); stopDemoCombatTick();
          }, 5000);
        } else if (ps.soldiers.every(s => s.hp <= 0) && ps.towers.every(t => t.arrows <= 0)) {
          // 兵力全灭 → 防御失败，海盗撤退但造成破坏
          ps.phase = 'defeat';
          toast.show('💀 防御失败…', 3000);
          // 士兵全灭
          data.soldiers.forEach(s => { s.alive = false; });
          saveGameData(data);
          setTimeout(() => { ps.phase = 'idle'; ps.pirates = []; ps.soldiers = []; ps.towers = []; ps.ships = []; ps.projectiles = []; ps.vfx = []; island.setCombatState({ phase: 'idle', pirates: [], soldiers: [], ships: [] }); stopDemoCombatTick(); }, 5000);
        }
        break;
      }

      case 'victory':
      case 'defeat':
        // waiting for timeout to reset
        break;
    }
  }

  // ─── Demo 快速战斗 tick（500ms，远快于正常 18s）───
  var demoCombatTimer = null;
  var demoWarningTimer = null;
  function stopDemoCombatTick() {
    if (demoCombatTimer) { clearInterval(demoCombatTimer); demoCombatTimer = null; }
    if (demoWarningTimer) { clearTimeout(demoWarningTimer); demoWarningTimer = null; }
  }

  // ─── 测试用 Demo 关卡：一键触发战斗 ───
  function setupTestCombat() {
    const ps = data.pirateState;
    // 若正在战斗或结算中，先强制重置
    if (ps.phase !== 'idle') {
      ps.phase = 'idle';
      ps.pirates = [];
      ps.soldiers = [];
      ps.towers = [];
      ps.ships = [];
      ps.projectiles = [];
      ps.vfx = [];
      island.setCombatState({ phase: 'idle', pirates: [], soldiers: [], ships: [] });
      stopDemoCombatTick();
    }

    let buildings = data.island.buildings || [];
    const G = 12; // ISLAND_GRID_SIZE
    const terrainMap = data.island.terrainMap;

    // ─── Demo 自动放置建筑（无资源开局，居中摆放）───
    function collectBuildableTiles(buildingId) {
      const tiles = [];
      for (let gy = 0; gy < G; gy++) {
        for (let gx = 0; gx < G; gx++) {
          if (!island.isOccupied(gx, gy) && island.isBuildableFor(buildingId, gx, gy)) {
            tiles.push({ x: gx, y: gy });
          }
        }
      }
      return tiles;
    }

    function makeBuilding(id) {
      const def = getBuildingById(id);
      return { id: def.id, name: def.name, icon: def.icon, spriteIndex: def.spriteIndex, spriteKey: def.spriteKey, spriteLevels: def.spriteLevels, fansSprite: def.fansSprite, fansPivot: def.fansPivot, layer: def.layer ?? 1, level: 1, hp: 80, maxHp: 80, x: 0, y: 0 };
    }

    // 居中摆放兵营：6×6 中心区域优先
    // 放置 1 个兵营
    if (buildings.filter(b => b.id === 'barracks').length === 0) {
      const slot = { x: 5, y: 6 };
      const exists = island.isOccupied(slot.x, slot.y);
      const buildable = island.isBuildableFor('barracks', slot.x, slot.y);
      if (!exists && buildable) {
        const bld = makeBuilding('barracks');
        bld.x = slot.x; bld.y = slot.y;
        island.addBuilding(bld);
      } else {
        const tiles = collectBuildableTiles('barracks');
        tiles.sort((a, b) => (Math.abs(a.x - 5) + Math.abs(a.y - 5)) - (Math.abs(b.x - 5) + Math.abs(b.y - 5)));
        const fallback = tiles.find(t => !island.isOccupied(t.x, t.y));
        if (fallback) {
          const bld = makeBuilding('barracks');
          bld.x = fallback.x; bld.y = fallback.y;
          island.addBuilding(bld);
        }
      }
    }

    // 放置 1 个防御塔
    if (buildings.filter(b => b.id === 'defense_tower').length === 0) {
      const slot = { x: 6, y: 5 };
      const exists = island.isOccupied(slot.x, slot.y);
      const buildable = island.isBuildableFor('defense_tower', slot.x, slot.y);
      if (!exists && buildable) {
        const bld = makeBuilding('defense_tower');
        bld.x = slot.x; bld.y = slot.y;
        island.addBuilding(bld);
      } else {
        const tiles = collectBuildableTiles('defense_tower');
        tiles.sort((a, b) => (Math.abs(a.x - 5) + Math.abs(a.y - 5)) - (Math.abs(b.x - 5) + Math.abs(b.y - 5)));
        const fallback = tiles.find(t => !island.isOccupied(t.x, t.y));
        if (fallback) {
          const bld = makeBuilding('defense_tower');
          bld.x = fallback.x; bld.y = fallback.y;
          island.addBuilding(bld);
        }
      }
    }

    // 同步 buildings 引用（island.addBuilding 写入内部数组）
    buildings = island.getBuildings();
    data.island.buildings = buildings;

    // 若有新建筑则存档
    if (data.island.buildings.length > (data._demoBuildingsPlaced ?? 0)) {
      data._demoBuildingsPlaced = data.island.buildings.length;
      saveGameData(data);
    }

    ps.wave = (ps.wave || 0) + 1;

    // - 海盗在 2 秒警告期后由 timeout 生成 -

    // Demo 模式：清已死 demo 兵，存活 demo 兵保留复用
    data.soldiers = data.soldiers.filter(s => !s.id.startsWith('demo_') || s.alive);
    const existingSoldiers = data.soldiers.filter(s => s.alive);
    const barracks = buildings.filter(b => b.id === 'barracks');
    const recruitCount = Math.min(barracks.length * 2, 10);
    const needRecruit = Math.max(0, recruitCount - existingSoldiers.length);
    for (let i = 0; i < needRecruit; i++) {
      const b = barracks[i % barracks.length];
      const ox = ((i % 5) - 2) * 12 + (Math.random() - 0.5) * 8;
      const oy = (Math.floor(i / 5) - 1) * 12 + (Math.random() - 0.5) * 8;
      data.soldiers.push({
        id: `demo_${ps.wave}_${i}_${Date.now()}`,
        x: b.x, y: b.y,
        _px: (b.x + 0.5) * CELL_SIZE + ox,
        _py: (b.y + 0.5) * CELL_SIZE + oy,
        _direction: 0,
        _walkFrame: 0, _walkTimer: 0,
        hp: 100, maxHp: 100, atk: 15,
        barrackId: b.id,
        alive: true
      });
    }
    saveGameData(data);

    // 从建筑列表提取防御塔
    ps.towers = buildings
      .filter(b => b.id === 'defense_tower')
      .map(tw => {
        const stats = getUpgradeStats(getBuildingById('defense_tower'), tw.level || 1);
        const cap = stats?.ammoCapacity || 20;
        return {
          id: tw.id, x: tw.x, y: tw.y,
          level: tw.level || 1,
          arrows: cap, maxArrows: cap
        };
      });
    // warning 阶段填充士兵渲染数据，确保游走可见
    ps.soldiers = data.soldiers.filter(s => s.alive).map(s => ({
      id: s.id, x: s.x, y: s.y,
      hp: s.hp, maxHp: s.maxHp, atk: s.atk,
      barrackId: s.barrackId,
      _px: s._px, _py: s._py,
      _tx: s._px, _ty: s._py,
      _direction: s._direction ?? 0,
      _walkFrame: s._walkFrame ?? 0,
      _walkTimer: s._walkTimer ?? 0
    }));
    ps.pirates = [];
    ps.phase = 'warning';
    toast.show(`⚔️ Wave ${ps.wave} incoming — ${data.soldiers.filter(s => s.alive).length} soldiers ready`, 3000);

    // 预计算海盗总数，生成海盗船
    const totalPirates = PIRATE_EVENT.baseWaveSize
      + Math.floor(Math.random() * (PIRATE_EVENT.extraRandom + 1))
      + Math.min(ps.wave - 1, 5);
    ps.ships = spawnShips(terrainMap, ps.wave, G, totalPirates);
    // 记录每艘船的起始像素位置和 warning 结束时间，用于时间驱动插值
    for (const s of ps.ships) {
      s._startPx = s._px;
      s._startPy = s._py;
    }
    ps.warningEndTime = performance.now() + 2000;

    // 停旧 timer，2 秒后靠岸 → 下船 → 转入战斗
    stopDemoCombatTick();
    demoWarningTimer = setTimeout(() => {
      // 船只靠岸（时间插值已接近目标，微调至精确位置）
      for (const s of ps.ships) {
        s.x = s.targetX;
        s.y = s.targetY;
        s._px = s.x * CELL_SIZE + CELL_SIZE / 2;
        s._py = s.y * CELL_SIZE + CELL_SIZE / 2;
        s.state = 'docked';
      }

      // 海盗下船
      let iOff = 0;
      for (const ship of ps.ships) {
        const newPirates = disembarkShip(ship, ps.wave, iOff);
        ps.pirates.push(...newPirates);
        // 海盗从水格推到相邻陆地
        for (const p of newPirates) {
          const neighbors = [[p.x, p.y - 1], [p.x, p.y + 1], [p.x - 1, p.y], [p.x + 1, p.y]];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < G && ny >= 0 && ny < G && terrainMap[ny][nx] !== TERRAIN.WATER) {
              p.x = nx;
              p.y = ny;
              break;
            }
          }
        }
        iOff += newPirates.length;
      }

      const aliveSoldiers = data.soldiers.filter(s => s.alive);
      ps.soldiers = aliveSoldiers.map(s => ({
        id: s.id, x: s.x, y: s.y,
        hp: s.hp, maxHp: s.maxHp, atk: s.atk,
        barrackId: s.barrackId,
        _px: s._px, _py: s._py,
        _tx: s._px, _ty: s._py,
        _direction: s._direction ?? 0,
        _walkFrame: s._walkFrame ?? 0,
        _walkTimer: s._walkTimer ?? 0
      }));
      ps.phase = 'combat';
      demoWarningTimer = null;
      toast.show(`⚔️ Demo Wave ${ps.wave} — ${ps.pirates.length} pirates from ${ps.ships.length} ships`, 3000);

      demoCombatTimer = setInterval(() => {
        if (ps.phase !== 'combat') {
          if (ps.phase === 'victory' || ps.phase === 'defeat') {
            stopDemoCombatTick();
          }
          return;
        }
        pirateTick();
      }, 1500);
    }, 2000);
  }

  // ─── 战斗单位平滑移动 + 动画（逐帧）───
  function initCombatUnitPos(u) {
    if (u._px === undefined) {
      u._px = u.x * CELL_SIZE + CELL_SIZE / 2;
      u._py = u.y * CELL_SIZE + CELL_SIZE;
      u._tx = u._px;
      u._ty = u._py;
      u._direction = 0; // down
      u._walkFrame = 0;
      u._walkTimer = 0;
    }
  }

  function snapshotCombatPrev(ps) {
    for (const u of ps.pirates) { if (!u.alive) continue; initCombatUnitPos(u); u._prevTx = u._tx; u._prevTy = u._ty; }
    for (const s of ps.soldiers) { if (s.hp <= 0) continue; initCombatUnitPos(s); s._prevTx = s._tx; s._prevTy = s._ty; }
  }

  function snapshotCombatTarget(ps) {
    for (const u of ps.pirates) {
      if (!u.alive) continue;
      u._tx = u.x * CELL_SIZE + CELL_SIZE / 2;
      u._ty = u.y * CELL_SIZE + CELL_SIZE;
    }
    for (const s of ps.soldiers) {
      if (s.hp <= 0) continue;
      s._tx = s.x * CELL_SIZE + CELL_SIZE / 2;
      s._ty = s.y * CELL_SIZE + CELL_SIZE;
    }
  }

  function smoothCombatUnits(ps, deltaMs) {
    if (ps.phase !== 'combat' && ps.phase !== 'warning' && ps.phase !== 'victory' && ps.phase !== 'defeat') return;
    const COMBAT_SPEED = demoCombatTimer ? 32 : 32; // px/s，Demo 正常速度
    const moveAmount = COMBAT_SPEED * deltaMs / 1000;
    const G = 12;

    // ─── 船只平滑航行（warning 阶段，时间驱动插值，仅水格）───
    const shipTerrainMap = data.island.terrainMap;
    if (ps.phase === 'warning' && ps.ships && ps.warningEndTime && shipTerrainMap) {
      const remaining = ps.warningEndTime - performance.now();
      const duration = 2000; // warning 总时长
      const t = Math.min(1, Math.max(0, 1 - remaining / duration)); // 0→1 over 2s
      for (const s of ps.ships) {
        if (s.state !== 'sailing') continue;
        const tx = s.targetX * CELL_SIZE + CELL_SIZE / 2;
        const ty = s.targetY * CELL_SIZE + CELL_SIZE / 2;
        s._px = s._startPx + (tx - s._startPx) * t;
        s._py = s._startPy + (ty - s._startPy) * t;
        s._tx = tx;
        s._ty = ty;
        // 强制 clamp 到水格，防止直线路径穿越陆地
        const gx = Math.round((s._px - CELL_SIZE / 2) / CELL_SIZE);
        const gy = Math.round((s._py - CELL_SIZE / 2) / CELL_SIZE);
        if (gy >= 0 && gy < G && gx >= 0 && gx < G && shipTerrainMap[gy][gx] !== TERRAIN.WATER) {
          const dx = Math.sign(s.targetX - gx);
          const dy = Math.sign(s.targetY - gy);
          let clamped = false;
          for (const [nx, ny] of [[gx + dx, gy], [gx, gy + dy], [gx + dx, gy + dy], [gx - dx, gy - dy], [gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]]) {
            if (nx >= 0 && nx < G && ny >= 0 && ny < G && shipTerrainMap[ny][nx] === TERRAIN.WATER) {
              s._px = nx * CELL_SIZE + CELL_SIZE / 2;
              s._py = ny * CELL_SIZE + CELL_SIZE / 2;
              clamped = true;
              break;
            }
          }
          if (!clamped) {
            // 极少情况：还原到起点水格
            s._px = s._startPx;
            s._py = s._startPy;
          }
        }
      }
    }

    for (const u of ps.pirates) {
      if (!u.alive) continue;
      initCombatUnitPos(u);
      let tx = u._tx ?? u._px;
      let ty = u._ty ?? u._py;
      const dx = tx - u._px;
      const dy = ty - u._py;
      const dist = Math.hypot(dx, dy);
      if (dist <= moveAmount) {
        u._px = tx;
        u._py = ty;
      } else {
        const ratio = moveAmount / dist;
        u._px += dx * ratio;
        u._py += dy * ratio;
      }
    }

    // ─── 士兵移动 + 约束 ───
    const blds = data.island.buildings || [];
    const terrainMap = data.island.terrainMap;
    const maxDistPx = SOLDIER_BARRACKS_MAX_DIST * CELL_SIZE;

    for (const s of ps.soldiers) {
      if (s.hp <= 0) continue;
      initCombatUnitPos(s);

      if (demoCombatTimer && ps.phase === 'combat') {
        const alivePirates = ps.pirates.filter(p => p.alive);
        if (alivePirates.length > 0) {
          let nearest = alivePirates[0];
          let minDist = Math.hypot(nearest._px - s._px, nearest._py - s._py);
          for (const p of alivePirates) {
            const d = Math.hypot(p._px - s._px, p._py - s._py);
            if (d < minDist) { minDist = d; nearest = p; }
          }
          s._tx = nearest._px;
          s._ty = nearest._py;
        }

        // 约束 1：距兵营最大距离
        const barrack = blds.find(b => b.id === 'barracks' && b.id === s.barrackId)
          || blds.find(b => b.id === 'barracks');
        if (barrack) {
          const bx = barrack.x * CELL_SIZE + CELL_SIZE / 2;
          const by = barrack.y * CELL_SIZE + CELL_SIZE / 2;
          const sd = Math.hypot(s._tx - bx, s._ty - by);
          if (sd > maxDistPx) {
            const angle = Math.atan2(s._ty - by, s._tx - bx);
            s._tx = bx + Math.cos(angle) * maxDistPx;
            s._ty = by + Math.sin(angle) * maxDistPx;
          }
        }

        // 约束 2：禁止入水
        const gx = Math.round(s._tx / CELL_SIZE);
        const gy = Math.round((s._ty - CELL_SIZE / 4) / CELL_SIZE);
        if (gx >= 0 && gx < G && gy >= 0 && gy < G && terrainMap[gy][gx] === TERRAIN.WATER) {
          if (barrack) {
            const bx = barrack.x * CELL_SIZE + CELL_SIZE / 2;
            const by = barrack.y * CELL_SIZE + CELL_SIZE / 2;
            s._tx = s._px + (bx - s._px) * 0.3;
            s._ty = s._py + (by - s._py) * 0.3;
          }
        }
      }

      let tx = s._tx ?? s._px;
      let ty = s._ty ?? s._py;
      const dx = tx - s._px;
      const dy = ty - s._py;
      const dist = Math.hypot(dx, dy);
      if (dist <= moveAmount) {
        s._px = tx;
        s._py = ty;
      } else {
        const ratio = moveAmount / dist;
        s._px += dx * ratio;
        s._py += dy * ratio;
      }
    }

    // warning 阶段：同步 data.soldiers 游走位置到 ps.soldiers 渲染
    if (ps.phase === 'warning') {
      const aliveSoldiers = data.soldiers.filter(s => s.alive);
      for (const s of ps.soldiers) {
        const src = aliveSoldiers.find(ds => ds.id === s.id);
        if (src) {
          s._px = src._px; s._py = src._py;
          s._direction = DIR_TO_NUM[src._direction] ?? 0;
          s._walkFrame = src._walkFrame ?? 0;
        }
      }
    }

    // ─── 持续扬尘（Demo + 正式游戏共用）───
    if (ps.phase === 'combat') {
      const MELEE_RANGE = 44;    // px
      const MAX_DUST = 5;
      const dustNow = performance.now();

      // 收集所有近战范围内的 pair + 距离
      const pairs = [];
      for (const s of ps.soldiers) {
        if (s.hp <= 0) continue;
        for (const p of ps.pirates) {
          if (!p.alive) continue;
          const d = Math.hypot(p._px - s._px, p._py - s._py);
          if (d <= MELEE_RANGE) {
            pairs.push({ key: s.id + '_' + p.id, s, p, d });
          }
        }
      }
      pairs.sort((a, b) => a.d - b.d);
      const top5 = pairs.slice(0, MAX_DUST);
      const topKeys = new Set(top5.map(p => p.key));

      // 单遍遍历：构建查找表 + 标记淡出 + 清理
      if (!ps.vfx) ps.vfx = [];
      const dustMap = new Map();
      for (let i = ps.vfx.length - 1; i >= 0; i--) {
        const v = ps.vfx[i];
        if (v.type !== 'fightVFX') continue;
        if (!v.alive && dustNow - v.lastAlive >= 800) {
          ps.vfx.splice(i, 1);
          continue;
        }
        dustMap.set(v.pairKey, v);
        if (!topKeys.has(v.pairKey) && v.alive) {
          v.alive = false;
          v.lastAlive = dustNow;
        }
      }

      // 只为 top5 创建/维持扬尘
      for (const { key, s, p } of top5) {
        let existing = dustMap.get(key);
        if (existing) {
          existing.alive = true;
          existing.lastAlive = dustNow;
          existing.x = (s._px + p._px) / 2;
          existing.y = (s._py + p._py) / 2;
        } else {
          const newDust = {
            type: 'fightVFX',
            pairKey: key,
            x: (s._px + p._px) / 2, y: (s._py + p._py) / 2,
            startTime: dustNow,
            duration: 99999,
            lastAlive: dustNow,
            alive: true,
            soldierId: s.id, pirateId: p.id
          };
          ps.vfx.push(newDust);
          dustMap.set(key, newDust);
        }
      }

      // 记录当前交战中的单位（用于隐藏 sprite）
      const combatSoldierIds = new Set();
      const combatPirateIds = new Set();
      for (const { s, p } of top5) {
        combatSoldierIds.add(s.id);
        combatPirateIds.add(p.id);
      }
      ps._combatSoldierIds = combatSoldierIds;
      ps._combatPirateIds = combatPirateIds;
    }

    // ─── Demo 实时近战判定 ───
    if (demoCombatTimer) {
      const ATK_INTERVAL = 600; // ms
      const MELEE_RANGE = 44;    // px

      // 1. 士兵攻击海盗（需接触）
      for (const s of ps.soldiers) {
        if (s.hp <= 0) continue;
        s._rtAtkTimer = (s._rtAtkTimer || 0) + deltaMs;
        if (s._rtAtkTimer < ATK_INTERVAL) continue;
        s._rtAtkTimer -= ATK_INTERVAL;
        for (const p of ps.pirates) {
          if (!p.alive) continue;
          const d = Math.hypot(p._px - s._px, p._py - s._py);
          if (d <= MELEE_RANGE) {
            p.hp -= s.atk;
            if (p.hp <= 0) p.alive = false;
            break;
          }
        }
      }

      // 2. 海盗攻击士兵（需接触）
      for (const p of ps.pirates) {
        if (!p.alive) continue;
        p._rtAtkTimer = (p._rtAtkTimer || 0) + deltaMs;
        if (p._rtAtkTimer < ATK_INTERVAL) continue;
        p._rtAtkTimer -= ATK_INTERVAL;
        for (const s of ps.soldiers) {
          if (s.hp <= 0) continue;
          const d = Math.hypot(p._px - s._px, p._py - s._py);
          if (d <= MELEE_RANGE) {
            s.hp -= p.atk;
            break;
          }
        }
      }

      // 3. 海盗攻击建筑（需踩在建筑格子上，排除装饰性 tree）
      const blds = (data.island.buildings || []).filter(b => b.id !== 'tree');
      for (const p of ps.pirates) {
        if (!p.alive) continue;
        const gx = p.x;
        const gy = p.y;
        const bld = blds.find(b => b.x === gx && b.y === gy && (b.hp ?? 80) > 0);
        if (bld) {
          // 视觉距离校验：海盗必须视觉到达建筑格内才攻击
          const bldCx = bld.x * 64 + 32;
          const bldCy = bld.y * 64 + 32;
          const visDist = Math.hypot(p._px - bldCx, p._py - bldCy);
          if (visDist > 64) continue;
          p._rtBldTimer = (p._rtBldTimer || 0) + deltaMs;
          if (p._rtBldTimer >= ATK_INTERVAL) {
            p._rtBldTimer -= ATK_INTERVAL;
            bld.hp = (bld.hp ?? 80) - p.atk;
            if (bld.hp <= 0) {
              // 建筑摧毁
              const idx = data.island.buildings.indexOf(bld);
              if (idx >= 0) {
                data.island.buildings.splice(idx, 1);
                island.removeBuilding(idx);
              }
            }
          }
        } else {
          p._rtBldTimer = 0;
        }
      }

      // 4. 防御塔攻击海盗（射程内自动射击，箭矢优先 → 炮弹）
      ps.projectiles = ps.projectiles || [];
      const now = performance.now();
      for (const tw of ps.towers) {
        const stats = getUpgradeStats(getBuildingById('defense_tower'), tw.level || 1);
        if (!stats || tw.arrows <= 0) continue;
        tw._rtAtkTimer = (tw._rtAtkTimer || 0) + deltaMs;
        if (tw._rtAtkTimer < ATK_INTERVAL) continue;
        tw._rtAtkTimer -= ATK_INTERVAL;
        const rangePx = stats.range * CELL_SIZE;
        const towerCx = tw.x * CELL_SIZE + CELL_SIZE / 2;
        const towerCy = tw.y * CELL_SIZE + CELL_SIZE / 2;
        for (const p of ps.pirates) {
          if (!p.alive) continue;
          if (tw.arrows <= 0) break;
          const d = Math.hypot(p._px - towerCx, p._py - towerCy);
          if (d > rangePx) continue;
          p.hp -= stats.arrowDMG;
          tw.arrows--;
          // 创建射弹
          ps.projectiles.push({
            type: 'arrow',
            startX: towerCx, startY: towerCy - 8,
            endX: p._px, endY: p._py - 16,
            startTime: now,
            duration: 280,
            targetId: p.id
          });
          // 塔基尘土
          ps.vfx.push({
            type: 'dust',
            x: towerCx, y: towerCy + CELL_SIZE / 2 - 4,
            startTime: now,
            duration: 350
          });
          if (p.hp <= 0) p.alive = false;
        }
      }

      // 更新射弹 & 命中 VFX
      for (let i = ps.projectiles.length - 1; i >= 0; i--) {
        const pr = ps.projectiles[i];
        const elapsed = now - pr.startTime;
        if (elapsed >= pr.duration) {
          // 命中闪光
          ps.vfx.push({
            type: 'hit',
            x: pr.endX, y: pr.endY,
            startTime: now,
            duration: 250
          });
          ps.projectiles.splice(i, 1);
        }
      }
      // 清理过期 VFX
      ps.vfx = ps.vfx.filter(v => (now - v.startTime) < v.duration);
    }

    updateCombatAnim(ps, deltaMs);
  }

  function updateCombatAnim(ps, deltaMs) {
    const WALK_MS = 120;
    for (const u of ps.pirates) {
      if (!u.alive) continue;
      const dx = (u._tx ?? u._px) - u._px;
      const dy = (u._ty ?? u._py) - u._py;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.5;
      if (moving) {
        // 方向：从速度向量推断
        if (Math.abs(dx) > Math.abs(dy)) u._direction = dx > 0 ? 2 : 1;
        else u._direction = dy > 0 ? 0 : 3;
      }
      // 战斗期间不停步，持续播放动画
      u._walkTimer += deltaMs;
      if (u._walkTimer >= WALK_MS) {
        u._walkFrame = (u._walkFrame + 1) % 3;
        u._walkTimer -= WALK_MS;
      }
    }
    for (const s of ps.soldiers) {
      if (s.hp <= 0) continue;
      const dx = (s._tx ?? s._px) - s._px;
      const dy = (s._ty ?? s._py) - s._py;
      const moving = Math.abs(dx) + Math.abs(dy) > 0.5;
      if (moving) {
        if (Math.abs(dx) > Math.abs(dy)) s._direction = dx > 0 ? 2 : 1;
        else s._direction = dy > 0 ? 0 : 3;
      }
      // 战斗期间不停步，持续播放动画
      s._walkTimer += deltaMs;
      if (s._walkTimer >= WALK_MS) {
        s._walkFrame = (s._walkFrame + 1) % 3;
        s._walkTimer -= WALK_MS;
      }
    }
  }

  function buildCombatRenderState(ps) {
    return {
      phase: ps.phase,
      wave: ps.wave,
      pirates: ps.pirates.map(p => ({
        id: p.id, alive: p.alive, hp: p.hp, maxHp: p.maxHp, atk: p.atk,
        x: p._px / CELL_SIZE,
        y: p._py / CELL_SIZE,
        _px: p._px, _py: p._py,
        _direction: p._direction ?? 0,
        _walkFrame: p._walkFrame ?? 0,
        _lastFrameTime: 1e15
      })),
      soldiers: ps.soldiers.map(s => ({
        id: s.id, hp: s.hp, maxHp: s.maxHp, atk: s.atk,
        x: s._px / CELL_SIZE,
        y: s._py / CELL_SIZE,
        _px: s._px, _py: s._py,
        _direction: s._direction ?? 0,
        _walkFrame: s._walkFrame ?? 0,
        _lastFrameTime: 1e15
      })),
      towers: ps.towers,
      ships: (ps.ships || []).map(s => ({
        id: s.id,
        x: s._px / CELL_SIZE,
        y: s._py / CELL_SIZE,
        state: s.state
      })),
      projectiles: (ps.projectiles || []).map(p => ({ ...p })),
      vfx: (ps.vfx || []).map(v => ({ ...v })),
      _hasFightVFX: (ps.vfx || []).some(v => v.type === 'fightVFX'),
      _combatSoldierIds: ps._combatSoldierIds || new Set(),
      _combatPirateIds: ps._combatPirateIds || new Set()
    };
  }

  // ─── 非战斗士兵游走 ───

  function updateOffDutySoldiers(deltaMs) {
    const soldiers = data.soldiers.filter(s => s.alive);
    if (soldiers.length === 0) return;

    for (const s of soldiers) {
      // 首次初始化像素位置
      if (s._px === undefined) {
        s._px = s.x * CELL_SIZE + CELL_SIZE / 2;
        s._py = s.y * CELL_SIZE + CELL_SIZE;
      }
      if (!s._state) s._state = 'idle';
      if (!s._wanderTimer) s._wanderTimer = 0;
      if (!s._walkMax) s._walkMax = 0;
      if (!s._walkFrameTimer) s._walkFrameTimer = 0;
      if (!s._walkFrame) s._walkFrame = 0;
      // 防御：存档中遗留的数字方向转为字符串
      if (typeof s._direction === 'number') s._direction = NUM_TO_DIR[s._direction] || 'down';

      const now = Date.now();

      if (s._state === 'idle') {
        s._wanderTimer += deltaMs;
        if (s._wanderTimer >= (s._wanderInterval || 2000)) {
          s._wanderTimer = 0;
          s._wanderInterval = Math.random() * 3000 + 2000; // 2-5s 间隔
          // 随机选方向 → 进入漫游
          s._direction = SOLDIER_DIRS[Math.floor(Math.random() * SOLDIER_DIRS.length)];
          s._walkFrame = 0;
          s._walkFrameTimer = 0;
          s._walkDuration = 0;
          s._walkMax = Math.random() * 4000 + 2000; // 2-6s 行走时长
          s._state = 'wandering';
        }
      } else if (s._state === 'wandering') {
        // 行走时长限制
        s._walkDuration += deltaMs;
        if (s._walkDuration >= s._walkMax) {
          s._state = 'idle';
          s._wanderTimer = 0;
          s._wanderInterval = Math.random() * 3000 + 2000;
          continue;
        }
        // 方向切换：每 2-4s 有 40% 概率换方向（比 NPC 的 65% 更低，士兵更专注）
        s._wanderTimer += deltaMs;
        if (s._wanderTimer >= (s._wanderInterval || 2000)) {
          s._wanderTimer = 0;
          s._wanderInterval = Math.random() * 2000 + 2000;
          if (Math.random() < 0.4) {
            s._direction = SOLDIER_DIRS[Math.floor(Math.random() * SOLDIER_DIRS.length)];
            s._walkFrame = 0;
          }
        }
        // 像素移动 + 围栏限制
        const moveAmount = SOLDIER_SPEED * deltaMs / 1000;
        const [ddx, ddy] = SOLDIER_DIR_DELTA[s._direction];
        let nextPx = s._px + ddx * moveAmount;
        let nextPy = s._py + ddy * moveAmount;
        // 限制在兵营半径内
        const cx = s.x * CELL_SIZE + CELL_SIZE / 2;
        const cy = s.y * CELL_SIZE + CELL_SIZE;
        const dist = Math.hypot(nextPx - cx, nextPy - cy);
        if (dist <= 2.5 * CELL_SIZE) {
          s._px = nextPx;
          s._py = nextPy;
        } else {
          // 碰边界 → 掉头
          s._state = 'idle';
          s._wanderTimer = 0;
          s._wanderInterval = Math.random() * 2000 + 1000;
        }
        // 行走动画
        const WALK_MS = 150;
        s._walkFrameTimer += deltaMs;
        if (s._walkFrameTimer >= WALK_MS) {
          s._walkFrame = (s._walkFrame + 1) % 3;
          s._walkFrameTimer -= WALK_MS;
        }
      }
      // idle 不动时 static frame
    }
  }

  function buildOffDutySoldiers() {
    const soldiers = data.soldiers.filter(s => s.alive);
    return soldiers.map(s => {
      if (!s._renderObj) {
        s._renderObj = { _lastFrameTime: 0, _walkFrame: 0 };
      }
      const isWalking = s._state === 'wandering';
      s._renderObj.id = s.id;
      s._renderObj.x = s._px / CELL_SIZE;
      s._renderObj.y = s._py / CELL_SIZE;
      s._renderObj.hp = s.hp;
      s._renderObj.maxHp = s.maxHp;
      s._renderObj.atk = s.atk;
      s._renderObj._walkFrame = isWalking ? s._walkFrame : 1;
      s._renderObj._lastFrameTime = 1e15;
      s._renderObj._direction = isWalking ? (DIR_TO_NUM[s._direction] ?? 0) : 0;
      return s._renderObj;
    });
  }

  setInterval(() => {
    const { income, breakdown } = tickIncomeWithBuffs(data.island.buildings, data.stats);
    if (Object.keys(income).length > 0) {
      data.resources = mergeResources(data.resources, income);
      const { capped, overflow } = capResources(data.resources, calculateCapacity(data.island.buildings));
      data.resources = capped;
      data.stats.tickIncomeCount = (data.stats.tickIncomeCount || 0) + 1;
      // 每日任务进度（金币收入）
      if (income.gold) updateDailyProgress({ earn_gold: income.gold });
      resourceBar.update(data.resources, data.island.level);
      for (const [k, v] of Object.entries(overflow)) {
        const icon = RES_ICONS[k] || k;
        const bldName = CAPACITY_BUILDERS[k] || '';
        toast.show(`${icon} 容量已满，多建${bldName}扩容`, 2500);
      }
      playSound('tick_income');
      if (breakdown.length > 0) animateTickIncome(breakdown);
      updateLevel();
    }
    // 海盗战斗 tick（Demo 快速战斗中跳过，由 demoCombatTimer 接管；warning 由 demoWarningTimer 接管）
    if (!demoCombatTimer && data.pirateState.phase !== 'warning') pirateTick();
    // 海盗状态 UI 更新
    pirateWarning.update(data.pirateState);
    // 非战斗驻守士兵渲染
    island.setOffDutySoldiers(buildOffDutySoldiers());
  }, ECONOMY_TICK);

  // ─── 9. 自动存档（30s）───
  setInterval(() => {
    data.island.buildings = island.getBuildings();
    data.island.lastOnline = Date.now();
    data.pickupSystem = pickupSystem.getState();
    data.starEcon = starEcon.getState();
    data.npcs = npcEngine.getState();
    saveGameData(data);
  }, 30000);

  console.log('Word Island Builder ready', data);
}

bootstrap().catch(err => {
  document.getElementById('app').innerHTML = `<div style="padding:40px;color:red">启动失败: ${err.message}</div>`;
  console.error('Bootstrap failed:', err);
});