# Word Island Builder — 游戏测试报告

**测试日期**: 2026-05-27  
**测试人**: 🎮 游戏设计师 (agent:uafru5gofdt644lm)  
**项目路径**: `~/.qclaw/workspace/word-island-builder`  
**版本**: 0.1.0 (Phase 5)

---

## 📊 测试总览

| 指标 | 结果 |
|------|------|
| 自动化测试数 | **71** |
| ✅ 通过 | **71** |
| ❌ 失败 | **0** |
| 通过率 | **100%** |
| Build 状态 | ✅ 通过 (236ms) |
| 产物大小 | JS 34.81KB + CSS 4.74KB (gzip: ~14KB) |

---

## 🧪 测试覆盖范围

### 1. constants.js — 常量检查 (9 项)
- ✅ 开局资源: gold=50, wood=30, stone=5, star=0
- ✅ 经济周期: 6s tick, 10% 离线倍率, 8h 离线上限
- ✅ 岛屿: 12×12 网格, 五种地形枚举
- ✅ 状态机: idle / vocab / build / preview

### 2. buildings.js — 建筑系统 (11 项)
- ✅ 12 种建筑 (T0~T4), tree → castle
- ✅ 各建筑 cost/income 正确
- ✅ `canBuild`: 资源不足 / star不足 / 等级不足 / 词量不足 四种拦截
- ✅ `countLearnedWords` 统计准确

### 3. vocab-engine.js — SM-2 词汇引擎 (10 项)
- ✅ 初始化: box=1, ef=2.5, nextReview=null
- ✅ getDueWords: 到期判定正确
- ✅ gradeWord: 答对→box+1, 答错→box不升, ef下限1.3, box上限5
- ✅ getBoxStats / getQuizOptions 生成4选项测验

### 4. economy.js — 经济系统 (18 项)
- ✅ 复习奖励表: Box1→Box5 五档, 好/差成绩双路径
- ✅ Buff 系统: woodBonus, stoneBonus, goldBonusBox3, reviewGoldMultiplier, starMultiplier, globalBuff
- ✅ tickIncome: 累加/零产出建筑处理正确
- ✅ 离线收入: 正常离线+8h 上限截断
- ✅ mergeResources / canAfford / deductResources 正确
- ✅ 格式化: formatElapsed / formatIncome 含emoji

### 5. achievements.js — 成就系统 (6 项)
- ✅ 8 个成就全部定义完整
- ✅ first_build / builder_5 / builder_10 建筑里程碑
- ✅ first_word / scholar_10 / scholar_50 词汇里程碑
- ✅ first_income / tick_100 经济里程碑
- ✅ 已解锁不重复返回

### 6. state.js — 状态机 (8 项)
- ✅ 合法转换: IDLE→VOCAB, IDLE→BUILD, VOCAB→IDLE, BUILD→PREVIEW, PREVIEW→IDLE
- ✅ 非法转换: IDLE→PREVIEW (被拒), VOCAB→BUILD (被拒)

### 7. 集成测试 — 完整游戏循环 (9 项)
- ✅ 学词→奖励→建造→tick→成就 全流程
- ✅ lumberjack buff 叠加: 2个伐木场 = wood 6/tick
- ✅ 离线收入计算: 1h cottage ≈ 60 gold
- ✅ 岛屿等级公式: floor(star/5)+floor(building/2)+1
- ✅ 建筑解锁一致性 + 奖励表完整性

---

## ⚠️ 发现的问题

### 🔴 需要修复

| # | 严重度 | 问题 | 位置 |
|---|--------|------|------|
| 1 | 低 | **storage.js 重复导入**: main.js 第11行静态 import，第185行又 `await import()` 动态导入，Vite 给出警告 | `src/main.js` L185 |

### 🟡 建议优化

| # | 类型 | 问题 | 建议 |
|---|------|------|------|
| 2 | 平衡 | 词库仅 28 词，但 factory 需要 250 词、castle 需要 300 词 | 从 CSV 补全至 84+ 词 |
| 3 | UX | 开局 50g 可立刻买 10 棵树（无产出），新手可能浪费资源 | 开局引导或最低解锁条件 |
| 4 | UX | 触摸设备（手机）不支持单指平移岛屿 | 考虑添加双指手势提示 |
| 5 | UX | 重置按钮双击跳过确认——容易误触 | 加更明确的双击提示或改为长按 |
| 6 | 代码 | `tickIncomeWithBuffs` 函数参数以 `stats` 传入但未充分利用——`woodBonus` 在 buff 计算里 | 结构清晰，无需改，但注意 buff 叠加逻辑 |

### ✅ 稳定性评估

- **核心逻辑**: 全部通过，无 bug
- **经济系统**: 数值平衡 v2 经过调优，合理的渐进曲线
- **状态机**: 转换规则完整，所有面板互斥正确
- **Build**: 零失败，产物大小健康 (34.81KB)

---

## 💡 游戏设计师视角评价

### 🎮 核心循环
`学单词 → 拿资源 → 造建筑 → 被动收入 → 解锁新建筑 → 学更多单词`

循环设计扎实，类似于《Cookie Clicker》的教学版。✅

### ⚖️ 数值平衡 (v2)
- 开局 50g/30w → 能立刻买伐木场（10g）开始木材经济 → 攒够 50g/30w/10s 买小屋 → 开启金币复利
- **伐木场 buff 叠加是双刃剑**：每个伐木场让所有木材+1，2个=6木/tick, 3个=12木/tick —— 有指数倾向，但被 stone 和 farmland 的解锁门槛自然抑制
- 顶级建筑 castle (50000g) 需要大量被动收入累积——长期目标明确

### 🏆 成就设计
8 个成就覆盖 建筑/词汇/经济 三个维度，奖励适中（⭐1~3, 🪙10~50）。里程碑节奏合理。

### 🔥 连续打卡
1天=5g, 3天=20g+1⭐, 7天=50g+2⭐。递增奖励设计良好，但**第2天无额外激励**（只有1天的5g会被覆盖），可考虑 2 天给少量额外奖。

---

## 📝 总结

| 结论 | 详情 |
|------|------|
| **状态** | 🟢 核心系统健康，可发布 Alpha |
| **优先级** | 补全词库 > 新手引导 > 移动端适配 |
| **下次测试** | 建议在浏览器中手动进行 UI/UX 测试 |