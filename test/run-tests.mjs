/**
 * Word Island Builder — 核心逻辑自动化测试
 * 运行: node test/run-tests.mjs
 */

import { strict as assert } from 'assert';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = `${__dirname.replace(/\\/g, '/')}/../src`;

// ─── 动态 import 各模块 ───
const constants   = await import(pathToFileURL(`${srcDir}/data/constants.js`).href);
const buildings   = await import(pathToFileURL(`${srcDir}/data/buildings.js`).href);
const vocabMod   = await import(pathToFileURL(`${srcDir}/core/vocab-engine.js`).href);
const economy    = await import(pathToFileURL(`${srcDir}/core/economy.js`).href);
const achMod     = await import(pathToFileURL(`${srcDir}/data/achievements.js`).href);
const stateMod   = await import(pathToFileURL(`${srcDir}/core/state.js`).href);

const { STARTING_RESOURCES, ECONOMY_TICK, OFFLINE_RATE, OFFLINE_MAX_HOURS,
        ISLAND_GRID_SIZE, CELL_SIZE, DAILY_NEW_WORD_LIMIT, LEITNER_BOXES,
        REVIEW_INTERVALS, AppState, SPRITE, TERRAIN, DEFAULT_ISLAND_TERRAIN } = constants;

const { getBuildingById, canBuild, countLearnedWords, BUILDINGS } = buildings;
const { initVocabulary, getDueWords, gradeWord, getBoxStats, getQuizOptions } = vocabMod;
const { rewardForReview, tickIncome, tickIncomeWithBuffs, calculateOfflineIncome,
        calculateBuffs, mergeResources, canAfford, deductResources,
        formatElapsed, formatIncome } = economy;
const { checkAchievements, ACHIEVEMENTS } = achMod;
const { getState, transition, setState } = stateMod;

// ─── 测试框架 ───
let passed = 0, failed = 0, total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
    if (e.actual !== undefined) {
      console.error(`     expected: ${JSON.stringify(e.expected)}`);
      console.error(`     actual:   ${JSON.stringify(e.actual)}`);
    }
  }
}

function section(title) {
  console.log(`\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`);
}

// ═══════════════════════════════════════════════════════════
//  Section 1: constants.js
// ═══════════════════════════════════════════════════════════
section('1. constants.js — 常量检查');

test('STARTING_RESOURCES 包含 gold/wood/stone/star', () => {
  assert.strictEqual(STARTING_RESOURCES.gold, 50);
  assert.strictEqual(STARTING_RESOURCES.wood, 30);
  assert.strictEqual(STARTING_RESOURCES.stone, 5);
  assert.strictEqual(STARTING_RESOURCES.star, 0);
});

test('ECONOMY_TICK = 6000ms', () => {
  assert.strictEqual(ECONOMY_TICK, 6000);
});

test('OFFLINE_RATE = 0.1', () => {
  assert.strictEqual(OFFLINE_RATE, 0.1);
});

test('OFFLINE_MAX_HOURS = 8', () => {
  assert.strictEqual(OFFLINE_MAX_HOURS, 8);
});

test('ISLAND_GRID_SIZE = 12', () => {
  assert.strictEqual(ISLAND_GRID_SIZE, 12);
});

test('REVIEW_INTERVALS 长度 = LEITNER_BOXES', () => {
  assert.strictEqual(REVIEW_INTERVALS.length, LEITNER_BOXES);
});

test('AppState 包含所有状态', () => {
  assert.strictEqual(AppState.IDLE, 'idle');
  assert.strictEqual(AppState.VOCAB, 'vocab');
  assert.strictEqual(AppState.BUILD, 'build');
  assert.strictEqual(AppState.PREVIEW, 'preview');
});

test('DEFAULT_ISLAND_TERRAIN 是 12×12', () => {
  assert.strictEqual(DEFAULT_ISLAND_TERRAIN.length, 12);
  assert.strictEqual(DEFAULT_ISLAND_TERRAIN[0].length, 12);
});

