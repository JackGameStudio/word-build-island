# Word Island Builder — Settings 面板 + 跳时间机制
**时间**: 2026-05-28 09:00-09:15 GMT+8

## 修改内容

### 新文件: `src/components/SettingsPanel.js`
- ⚙️ 设置按钮 → 打开弹窗面板
- ⏩ **跳到下一天** — 每次点击 `timeOffset += 86400000`（1天）
- 显示"当前已跳过 N 天"计数
- 🔄 **重置所有数据** — 移到面板内（带确认弹窗）
- ✕ 关闭按钮

### 修改文件

#### `src/core/vocab-engine.js`
- `gradeWord(word, quality, now = Date.now())` — 新增可选 `now` 参数

#### `src/components/VocabOverlay.js`
- 新增第5个参数 `getEffectiveNow`
- `getDueWords()` 和 `gradeWord()` 都使用有效时间

#### `src/main.js`
- `data.timeOffset` — 新增字段，持久化到 IndexedDB
- `getEffectiveNow()` / `getEffectiveDate()` — 统一时间计算
- 每日打卡逻辑改用有效日期
- 底部按钮：🔧 重置 → ⚙️ 设置（打开 Settings 面板）
- 跳时间后自动保存

## 跳时间机制说明
- `timeOffset` 存储在存档中（毫秒）
- 背词引擎使用 `Date.now() + timeOffset` 作为"当前时间"
- 跳1天 → 所有词卡片的 `nextReview` 向前推移，原本明天才到期的词现在就到期了
- 每天打卡逻辑也跟随有效日期，可以模拟连续打卡

## 验证
- ✅ 全部文件 node --check 通过
- ✅ vite build 成功（61KB JS）

## 使用方式
1. 点底部 ⚙️ 设置
2. 点 ⏩ 跳到下一天（可多次点击跳过更多天）
3. 关掉面板，点 📖 背词 → 看新到期的词