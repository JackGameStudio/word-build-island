/**
 * roadmap.js
 * 三条阶梯 Roadmap 数据定义
 * 建筑 Roadmap / 词汇 Roadmap / 收入 Roadmap
 *
 * 每条 roadmap 是一个有序数组，从下往上渲染（index 0 = 最底层）
 * 每个节点：{ id, icon, name, desc, check(state): bool, reward, progress(state): [current, need] }
 */

import { BUILDINGS } from './buildings.js';

// ─── 建筑 Roadmap ───
// 顺序 = 解锁顺序 = 阶梯从下往上
export const BUILDING_ROADMAP = [
  {
    id: 'tree',
    icon: '🌲',
    name: '种树',
    desc: '第一棵树，开始你的岛屿！',
    check: (state) => state.island.buildings.some(b => b.id === 'tree'),
    reward: { star: 1, gold: 5 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'tree').length;
      return [cnt, 1];
    }
  },
  {
    id: 'lumberjack',
    icon: '🪓',
    name: '伐木场',
    desc: '生产木材，岛屿经济起步',
    check: (state) => state.island.buildings.some(b => b.id === 'lumberjack'),
    reward: { star: 1, wood: 10 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'lumberjack').length;
      return [cnt, 1];
    }
  },
  {
    id: 'cottage',
    icon: '🏠',
    name: '小屋',
    desc: '有人居住，岛屿活起来了',
    check: (state) => state.island.buildings.some(b => b.id === 'cottage'),
    reward: { star: 1, gold: 20 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'cottage').length;
      return [cnt, 1];
    }
  },
  {
    id: 'garden',
    icon: '🌾',
    name: '农田',
    desc: '复习 Boost，Box≥3 额外 +2 gold',
    check: (state) => state.island.buildings.some(b => b.id === 'garden'),
    reward: { star: 1, stone: 3 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'garden').length;
      return [cnt, 1];
    }
  },
  {
    id: 'quarry',
    icon: '⛏️',
    name: '采石场',
    desc: '石材来源，进阶建筑解锁',
    check: (state) => state.island.buildings.some(b => b.id === 'quarry'),
    reward: { star: 1, stone: 5 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'quarry').length;
      return [cnt, 1];
    }
  },
  {
    id: 'market',
    icon: '🏪',
    name: '市场',
    desc: 'gold 收入 ×1.5',
    check: (state) => state.island.buildings.some(b => b.id === 'market'),
    reward: { star: 1, gold: 30, wood: 20 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'market').length;
      return [cnt, 1];
    }
  },
  {
    id: 'dock',
    icon: '⚓',
    name: '码头',
    desc: '岛屿对外贸易，离线收入提升',
    check: (state) => state.island.buildings.some(b => b.id === 'dock'),
    reward: { star: 1, gold: 50, wood: 30, stone: 10 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'dock').length;
      return [cnt, 1];
    }
  },
  {
    id: 'lighthouse',
    icon: '🗼',
    name: '灯塔',
    desc: '指引方向，离线收入大幅提升',
    check: (state) => state.island.buildings.some(b => b.id === 'lighthouse'),
    reward: { star: 1 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'lighthouse').length;
      return [cnt, 1];
    }
  },
  {
    id: 'town_square',
    icon: '🏛️',
    name: '城镇广场',
    desc: '岛屿中心，所有收入 +10%',
    check: (state) => state.island.buildings.some(b => b.id === 'town_square'),
    reward: { star: 1, gold: 100 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'town_square').length;
      return [cnt, 1];
    }
  },
  {
    id: 'factory',
    icon: '🏭',
    name: '工厂',
    desc: '工业化！所有资源产出 ×2',
    check: (state) => state.island.buildings.some(b => b.id === 'factory'),
    reward: { star: 1, gold: 200 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'factory').length;
      return [cnt, 1];
    }
  },
  {
    id: 'castle',
    icon: '🏰',
    name: '城堡',
    desc: '终极建筑！岛屿之王',
    check: (state) => state.island.buildings.some(b => b.id === 'castle'),
    reward: { star: 1, gold: 500 },
    progress: (state) => {
      const cnt = state.island.buildings.filter(b => b.id === 'castle').length;
      return [cnt, 1];
    }
  }
];

// ─── 词汇 Roadmap ───
export const VOCAB_ROADMAP = [
  {
    id: 'v_0',
    icon: '🌱',
    name: '第一次',
    desc: '学第一个词',
    check: (state) => (state.stats.wordsCorrect || 0) >= 1,
    reward: { star: 1, gold: 10 },
    progress: (state) => [Math.min(state.stats.wordsCorrect || 0, 1), 1]
  },
  {
    id: 'v_10',
    icon: '🌿',
    name: '10 词',
    desc: '掌握 10 个词',
    check: (state) => countLearned(state.vocabulary) >= 10,
    reward: { star: 1, gold: 30, stone: 3 },
    progress: (state) => [Math.min(countLearned(state.vocabulary), 10), 10]
  },
  {
    id: 'v_50',
    icon: '🌳',
    name: '50 词',
    desc: '小有成就！',
    check: (state) => countLearned(state.vocabulary) >= 50,
    reward: { gold: 50, star: 1 },
    progress: (state) => [Math.min(countLearned(state.vocabulary), 50), 50]
  },
  {
    id: 'v_100',
    icon: '🏔️',
    name: '100 词',
    desc: '百词斩',
    check: (state) => countLearned(state.vocabulary) >= 100,
    reward: { gold: 100, star: 1, wood: 50 },
    progress: (state) => [Math.min(countLearned(state.vocabulary), 100), 100]
  },
  {
    id: 'v_200',
    icon: '🏯',
    name: '200 词',
    desc: '词汇大户',
    check: (state) => countLearned(state.vocabulary) >= 200,
    reward: { gold: 200, star: 1 },
    progress: (state) => [Math.min(countLearned(state.vocabulary), 200), 200]
  },
  {
    id: 'v_500',
    icon: '🏙️',
    name: '500 词',
    desc: '词汇大师',
    check: (state) => countLearned(state.vocabulary) >= 500,
    reward: { gold: 500, star: 1, stone: 50 },
    progress: (state) => [Math.min(countLearned(state.vocabulary), 500), 500]
  },
  {
    id: 'v_1000',
    icon: '👑',
    name: '1000 词',
    desc: '语言之王！',
    check: (state) => countLearned(state.vocabulary) >= 1000,
    reward: { gold: 1000, star: 1 },
    progress: (state) => [Math.min(countLearned(state.vocabulary), 1000), 1000]
  }
];

function countLearned(vocab) {
  if (!vocab) return 0;
  return vocab.filter(w => w.learnedAt !== null).length;
}

// ─── 收入 Roadmap ───
// ─── 获取当前 roadmap 进度 ───
// 返回已达成的最高索引 + 1
export function getRoadmapProgress(roadmap, state) {
  let currentIndex = 0;
  for (let i = 0; i < roadmap.length; i++) {
    if (roadmap[i].check(state)) {
      currentIndex = i + 1;
    }
  }
  return currentIndex; // 可能 === roadmap.length（全部达成）
}
