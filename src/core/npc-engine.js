/**
 * npc-engine.js
 * NPC 核心逻辑 — 像素平滑移动、行走动画、任务生成、进度检测、渲染
 *
 * 使用 createNpcEngine(stateRef) 工厂函数创建。
 * stateRef 包含 data / resources / buildings / stats / island 的引用，
 * 引擎内部直接读取最新值。
 *
 * 任务两阶段流程：
 *   offer — NPC 发起任务，玩家「接」或「不接」
 *   claim — 任务进度完成，玩家「领取」奖励
 *
 * 移动系统：
 *   idle：等待 wanderInterval 后随机选方向发起移动
 *   wandering：像素空间连续自由移动，每帧碰撞检测，定时概率换向
 *   quest_ready：任务进度完成 → 静止，显示「✓」气泡
 */

import { NPC_DEFS, getUnbuiltUnlocked } from '../data/npcs.js';
import { BUILDINGS } from '../data/buildings.js';
import { ISLAND_GRID_SIZE, CELL_SIZE, TERRAIN } from '../data/constants.js';

/* ── Spritesheet 常量 ── */
const NPC_FRAME_W = 32;
const NPC_FRAME_H = 32;
const NPC_COLS = 3;

/* NPC 绘制尺寸 — 半格，32×32 */
const NPC_RENDER_W = 32;
const NPC_RENDER_H = 32;

/* NPC 移动速度 px/s（CELL_SIZE=64 时约 2.29 秒/格） */
const NPC_SPEED = 28;

/* 行走动画帧间隔 ms（3 帧约 0.45s，跨格移动期间约 2.5 个循环） */
const WALK_FRAME_MS = 150;

/* 方向 → spritesheet 行 */
const DIR_ROWS = { down: 0, left: 1, right: 1, up: 2 };
const DIRECTIONS = ['down', 'up', 'left', 'right'];
const DIR_DELTA = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

/* 不可通行的地形 */
const BLOCKED = new Set([TERRAIN.WATER, TERRAIN.STONE, TERRAIN.SAND]);

/* 收集类任务 base 值 */
const COLLECT_BASES = { gold: 100, wood: 50, stone: 30 };

/* ── 工具函数 ── */
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* 计算 NPC 当前所占格子（像素→网格） */
function npcGridX(npc) { return Math.floor(npc.px / CELL_SIZE); }
function npcGridY(npc) { return Math.floor(npc.py / CELL_SIZE); }