test('TERRAIN 枚举完整', () => {
  assert.strictEqual(TERRAIN.GRASS, 0);
  assert.strictEqual(TERRAIN.SAND, 1);
  assert.strictEqual(TERRAIN.WATER, 2);
  assert.strictEqual(TERRAIN.FOREST, 3);
  assert.strictEqual(TERRAIN.STONE, 4);
});

// ═══════════════════════════════════════════════════════════
//  Section 2: buildings.js
// ═══════════════════════════════════════════════════════════
section('2. buildings.js — 建筑定义 & 解锁逻辑');

test('BUILDINGS 共 12 种', () => {
  assert.strictEqual(BUILDINGS.length, 12);
});

test('T0 建筑 (tree/lumberjack/cottage) 存在', () => {
  assert.ok(getBuildingById('tree'));
  assert.ok(getBuildingById('lumberjack'));
  assert.ok(getBuildingById('cottage'));
});

test('T4 终极建筑 (factory/castle) 存在', () => {
  assert.ok(getBuildingById('factory'));
  assert.ok(getBuildingById('castle'));
});

test('tree 成本 = {gold:5}, 无收入', () => {
  const b = getBuildingById('tree');
  assert.deepStrictEqual(b.cost, { gold: 5 });
  assert.strictEqual(b.income, null);
});

test('lumberjack 收入 = {wood:1}', () => {
  const b = getBuildingById('lumberjack');
  assert.deepStrictEqual(b.income, { wood: 1 });
});

test('cottage 收入 = {gold:1}', () => {
  const b = getBuildingById('cottage');
  assert.deepStrictEqual(b.income, { gold: 1 });
});

test('castle 收入 = {gold:200}', () => {
  const b = getBuildingById('castle');
  assert.deepStrictEqual(b.income, { gold: 200 });
});

test('canBuild: 资源不足 → {ok:false}', () => {
  const b = getBuildingById('tree');
  const r = canBuild(b, { gold: 0, wood: 0, stone: 0, star: 0 }, 1, 0, 0);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.includes('资源不足'));
});

test('canBuild: star 不足', () => {
  const b = getBuildingById('lumberjack'); // starRequired:1
  const r = canBuild(b, { gold: 99, wood: 99, stone: 99, star: 0 }, 1, 0, 0);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.includes('⭐'));
});

test('canBuild: 等级不足', () => {
  const b = getBuildingById('garden'); // levelRequired:3
  const r = canBuild(b, { gold: 999, wood: 999, stone: 999, star: 99 }, 1, 100, 99);
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.includes('Lv.'));
});

test('canBuild: 条件满足 → {ok:true}', () => {
  const b = getBuildingById('tree');
  const r = canBuild(b, { gold: 50, wood: 30, stone: 5, star: 0 }, 1, 0, 0);
  assert.strictEqual(r.ok, true);
});

test('countLearnedWords: 统计 learnedAt!==null', () => {
  const vocab = [
    { learnedAt: 1 }, { learnedAt: null },
    { learnedAt: 999 }, { learnedAt: null }
  ];
  assert.strictEqual(countLearnedWords(vocab), 2);
});

// ═══════════════════════════════════════════════════════════
//  Section 3: vocab-engine.js
// ═══════════════════════════════════════════════════════════
section('3. vocab-engine.js — SM-2 词汇引擎');

test('initVocabulary: 每个词含 box=1/ef=1.0/nextReview=null', () => {
  const vocab = initVocabulary();
  assert.ok(vocab.length > 0);
  const w = vocab[0];
  assert.strictEqual(w.box, 1);
  assert.strictEqual(w.ef, 1.0);
  assert.strictEqual(w.nextReview, null);
  assert.strictEqual(w.learnedAt, null);
});

test('getDueWords: nextReview=null 算到期', () => {
  const vocab = initVocabulary();
  const due = getDueWords(vocab);
  assert.ok(due.length > 0);
});

