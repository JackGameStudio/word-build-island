/**
 * tasks.js
 * 每日任务定义 + 随机选取 + 进度追踪
 *
 * 每天从任务池中随机选择 3 个任务，优先不与昨天重复。
 */

// ─── 任务池 ───
const TASK_POOL = [
  {
    id: 'review_5',
    name: '温故知新',
    description: '复习 5 个单词',
    goal: 5,
    reward: { gold: 30 },
    eventKey: 'review'
  },
  {
    id: 'review_10',
    name: '勤学苦练',
    description: '复习 10 个单词',
    goal: 10,
    reward: { gold: 50, star: 1 },
    eventKey: 'review'
  },
  {
    id: 'correct_5',
    name: '百发百中',
    description: '答对 5 题',
    goal: 5,
    reward: { gold: 20 },
    eventKey: 'correct'
  },
  {
    id: 'correct_10',
    name: '所向披靡',
    description: '答对 10 题',
    goal: 10,
    reward: { gold: 40, star: 1 },
    eventKey: 'correct'
  },
  {
    id: 'build_1',
    name: '添砖加瓦',
    description: '建造 1 个建筑',
    goal: 1,
    reward: { gold: 30 },
    eventKey: 'build'
  },
  {
    id: 'build_2',
    name: '大兴土木',
    description: '建造 2 个建筑',
    goal: 2,
    reward: { gold: 60, star: 1 },
    eventKey: 'build'
  },
  {
    id: 'earn_gold_50',
    name: '日进斗金',
    description: '获得 50 金币',
    goal: 50,
    reward: { wood: 10 },
    eventKey: 'earn_gold'
  },
  {
    id: 'earn_star_3',
    name: '星光灿烂',
    description: '获得 3 颗 ⭐',
    goal: 3,
    reward: { gold: 50 },
    eventKey: 'earn_star'
  },
  {
    id: 'demolish_1',
    name: '破旧立新',
    description: '拆除 1 个建筑',
    goal: 1,
    reward: { stone: 10 },
    eventKey: 'demolish'
  },
  {
    id: 'move_1',
    name: '乾坤挪移',
    description: '移动 1 个建筑',
    goal: 1,
    reward: { gold: 15 },
    eventKey: 'move'
  }
];

// ─── 伪随机：基于日期字符串的确定性随机 ───
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) | 0;
    const j = (s >>> 0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── 导出函数 ───

/**
 * 获取今日任务
 * @param {string} dateStr - 日期字符串 YYYY-MM-DD
 * @param {object} [history] - 历史记录 { date, taskIds[] }
 * @returns {{ date: string, taskIds: string[] }}
 */
export function getDailyTasks(dateStr, history) {
  const yesterdayIds = history?.date && history.taskIds ? history.taskIds : [];
  const seed = hashCode(dateStr);

  // 优先选与昨天不同的任务
  const otherPool = TASK_POOL.filter(t => !yesterdayIds.includes(t.id));
  const candidates = otherPool.length >= 3 ? otherPool : TASK_POOL;

  const shuffled = seededShuffle(candidates, seed);
  const taskIds = shuffled.slice(0, 3).map(t => t.id);

  return { date: dateStr, taskIds };
}

/**
 * 根据 id 获取任务定义
 */
export function getTaskById(id) {
  return TASK_POOL.find(t => t.id === id) || null;
}

/**
 * 获取所有任务
 */
export function getAllTasks() {
  return TASK_POOL;
}

/**
 * 创建当日进度追踪器
 * @returns {{ progress: Record<string, number> }}
 */
export function createTaskTracker() {
  return {
    progress: {
      review: 0,
      correct: 0,
      build: 0,
      demolish: 0,
      move: 0,
      earn_gold: 0,
      earn_star: 0
    }
  };
}

/**
 * 检查某个任务是否完成
 * @param {object} task - 任务定义对象
 * @param {Record<string, number>} progress - 当前进度
 * @returns {{ done: boolean, current: number }}
 */
export function checkTaskComplete(task, progress) {
  const current = progress[task.eventKey] || 0;
  return {
    done: current >= task.goal,
    current: Math.min(current, task.goal)
  };
}