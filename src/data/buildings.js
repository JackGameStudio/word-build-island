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
    levelRequired: 1,
    wordRequired: 0,
    tier: 0,
    description: '每6秒产出2木材'
  },
  {
    id: 'lumberjack',
    name: '伐木场',
    icon: '🪓',
    spriteIndex: 1,
    cost: { gold: 15 },
    income: { wood: 2 },
    buff: { type: 'woodBonus', value: 1, description: '所有木材建筑产量+1' },
    levelRequired: 1,
    wordRequired: 0,
    tier: 0,
    description: '每6秒产出3木材'
  },
  {
    id: 'cottage',
    name: '小屋',
    icon: '🏠',
    spriteIndex: 2,
    cost: { gold: 40, wood: 15 },
    income: { gold: 2 },
    buff: { type: 'streakGold', value: 10, description: '连续3天每日+10金币' },
    levelRequired: 2,
    wordRequired: 0,
    tier: 0,
    description: '每6秒产出2金币'
  },
  {
    id: 'farm',
    name: '农田',
    icon: '🌾',
    spriteIndex: 3,
    cost: { gold: 80, wood: 25 },
    income: { food: 3 },
    buff: { type: 'autoReview', value: 5, description: '每日自动复习5词' },
    levelRequired: 3,
    wordRequired: 0,
    tier: 1,
    description: '每6秒产出3食物'
  },
  {
    id: 'quarry',
    name: '采石场',
    icon: '⛏️',
    spriteIndex: 4,
    cost: { gold: 200, wood: 50 },
    income: { stone: 2 },
    buff: { type: 'stoneBonus', value: 1, description: '所有石材建筑产量+1' },
    levelRequired: 4,
    wordRequired: 0,
    tier: 1,
    description: '每6秒产出2石材'
  }
];

export function getBuildingById(id) {
  return BUILDINGS.find(b => b.id === id);
}

/**
 * 检查建筑是否可建造
 * @returns {{ok:boolean, reason?:string}}
 */
export function canBuild(building, resources, islandLevel, totalWords) {
  for (const [res, cost] of Object.entries(building.cost)) {
    if ((resources[res] || 0) < cost)
      return { ok: false, reason: `资源不足` };
  }
  if (islandLevel < building.levelRequired)
    return { ok: false, reason: `需要岛屿 Lv.${building.levelRequired}` };
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