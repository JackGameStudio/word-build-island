# Changelog

## [Unreleased] - 2026-06-05

### Added
- **新增填空题题型 (FILL_BLANK)**
  - `src/core/vocab-engine.js`：新增 `getWordOptions()` 函数，从词库随机取 3 个干扰词 + 正确词打乱返回
  - `src/components/VocabOverlay.js`：导入 `getWordOptions`；MODE 新增 `FILL_BLANK`；`autoDecideMode()` 改为三层分发（Box1 选择题，Box2-3 50% 填空，Box4-5 三选一）；`renderCurrentQuestion()` 新增填空分支（展示含 `___` 的例句 + 4 个单词选项）；新增 `handleFillBlankAnswer()` 处理逻辑；`processAnswer()` 填空归入选项禁用分支，错误恢复保留原始字号

### Fixed
- **修复 vocabulary.js 语法错误**：第 327 行和第 776 行各移除了残留字符串（"It is very ___." / "Everything looks ___ now."）

### Changed
- **农田重命名**：`src/data/buildings.js` 中 garden 建筑 name 从「花园」改为「农田」，icon 从 🌷 改为 🌾
