/**
 * buildings.js
 * 建筑定义 — 12 种建筑（T0-T4）+ 解锁/建造检查
 * spriteIndex 对应 spritesheet.png 中的列号（0-based），null 表示等待美术补全
 *
 * 成本对齐设计文档（all-buildings-complete_2026-05-27）
 */

export const BUILDINGS = [
  // ── T0 开局 ──
  {
    id: 'tree',
    name: '树木',
    icon: '🌲',
    spriteIndex: 0,
    layer: 2,
    cost: { gold: 5 },
    income: null,
    buff: null,
    levelRequired: 1,
    wordRequired: 0,
    starRequired: 0,
    tier: 0,
    description: '纯装饰，岛屿的第一抹绿色'
  },

  // ── T0 ──
  {
    id: 'lumberjack',
    name: '伐木场',
    icon: '🪓',
    spriteIndex: 1,
    layer: 1,
    cost: { gold: 10 },
    income: { wood: 1 },
    capacity: { wood: 100 },
    buff: { type: 'woodBonus', value: 1, description: '所有木材建筑产量+1' },
    levelRequired: 1,
    wordRequired: 5,
    starRequired: 1,
    tier: 0,
    description: '产出木材，所有木材建筑产量+1，容量: 🪵100'
  },
  {
    id: 'cottage',
    name: '小屋',
    icon: '🏠',
    spriteIndex: 2,
    layer: 1,
    cost: { gold: 50, wood: 30, stone: 10 },
    income: { gold: 1 },
    capacity: { gold: 200 },
    buff: { type: 'streakGold', value: 10, description: '连续3天打卡额外+10金币' },
    levelRequired: 1,
    wordRequired: 10,
    starRequired: 2,
    tier: 0,
    description: '有人居住的屋子，连续打卡额外金币，限 1+2×农田，容量: 🪙200'
  },

  // ── T1 ──
  {
    id: 'garden',
    name: '农田',
    icon: '🌾',
    spriteIndex: null,
    layer: 0,
    cost: { gold: 100, wood: 50 },
    income: null,
    buff: { type: 'goldBonusBox3', value: 2, description: 'Box≥3 复习 gold+2' },
    levelRequired: 2,
    wordRequired: 25,
    starRequired: 5,
    tier: 1,
    description: '高级词复习额外产出金币，每座解锁 2 间小屋'
  },
  {
    id: 'quarry',
    name: '采石场',
    icon: '⛏️',
    spriteIndex: 4,
    layer: 1,
    cost: { gold: 50, wood: 20 },
    income: { stone: 1 },
    capacity: { stone: 80 },
    buff: { type: 'stoneBonus', value: 1, description: '所有石材建筑产量+1' },
    levelRequired: 2,
    wordRequired: 50,
    starRequired: 8,
    tier: 1,
    description: '产出石材，所有石材建筑产量+1，容量: 🪨80'
  },

  // ── T2 ──
  {
    id: 'dock',
    name: '码头',
    icon: '⚓',
    spriteIndex: 3,
    layer: 0,
    cost: { gold: 200, wood: 100, stone: 50 },
    income: { gold: 3 },
    buff: { type: 'unlockWater', value: 1, description: '解锁水地形可建造' },
    levelRequired: 3,
    wordRequired: 100,
    starRequired: 15,
    tier: 2,
    description: '解锁水地形建造，产出金币'
  },
  {
    id: 'deep_mine',
    name: '风车作坊',
    icon: '🌾',
    spriteKey: 'windmillBody',
    spriteLevels: 1,
    fansSprite: 'windmillFans',
    fansPivot: { x: 47, y: 32 },
    layer: 2,
    cost: { gold: 300, wood: 150, stone: 80 },
    buff: { type: 'reviewGoldMultiplier', value: 1.3, description: '所有复习 gold ×1.3' },
    levelRequired: 3,
    wordRequired: 150,
    starRequired: 20,
    tier: 2,
    description: '所有复习 gold 收入 ×1.3'
  },

  // ── T3 ──
  {
    id: 'market',
    name: '市场',
    icon: '🏪',
    spriteIndex: null,
    layer: 1,
    cost: { gold: 400, wood: 200, stone: 100 },
    income: { gold: 5 },
    buff: { type: 'reviewGoldMultiplier', value: 1.5, description: '所有复习 gold ×1.5' },
    levelRequired: 4,
    wordRequired: 250,
    starRequired: 30,
    tier: 3,
    description: '所有复习 gold 收入 ×1.5'
  },
  {
    id: 'defense_tower',
    name: '防御塔',
    icon: '🏹',
    spriteIndex: null,
    spriteKey: 'wartower',
    spriteLevels: 3,
    layer: 2,
    cost: { gold: 600, wood: 400, stone: 100 },
    income: null,
    buff: null,
    levelRequired: 4,
    wordRequired: 280,
    starRequired: 32,
    tier: 3,
    description: '自动攻击射程内海盗，可升级',
    // 升级数据
    upgradeable: true,
    tierLevels: [
      { level: 1, range: 3, arrowDMG: 18, arrowCost: { wood: 3 }, cannonDMG: 0, cannonCost: null, ammoCapacity: 20 },
      { level: 2, range: 4, arrowDMG: 20, arrowCost: { wood: 2 }, cannonDMG: 35, cannonCost: { stone: 4 }, ammoCapacity: 40,
        upgradeCost: { gold: 300, wood: 350, stone: 200 }, reqStars: 55, reqIslandLv: 5 },
      { level: 3, range: 5, arrowDMG: 25, arrowCost: { wood: 2 }, cannonDMG: 45, cannonCost: { stone: 3 }, ammoCapacity: 60,
        upgradeCost: { gold: 600, wood: 500, stone: 350 }, reqStars: 80, reqIslandLv: 5 }
    ]
  },
  {
    id: 'town_square',
    name: '城镇广场',
    icon: '🏛️',
    spriteIndex: null,
    layer: 1,
    cost: { gold: 800, wood: 400, stone: 200 },
    income: { gold: 8, wood: 3 },
    buff: { type: 'streak7Review', value: 1, description: 'streak≥7 每日免费复习1次' },
    levelRequired: 4,
    wordRequired: 500,
    starRequired: 50,
    tier: 3,
    description: '连续7天打卡每日额外免费复习'
  },

  // ── T4 ──
  {
    id: 'barracks',
    name: '兵营',
    icon: '⚔️',
    spriteIndex: null,
    spriteKey: 'barracks',
    spriteLevels: 3,
    layer: 1,
    cost: { gold: 800, wood: 400, stone: 200 },
    income: null,
    buff: null,
    levelRequired: 4,
    wordRequired: 300,
    starRequired: 35,
    tier: 4,
    description: '训练士兵抵御海盗，可升级',
    upgradeable: true,
    tierLevels: [
      { level: 1, trainSpeed: 60, capacity: 3, soldierATK: 20, soldierHP: 35, recruitGold: 40 },
      { level: 2, trainSpeed: 40, capacity: 5, soldierATK: 22, soldierHP: 45, recruitGold: 60,
        upgradeCost: { gold: 500, wood: 350, stone: 300 }, reqStars: 55, reqIslandLv: 5 },
      { level: 3, trainSpeed: 25, capacity: 8, soldierATK: 30, soldierHP: 60, recruitGold: 80,
        upgradeCost: { gold: 1000, wood: 600, stone: 500 }, reqStars: 80, reqIslandLv: 5 }
    ]
  },
  {
    id: 'castle',
    name: '城堡',
    icon: '🏰',
    spriteIndex: null,
    layer: 2,
    cost: { gold: 3000, wood: 1200, stone: 800 },
    income: { gold: 20, wood: 8, stone: 5 },
    buff: { type: 'globalBuff', value: 1.2, description: '全局 Buff 20%, ⭐×3' },
    levelRequired: 5,
    wordRequired: 1000,
    starRequired: 100,
    tier: 4,
    description: '终极建筑，全局奖励 +20%，⭐×3'
  }
];

