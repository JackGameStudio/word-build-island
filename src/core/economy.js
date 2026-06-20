/**
 * economy.js
 * 经济系统 — 资源管理、词汇→奖励映射、被动收入、离线结算、Buff 叠加
 */

import { OFFLINE_RATE, OFFLINE_MAX_HOURS, ECONOMY_TICK, BUILDING_HP, REPAIR_COST, SOLDIER_MAINTENANCE, PIRATE_EVENT } from '../data/constants.js';
import { getBuildingById } from '../data/buildings.js';

/**
 * Box → [记住奖励(quality>=3), 模糊奖励(quality<3)]
 * 来自 island-merge-balance v1.1
 */
const REWARD_TABLE = {
  1: [ { gold: 2, wood: 1 },            { gold: 1 } ],
  2: [ { gold: 3, wood: 2 },            { gold: 1, wood: 1 } ],
  3: [ { gold: 5, wood: 3 },              { gold: 2, wood: 1 } ],
  4: [ { gold: 8, wood: 5, stone: 3 },     { gold: 3, wood: 2 } ],
  5: [ { gold: 12, wood: 8, stone: 5 }, { gold: 5, wood: 3, stone: 1 } ]
};

/**
 * 根据词汇复习结果返回资源奖励
 * @param {object} word - 词汇对象
 * @param {number} quality - 答题质量 (0-5)
 * @param {object} buffs - 活动 Buff（来自 calculateBuffs）
 */
export function rewardForReview(word, quality, buffs = {}) {
  const idx = quality >= 3 ? 0 : 1;
  const base = { ...REWARD_TABLE[word.box]?.[idx] ?? { gold: 1 } };
  const reward = { ...base };

  // Box 5 额外 star（已在 REWARD_TABLE 里）
  if (quality >= 3 && word.box >= 5) {
    reward.star = (reward.star || 1);
  }

  // Garden: Box≥3 复习额外 gold+2
  if (buffs.goldBonusBox3 && quality >= 3 && word.box >= 3) {
    reward.gold = (reward.gold || 0) + buffs.goldBonusBox3;
  }

  // Deep Mine: Box≥4 复习奖励 ×1.3
  if (buffs.box4Multiplier && quality >= 3 && word.box >= 4) {
    Object.keys(reward).forEach(k => {
      if (k !== 'star') reward[k] = Math.floor((reward[k] || 0) * buffs.box4Multiplier);
    });
  }

  // Market: 所有复习 gold ×1.5
  if (buffs.reviewGoldMultiplier && reward.gold) {
    reward.gold = Math.floor(reward.gold * buffs.reviewGoldMultiplier);
  }

  // Castle: 全局学习 Buff+20%, ⭐×3
  if (buffs.globalBuff) {
    Object.keys(reward).forEach(k => {
      if (k === 'star') reward[k] = Math.floor((reward[k] || 0) * 3);
      else reward[k] = Math.floor((reward[k] || 0) * buffs.globalBuff);
    });
  }

  return reward;
}

/**
 * 被动收入 tick — 所有建筑的 income 累加
 * @returns {{gold?:number, wood?:number, stone?:number}}
 */
export function tickIncome(buildings) {
  const income = {};
  buildings.forEach(b => {
    const def = getBuildingById(b.id);
    if (!def?.income) return;
    Object.entries(def.income).forEach(([res, val]) => {
      income[res] = (income[res] || 0) + val;
    });
  });
  return income;
}

/**
 * 被动收入 tick（含 Buff 加成 + 每建筑明细）
 * @returns {{income:object, breakdown:Array<{x,y,icon,income:object}>}}
 */
export function tickIncomeWithBuffs(buildings, stats) {
  const buffs = calculateBuffs(buildings, stats || {});
  const income = {};
  const breakdown = [];

  buildings.forEach(b => {
    const def = getBuildingById(b.id);
    if (!def?.income) return;
    const buildingIncome = {};
    Object.entries(def.income).forEach(([res, val]) => {
      let total = val;
      if (res === 'wood' && buffs.woodBonus) total += buffs.woodBonus;
      if (res === 'stone' && buffs.stoneBonus) total += buffs.stoneBonus;
      income[res] = (income[res] || 0) + total;
      buildingIncome[res] = total;
    });
    if (Object.keys(buildingIncome).length > 0) {
      breakdown.push({ x: b.x, y: b.y, icon: def.icon, income: buildingIncome });
    }
  });

  return { income, breakdown };
}

/**
 * 离线收入结算
 * @param {Array} buildings — 已放置建筑列表
 * @param {number} lastOnline — 上次在线 timestamp
 * @returns {{gold?:number, wood?:number, stone?:number}}
 */
export function calculateOfflineIncome(buildings, lastOnline) {
  const now = Date.now();
  const elapsed = Math.min((now - lastOnline) / 1000, OFFLINE_MAX_HOURS * 3600);
  const ticks = Math.floor(elapsed / (ECONOMY_TICK / 1000));
  const income = {};
  buildings.forEach(b => {
    const def = getBuildingById(b.id);
    if (!def?.income) return;
    Object.entries(def.income).forEach(([res, val]) => {
      income[res] = (income[res] || 0) + Math.floor(val * ticks * OFFLINE_RATE);
    });
  });
  return income;
}

/**
 * 计算活动现场 Buff
 * @param {Array} buildings
 * @param {{streak:number}} stats
 */
