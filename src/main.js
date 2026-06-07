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
import { getDailyTasks, createTaskTracker, getTaskById, checkTaskComplete } from './data/tasks.js';
import { transition, getState } from './core/state.js';
import { STARTING_RESOURCES, ECONOMY_TICK, CELL_SIZE, AppState, DEFAULT_ISLAND_TERRAIN } from './data/constants.js';
import { getBuildingById, countLearnedWords } from './data/buildings.js';
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
      dailyTasks: { date: '', taskIds: [], progress: createTaskTracker().progress, claimed: [] }
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
  let lastAnimTime = performance.now();
  (function animLoop(now) {
    const delta = now - lastAnimTime;
    lastAnimTime = now;
    npcEngine.update(delta);
    island.render();

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

    // ─── 拆除建筑（点击弹出确认窗）───
    if (getState() === AppState.IDLE && !isMoveMode) {
      const buildingIdx = island.findBuildingAt(x, y);
      if (buildingIdx >= 0) {
        const building = island.getBuildings()[buildingIdx];
        showDemolishConfirm(building, buildingIdx);
        return;
      }
      // 点击空白处 → 关闭拆除确认窗
      hideDemolishBar();
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
      layer: previewBuilding.layer ?? 1,
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

  // ─── 8. 被动收入 tick（含 Buff + 飞入动画）───
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