/* ── 工厂函数 ── */
export function createNpcEngine(stateRef) {
  const npcs = [];

  /* ── 内部辅助 ── */

  function getTerrain() {
    return stateRef.island?.terrainMap || [];
  }

  function getBuildings() {
    return stateRef.island?.buildings || [];
  }

  /** 检查格子是否 NPC 可通行 */
  function isPassable(gx, gy, excludeId) {
    if (gx < 0 || gx >= ISLAND_GRID_SIZE || gy < 0 || gy >= ISLAND_GRID_SIZE) return false;
    const terrain = getTerrain();
    const t = (terrain[gy] && terrain[gy][gx]) ?? TERRAIN.WATER;
    if (BLOCKED.has(t)) return false;
    if (getBuildings().some(b => b.x === gx && b.y === gy)) return false;

    for (const n of npcs) {
      if (n.id === excludeId) continue;
      if (npcGridX(n) === gx && npcGridY(n) === gy) return false;
    }
    return true;
  }

  /** 在岛上找一个随机空地 */
  function findRandomSpawn() {
    const terrain = getTerrain();
    const buildings = getBuildings();
    const attempts = 200;
    for (let i = 0; i < attempts; i++) {
      const gx = randInt(0, ISLAND_GRID_SIZE - 1);
      const gy = randInt(0, ISLAND_GRID_SIZE - 1);
      const t = (terrain[gy] && terrain[gy][gx]) ?? TERRAIN.WATER;
      if (BLOCKED.has(t)) continue;
      if (buildings.some(b => b.x === gx && b.y === gy)) continue;
      if (npcs.some(n => npcGridX(n) === gx && npcGridY(n) === gy)) continue;
      return { gx, gy };
    }
    for (let gy = 0; gy < ISLAND_GRID_SIZE; gy++) {
      for (let gx = 0; gx < ISLAND_GRID_SIZE; gx++) {
        const t = (terrain[gy] && terrain[gy][gx]) ?? TERRAIN.WATER;
        if (BLOCKED.has(t)) continue;
        if (buildings.some(b => b.x === gx && b.y === gy)) continue;
        if (npcs.some(n => npcGridX(n) === gx && npcGridY(n) === gy)) continue;
        return { gx, gy };
      }
    }
    return { gx: 5, gy: 7 };
  }

  /** 生成任务 */
  function generateQuest(npcDef) {
    const level = stateRef.island?.level || 1;
    const pool = npcDef.questPool || ['build', 'vocab', 'collect'];
    const type = pick(pool);

    if (type === 'build') {
      const buildingDefs = BUILDINGS.filter(b => b.id !== 'tree');
      const unbuilt = getUnbuiltUnlocked(buildingDefs, getBuildings(), level);
      if (unbuilt.length === 0) {
        return generateVocabQuest(level);
      }
      const bldId = pick(unbuilt);
      const bldDef = BUILDINGS.find(b => b.id === bldId);
      const reward = { gold: 50 + level * 20, star: 1 };
      if (bldDef.cost) {
        if (bldDef.cost.wood) reward.wood = Math.floor(bldDef.cost.wood * 0.3);
        if (bldDef.cost.stone) reward.stone = Math.floor(bldDef.cost.stone * 0.3);
      }
      return {
        type: 'build',
        target: { buildingId: bldId, buildingName: bldDef?.name || bldId },
        reward,
        claimed: false,
        accepted: false,
        baseline: {}
      };
    }

    if (type === 'vocab') {
      return generateVocabQuest(level);
    }

    if (type === 'collect') {
      const resource = pick(['gold', 'wood', 'stone']);
      const base = COLLECT_BASES[resource] || 100;
      const amount = Math.max(1, Math.floor(base * level * 0.8));
      const reward = { gold: 20 + level * 10, star: 1 };
      reward[resource] = Math.floor(amount * 0.1);
      return {
        type: 'collect',
        target: { resource, amount },
        reward,
        claimed: false,
        accepted: false,
        baseline: {}
      };
    }

    return generateVocabQuest(level);
  }

  function generateVocabQuest(level) {
    const count = randInt(3, 8);
    return {
      type: 'vocab',
      target: { count },
      reward: { gold: 30 + level * 10, wood: 15 + level * 5, star: 1 },
      claimed: false,
      accepted: false,
      baseline: {}
    };
  }

  /** 检测任务进度是否达标 */
  function checkQuestProgress(quest) {
    if (!quest) return false;

    if (quest.type === 'build') {
      return getBuildings().some(b => b.id === quest.target.buildingId);
    }

    if (quest.type === 'vocab') {
      const current = stateRef.stats?.wordsCorrect || 0;
      const baseline = quest.baseline.wordsCorrect || 0;
      return (current - baseline) >= quest.target.count;
    }

    if (quest.type === 'collect') {
      const res = quest.target.resource;
      const current = stateRef.resources?.[res] || 0;
      return current >= quest.target.amount;
    }

    return false;
  }

  /** 计算任务进度百分比 + 标签 */
  function getProgressInfo(quest) {
    if (!quest) return { pct: 0, label: '' };
    if (quest.claimed) return { pct: 100, label: '已完成' };

    if (quest.type === 'build') {
      const done = getBuildings().some(b => b.id === quest.target.buildingId);
      return { pct: done ? 100 : 0, label: done ? '已建造' : '未建造' };
    }

    if (quest.type === 'vocab') {
      const current = stateRef.stats?.wordsCorrect || 0;
      const baseline = quest.baseline.wordsCorrect || 0;
      const target = quest.target.count || 1;
      const done = Math.max(0, current - baseline);
      const pct = Math.min(100, (done / target) * 100);
      return { pct, label: `${Math.min(done, target)} / ${target}` };
    }

    if (quest.type === 'collect') {
      const current = stateRef.resources?.[quest.target.resource] || 0;
      const target = quest.target.amount || 1;
      const pct = Math.min(100, (current / target) * 100);
      return { pct, label: `${Math.floor(current)} / ${target}` };
    }

    return { pct: 0, label: '' };
  }

  /** 初始化单个 NPC 运行时数据 */
  function initNpcRuntime(def, pos) {
    return {
      id: def.id,
      name: def.name,
      type: def.type,
      questPool: [...def.questPool],
      px: pos.gx * CELL_SIZE,
      py: pos.gy * CELL_SIZE,
      speed: NPC_SPEED,
      state: 'idle',
      direction: 'down',
      walkFrame: 0,
      walkFrameTimer: 0,
      wanderTimer: 0,
      wanderInterval: rand(2000, 4000),
      consecutiveFails: 0,
      quest: null,
      cooldownUntil: 0
    };
  }

  /* ═══════════════════════════════════════════
     公开 API
     ═══════════════════════════════════════════ */

  /** 按小屋数量解锁 NPC：第1间小屋→1个NPC，之后每+2间小屋→+1个NPC */
  function unlockNPCs(hutCount) {
    const maxNPCs = Math.floor((hutCount + 1) / 2);
    if (maxNPCs < 1) return [];

    const unlocked = [];
    for (let i = 0; i < NPC_DEFS.length && npcs.length + unlocked.length < maxNPCs; i++) {
      const def = NPC_DEFS[i];
      if (npcs.some(n => n.id === def.id)) continue;
      const pos = findRandomSpawn();
      const runtime = initNpcRuntime(def, pos);
      runtime.quest = generateQuest(def);
      npcs.push(runtime);
      unlocked.push(runtime);
    }
    return unlocked;
  }

  /** 初始化或恢复 NPC 列表 */
  function initFromData(savedNpcs, hutCount) {
    npcs.length = 0;
    if (savedNpcs && savedNpcs.length > 0) {
      for (const s of savedNpcs) {
        const def = NPC_DEFS.find(d => d.id === s.id);
        if (!def) continue;
        // 兼容旧存档：gx/gy → 推算 px/py
        const fallbackGx = s.gx != null ? s.gx : 0;
        const fallbackGy = s.gy != null ? s.gy : 0;
        npcs.push({
          id: s.id,
          name: def.name,
          type: def.type,
          questPool: [...def.questPool],
          px: s.px != null ? s.px : (fallbackGx * CELL_SIZE),
          py: s.py != null ? s.py : (fallbackGy * CELL_SIZE),
          speed: s.speed || NPC_SPEED,
          state: s.state || 'idle',
          direction: s.direction || 'down',
          walkFrame: s.walkFrame || 0,
          walkFrameTimer: s.walkFrameTimer || 0,
          wanderTimer: s.wanderTimer || 0,
          wanderInterval: s.wanderInterval || rand(2000, 4000),
          consecutiveFails: s.consecutiveFails || 0,
          quest: s.quest || null,
          cooldownUntil: s.cooldownUntil || 0
        });
      }
    }
    unlockNPCs(hutCount);
  }

  function getNPCs() {
    return npcs;
  }

  /** 查找指定格子上的 NPC（用像素取整判断，覆盖移动中 NPC） */
  function findNPCAt(gx, gy) {
    return npcs.findIndex(n => npcGridX(n) === gx && npcGridY(n) === gy);
  }

  /** 像素级命中检测：检查世界坐标点是否落在 NPC 视觉矩形内 */
  function hitTestNPC(worldPx, worldPy) {
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      const left = n.px + (CELL_SIZE - NPC_RENDER_W) / 2;
      const top = n.py - NPC_RENDER_H;
      if (worldPx >= left && worldPx < left + NPC_RENDER_W &&
          worldPy >= top && worldPy < top + NPC_RENDER_H) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 交互 NPC（通过像素坐标）：返回 phase 区分 offer / claim
   */
  function interactNPCByPixel(worldPx, worldPy) {
    const idx = hitTestNPC(worldPx, worldPy);
    return interactNPCByIndex(idx);
  }

  /**
   * 交互 NPC（通过 npc 索引）
   */
  function interactNPCByIndex(idx) {
    if (idx < 0 || idx >= npcs.length) return { npcIndex: -1, npc: null, quest: null, phase: null };

    const npc = npcs[idx];
    const q = npc.quest;

    if (!q || q.claimed) return { npcIndex: idx, npc, quest: null, phase: null };
    if (!q.accepted) return { npcIndex: idx, npc, quest: q, phase: 'offer' };
    if (q.accepted && checkQuestProgress(q)) {
      return { npcIndex: idx, npc, quest: q, phase: 'claim' };
    }
    // 已接取、未完成 → 显示进度
    return { npcIndex: idx, npc, quest: q, phase: 'progress' };
  }

  /**
   * 交互 NPC（通过格子坐标 — 保留兼容）
   */
  function interactNPC(gx, gy) {
    const idx = findNPCAt(gx, gy);
    return interactNPCByIndex(idx);
  }

  /** 接受任务，记录基线 */
  function acceptQuest(index) {
    if (index < 0 || index >= npcs.length) return false;
    const npc = npcs[index];
    if (!npc.quest || npc.quest.accepted || npc.quest.claimed) return false;

    const q = npc.quest;
    q.accepted = true;

    if (q.type === 'vocab') {
      q.baseline = { wordsCorrect: stateRef.stats?.wordsCorrect || 0 };
    } else if (q.type === 'collect') {
      q.baseline = {};
    }

    npc.state = 'idle';
    return true;
  }

  /** 领取奖励 */
  function claimQuest(index) {
    if (index < 0 || index >= npcs.length) return null;
    const npc = npcs[index];
    if (!npc.quest || npc.quest.claimed) return null;
    if (!npc.quest.accepted) return null;
    if (!checkQuestProgress(npc.quest)) return null;

    npc.quest.claimed = true;
    const reward = { ...npc.quest.reward };
    npc.state = 'idle';
    npc.cooldownUntil = Date.now() + 8 * 60 * 1000;
    return reward;
  }

  /** 跳过任务 */
  function skipQuest(index) {
    if (index < 0 || index >= npcs.length) return;
    const npc = npcs[index];
    npc.quest = null;
    npc.state = 'idle';
    npc.cooldownUntil = Date.now() + 30 * 60 * 1000;
  }

  function getQuestProgress(index) {
    if (index < 0 || index >= npcs.length) return null;
    return getProgressInfo(npcs[index].quest);
  }

  /* ═══════════════════════════════════════════
     主更新循环 — 像素移动
     ═══════════════════════════════════════════ */

  function update(deltaMs) {
    const now = Date.now();

    for (const npc of npcs) {
      // 冷却中仅禁止任务生成，不影响移动

      // 已接取的任务检测进度完成
      if (npc.quest && npc.quest.accepted && !npc.quest.claimed) {
        if (npc.state !== 'quest_ready' && checkQuestProgress(npc.quest)) {
          npc.state = 'quest_ready';
        }
      }

      /* ── 状态机 ── */

      if (npc.state === 'idle') {
        // 等待漫游计时器触发
        npc.wanderTimer += deltaMs;
        if (npc.wanderTimer >= npc.wanderInterval) {
          npc.wanderTimer = 0;
          npc.wanderInterval = rand(2000, 4000);

          // 任务生成检测：有任务时继续移动，不再卡在 quest_ready
          if (!npc.quest || npc.quest.claimed) {
            if (npc.cooldownUntil <= now) {
              const def = NPC_DEFS.find(d => d.id === npc.id) || { questPool: ['build', 'vocab', 'collect'] };
              npc.quest = generateQuest(def);
            }
          }

          // 发起自由漫游：随机选方向，进入持续行走
          npc.direction = pick(DIRECTIONS);
          npc.walkFrame = 0;
          npc.walkFrameTimer = 0;
          npc.state = 'wandering';
        }
      }

      else if (npc.state === 'wandering') {
        // —— 方向切换计时器：每 2-4s 有 65% 概率换方向 ——
        npc.wanderTimer += deltaMs;
        if (npc.wanderTimer >= npc.wanderInterval) {
          npc.wanderTimer = 0;
          npc.wanderInterval = rand(2000, 4000);
          if (Math.random() < 0.65) {
            npc.direction = pick(DIRECTIONS);
            npc.walkFrame = 0;
          }

          // 任务生成检测：有任务时继续移动
          if (!npc.quest || npc.quest.claimed) {
            if (npc.cooldownUntil <= now) {
              const def = NPC_DEFS.find(d => d.id === npc.id) || { questPool: ['build', 'vocab', 'collect'] };
              npc.quest = generateQuest(def);
            }
          }
        }

        // —— 边界情况：当前格子不可通行 → 强制换方向 ——
        const curGx = npcGridX(npc);
        const curGy = npcGridY(npc);
        if (!isPassable(curGx, curGy, npc.id)) {
          npc.direction = pick(DIRECTIONS);
          npc.consecutiveFails++;
          continue;
        }

        // —— 计算下一步像素位置 ——
        const moveAmount = npc.speed * deltaMs / 1000;
        const [ddx, ddy] = DIR_DELTA[npc.direction];
        const nextPx = npc.px + ddx * moveAmount;
        const nextPy = npc.py + ddy * moveAmount;

        // —— 碰撞检测：反算目标格 ——
        const nextGx = Math.floor(nextPx / CELL_SIZE);
        const nextGy = Math.floor(nextPy / CELL_SIZE);

        if (isPassable(nextGx, nextGy, npc.id)) {
          // 可通行：自由移动
          npc.px = nextPx;
          npc.py = nextPy;
          npc.consecutiveFails = 0;

          // 行走动画
          npc.walkFrameTimer += deltaMs;
          if (npc.walkFrameTimer >= WALK_FRAME_MS) {
            npc.walkFrame = (npc.walkFrame + 1) % NPC_COLS;
            npc.walkFrameTimer -= WALK_FRAME_MS;
          }
        } else {
          // 碰撞：换方向（避开当前方向）
          npc.consecutiveFails++;
          if (npc.consecutiveFails >= 3) {
            // 卡住 3 次 → 暂停一轮
            npc.state = 'idle';
            npc.wanderTimer = 0;
            npc.wanderInterval = rand(2000, 4000);
            npc.consecutiveFails = 0;
          } else {
            const otherDirs = DIRECTIONS.filter(d => d !== npc.direction);
            npc.direction = pick(otherDirs);
            npc.walkFrame = 0;
          }
        }
      }

      // quest_ready → 静止不动，不 wander
    }
  }

  /* ═══════════════════════════════════════════
     渲染 — 使用 px/py 像素坐标
     ═══════════════════════════════════════════ */

  function renderNPCs(ctx, assets, scale, now) {
    const sheet = assets?.villagerSheet;
    if (!sheet) return;

    const t = now || performance.now();

    for (const npc of npcs) {
      const drawX = npc.px + (CELL_SIZE - NPC_RENDER_W) / 2;
      const drawY = npc.py - NPC_RENDER_H;

      let srcCol, srcRow, flipX = false;

      if (npc.state === 'idle' || npc.state === 'quest_ready') {
        srcRow = 0;
        srcCol = 1;
      } else if (npc.state === 'wandering') {
        srcRow = DIR_ROWS[npc.direction] ?? 0;
        srcCol = npc.walkFrame % NPC_COLS;
      } else {
        srcRow = 0;
        srcCol = 1;
      }

      if (npc.direction === 'right') {
        flipX = true;
        srcRow = DIR_ROWS.left;
        srcCol = npc.state === 'idle' || npc.state === 'quest_ready' ? 1 : npc.walkFrame % NPC_COLS;
      }

      ctx.save();

      if (flipX) {
        ctx.translate(drawX + NPC_RENDER_W / 2, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(
          sheet,
          srcCol * NPC_FRAME_W, srcRow * NPC_FRAME_H, NPC_FRAME_W, NPC_FRAME_H,
          -NPC_RENDER_W / 2, 0, NPC_RENDER_W, NPC_RENDER_H
        );
      } else {
        ctx.drawImage(
          sheet,
          srcCol * NPC_FRAME_W, srcRow * NPC_FRAME_H, NPC_FRAME_W, NPC_FRAME_H,
          drawX, drawY, NPC_RENDER_W, NPC_RENDER_H
        );
      }

      ctx.restore();

      // ── 气泡 ──
      // quest_ready = 任务完成可领取 → "✓"
      // 有未完成 quest → "!"（跟随移动）
      if (npc.state === 'quest_ready') {
        drawQuestBubble(ctx, npc.px, drawY, t, '✓', '#27ae60');
      } else if (npc.quest && !npc.quest.claimed) {
        drawQuestBubble(ctx, npc.px, drawY, t, '!', '#e74c3c');
      }
    }
  }

  function drawQuestBubble(ctx, px, py, t, text = '!', color = '#e74c3c') {
    const bubbleX = px + CELL_SIZE / 2;
    const bubbleY = py - 6;
    const pulse = 0.9 + 0.1 * Math.sin(t / 300);

    ctx.save();
    ctx.translate(bubbleX, bubbleY);
    ctx.scale(pulse, pulse);

    const r = 8;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);

    ctx.restore();
  }

  /** 渲染单个 NPC */
  function renderNPC(ctx, npc, assets, now) {
    const sheet = assets?.villagerSheet;
    if (!sheet) return;

    const t = now || performance.now();
    const drawX = npc.px + (CELL_SIZE - NPC_RENDER_W) / 2;
    const drawY = npc.py - NPC_RENDER_H;

    let srcCol, srcRow, flipX = false;

    if (npc.state === 'idle' || npc.state === 'quest_ready') {
      srcRow = 0;
      srcCol = 1;
    } else if (npc.state === 'wandering') {
      srcRow = DIR_ROWS[npc.direction] ?? 0;
      srcCol = npc.walkFrame % NPC_COLS;
    } else {
      srcRow = 0;
      srcCol = 1;
    }

    if (npc.direction === 'right') {
      flipX = true;
      srcRow = DIR_ROWS.left;
      srcCol = npc.state === 'idle' || npc.state === 'quest_ready' ? 1 : npc.walkFrame % NPC_COLS;
    }

    ctx.save();

    if (flipX) {
      ctx.translate(drawX + NPC_RENDER_W / 2, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(
        sheet,
        srcCol * NPC_FRAME_W, srcRow * NPC_FRAME_H, NPC_FRAME_W, NPC_FRAME_H,
        -NPC_RENDER_W / 2, 0, NPC_RENDER_W, NPC_RENDER_H
      );
    } else {
      ctx.drawImage(
        sheet,
        srcCol * NPC_FRAME_W, srcRow * NPC_FRAME_H, NPC_FRAME_W, NPC_FRAME_H,
        drawX, drawY, NPC_RENDER_W, NPC_RENDER_H
      );
    }

    ctx.restore();

    if (npc.state === 'quest_ready') {
      drawQuestBubble(ctx, npc.px, drawY, t, '✓', '#27ae60');
    } else if (npc.quest && !npc.quest.claimed) {
      drawQuestBubble(ctx, npc.px, drawY, t, '!', '#e74c3c');
    }
  }

  /** 获取 NPC 存档数据 */
  function getState() {
    return npcs.map(n => ({
      id: n.id,
      gx: npcGridX(n),
      gy: npcGridY(n),
      px: n.px,
      py: n.py,
      speed: n.speed,
      state: n.state,
      direction: n.direction,
      walkFrame: n.walkFrame,
      walkFrameTimer: n.walkFrameTimer,
      wanderTimer: n.wanderTimer,
      wanderInterval: n.wanderInterval,
      consecutiveFails: n.consecutiveFails,
      quest: n.quest ? { ...n.quest } : null,
      cooldownUntil: n.cooldownUntil
    }));
  }

  return {
    initFromData,
    unlockNPCs,
    getNPCs,
    findNPCAt,
    hitTestNPC,
    interactNPC,
    interactNPCByPixel,
    acceptQuest,
    claimQuest,
    skipQuest,
    getQuestProgress,
    update,
    renderNPCs,
    renderNPC,
    getState
  };
}
