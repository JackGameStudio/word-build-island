/**
 * buildings.js
 * 建筑定义 — 5 种核心建筑 + 解锁/建造检查
 * spriteIndex 对应 spritesheet.png 中的列号（0-based）
 */

export const BUILDINGS = [
  {
    id: 'tree',
    name: '树木',
    icon: '🌲',
    spriteIndex: 0,
    cost: { gold: 5 },
    income: { wood: 1 },
    buff: null,
    starRequired: 0,
    wordRequired: 0,
    tier: 0,
    description: '每6秒产出1木材'
  },
  {
    id: 'lumberjack',
    name: '伐木场',
    icon: '🪓',
    spriteIndex: 1,
    cost: { gold: 10 },
    income: { wood: 2 },
    buff: { type: 'woodBonus', value: 1, description: '所有木材建筑产量+1' },
    starRequired: 0,
    wordRequired: 0,
    tier: 0,
    description: '每6秒产出2木材'
  },
  {
    id: 'cottage',
    name: '小屋',
    icon: '🏠',
    spriteIndex: 2,
    cost: { gold: 50, wood: 20 },
    income: { gold: 1 },
    buff: { type: 'streakGold', value: 10, description: '连续3天每日+10金币' },
    starRequired: 0,
    wordRequired: 1,
    tier: 0,
    description: '每6秒产出1金币'
  },
  {
    id: 'farm',
    name: '农田',
    icon: '🌾',
    spriteIndex: 3,
    cost: { gold: 100, wood: 30 },
    income: { food: 2 },
    buff: { type: 'autoReview', value: 5, description: '每日自动复习5词' },
    starRequired: 0,
    wordRequired: 5,
    tier: 1,
    description: '每6秒产出2食物'
  },
  {
    id: 'quarry',
    name: '采石场',
    icon: '⛏️',
    spriteIndex: 4,
    cost: { gold: 50, wood: 20 },
    income: { stone: 1 },
    buff: { type: 'stoneBonus', value: 1, description: '学科学类词 stone+1' },
    starRequired: 0,
    wordRequired: 10,
    tier: 1,
    description: '每6秒产出1石材'
  }
];

export function getBuildingById(id) {
  return BUILDINGS.find(b => b.id === id);
}

/**
 * 检查建筑是否可建造
 * @returns {{ok:boolean, reason?:string}}
 */
export function canBuild(building, resources, stars, totalWords) {
  for (const [res, cost] of Object.entries(building.cost)) {
    if ((resources[res] || 0) < cost)
      return { ok: false, reason: `资源不足` };
  }
  if (stars < building.starRequired)
    return { ok: false, reason: `需要 ⭐${building.starRequired}` };
  if (totalWords < building.wordRequired)
    return { ok: false, reason: `需要学${building.wordRequired}个词` };
  return { ok: true };
}

/**
 * 计算总学词数
 */
export function countLearnedWords(vocab) {
  return vocab.filter(w => w.learnedAt !== null).length;
}