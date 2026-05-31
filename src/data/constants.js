// 开局资源（全新开始）
export const STARTING_RESOURCES = {
  gold: 50, wood: 30, stone: 5, star: 0
};

// 经济系统
export const ECONOMY_TICK = 6000;       // ms per tick
export const OFFLINE_RATE = 0.1;        // 10% 离线倍率
export const OFFLINE_MAX_HOURS = 8;     // 最大离线累积
export const ISLAND_GRID_SIZE = 12;     // 12×12 网格
export const CELL_SIZE = 64;            // 每个格子的像素大小

// 词汇系统
export const DAILY_NEW_WORD_LIMIT = 10;
export const LEITNER_BOXES = 5;
export const REVIEW_INTERVALS = [1, 1, 3, 7, 14]; // 天 (Ebbinghaus forgetting curve: 1 → 3 → 7 → 14)

// 应用状态机
export const AppState = {
  IDLE: 'idle',
  VOCAB: 'vocab',
  BUILD: 'build',
  PREVIEW: 'preview',
  CHEST: 'chest'
};

// ─── 段位系统（替代 Box 1-5）───
export const RANK = {
  1: { name: '青铜', icon: '🥉', color: '#cd7f32', nextReview: 2,  short: '铜' },
  2: { name: '白银', icon: '🥈', color: '#c0c0c0', nextReview: 4,  short: '银' },
  3: { name: '黄金', icon: '🥇', color: '#ffd700', nextReview: 8,  short: '金' },
  4: { name: '铂金', icon: '💎', color: '#a0d2db', nextReview: 14, short: '铂' },
  5: { name: '钻石', icon: '👑', color: '#b9f2ff', nextReview: 30, short: '钻' }
};

export function getRank(box) { return RANK[box] || RANK[1]; }

// ─── 宝箱系统 ───
export const CHEST_TIERS = [
  { tier: 0, name: '木宝箱',   icon: '📦', color: '#8B4513', glow: '#a0522d', multi: 1.0 },
  { tier: 1, name: '银宝箱',   icon: '🎁', color: '#c0c0c0', glow: '#e8e8e8', multi: 1.3 },
  { tier: 2, name: '金宝箱',   icon: '🎁', color: '#ffd700', glow: '#fff44f', multi: 1.6 },
  { tier: 3, name: '铂金宝箱', icon: '🎁', color: '#a0d2db', glow: '#d4f1f9', multi: 2.0 },
  { tier: 4, name: '钻石宝箱', icon: '🎁', color: '#b9f2ff', glow: '#e0ffff', multi: 2.5 }
];

// 每次点击升级概率 [点1, 点2, 点3, 点4]
export const CHEST_UPGRADE_CHANCE = [0.10, 0.15, 0.20, 0.30];

// Sprite 切片坐标
export const SPRITE = {
  CELL_W: 64,   // 建筑精灵单格尺寸
  CELL_H: 64,
  ICON_W: 24,   // 图标单格尺寸
  ICON_H: 24
};

// 地形类型（对应 terrain.png 每一行）
export const TERRAIN = {
  GRASS:  0,   // 草地（岛屿主体）
  SAND:   1,   // 沙滩（边缘过渡）
  WATER:  2,   // 海水（岛屿外）
  FOREST: 3,   // 森林（草地变体）
  STONE:  4    // 岩石（不可建造）
};

// 每个地形两个 tile（亮/暗棋盘格）
export const TERRAIN_TILE_COUNT = 2;

// 岛屿默认地形：12×12 中央 8×8 草地，边缘沙滩，外面海水
// 0=草地 1=沙 2=水 3=林 4=石
export const DEFAULT_ISLAND_TERRAIN = [
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2],
  [2, 2, 1, 0, 0, 0, 0, 0, 0, 1, 2, 2],
  [2, 2, 1, 0, 4, 0, 0, 0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0, 0, 0, 3, 0, 1, 2, 2],
  [2, 2, 1, 0, 0, 0, 0, 0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0, 0, 3, 0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0, 0, 0, 0, 1, 1, 2, 2],
  [2, 2, 1, 0, 0, 4, 0, 0, 0, 1, 2, 2],
  [2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2],
  [2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
];
