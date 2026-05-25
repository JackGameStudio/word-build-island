/**
 * achievements.js
 * 成就定义 — 里程碑解锁 + 资源奖励
 */

export const ACHIEVEMENTS = [
  { id: 'first_build',    name: '第一个建筑',   icon: '🏠', desc: '放置你第一座建筑',       check: (s) => s.buildings >= 1,  reward: { star: 1 } },
  { id: 'builder_5',      name: '小有规模',     icon: '🏘️', desc: '放置 5 座建筑',          check: (s) => s.buildings >= 5,  reward: { star: 2 } },
  { id: 'builder_10',     name: '大兴土木',     icon: '🏙️', desc: '放置 10 座建筑',         check: (s) => s.buildings >= 10, reward: { star: 3 } },
  { id: 'first_word',     name: '初识单词',     icon: '📖', desc: '答对第 1 个单词',        check: (s) => s.wordsCorrect >= 1,  reward: { food: 5 } },
  { id: 'scholar_10',     name: '单词达人',     icon: '🎓', desc: '累计答对 10 个单词',     check: (s) => s.wordsCorrect >= 10, reward: { food: 10, star: 1 } },
  { id: 'scholar_50',     name: '词汇大师',     icon: '📚', desc: '累计答对 50 个单词',     check: (s) => s.wordsCorrect >= 50, reward: { star: 3, food: 20 } },
  { id: 'first_income',   name: '被动收入',     icon: '💰', desc: '首次获得被动收入',       check: (s) => s.tickIncomeCount >= 1,  reward: { gold: 10 } },
  { id: 'tick_100',       name: '财源滚滚',     icon: '🏦', desc: '被动收入触发 100 次',    check: (s) => s.tickIncomeCount >= 100, reward: { gold: 50 } },
];

/**
 * 检查并返回新解锁的成就
 */
export function checkAchievements(stats, alreadyUnlocked = []) {
  const newAchievements = [];
  ACHIEVEMENTS.forEach(a => {
    if (alreadyUnlocked.includes(a.id)) return;
    if (a.check(stats)) {
      newAchievements.push(a);
    }
  });
  return newAchievements;
}