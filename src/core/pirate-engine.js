/**
 * pirate-engine.js
 * 海盗事件引擎 — 激活检测、波次生成、每tick战斗、破坏判定、波次结算
 */

import { PIRATE_TYPES, PIRATE_EVENT, BUILDING_HP, SOLDIER_MAINTENANCE, MAX_PIRATE_SHIPS, TERRAIN } from '../data/constants.js';
import { getBuildingById, getUpgradeStats } from '../data/buildings.js';

// ─── 激活检测 ───

/**
 * 检查是否满足海盗事件激活条件（码头 + 市场同时存在）
 * @param {Array} buildings - 已放置建筑列表
 * @returns {boolean}
 */
export function pirateActivationCheck(buildings) {
  const ids = new Set(buildings.map(b => b.id));
  return PIRATE_EVENT.activation.every(reqId => ids.has(reqId));
}

// ─── 波次生成 ───

/**
 * 根据波次号生成海盗队伍
 * @param {number} wave - 波次号（1-based）
 * @returns {Array} 海盗对象数组 [{id, x, y, hp, maxHp, atk, speed, type, lootGold, pathIndex}]
 */
export function spawnWave(buildings, wave) {
  const count = PIRATE_EVENT.baseWaveSize
    + Math.floor(Math.random() * (PIRATE_EVENT.extraRandom + 1))
    + Math.min(wave - 1, 5);

  const pirates = [];
  // 波次难度权重调整
  const weightShift = Math.min((wave - 1) * 5, 25);

  for (let i = 0; i < count; i++) {
    const type = weightedRandom(PIRATE_TYPES, weightShift);
    // 海盗从地图边缘水域随机出生
    const edge = pickWaterEdge();
    pirates.push({
      id: `pirate_${Date.now()}_${i}`,
      type: type.id,
      name: type.name,
      x: edge.x,
      y: edge.y,
      hp: type.hp,
      maxHp: type.hp,
      atk: type.atk,
      speed: type.speed,
      lootGold: type.lootGold,
      pathIndex: 0,
      alive: true
    });
  }

  return pirates;
}

function weightedRandom(types, shift) {
  const adjusted = types.map(t => ({
    ...t,
    weight: Math.max(1, t.weight + (t.id === 'captain' ? shift : t.id === 'brute' ? shift / 2 : 0))
  }));
  const total = adjusted.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of adjusted) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return adjusted[0];
}

function pickWaterEdge() {
  // 在 12×12 网格边缘水域随机选点
  const edges = [];
  for (let i = 0; i < 12; i++) {
    edges.push({ x: 0, y: i });
    edges.push({ x: 11, y: i });
    edges.push({ x: i, y: 0 });
    edges.push({ x: i, y: 11 });
  }
  return edges[Math.floor(Math.random() * edges.length)];
}

// ─── 路径推进 ───

/**
 * 计算海盗朝向建筑移动（每tick）
 * @param {Array} pirates - 海盗列表
 * @param {Array} buildings - 建筑列表
 * @param {Array} terrain - 地形网格 [y][x]
 */
export function movePirates(pirates, buildings, terrain) {
  if (!buildings || buildings.length === 0) return;

  for (const p of pirates) {
    if (!p.alive) continue;

    // 选取最近的可攻击建筑
    const target = findNearestBuilding(p, buildings);
    if (!target) continue;

    // 简单曼哈顿路径：每tick朝目标移动 speed 格
    const dx = Math.sign(target.x - p.x) * Math.min(p.speed, Math.abs(target.x - p.x));
    const dy = Math.sign(target.y - p.y) * Math.min(p.speed, Math.abs(target.y - p.y));

    p.x += dx;
    p.y += dy;
    p.pathIndex++;

    // 到达建筑位置 → 开始攻击
    if (p.x === target.x && p.y === target.y) {
      p.atBuilding = target.id;
    }
  }
}

function findNearestBuilding(pirate, buildings) {
  let nearest = null;
  let minDist = Infinity;
  for (const b of buildings) {
    const dist = Math.abs(b.x - pirate.x) + Math.abs(b.y - pirate.y);
    if (dist < minDist) {
      minDist = dist;
      nearest = b;
    }
  }
  return nearest;
}

// ─── 战斗 Tick ───

/**
 * 每 tick 执行一次战斗回合
 * @param {Array} pirates - 海盗列表
 * @param {Array} soldiers - 士兵列表
 * @param {Array} towers - 防御塔列表（含位置、等级）
 * @param {Array} buildings - 建筑列表（用于伤害判定）
 * @returns {{pirateLog:Array, buildingDamage:Object}} 战斗日志和建筑受损
 */