export function calculateBuffs(buildings, stats) {
  const buffs = {};
  buildings.forEach(b => {
    const def = getBuildingById(b.id);
    if (!def?.buff) return;
    switch (def.buff.type) {
      case 'woodBonus':
        buffs.woodBonus = (buffs.woodBonus || 0) + def.buff.value;
        break;
      case 'stoneBonus':
        buffs.stoneBonus = (buffs.stoneBonus || 0) + def.buff.value;
        break;
      case 'streakGold':
        if ((stats.streak || 0) >= 3)
          buffs.dailyGold = (buffs.dailyGold || 0) + def.buff.value;
        break;
      case 'autoReview':
        buffs.autoReview = (buffs.autoReview || 0) + def.buff.value;
        break;
      // ─── 新增 Buff 类型 ───
      case 'goldBonusBox3':
        buffs.goldBonusBox3 = (buffs.goldBonusBox3 || 0) + def.buff.value;
        break;
      case 'box4Multiplier':
        buffs.box4Multiplier = Math.max(buffs.box4Multiplier || 1, def.buff.value);
        break;
      case 'reviewGoldMultiplier':
        buffs.reviewGoldMultiplier = Math.max(buffs.reviewGoldMultiplier || 1, def.buff.value);
        break;
      case 'streak7Review':
        if ((stats.streak || 0) >= 7)
          buffs.extraReview = (buffs.extraReview || 0) + def.buff.value;
        break;
      case 'globalBuff':
        buffs.globalBuff = Math.max(buffs.globalBuff || 1, def.buff.value);
        break;
      case 'unlockWater':
        buffs.unlockWater = true;
        break;
    }
  });
  return buffs;
}

/**
 * 合并两个资源对象（src 加到 target）
 */
export function mergeResources(target, src) {
  const result = { ...target };
  Object.entries(src).forEach(([k, v]) => {
    result[k] = (result[k] || 0) + v;
  });
  return result;
}

/**
 * 检查能否支付 cost
 */
export function canAfford(resources, cost) {
  return Object.entries(cost).every(([k, v]) => (resources[k] || 0) >= v);
}

/**
 * 扣除资源
 */
export function deductResources(resources, cost) {
  const result = { ...resources };
  Object.entries(cost).forEach(([k, v]) => {
    result[k] = (result[k] || 0) - v;
  });
  return result;
}

// ─── 时间 / 收入格式化 ───

export function formatElapsed(lastOnline) {
  const sec = Math.floor((Date.now() - lastOnline) / 1000);
  if (sec < 60) return `${sec}秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)}分钟`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}小时${Math.floor((sec % 3600) / 60)}分钟`;
  return `${Math.floor(sec / 86400)}天${Math.floor((sec % 86400) / 3600)}小时`;
}

export function formatIncome(income) {
  const icons = { gold: '🪙', wood: '🪵', stone: '🪨', star: '⭐' };
  return Object.entries(income)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${icons[k] || k}+${v}`)
    .join('  ');
}

/**
 * 计算当前所有建筑提供的资源容量上限。
 * 每个有 capacity 字段的建筑按数量累加。
 */
export function calculateCapacity(buildings) {
  const cap = {};
  for (const b of buildings) {
    const def = getBuildingById(b.id);
    if (def && def.capacity) {
      const count = b.count || 1;
      for (const [k, v] of Object.entries(def.capacity)) {
        cap[k] = (cap[k] || 0) + v * count;
      }
    }
  }
  return cap;
}

/**
 * 将资源裁剪到容量上限以内，返回 { capped, overflow }。
 * overflow 记录每种资源被裁剪掉的量（key: 资源名, value: 溢出量）。
 */
export function capResources(resources, capacity) {
  const capped = { ...resources };
  const overflow = {};
  for (const [k, max] of Object.entries(capacity)) {
    if (capped[k] > max) {
      overflow[k] = capped[k] - max;
      capped[k] = max;
    }
  }
  return { capped, overflow };
}

// ─── 海盗防御经济 ───

/**
 * 计算部队维护费（gold/tick）
 * @param {number} soldierCount - 当前士兵总数
 * @returns {number} 每 tick gold 消耗
 */
export function calculateDefenseCost(soldierCount) {
  return Math.ceil(soldierCount * SOLDIER_MAINTENANCE);
}

/**
 * 计算建筑修复成本
 * @param {object} building - 建筑定义对象
 * @param {number} damage - 已损失 HP
 * @returns {{gold:number, wood:number, stone:number}}
 */
export function calculateRepairCost(building, damage) {
  const tier = building.tier || 0;
  const hp = BUILDING_HP[tier] || 80;
  const ratio = Math.max(damage / hp, 0);
  return {
    gold: Math.ceil(ratio * hp * REPAIR_COST.gold),
    wood: Math.ceil(ratio * hp * REPAIR_COST.wood),
    stone: Math.floor(ratio * hp * REPAIR_COST.stone)
  };
}

/**
 * 计算防御塔弹药补充成本
 * @param {object} towerStats - 防御塔当前等级属性
 * @param {number} missingArrows - 缺少的箭矢数
 * @param {number} missingCannon - 缺少的炮弹数
 * @returns {{gold:number, wood:number, stone:number}}
 */
export function calculateAmmoCost(towerStats, missingArrows = 0, missingCannon = 0) {
  const cost = { gold: 0, wood: 0, stone: 0 };
  if (missingArrows > 0 && towerStats.arrowCost) {
    cost.wood += missingArrows * towerStats.arrowCost.wood;
  }
  if (missingCannon > 0 && towerStats.cannonCost) {
    cost.stone += missingCannon * towerStats.cannonCost.stone;
  }
  return cost;
}

/**
 * 计算海盗波次掉落奖励
 * @param {Array} piratesDefeated - 击败的海盗类型列表
 * @returns {{gold:number}}
 */
export function calculatePirateReward(piratesDefeated) {
  let gold = 0;
  for (const pirate of piratesDefeated) {
    gold += (pirate.lootGold || 0) * PIRATE_EVENT.rewardMultiplier;
  }
  return { gold };
}