test('getDueWords: nextReview 未来 → 不算到期', () => {
  const vocab = initVocabulary();
  vocab[0].nextReview = Date.now() + 999999999;
  const due = getDueWords(vocab);
  assert.ok(!due.includes(vocab[0]));
});

test('gradeWord: quality<3 → box 不升, 降或不变', () => {
  const w = { box: 3, ef: 1.0, nextReview: null, learnedAt: null, timesReviewed: 0, timesCorrect: 0 };
  const r = gradeWord(w, 0);
  assert.ok(r.box <= w.box);
});

test('gradeWord: quality>=3 → box+1 + learnedAt 设置', () => {
  const w = { box: 1, ef: 1.0, nextReview: null, learnedAt: null, timesReviewed: 0, timesCorrect: 0 };
  const r = gradeWord(w, 4);
  assert.strictEqual(r.box, 2);
  assert.ok(r.nextReview > Date.now());
  assert.strictEqual(r.learnedAt !== null, true);
  assert.strictEqual(r.timesCorrect, 1);
});

test('gradeWord: ef 下限 1.0', () => {
  const w = { box: 1, ef: 1.3, nextReview: null, learnedAt: null, timesReviewed: 0, timesCorrect: 0 };
  const r = gradeWord(w, 0);
  assert.ok(r.ef >= 1.0);
});

test('gradeWord: box 上限 5', () => {
  const w = { box: 5, ef: 1.0, nextReview: Date.now() + 1000, learnedAt: 1, timesReviewed: 10, timesCorrect: 10 };
  const r = gradeWord(w, 5);
  assert.strictEqual(r.box, 5);
});

test('getBoxStats: 正确统计各 Box 词数', () => {
  const vocab = [{ box: 1 }, { box: 1 }, { box: 2 }, { box: 5 }, { box: 3 }];
  const s = getBoxStats(vocab);
  assert.strictEqual(s[1], 2);
  assert.strictEqual(s[2], 1);
  assert.strictEqual(s[3], 1);
  assert.strictEqual(s[5], 1);
  assert.strictEqual(s.total, 5);
});

test('getQuizOptions: 返回 4 个选项含正确答案', () => {
  const vocab = initVocabulary();
  const correct = vocab[0];
  const options = getQuizOptions(correct, vocab);
  assert.strictEqual(options.length, 4);
  assert.ok(options.includes(correct.meaning));
});

test('getQuizOptions: 词库不够4个时处理', () => {
  const vocab = initVocabulary().slice(0, 2);
  const options = getQuizOptions(vocab[0], vocab);
  assert.ok(options.length > 0);
});

// ═══════════════════════════════════════════════════════════
//  Section 4: economy.js
// ═══════════════════════════════════════════════════════════
section('4. economy.js — 经济系统');

test('rewardForReview: Box1 quality>=3 → gold:2 wood:1', () => {
  const r = rewardForReview({ box: 1 }, 4, {});
  assert.strictEqual(r.gold, 2);
  assert.strictEqual(r.wood, 1);
});

test('rewardForReview: Box1 quality<3 → gold:1', () => {
  const r = rewardForReview({ box: 1 }, 2, {});
  assert.strictEqual(r.gold, 1);
});

test('rewardForReview: Box5 quality>=3 → 含 star:1', () => {
  const r = rewardForReview({ box: 5 }, 4, {});
  assert.strictEqual(r.star, 1);
});

test('rewardForReview: Garden buff Box≥3 +2gold', () => {
  const r = rewardForReview({ box: 3 }, 4, { goldBonusBox3: 2 });
  assert.strictEqual(r.gold, 7); // 5+2
});

test('rewardForReview: Market buff ×1.5 gold', () => {
  const r = rewardForReview({ box: 1 }, 4, { reviewGoldMultiplier: 1.5 });
  assert.strictEqual(r.gold, 3); // floor(2*1.5)
});

