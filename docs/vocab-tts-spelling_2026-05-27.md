# Word Island Builder — 词库补全 + TTS + 拼字测试
**时间**: 2026-05-27 23:30-23:45 GMT+8

## 修改内容

### 1. 词库替换（2876→773 词）
- **来源**: 项目根 `vocabularies.csv`（JACK 提供的学习词表）
- **之前误操作**: 从 LearningIsFun dictionary-api.js 提取了 2876 条（那是查词词典，不是学习词库）
- **纠正**: 解析 `vocabularies.csv`（3列: number,english,chinese），输出 773 条到 `src/data/vocabulary.js`
- 脚本: `convert-csv.cjs`（可复用）

### 2. TTS 读音系统
- **新文件** `src/core/tts.js`（80行）
- 使用浏览器原生 Web Speech API（无需后端/API key）
- `speakWord()` 自动先读英文→停 350ms→读中文
- 拼写测试时自动朗读
- 顶部 🔊 按钮可手动重听

### 3. 拼字测试模式
- 修改 `src/components/VocabOverlay.js`
- 顶部新增 🔀 模式切换按钮
- **选择题模式**（默认）— 看英文，选中文（4选1）
- **拼写模式** — 看中文释义 + 听发音，手打英文拼写
- 拼写模式下输入框自动聚焦，Enter/回车直接提交
- 答错时显示正确答案

## 验证
- ✅ node --check 全部通过（vocabulary.js, tts.js, VocabOverlay.js）
- ✅ vocabulary.js 773 词（30KB，vs 之前 108KB/2876 词）

## 待测试
- TTS 在移动端 Safari 的兼容性（需要用户手势触发）
- 拼写模式的大写/标点容错（已做 toLowerCase 处理）