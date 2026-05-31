/**
 * sim-v5.mjs — 最终修正版
 * - ⭐ 永不消耗 (gate only)
 * - Day 1 无复习 (只有 5 新词)
 * - 只复习 previously-learned words
 * - 含成就 + Roadmap + streak
 * 运行: node test/sim-v5.mjs
 */
import { initVocabulary, gradeWord } from '../src/core/vocab-engine.js';
import { rewardForReview, tickIncome, calculateBuffs, canAfford, deductResources } from '../src/core/economy.js';
import { getBuildingById } from '../src/data/buildings.js';
import { STARTING_RESOURCES, ECONOMY_TICK } from '../src/data/constants.js';

const BUILD_ORDER = ['tree','lumberjack','cottage','garden','quarry','market','dock','lighthouse','deep_mine','town_plaza','factory','castle'];
const TICKS_PER_DAY = Math.floor(86400 / (ECONOMY_TICK / 1000));
const STONE_PICKUP = 6;
const NEW_PER_DAY = 5;

function checkRewards(wordsCorrect, buildingCount, streak, totalLearned, prevAch) {
  const out = [];
  const add = (src, star, extra = {}) => { out.push({ src, star, ...extra }); };

  if (!prevAch.has('scholar_10') && wordsCorrect >= 10) {
    prevAch.add('scholar_10'); add('成就:单词达人', 1, { gold: 30 });
  }
  if (!prevAch.has('scholar_50') && wordsCorrect >= 50) {
    prevAch.add('scholar_50'); add('成就:词汇大师', 3, { gold: 50 });
  }
  if (!prevAch.has('first_build') && buildingCount >= 1) {
    prevAch.add('first_build'); add('成就:第一个建筑', 1);
  }
  if (!prevAch.has('builder_5') && buildingCount >= 5) {
    prevAch.add('builder_5'); add('成就:小有规模', 2);
  }
  if (!prevAch.has('builder_10') && buildingCount >= 10) {
    prevAch.add('builder_10'); add('成就:大兴土木', 3);
  }
  if (!prevAch.has('streak_3') && streak >= 3) {
    prevAch.add('streak_3'); add('streak:3天', 1, { gold: 20 });
  }
  if (!prevAch.has('streak_7') && streak >= 7) {
    prevAch.add('streak_7'); add('streak:7天', 2, { gold: 50 });
  }
  if (!prevAch.has('v_50') && totalLearned >= 50) {
    prevAch.add('v_50'); add('Roadmap:50词', 1, { gold: 50 });
  }
  if (!prevAch.has('v_100') && totalLearned >= 100) {
    prevAch.add('v_100'); add('Roadmap:100词', 2, { gold: 100, wood: 50 });
  }
  return out;
}