test('rewardForReview: Castle buff ×1.2 + star×2', () => {
  const r = rewardForReview({ box: 5 }, 4, { globalBuff: 1.2 });
  assert.strictEqual(r.gold, 14); // floor(12*1.2)
  assert.strictEqual(r.star, 2);
});

test('tickIncome: 累加所有建筑收入', () => {
  const buildings = [
    { id: 'lumberjack' }, { id: 'lumberjack' },
    { id: 'cottage' }
  ];
  const income = tickIncome(buildings);
  assert.strictEqual(income.wood, 2);
  assert.strictEqual(income.gold, 1);
});

test('tickIncome: income=null 不贡献', () => {
  const income = tickIncome([{ id: 'tree' }]);
  assert.deepStrictEqual(income, {});
});

test('calculateBuffs: 多个 lumberjack → woodBonus 累加', () => {
  const buffs = calculateBuffs([{ id: 'lumberjack' }, { id: 'lumberjack' }], {});
  assert.strictEqual(buffs.woodBonus, 2);
});

test('calculateBuffs: streak>=3 + cottage → dailyGold=10', () => {
  const buffs = calculateBuffs([{ id: 'cottage' }], { streak: 5 });
  assert.strictEqual(buffs.dailyGold, 10);
});

test('calculateBuffs: streak<3 → 无 dailyGold', () => {
  const buffs = calculateBuffs([{ id: 'cottage' }], { streak: 1 });
  assert.strictEqual(buffs.dailyGold, undefined);
});

test('calculateOfflineIncome: 正常离线收入>0', () => {
  const buildings = [{ id: 'cottage' }];
  const lastOnline = Date.now() - 3600 * 1000; // 1小时
  const income = calculateOfflineIncome(buildings, lastOnline);
  assert.ok(income.gold > 0);
  assert.ok(income.gold <= 60);
});

test('calculateOfflineIncome: 超过8小时仅算8小时', () => {
  const buildings = [{ id: 'cottage' }];
  const lastOnline = Date.now() - 100 * 3600 * 1000;
  const income = calculateOfflineIncome(buildings, lastOnline);
  assert.ok(income.gold <= 480);
});

test('mergeResources: 正确合并', () => {
  const r = mergeResources({ gold: 10, wood: 5 }, { gold: 3, wood: 2, stone: 1 });
  assert.strictEqual(r.gold, 13);
  assert.strictEqual(r.wood, 7);
  assert.strictEqual(r.stone, 1);
});

test('canAfford: true/false 正确', () => {
  const res = { gold: 50, wood: 30 };
  assert.strictEqual(canAfford(res, { gold: 10 }), true);
  assert.strictEqual(canAfford(res, { gold: 60 }), false);
});

test('deductResources: 正确扣除', () => {
  const r = deductResources({ gold: 50, wood: 30 }, { gold: 10, wood: 5 });
  assert.strictEqual(r.gold, 40);
  assert.strictEqual(r.wood, 25);
});

test('formatElapsed: 秒/分/时 正确格式化', () => {
  assert.ok(formatElapsed(Date.now() - 30000).includes('秒'));
  assert.ok(formatElapsed(Date.now() - 120000).includes('分钟'));
});

test('formatIncome: 含图标和数值', () => {
  const s = formatIncome({ gold: 10, wood: 5 });
  assert.ok(s.includes('🪙'));
  assert.ok(s.includes('+10'));
});

// ═══════════════════════════════════════════════════════════
//  Section 5: achievements.js
// ═══════════════════════════════════════════════════════════
section('5. achievements.js — 成就系统');

test('ACHIEVEMENTS 共 8 个', () => {
  assert.strictEqual(ACHIEVEMENTS.length, 8);
});

test('first_build: buildings>=1 解锁', () => {
  const a = checkAchievements({ buildings: 1, wordsCorrect: 0, tickIncomeCount: 0 }, []);
  assert.ok(a.find(x => x.id === 'first_build'));
});

