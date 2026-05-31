# Word Island Builder — 全部建筑补全 & Buff 系统实现
**时间**: 2026-05-27 00:15-00:45 GMT+8
**范围**: 12 建筑补全 + 8 种新 Buff 类型 + canBuild 加 star 检查

## 修改的文件

### 1. `src/data/buildings.js` — 完全重写（4→12 建筑）
- **T0**: Tree, Lumberjack, Cottage
- **T1**: Garden, Quarry
- **T2**: Dock, Deep Mine
- **T3**: Market, Lighthouse, Town Plaza
- **T4**: Factory, Castle
- 新增 `starRequired` 字段（每个建筑解锁需要多少⭐）
- `canBuild()` 新增 `stars` 参数，检查 `starRequired`
- 成本对齐设计文档（Lumberjack 10g→1⭐/5词，Cottage 50g/30w/10s→2⭐/10词，Quarry 50g/20w→10⭐/50词等）
- Tree income 改为 null（纯装饰）
- 新建筑 spriteIndex 为 null（等待美术补全，渲染时显示 emoji 文字/树精灵占位）

### 2. `src/core/economy.js` — Buff 系统大幅升级
- **`calculateBuffs()`**: 新增 8 种 buff 类型处理
  - `goldBonusBox3` (Garden) — Box≥3 复习时 gold+
  - `box4Multiplier` (Deep Mine) — Box≥4 奖励 ×1.3
  - `reviewGoldMultiplier` (Market) — 所有复习 gold ×1.5
  - `starMultiplier` (Lighthouse) — ⭐获取速度 ×1.5
  - `streak7Review` (Town Plaza) — streak≥7 每日免费复习
  - `dailyWordLimit` (Factory) — 每日新词上限 +5
  - `globalBuff` (Castle) — 全局 Buff 20%, ⭐×2
  - `unlockWater` (Dock) — 解锁水地形
- **`rewardForReview(word, quality, buffs)`**: 新增 `buffs` 参数，按顺序应用 4 种奖励 buff（goldBonusBox3 → box4Multiplier → reviewGoldMultiplier → starMultiplier → globalBuff）

### 3. `src/components/BuildDrawer.js` — UI 显示 ⭐
- 新增 `getStars` 参数
- `canBuild()` 调用传入 star 值
- 建筑列表显示 `⭐N` 标签和需求
- `formatCost()` 移除 food，显示 ⭐ 花费
- 资源不足时显示具体缺什么（含 ⭐）

### 4. `src/components/VocabOverlay.js` — 复习奖励应用 Buff
- 新增 `getBuffs` 参数（可选，默认空对象）
- `rewardForReview()` 调用传入 buffs 参数

### 5. `src/main.js` — 入口串联
- 导入 `calculateBuffs`
- `buildDrawer` 传入 `() => data.resources.star || 0`
- `vocabOverlay` 传入 `() => calculateBuffs(buildings, stats)`

## 验证结果
- ✅ `node --check` 全部 5 个 JS 文件通过
- ✅ `vite build` 成功（20 modules, ~271ms）
- ✅ ResourceBar.js 无 food 残留
- ✅ 原有 canBuild 调用点全部更新

## 已知待实现（不影响 balance 测试）
1. **Dock 解锁水地形** — 需改 `island-engine.js` 的 `isBuildable()` 逻辑
2. **Town Plaza streak7Review** — 需在 main.js 的每日打卡逻辑中加入免费复习
3. **Factory dailyWordLimit** — 需实现每日新词系统
4. **新建筑 spritesheet** — 当前 9 个新建筑显示树精灵占位，美术补 9 列 spritesheet
5. **岛屿等级计算** — 当前 `calcLevel()` 公式（stars/5+buildings/2+1）与设计文档的等级表（25级）不完全对齐，需后续调参