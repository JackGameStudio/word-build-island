/**
 * economy.js
 * 经济系统 — 资源管理、词汇→奖励映射、被动收入、离线结算、Buff 叠加
 */

import { OFFLINE_RATE, OFFLINE_MAX_HOURS, ECONOMY_TICK } from '../data/constants.js';
import { getBuildingById } from '../data/buildings.js';

/**
 * Box → [记住奖励(quality>=3), 模糊奖励(quality<3)]
 * 来自 island-merge-balance v1.1
 */
const REWARD_TABLE = {
  1: [ { gold: 2, wood: 1 },            { gold: 1 } ],
  2: [ { gold: 3, wood: 2 },            { gold: 1, wood: 1 } ],
  3: [ { gold: 5, wood: 3, food: 2 },   { gold: 2, wood: 1 } ],
  4: [ { gold: 8, wood: 5, stone: 3, food: 3 },  { gold: 3, wood: 2 } ],
  5: [ { gold: 12, wood: 8, stone: 5, food: 5, star: 1 }, { gold: 5, wood: 3, stone: 1 } ]
};

/**
 * 根据词汇复习结果返回资源奖励
 * @param {object} word — 含 box 字段
 * @param {number} quality — 0-5 评分
 * @returns {{gold?:number, wood?:number, stone?:number, food?:number, star?:number}}
 */
export function rewardForReview(word, quality) {
  const idx = quality >= 3 ? 0 : 1;
  const base = REWARD_TABLE[word.box]?.[idx] ?? { gold: 1 };
  return { ...base };
}

/**
 * 被动收入 tick — 所有建筑的 income 累加
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
 * 离线收入结算
 * @param {Array} buildings — 已放置建筑列表
 * @param {number} lastOnline — 上次在线 timestamp
 * @returns {{gold?:number, wood?:number, stone?:number, food?:number}}
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
      case 'streakGold':
        if (stats.streak >= 3)
          buffs.dailyGold = (buffs.dailyGold || 0) + def.buff.value;
        break;
      case 'autoReview':
        buffs.autoReview = (buffs.autoReview || 0) + def.buff.value;
        break;
      case 'stoneBonus':
        buffs.stoneBonus = (buffs.stoneBonus || 0) + def.buff.value;
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