function simulate(days) {
  let vocab = initVocabulary().map(w => ({ ...w }));
  let resources = { ...STARTING_RESOURCES };
  let buildings = [];
  let totalLearned = 0;
  let wordsCorrect = 0;
  let stars = 0;
  let streak = 1;
  const prevAch = new Set();
  const daily = [];

  for (let d = 1; d <= days; d++) {
    const now = d * 86400000;
    const dayIn = { gold: 0, wood: 0, stone: 0, star: 0 };
    const events = [];
    let bldgObjs = buildings.map(b => getBuildingById(b.id));

    // 1. 地图拾取
    dayIn.stone += STONE_PICKUP;

    // 2. 复习：只复习 previously-learned words that are due
    const due = vocab.filter(w =>
      w.learnedAt !== null && w.nextReview !== null && w.nextReview <= now
    );
    // 平均每天复习 ~5-8 个 (随着时间增长)
    const reviewCount = Math.min(8, due.length);
    for (let i = 0; i < reviewCount; i++) {
      const w = due[i];
      const idx = vocab.findIndex(v => v.word === w.word && v.meaning === w.meaning);
      if (idx === -1) continue;
      const buffs = calculateBuffs(bldgObjs, { streak });
      const reward = rewardForReview(vocab[idx], 5, buffs);
      vocab[idx] = gradeWord(vocab[idx], 5, now);
      ['gold','wood','stone'].forEach(k => { if (reward[k]) dayIn[k] = (dayIn[k]||0) + reward[k]; });
      if (reward.star) { dayIn.star = (dayIn.star||0) + reward.star; stars += reward.star; }
      // no longer "new learning", just review
    }

    // 3. 学新词 (NEW_PER_DAY 个)
    const lk = new Set(vocab.filter(v => v.learnedAt).map(v => `${v.word}|${v.meaning}`));
    const fresh = vocab.filter(v => !lk.has(`${v.word}|${v.meaning}`)).slice(0, NEW_PER_DAY);
    for (const w of fresh) {
      const idx = vocab.findIndex(v => v.word === w.word && v.meaning === w.meaning);
      if (idx === -1) continue;
      const buffs = calculateBuffs(bldgObjs, { streak });
      const reward = rewardForReview(vocab[idx], 5, buffs);
      vocab[idx] = gradeWord(vocab[idx], 5, now);
      totalLearned++;
      wordsCorrect++;
      ['gold','wood','stone'].forEach(k => { if (reward[k]) dayIn[k] = (dayIn[k]||0) + reward[k]; });
      if (reward.star) { dayIn.star = (dayIn.star||0) + reward.star; stars += reward.star; }
      lk.add(`${w.word}|${w.meaning}`);
    }

    // 4. 被动收入
    const tickInc = tickIncome(bldgObjs);
    ['gold','wood','stone'].forEach(k => {
      if (tickInc[k]) dayIn[k] = (dayIn[k]||0) + tickInc[k] * TICKS_PER_DAY;
    });

    // 5. 成就 / Roadmap / Streak
    const batches = checkRewards(wordsCorrect, buildings.length, streak, totalLearned, prevAch);
    batches.forEach(b => {
      if (b.star) { dayIn.star = (dayIn.star||0) + b.star; stars += b.star; }
      if (b.gold) dayIn.gold = (dayIn.gold||0) + b.gold;
      if (b.wood) dayIn.wood = (dayIn.wood||0) + b.wood;
      events.push(b.src);
    });

    // 6. 合并
    ['gold','wood','stone'].forEach(k => { resources[k] = (resources[k]||0) + (dayIn[k]||0); });
    resources.star = stars;

    // 7. 建造（星不消耗）
    for (const bid of BUILD_ORDER) {
      const def = getBuildingById(bid);
      if (buildings.some(b => b.id === bid)) continue;
      if (!canAfford(resources, def.cost)) continue;
      if (stars < def.starRequired) continue;
      if (totalLearned < def.wordRequired) continue;
      resources = deductResources(resources, def.cost);
      buildings.push({ id: bid });
      events.push(`建:${def.name}`);
      const postBuild = checkRewards(wordsCorrect, buildings.length, streak, totalLearned, prevAch);
      postBuild.forEach(b => {
        if (b.star) { dayIn.star = (dayIn.star||0) + b.star; stars += b.star; }
        if (b.gold) dayIn.gold = (dayIn.gold||0) + b.gold;
        if (b.wood) dayIn.wood = (dayIn.wood||0) + b.wood;
        events.push(b.src);
      });
      resources.star = stars;
      bldgObjs = buildings.map(b => getBuildingById(b.id));
    }

    daily.push({
      day: d, learned: totalLearned, wordsCorrect,
      buildings: buildings.length, stars,
      income: { ...dayIn }, res: { ...resources },
      events: events.length > 0 ? events : null
    });
    streak++;
  }
  return { daily };
}

function fmt(n,w) { return Math.round(n).toLocaleString().padStart(w); }
function pad(s,w) { return String(s).padStart(w); }

const { daily } = simulate(30);

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║  🏝️  Word Island Builder — v5 完整资源流 (⭐=gate不消耗)      ║');
console.log('╠═══════════════════════════════════════════════════════════════════╣\n');

// ── 关键节点 ──
console.log('📊 关键节点快照\n');
console.log('  Day │词数│建│  ⭐ │    🪙 gold │  🪵 wood │🪨 stone');
console.log('  ─────┼────┼──┼─────┼───────────┼──────────┼─────────');
[1,2,3,5,7,8,10,12,14,21,30].forEach(d => {
  const r = daily[d-1]; if (!r) return;
  console.log(`  ${pad(d,4)} │${pad(r.learned,3)} │${pad(r.buildings,1)} │${pad(r.stars,3)} │${fmt(r.res.gold,10)} │${fmt(r.res.wood,8)} │${fmt(r.res.stone,7)}`);
});