export function combatTick(pirates, soldiers, towers, buildings) {
  const pirateLog = [];
  const buildingDamage = {}; // { buildingId: damage }

  // 1. 防御塔射击：每个塔攻击射程内的海盗
  for (const tw of towers) {
    const stats = getUpgradeStats(getBuildingById('defense_tower'), tw.level || 1);
    if (!stats || tw.arrows <= 0) continue;

    const inRange = pirates.filter(p =>
      p.alive &&
      Math.abs(p.x - tw.x) <= stats.range &&
      Math.abs(p.y - tw.y) <= stats.range
    );

    for (const target of inRange) {
      if (tw.arrows <= 0) break;
      target.hp -= stats.arrowDMG;
      tw.arrows--;
      pirateLog.push({ event: 'tower_arrow', towerId: tw.id, target: target.id, dmg: stats.arrowDMG });

      if (target.hp <= 0) {
        target.alive = false;
        pirateLog.push({ event: 'pirate_killed', target: target.id, by: 'tower' });
      }
    }
  }

  // 2. 士兵 vs 海盗近战（1v1匹配）
  const aliveSoldiers = soldiers.filter(s => s.hp > 0);
  const alivePirates = pirates.filter(p => p.alive);

  for (let i = 0; i < Math.min(aliveSoldiers.length, alivePirates.length); i++) {
    const soldier = aliveSoldiers[i];
    const pirate = alivePirates[i];

    soldier.hp -= pirate.atk;
    pirate.hp -= soldier.atk;

    pirateLog.push({
      event: 'melee',
      soldierId: soldier.id,
      pirateId: pirate.id,
      soldierHP: soldier.hp,
      pirateHP: pirate.hp
    });

    if (soldier.hp <= 0) {
      pirateLog.push({ event: 'soldier_killed', soldierId: soldier.id });
    }
    if (pirate.hp <= 0) {
      pirate.alive = false;
      pirateLog.push({ event: 'pirate_killed', target: pirate.id, by: 'soldier' });
    }
  }

  // 3. 海盗攻击建筑：在海盗所在格子有建筑则造成伤害
  for (const p of pirates) {
    if (!p.alive) continue;
    const onBuilding = buildings.find(b => b.x === p.x && b.y === p.y && b.id !== 'tree');
    if (onBuilding) {
      buildingDamage[onBuilding.id] = (buildingDamage[onBuilding.id] || 0) + p.atk;
    }
  }

  // 清理阵亡
  pirates = pirates.filter(p => p.alive);

  return { pirateLog, buildingDamage };
}

// ─── 建筑破坏判定 ───

/**
 * 应用建筑伤害，返回被摧毁的建筑列表
 * @param {Array} buildings - 建筑列表（含 hp）
 * @param {Object} damageMap - { buildingId: damage }
 * @returns {{destroyed:Array, damaged:Array}} 被摧毁和受损建筑
 */
export function checkDestruction(buildings, damageMap) {
  const destroyed = [];
  const damaged = [];

  for (const b of buildings) {
    const dmg = damageMap[b.id] || 0;
    if (dmg <= 0) continue;

    const def = getBuildingById(b.id);
    const maxHp = BUILDING_HP[def?.tier ?? 0] || 80;
    b.hp = Math.max(0, (b.hp ?? maxHp) - dmg);

    if (b.hp <= 0) {
      destroyed.push(b);
    } else {
      damaged.push({ id: b.id, hp: b.hp, maxHp });
    }
  }

  return { destroyed, damaged };
}

// ─── 波次结算 ───

/**
 * 波次结束处理：统计击杀、计算奖励
 * @param {Object} waveState - 波次状态 { wave, piratesDefeated, buildingsDestroyed }
 * @returns {{gold:number, star:number, survivedAll:boolean}}
 */
export function processWaveEnd(waveState) {
  const { piratesDefeated = [], buildingsDestroyed = [], wave = 1 } = waveState;

  // 击杀奖励
  let gold = 0;
  for (const pirate of piratesDefeated) {
    gold += (pirate.lootGold || 0) * PIRATE_EVENT.rewardMultiplier;
  }

  // 波次 bonus
  const star = buildingsDestroyed.length === 0 ? 1 : 0;

  const survivedAll = buildingsDestroyed.length === 0;

  return { gold, star, survivedAll };
}

/**
 * 获取当前海盗状态快照（用于UI展示）
 */
export function getPirateState(waveState) {
  const { wave = 0, pirates = [], soldiers = [], phase = 'idle' } = waveState || {};
  return {
    active: phase !== 'idle',
    phase,
    wave,
    piratesAlive: pirates.filter(p => p.alive).length,
    piratesTotal: pirates.length,
    soldiersAlive: soldiers.filter(s => s.hp > 0).length,
    soldiersTotal: soldiers.length
  };
}