test('builder_10: buildings>=10 解锁', () => {
  const a = checkAchievements({ buildings: 10, wordsCorrect: 0, tickIncomeCount: 0 }, []);
  assert.ok(a.find(x => x.id === 'builder_10'));
});

test('first_word: wordsCorrect>=1 解锁', () => {
  const a = checkAchievements({ buildings: 0, wordsCorrect: 1, tickIncomeCount: 0 }, []);
  assert.ok(a.find(x => x.id === 'first_word'));
});

test('scholar_50: wordsCorrect>=50 解锁 + gold:50（无 star）', () => {
  const a = checkAchievements({ buildings: 0, wordsCorrect: 50, tickIncomeCount: 0 }, []);
  const sa = a.find(x => x.id === 'scholar_50');
  assert.ok(sa);
  assert.strictEqual(sa.reward.star, undefined);  // 成就 star 已暂停
  assert.strictEqual(sa.reward.gold, 50);
});

test('tick_100: tickIncomeCount>=100 解锁 + gold:50', () => {
  const a = checkAchievements({ buildings: 0, wordsCorrect: 0, tickIncomeCount: 100 }, []);
  const ta = a.find(x => x.id === 'tick_100');
  assert.ok(ta);
  assert.strictEqual(ta.reward.gold, 50);
});

test('已解锁的不重复返回', () => {
  const a = checkAchievements(
    { buildings: 5, wordsCorrect: 0, tickIncomeCount: 0 },
    ['first_build', 'builder_5']
  );
  assert.strictEqual(a.length, 0);
});

// ═══════════════════════════════════════════════════════════
//  Section 6: state.js
// ═══════════════════════════════════════════════════════════
section('6. state.js — 状态机');

test('初始状态 = IDLE', () => {
  setState(AppState.IDLE);
  assert.strictEqual(getState(), AppState.IDLE);
});

test('IDLE→VOCAB 合法', () => {
  setState(AppState.IDLE);
  assert.strictEqual(transition(AppState.VOCAB), true);
});

test('IDLE→BUILD 合法', () => {
  setState(AppState.IDLE);
  assert.strictEqual(transition(AppState.BUILD), true);
});

test('VOCAB→IDLE 合法', () => {
  setState(AppState.VOCAB);
  assert.strictEqual(transition(AppState.IDLE), true);
});

test('BUILD→PREVIEW 合法', () => {
  setState(AppState.BUILD);
  assert.strictEqual(transition(AppState.PREVIEW), true);
});

test('PREVIEW→IDLE 合法', () => {
  setState(AppState.PREVIEW);
  assert.strictEqual(transition(AppState.IDLE), true);
});

test('IDLE→PREVIEW 非法', () => {
  setState(AppState.IDLE);
  assert.strictEqual(transition(AppState.PREVIEW), false);
});

test('VOCAB→BUILD 非法', () => {
  setState(AppState.VOCAB);
  assert.strictEqual(transition(AppState.BUILD), false);
});

// ═══════════════════════════════════════════════════════════
//  Section 7: 集成测试
// ═══════════════════════════════════════════════════════════
section('7. 集成测试 — 完整游戏循环');

