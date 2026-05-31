/**
 * star-economy.js
 * Box 回答累计 → 星星奖励
 *
 * Box 3: 每 30 个正确 → 1⭐
 * Box 4: 每 10 个正确 → 1⭐
 * Box 5: 每 2  个正确 → 1⭐
 */

const THRESHOLDS = { 3: 30, 4: 10, 5: 2 };

export function createStarEconomy() {
  let counters = { box3: 0, box4: 0, box5: 0 };

  return {
    /**
     * 记录一次正确答题，返回本次产出的星星数
     * @param {number} box - 词所在的 Box (1-5)
     * @param {number} quality - 答题质量 (>=3 才计数)
     * @returns {number} 本次获得的星星数
     */
    record(box, quality) {
      if (quality < 3 || box < 3) return 0;
      const key = `box${box}`;
      if (!THRESHOLDS[box]) return 0;

      counters[key]++;
      const threshold = THRESHOLDS[box];
      if (counters[key] >= threshold) {
        const earned = Math.floor(counters[key] / threshold);
        counters[key] = counters[key] % threshold;
        return earned;
      }
      return 0;
    },

    /** 获取当前计数器状态（用于存档） */
    getState() {
      return { box3: counters.box3, box4: counters.box4, box5: counters.box5 };
    },

    /** 从存档恢复计数器 */
    loadState(state) {
      if (!state) return;
      counters.box3 = state.box3 || 0;
      counters.box4 = state.box4 || 0;
      counters.box5 = state.box5 || 0;
    }
  };
}