// ── 事件日志 (前 21 天) ──
console.log('\n\n📋 每日事件\n');
for (let i = 0; i < 21; i++) {
  const r = daily[i]; if (!r) continue;
  const inc = r.income;
  const incStr = `🪙${fmt(inc.gold,5)} 🪵${fmt(inc.wood,5)} 🪨${fmt(inc.stone,3)} ⭐+${fmt(inc.star,2)}`;
  const ev = r.events ? r.events.join(', ') : '-';
  console.log(`  Day ${pad(r.day,2)} │⭐${pad(r.stars,2)}│${incStr} │${ev.length > 70 ? ev.slice(0,67)+'...' : ev}`);
}

// ── 星星来源 ──
console.log('\n\n⭐ 星星获取节奏\n');
let cum = 0; const byWeek = [0,0,0,0];
daily.forEach(r => {
  const wk = Math.ceil(r.day/7);
  if (wk <= 4) byWeek[wk-1] += (r.income.star||0);
  cum += (r.income.star||0);
});
console.log(`  Week 1: +${fmt(byWeek[0],2)}⭐  Week 2: +${fmt(byWeek[1],2)}⭐  Week 3: +${fmt(byWeek[2],2)}⭐  Week 4: +${fmt(byWeek[3],2)}⭐`);
console.log(`  30天累计: ⭐${cum}`);
console.log(`  来源: 成就(5⭐=scholar_10+50+first_build) + streak(3⭐) + roadmap(3⭐)`);
console.log(`  Box 5 复习: Day ${12}+ 开始产星 (每21天1⭐/词)`);

// ── 建造时间线 ──
console.log('\n\n🏗️ 建造时间线\n');
let allBuilds = [];
daily.forEach(r => {
  if (r.events) {
    r.events.filter(e => e.startsWith('建:')).forEach(e => {
      allBuilds.push(`Day ${pad(r.day,2)}: ${e.replace('建:','')}`);
    });
  }
});
allBuilds.forEach(l => console.log(`  ${l}`));

// ── 门禁分析 ──
console.log('\n\n🔒 星数门禁 vs 30天实际\n');
const s30 = daily[29]?.stars || 0;
console.log(`  30天 ⭐=${s30}`);
console.log('');
console.log('  建筑           需⭐  词   30天?');
console.log('  ───────────────┼─────┼────┼──────');

// 找到每个建筑可建造的 day
const findDay = (needStar, needWord) => {
  for (const r of daily) {
    if (r.stars >= needStar && r.learned >= needWord) return r.day;
  }
  return '>30';
};

BUILD_ORDER.forEach(bid => {
  const def = getBuildingById(bid);
  const d = findDay(def.starRequired, def.wordRequired);
  const mark = d === '>30' ? '❌' : `Day${d}`;
  console.log(`  ${def.name.padEnd(16)}│${pad(def.starRequired,4)}│${pad(def.wordRequired,3)}│ ${mark}`);
});

// ── 结论 ──
console.log('\n\n╔═══════════════════════════════════════════════════════════════════╗');
console.log('║  📋 结论                                                          ║');
console.log('╠═══════════════════════════════════════════════════════════════════╣');

const lastDay = daily[29];
const blds = ['树','伐木场','小屋','花园','采石场'];
const built = blds.slice(0, lastDay.buildings).join('→');
const nxt = lastDay.buildings < blds.length ? blds[lastDay.buildings] : '无';

console.log(`║  30天建造: ${built}                                                ║`);
console.log(`║  30天⭐:   ${lastDay.stars}   下一个建筑: ${nxt}                                              ║`);
console.log(`║                                                                 ║`);
if (lastDay.stars < 8) {
  console.log(`║  ⚠️  卡在 garden (需8⭐)，成就用尽后无星源                     ║`);
  console.log(`║  Box 5 星来得太慢: Day 12+ 才有第一个 → 需 21 天产 2⭐      ║`);
  console.log(`║  建 garden 要再等 ~${findDay(8,40)} 天                                   ║`);
} else {
  console.log(`║  ✅ garden可建                                                 ║`);
}
console.log(`║                                                                 ║`);
console.log(`║  设计建议:                                                      ║`);
console.log(`║  1. garden 降⭐到 3-4 (与 cottage 自然衔接)                   ║`);
console.log(`║  2. 或 Box 3 复习也给 ⭐ (每 4 天产 1⭐)                      ║`);
console.log(`║  3. 或 v_10 Roadmap 直接给 1⭐                                ║`);
console.log('╚═══════════════════════════════════════════════════════════════════╝');