// ─── 海盗船系统 ───

/**
 * 找海岸水域格子：WATER 且与可建筑陆地(GRASS/SAND)曼哈顿相邻
 * @param {Array<number[]>} terrainMap — [y][x] 地形值
 * @param {number} G — 网格大小
 * @returns {Array<{x:number, y:number}>}
 */
export function findShoreTiles(terrainMap, G = 12) {
  const tiles = [];
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      if (terrainMap[y][x] !== TERRAIN.WATER) continue;
      // 检查四邻是否可建筑陆地
      const neighbors = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < G && ny >= 0 && ny < G) {
          const t = terrainMap[ny][nx];
          if (t === 0 || t === 1) { // GRASS or SAND
            tiles.push({ x, y });
            break;
          }
        }
      }
    }
  }
  return tiles;
}

/**
 * 找地图边缘水域格子（离海岸最远的水域）
 * @param {Array<number[]>} terrainMap
 * @param {number} G
 * @param {Array} shoreTiles
 * @returns {Array<{x:number, y:number}>}
 */
export function findWaterEdgeTiles(terrainMap, G = 12, shoreTiles) {
  const shoreSet = new Set(shoreTiles.map(t => `${t.x},${t.y}`));
  const edges = [];
  // 优先四条边上的 WATER
  const sides = [];
  for (let i = 0; i < G; i++) {
    sides.push({ x: 0, y: i }); sides.push({ x: G - 1, y: i });
    sides.push({ x: i, y: 0 }); sides.push({ x: i, y: G - 1 });
  }
  for (const { x, y } of sides) {
    if (terrainMap[y][x] === TERRAIN.WATER && !shoreSet.has(`${x},${y}`)) {
      edges.push({ x, y });
    }
  }
  // fallback：任意水域
  if (edges.length === 0) {
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        if (terrainMap[y][x] === TERRAIN.WATER) edges.push({ x, y });
      }
    }
  }
  return edges;
}

/**
 * 为当前波次生成海盗船
 * @param {Array<number[]>} terrainMap
 * @param {number} wave — 1-based
 * @param {number} G
 * @param {number} totalPirates — 本波海盗总数
 * @returns {Array} 海盗船对象
 */
export function spawnShips(terrainMap, wave, G = 12, totalPirates) {
  const shore = findShoreTiles(terrainMap, G);
  if (shore.length === 0) return [];

  const edges = findWaterEdgeTiles(terrainMap, G, shore);
  if (edges.length === 0) return [];

  // 最高难度最多 3 船，最低 1 船
  const maxShips = Math.min(MAX_PIRATE_SHIPS, Math.ceil(wave / 2));
  const shipCount = Math.max(1, Math.min(maxShips, edges.length));

  // 按边 + 同列/同行构建有效 (edge→shore) 配对，保证纯水平/垂直水路径
  function edgeSide(t) { return t.x <= 1 ? 'left' : t.x >= G - 2 ? 'right' : t.y <= 1 ? 'top' : 'bottom'; }
  const pairsBySide = { left: [], right: [], top: [], bottom: [] };
  const shoreByCol = {};
  const shoreByRow = {};
  for (const s of shore) {
    (shoreByCol[s.x] ||= []).push(s);
    (shoreByRow[s.y] ||= []).push(s);
  }

  // ── 辅助：校验两点间水平/垂直路径是否全部为水格 ──
  function horizontalWater(x1, x2, y) {
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    for (let x = lo; x <= hi; x++) if (terrainMap[y][x] !== TERRAIN.WATER) return false;
    return true;
  }
  function verticalWater(y1, y2, x) {
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    for (let y = lo; y <= hi; y++) if (terrainMap[y][x] !== TERRAIN.WATER) return false;
    return true;
  }

  for (const e of edges) {
    const side = edgeSide(e);
    if (side === 'left' || side === 'right') {
      // 同行 shoreline 上所有 shore，只保留纯水水平路径可达的
      const rowShores = shoreByRow[e.y] || [];
      for (const s of rowShores) {
        if (horizontalWater(e.x, s.x, e.y)) {
          pairsBySide[side].push({ edge: e, shore: s });
        }
      }
    } else {
      // top/bottom：同列 shore（排除自身），只保留纯水垂直路径可达的
      const colShores = shoreByCol[e.x] || [];
      let found = false;
      for (const s of colShores) {
        if (s.y !== e.y && verticalWater(e.y, s.y, e.x)) {
          pairsBySide[side].push({ edge: e, shore: s });
          found = true;
        }
      }
      // 同列无有效 shore → top 用同行（仅纯水水平可达），bottom 无解跳过
      if (!found && side === 'top') {
        const rowShores = shoreByRow[e.y] || [];
        for (const s of rowShores) {
          if (s.x !== e.x && horizontalWater(e.x, s.x, e.y)) {
            pairsBySide[side].push({ edge: e, shore: s });
          }
        }
      }
    }
  }

  const ships = [];
  const usedEdges = new Set();
  const usedShores = new Set();
  const pirates = totalPirates || (PIRATE_EVENT.baseWaveSize + Math.floor(Math.random() * (PIRATE_EVENT.extraRandom + 1)) + Math.min(wave - 1, 5));
  const perShip = Math.ceil(pirates / shipCount);

  const sideOrder = ['left', 'right', 'top', 'bottom'].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shipCount; i++) {
    const side = sideOrder[i % sideOrder.length];
    const pairs = pairsBySide[side];
    if (!pairs || pairs.length === 0) continue;

    // 过滤已用的 edge 和 shore
    const valid = pairs.filter(p =>
      !usedEdges.has(`${p.edge.x},${p.edge.y}`) &&
      !usedShores.has(`${p.shore.x},${p.shore.y}`)
    );
    if (valid.length === 0) continue;

    const { edge: start, shore: dest } = valid[Math.floor(Math.random() * valid.length)];
    usedEdges.add(`${start.x},${start.y}`);
    usedShores.add(`${dest.x},${dest.y}`);

    const carry = i === shipCount - 1
      ? pirates - (shipCount - 1) * perShip
      : perShip;

    ships.push({
      id: `ship_${Date.now()}_${i}`,
      x: start.x, y: start.y,
      targetX: dest.x, targetY: dest.y,
      pirateCount: Math.max(1, carry),
      state: 'sailing',
      _px: start.x * 64 + 32,
      _py: start.y * 64 + 32,
      _tx: start.x * 64 + 32,
      _ty: start.y * 64 + 32
    });
  }
  return ships;
}

