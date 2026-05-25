// 开局资源（全新开始）
export const STARTING_RESOURCES = {
  gold: 50, wood: 30, stone: 5, food: 10, star: 0
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
export const REVIEW_INTERVALS = [2, 4, 8, 14, 30]; // 天

// 应用状态机
export const AppState = {
  IDLE: 'idle',
  VOCAB: 'vocab',
  BUILD: 'build',
  PREVIEW: 'preview'
};

// Sprite 切片坐标
export const SPRITE = {
  CELL_W: 64,   // 建筑精灵单格尺寸
  CELL_H: 64,
  ICON_W: 24,   // 图标单格尺寸
  ICON_H: 24
};