export function getBuildingById(id) {
  return BUILDINGS.find(b => b.id === id);
}

/**
 * 检查建筑是否可建造
 * @param {number} [stars=0] - 当前拥有的星星数
 * @returns {{ok:boolean, reason?:string}}
 */
export function canBuild(building, resources, islandLevel, totalWords, stars = 0, builtBuildings = []) {
  for (const [res, cost] of Object.entries(building.cost)) {
    if ((resources[res] || 0) < cost)
      return { ok: false, reason: `资源不足` };
  }
  if (islandLevel < building.levelRequired)
    return { ok: false, reason: `需要岛屿 Lv.${building.levelRequired}` };
  if (totalWords < building.wordRequired)
    return { ok: false, reason: `需要学${building.wordRequired}个词` };
  if ((stars || 0) < (building.starRequired || 0))
    return { ok: false, reason: `需要 ⭐${building.starRequired}` };
  // 小屋上限: 第1间免费，之后每座农田解锁2间
  if (building.id === 'cottage') {
    const cottageCount = builtBuildings.filter(b => b.id === 'cottage').length;
    const gardenCount = builtBuildings.filter(b => b.id === 'garden').length;
    const max = 1 + gardenCount * 2;
    if (cottageCount >= max)
      return { ok: false, reason: `需要更多农田（当前上限: ${max} 间）` };
  }
  return { ok: true };
}

/**
 * 计算总学词数
 */
export function countLearnedWords(vocab) {
  return vocab.filter(w => w.learnedAt !== null).length;
}

/**
 * 获取建筑当前等级升级所需资源
 * @param {object} building - 建筑定义对象
 * @param {number} currentLevel - 当前等级 (0-based, 0=未建造仅参照基础cost)
 * @returns {object|null} 升级成本，若无更高等级返回null
 */
export function upgradeCost(building, currentLevel) {
  if (!building.upgradeable || !building.tierLevels) return null;
  if (currentLevel >= building.tierLevels.length) return null;
  return building.tierLevels[currentLevel].upgradeCost || null;
}

/**
 * 获取建筑在某等级的完整属性
 * @param {object} building - 建筑定义对象
 * @param {number} level - 等级 (1-based)
 * @returns {object|null} 该等级的属性对象
 */
export function getUpgradeStats(building, level) {
  if (!building.upgradeable || !building.tierLevels) return null;
  const idx = level - 1;
  if (idx < 0 || idx >= building.tierLevels.length) return null;
  return building.tierLevels[idx];
}