/**
 * 每 tick 移动船只向海岸目的地（每次 1 格，仅在水域移动）
 * @param {Array} ships
 * @param {Array<number[]>} terrainMap
 * @param {number} G
 * @returns {Array} 已到岸的船只
 */
export function moveShips(ships, terrainMap, G = 12) {
  const arrived = [];
  for (const s of ships) {
    if (s.state !== 'sailing') continue;
    // 已到达 → 靠岸
    if (s.x === s.targetX && s.y === s.targetY) {
      s.state = 'docked';
      arrived.push(s);
      continue;
    }
    // 曼哈顿方向推进（优先较远轴）
    const dx = Math.sign(s.targetX - s.x);
    const dy = Math.sign(s.targetY - s.y);
    const distX = Math.abs(s.targetX - s.x);
    const distY = Math.abs(s.targetY - s.y);

    let nextX = s.x, nextY = s.y;
    if (distX >= distY && dx !== 0) {
      nextX = s.x + dx;
    } else if (dy !== 0) {
      nextY = s.y + dy;
    } else if (dx !== 0) {
      nextX = s.x + dx;
    }

    // 仅在水域中移动
    if (nextX >= 0 && nextX < G && nextY >= 0 && nextY < G && terrainMap[nextY][nextX] === TERRAIN.WATER) {
      s.x = nextX;
      s.y = nextY;
    } else if (terrainMap[s.y + dy]?.[s.x] === TERRAIN.WATER) {
      s.y += dy;
    } else if (terrainMap[s.y]?.[s.x + dx] === TERRAIN.WATER) {
      s.x += dx;
    }

    // 更新像素目标
    s._tx = s.x * 64 + 32;
    s._ty = s.y * 64 + 32;

    // 检查是否到达
    if (s.x === s.targetX && s.y === s.targetY) {
      s.state = 'docked';
      arrived.push(s);
    }
  }
  return arrived;
}

/**
 * 船只靠岸后，生成海盗从海岸格子上岸
 * @param {Object} ship — 已 dock 的船
 * @param {number} wave — 当前波次
 * @param {number} iOffset — 海盗ID 起始偏移
 * @returns {Array} 海盗对象
 */
export function disembarkShip(ship, wave, iOffset = 0) {
  const pirates = [];
  const weightShift = Math.min((wave - 1) * 5, 25);
  for (let i = 0; i < ship.pirateCount; i++) {
    const type = weightedRandom(PIRATE_TYPES, weightShift);
    pirates.push({
      id: `pirate_${ship.id}_${iOffset + i}`,
      type: type.id,
      name: type.name,
      x: ship.targetX,
      y: ship.targetY,
      hp: type.hp,
      maxHp: type.hp,
      atk: type.atk,
      speed: type.speed,
      lootGold: type.lootGold,
      pathIndex: 0,
      alive: true
    });
  }
  return pirates;
}