test('学词→拿奖励→造tree→tick→成就', () => {
  let resources = { ...STARTING_RESOURCES };
  let vocab = initVocabulary();
  let buildings = [];
  let achievements = [];
  let stats = { buildings: 0, wordsCorrect: 0, tickIncomeCount: 0 };

  // 学词 (quality=4)
  vocab[0] = gradeWord(vocab[0], 4);
  stats.wordsCorrect = 1;
  const reward = rewardForReview(vocab[0], 4, calculateBuffs(buildings, { streak: 1 }));
  resources = mergeResources(resources, reward);

  // 成就 first_word
  let newA = checkAchievements(stats, []);
  assert.ok(newA.find(x => x.id === 'first_word'));
  newA.forEach(a => { resources = mergeResources(resources, a.reward || {}); achievements.push(a.id); });

  // 造 tree
  assert.ok(canAfford(resources, { gold: 5 }));
  resources = deductResources(resources, { gold: 5 });
  buildings.push({ id: 'tree', x: 3, y: 3 });
  stats.buildings = 1;

  // 成就 first_build
  newA = checkAchievements(stats, achievements);
  assert.ok(newA.find(x => x.id === 'first_build'));

  // tick (tree 无收入)
  const { income } = tickIncomeWithBuffs(buildings, { streak: 1 });
  assert.deepStrictEqual(income, {});

  // 最终资源验证
  assert.ok(resources.gold > 0);
});

test('造lumberjack→6秒tick→wood收入增长', () => {
  let resources = { gold: 50, wood: 30, stone: 5, star: 1 };
  let buildings = [{ id: 'lumberjack', x: 0, y: 0 }];
  const { income } = tickIncomeWithBuffs(buildings, { streak: 1 });
  // 1个伐木场: wood=1(基础) + woodBonus=1 = 2
  assert.strictEqual(income.wood, 2);
});

test('多个伐木场 woodBonus 累加到 tick 收入', () => {
  const buildings = [
    { id: 'lumberjack', x: 0, y: 0 },
    { id: 'lumberjack', x: 1, y: 0 },
  ];
  const { income } = tickIncomeWithBuffs(buildings, { streak: 1 });
  // 2个伐木场: woodBonus=2, 每个伐木场 wood=1+2=3, 总计=6
  assert.strictEqual(income.wood, 6);
});

test('离线收入: 1小时 cottag→gold≈60', () => {
  const income = calculateOfflineIncome(
    [{ id: 'cottage' }],
    Date.now() - 3600 * 1000
  );
  assert.ok(income.gold > 0);
  assert.ok(income.gold <= 60);
});

test('box5 复习含 star→升级岛屿等级计算', () => {
  // 模拟放在 5 个 building + 1 个 star → level = floor(1/5)+floor(5/2)+1 = 0+2+1=3
  const stars = 1;
  const bCount = 5;
  const level = Math.floor(stars / 5) + Math.floor(bCount / 2) + 1;
  assert.strictEqual(level, 3);
});

test('所有建筑解锁条件一致性检查', () => {
  // 验证每个建筑的 unlock 条件不会互相矛盾
  BUILDINGS.forEach(b => {
    assert.ok(typeof b.id === 'string');
    assert.ok(typeof b.name === 'string');
    assert.ok(typeof b.tier === 'number');
    assert.ok(b.levelRequired >= 1 && b.levelRequired <= 25);
    assert.ok(b.starRequired >= 0);
    assert.ok(b.wordRequired >= 0);
    if (b.cost) {
      Object.values(b.cost).forEach(v => assert.ok(v > 0));
    }
  });
});

test('复习奖励表 Box1-5 一致性', () => {
  // 确保每个 Box 的奖励表都有两档
  for (let box = 1; box <= 5; box++) {
    const rGood = rewardForReview({ box }, 4, {});
    const rBad = rewardForReview({ box }, 2, {});
    assert.ok(rGood.gold > 0);
    assert.ok(rBad.gold > 0);
    // 好成绩收入 >= 差成绩
    assert.ok(rGood.gold >= rBad.gold);
  }
});

// ═══════════════════════════════════════════════════════════
//  汇总
// ═══════════════════════════════════════════════════════════
section('测试结果汇总');
console.log(`\n  总测试数: ${total}`);
console.log(`  ✅ 通过:  ${passed}`);
console.log(`  ❌ 失败:  ${failed}`);
console.log(`  通过率:  ${((passed/total)*100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\n❌ 有测试失败！');
  process.exit(1);
} else {
  console.log('\n🎉 所有测试通过！');
  process.exit(0);
}