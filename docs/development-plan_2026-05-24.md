# Word Island Builder — 开发实施计划 v1.1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建 Word Island Builder MVP — 将词汇学习（LearningIsFun）与岛屿建造玩法深度融合的 HTML5 游戏

**Architecture:** Vite + Vanilla JS 模块化项目，混合渲染方案（Canvas 游戏画面 + CSS/图片 UI 面板），俯视 top-down，IndexedDB 持久化，5 阶段交付

**渲染方案:** 
- **Canvas** — 岛屿地图、建筑 sprite 切图、幽灵预览、拖拽缩放
- **CSS + 图片** — 资源栏、背词卡片、建造抽屉（九宫格面板边框、图片按钮三态、像素图标切片）

**Tech Stack:** Vite 5.x, Vanilla JavaScript (ES Modules), Canvas API, IndexedDB, Web Speech API (TTS)

**设计文档:** `island-merge-design_2026-05-02.md` (v1.1), `island-merge-balance_2026-05-04.md` (v1.1), `island-merge-uiux-v1.md` (v1.1)

---

## 文件结构总览

```
/word-island-builder
  /src
    /core
      /storage.js         ← IndexedDB 封装（读/写/初始化）
      /vocab-engine.js    ← SM-2 算法 + Leitner 5盒逻辑
      /economy.js         ← 资源管理 + 词汇→资源映射 + 离线收入 + Buff
      /island-engine.js   ← Canvas 渲染引擎（俯视网格 + sprite 切图 + 拖拽缩放）
      /asset-loader.js    ← 图片资源预加载器（spritesheet/UI图片/图标）
      /state.js           ← 全局状态机（IDLE/VOCAB/BUILD/PREVIEW）+ 面板互斥
    /components
      /ResourceBar.js     ← 顶部资源栏（icons.png 切片 + panel-9slice 背景）
      /VocabOverlay.js    ← 背词覆盖层（九宫格面板 + btn-pixel 图片按钮）
      /BuildDrawer.js     ← 底部建造抽屉（九宫格边框 + 建筑缩略图 + 解锁条件）
      /BuildPreview.js    ← 幽灵预览层（50%透明度 sprite）
      /Toast.js           ← 通知组件（像素风弹出消息）
    /data
      /buildings.js       ← 建筑定义（5种核心：sprite坐标 + cost + income + buff + unlock）
      /vocabulary.js      ← 词库（~84词，从 LearningIsFun 迁移）
      /achievements.js    ← 成就定义（Phase 4）
      /constants.js       ← 全局常量
    /assets
      /images
        /spritesheet.png  ← 建筑精灵表（5列×1行，每格 64×64）
        /icons.png        ← 像素图标（5种资源，每格 24×24）
        /panel-9slice.png ← 九宫格面板背景（64×64）
        /btn-normal.png   ← 按钮-正常态
        /btn-hover.png    ← 按钮-悬停态
        /btn-disabled.png ← 按钮-禁用态
      /style.css          ← 像素风 CSS + 九宫格 + 图片按钮样式
    /main.js              ← 入口：preloadAssets → initDB → load → 挂载
  /index.html
  /package.json
  /vite.config.js
```

---

## Phase 0: 脚手架 (1天)

### Task 0.1: 初始化 Vite 项目

**Files:**
- Create: `word-island-builder/package.json`
- Create: `word-island-builder/vite.config.js`
- Create: `word-island-builder/index.html`

- [ ] **Step 1: 创建项目目录结构**

```powershell
$root = "$env:USERPROFILE\.qclaw\workspace\word-island-builder"
New-Item -ItemType Directory -Path "$root\src\core" -Force
New-Item -ItemType Directory -Path "$root\src\components" -Force
New-Item -ItemType Directory -Path "$root\src\data" -Force
New-Item -ItemType Directory -Path "$root\src\assets\images" -Force
```

- [ ] **Step 2: 写 `package.json`**

```json
{
  "name": "word-island-builder",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 3: 写 `vite.config.js`**

```javascript
import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsDir: 'assets' },
  server: { port: 3000, open: true }
});
```

- [ ] **Step 4: 写 `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Word Island Builder</title>
  <link rel="stylesheet" href="/src/assets/style.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: 安装并验证**

```powershell
cd $root; npm install; npx vite --port 3000
```

Expected: 浏览器空白页，console 无报错

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: initialize Vite project scaffold"
```

---

### Task 0.2: 全局常量 + CSS + 占位图片

**Files:**
- Create: `src/data/constants.js`
- Create: `src/assets/style.css`
- Create: 6 个占位图片（用代码生成）

- [ ] **Step 1: 写 `src/data/constants.js`**

```javascript
// 开局资源（全新开始）
export const STARTING_RESOURCES = {
  gold: 30, wood: 20, stone: 5, food: 10, star: 0
};

// 经济系统
export const ECONOMY_TICK = 6000;
export const OFFLINE_RATE = 0.1;
export const OFFLINE_MAX_HOURS = 8;
export const ISLAND_GRID_SIZE = 12;
export const CELL_SIZE = 64;

// 词汇系统
export const DAILY_NEW_WORD_LIMIT = 10;
export const LEITNER_BOXES = 5;
export const REVIEW_INTERVALS = [2, 4, 8, 14, 30];

// 应用状态机
export const AppState = {
  IDLE: 'idle',
  VOCAB: 'vocab',
  BUILD: 'build',
  PREVIEW: 'preview'
};

// sprite 切片坐标
export const SPRITE = {
  CELL_W: 64, // 建筑精灵单格尺寸
  CELL_H: 64,
  ICON_W: 24, // 图标单格尺寸
  ICON_H: 24,
  NINE_SLICE: 32 // 九宫格切边
};
```

- [ ] **Step 2: 生成占位图片**

用 Canvas API 生成 6 个临时图片。以下是生成脚本：

```javascript
// gen-placeholders.js — 运行一次即可
import { createCanvas } from 'canvas'; // 或用浏览器 console
// 简化：用以下 HTML 在浏览器中打开生成
```

> 实际实施时，用 Chrome console 或 Node canvas 包生成纯色方块 PNG。

占位图片规格：

| 图片 | 尺寸 | 内容 |
|-----|------|------|
| `spritesheet.png` | 320×64 | 5列 × 1行，每格64×64，不同颜色方块 + emoji |
| `icons.png` | 120×24 | 5列 × 1行，每格24×24，⭐🪙🪵🪨🌾 |
| `panel-9slice.png` | 64×64 | 2px 边框 + 填充色（做九宫格拉伸） |
| `btn-normal.png` | 默认 160×40 | 深绿色 #5a8f3e |
| `btn-hover.png` | 160×40 | 亮绿色 #7bc44f |
| `btn-disabled.png` | 160×40 | 灰色 #555 |

- [ ] **Step 3: 写 `src/assets/style.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Silkscreen&display=swap');

:root {
  --pixel-font: 'Silkscreen', 'Press Start 2P', monospace;
  --color-bg: #1a1a2e;
  --color-surface: #2d2d44;
  --color-text: #e2e8f0;
  --color-muted: #94a3b8;
  --color-overlay: rgba(26, 26, 46, 0.7);
  --color-correct: #4ade80;
  --color-wrong: #f87171;

  --header-height: 48px;
  --drawer-max-height: 50vh;
  --overlay-height: 60vh;

  --transition-fast: 150ms ease;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 100%; height: 100%;
  overflow: hidden;
  background: var(--color-bg);
  font-family: var(--pixel-font);
  color: var(--color-text);
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  image-rendering: pixelated;
}

#app {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  position: relative;
}

/* ─── 九宫格面板 ─── */
.panel-9slice {
  border: 8px solid transparent;
  border-image: url('/src/assets/images/panel-9slice.png') 8 fill stretch;
  border-image-slice: 8 fill;
  border-image-width: 8px;
  background: var(--color-surface);
}

/* ─── 图片按钮（三态） ─── */
.btn-pixel {
  display: inline-flex;
  align-items: center; justify-content: center;
  padding: 8px 16px;
  min-width: 120px; min-height: 36px;
  border: none;
  background: url('/src/assets/images/btn-normal.png') center / 100% 100% no-repeat;
  color: var(--color-text);
  font-family: var(--pixel-font);
  font-size: 13px;
  cursor: pointer;
  image-rendering: pixelated;
  transition: transform var(--transition-fast);
}
.btn-pixel:hover  { background-image: url('/src/assets/images/btn-hover.png'); }
.btn-pixel:active { transform: scale(0.95); }
.btn-pixel.disabled {
  background-image: url('/src/assets/images/btn-disabled.png');
  opacity: 0.5;
  pointer-events: none;
}

/* ─── 资源栏 ─── */
.resource-bar {
  height: var(--header-height);
  display: flex; align-items: center;
  gap: 16px; padding: 0 16px;
  background: var(--color-surface);
  border-bottom: 2px solid #444;
  flex-shrink: 0;
  z-index: 10;
}
.resource-item {
  display: flex; align-items: center; gap: 4px;
  font-size: 13px;
}
.resource-icon {
  width: 24px; height: 24px;
  display: inline-block;
}

/* ─── 遮罩层 ─── */
.overlay-backdrop {
  position: absolute;
  inset: var(--header-height) 0 0 0;
  background: var(--color-overlay);
  z-index: 20;
  transition: opacity var(--transition-fast);
}

/* ─── 半屏面板 ─── */
.slide-panel {
  position: absolute;
  left: 0; right: 0;
  bottom: 0;
  height: var(--overlay-height);
  z-index: 30;
  transform: translateY(100%);
  transition: transform var(--transition-fast);
}
.slide-panel.open {
  transform: translateY(0);
}

/* ─── Canvas 容器 ─── */
.island-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}
.island-container canvas {
  display: block;
}

/* ─── 动画 ─── */
@keyframes fly-to-bar {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.3) translateY(-200px); }
}
@keyframes toast-in {
  0%   { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25%  { transform: translateX(-8px); }
  75%  { transform: translateX(8px); }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/data/constants.js src/assets/
git commit -m "feat: add constants, pixel CSS, and placeholder images"
```

---

## Phase 1: MVP — 背词+资源 (1周)

### Task 1.0: 图片资源预加载器

**Files:**
- Create: `src/core/asset-loader.js`

```javascript
const ASSET_LIST = {
  spritesheet:  '/src/assets/images/spritesheet.png',
  icons:        '/src/assets/images/icons.png',
  panelBG:      '/src/assets/images/panel-9slice.png',
  btnNormal:    '/src/assets/images/btn-normal.png',
  btnHover:     '/src/assets/images/btn-hover.png',
  btnDisabled:  '/src/assets/images/btn-disabled.png'
};

export function preloadAssets(onProgress) {
  const keys = Object.keys(ASSET_LIST);
  const images = {};
  let loaded = 0;

  return Promise.all(keys.map(key =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        images[key] = img;
        loaded++;
        onProgress?.(loaded / keys.length);
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load: ${ASSET_LIST[key]}`));
      img.src = ASSET_LIST[key];
    })
  )).then(() => images);
}

// sprite 工具函数
export function drawSprite(ctx, image, sx, sy, sw, sh, dx, dy, dw, dh) {
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw ?? sw, dh ?? sh);
}
```

- [ ] **Step 1: 写 `asset-loader.js`**
- [ ] **Step 2: Commit**

---

### Task 1.1: IndexedDB 存储封装

**Files:**
- Create: `src/core/storage.js`

```javascript
const DB_NAME = 'word-island-builder';
const DB_VERSION = 1;
const STORE = 'game-state';
const KEY = 'current';
let db = null;

export async function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      if (!e.target.result.objectStoreNames.contains(STORE))
        e.target.result.createObjectStore(STORE);
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

export async function saveGameData(data) {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadGameData() {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 1: 写 `storage.js`**
- [ ] **Step 2: Commit**

---

### Task 1.2: 词汇引擎 — SM-2 + Leitner

**Files:**
- Create: `src/core/vocab-engine.js`
- Create: `src/data/vocabulary.js`（从 LearningIsFun 迁移 ~84词）

**核心函数:**

```javascript
import { REVIEW_INTERVALS } from '../data/constants.js';

export function initVocabulary(wordBank) {
  return wordBank.map(w => ({ ...w, box: 1, nextReview: null, ef: 2.5, learnedAt: null }));
}

export function getDueWords(vocab, now = Date.now()) {
  return vocab.filter(w => w.nextReview === null || w.nextReview <= now);
}

export function gradeWord(word, quality) {
  let newEf = word.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEf = Math.max(1.3, newEf);
  
  if (quality < 3) {
    return {
      ...word,
      box: quality === 0 ? 1 : Math.max(1, word.box - 1),
      nextReview: quality === 0 ? null : Date.now() + 86400000,
      ef: newEf
    };
  }
  
  const newBox = Math.min(5, word.box + 1);
  const interval = Math.round(REVIEW_INTERVALS[newBox - 1] * newEf);
  return {
    ...word,
    box: newBox,
    nextReview: Date.now() + interval * 86400000,
    ef: newEf,
    learnedAt: word.learnedAt || Date.now()
  };
}

export function getBoxStats(vocab) {
  const stats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  vocab.forEach(w => { stats[w.box]++; });
  return stats;
}
```

- [ ] **Step 1: 迁移词库 → `vocabulary.js`**
- [ ] **Step 2: 写 `vocab-engine.js`**
- [ ] **Step 3: Commit**

---

### Task 1.3: 经济引擎

**Files:**
- Create: `src/core/economy.js`

**核心函数:**

```javascript
import { OFFLINE_RATE, OFFLINE_MAX_HOURS, ECONOMY_TICK } from '../data/constants.js';
import { getBuildingById } from '../data/buildings.js';

const REWARD_TABLE = {
  1: [ { gold: 2, wood: 1 },            { gold: 1 } ],
  2: [ { gold: 3, wood: 2 },            { gold: 1, wood: 1 } ],
  3: [ { gold: 5, wood: 3, food: 2 },   { gold: 2, wood: 1 } ],
  4: [ { gold: 8, wood: 5, stone: 3, food: 3 },  { gold: 3, wood: 2 } ],
  5: [ { gold: 12, wood: 8, stone: 5, food: 5, star: 1 }, { gold: 5, wood: 3, stone: 1 } ]
};

export function rewardForReview(word, quality) {
  const idx = quality < 3 ? 1 : 0;
  return { ...REWARD_TABLE[word.box][idx] };
}

export function tickIncome(buildings) {
  const income = {};
  buildings.forEach(b => {
    const def = getBuildingById(b.id);
    if (def?.income) {
      Object.entries(def.income).forEach(([res, val]) => {
        income[res] = (income[res] || 0) + val;
      });
    }
  });
  return income;
}

export function calculateOfflineIncome(buildings, lastOnline) {
  const now = Date.now();
  const elapsed = Math.min((now - lastOnline) / 1000, OFFLINE_MAX_HOURS * 3600);
  const ticks = Math.floor(elapsed / (ECONOMY_TICK / 1000));
  const income = {};
  buildings.forEach(b => {
    const def = getBuildingById(b.id);
    if (def?.income) {
      Object.entries(def.income).forEach(([res, val]) => {
        income[res] = (income[res] || 0) + Math.floor(val * ticks * OFFLINE_RATE);
      });
    }
  });
  return income;
}

export function calculateBuffs(buildings, stats) {
  const buffs = {};
  buildings.forEach(b => {
    const def = getBuildingById(b.id);
    if (!def?.buff) return;
    switch (def.buff.type) {
      case 'woodBonus':
        buffs.woodBonus = (buffs.woodBonus || 0) + def.buff.value;
        break;
      case 'streakGold':
        if (stats.streak >= 3) buffs.dailyGold = (buffs.dailyGold || 0) + def.buff.value;
        break;
      case 'autoReview':
        buffs.autoReview = (buffs.autoReview || 0) + def.buff.value;
        break;
      case 'stoneBonus':
        buffs.stoneBonus = (buffs.stoneBonus || 0) + def.buff.value;
        break;
    }
  });
  return buffs;
}

export function mergeResources(a, b) {
  const result = { ...a };
  Object.entries(b).forEach(([k, v]) => { result[k] = (result[k] || 0) + v; });
  return result;
}
```

- [ ] **Step 1: 写 `economy.js`**
- [ ] **Step 2: 验证：`node --check src/core/economy.js`**
- [ ] **Step 3: Commit**

---

### Task 1.4: 岛屿引擎 — Canvas sprite 渲染

**Files:**
- Create: `src/core/island-engine.js`

**职责:**
- 创建 Canvas 放在 `.island-container` 内
- 渲染 12×12 俯视网格（草地双色格子）
- 从 spritesheet 切图绘制建筑（`drawSprite`）
- 实现 screenToGrid / gridToScreen 坐标转换
- 支持 PointerEvent 拖拽平移（设置 `wasPanning` 标志防误触）

```javascript
import { ISLAND_GRID_SIZE, CELL_SIZE, SPRITE } from '../data/constants.js';
import { drawSprite } from './asset-loader.js';

export function createIslandEngine(container, assets) {
  const canvas = document.createElement('canvas');
  const G = ISLAND_GRID_SIZE;
  const S = CELL_SIZE;
  canvas.width = G * S;
  canvas.height = G * S;
  canvas.style.cssText = 'display:block;background:#1a1a2e;';
  
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  
  let buildings = [];
  let offsetX = 0, offsetY = 0;
  
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    
    // 草地网格
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#4a7c4f' : '#3d6b42';
        ctx.fillRect(x * S, y * S, S, S);
      }
    }
    
    // 建筑 sprite
    buildings.forEach(b => {
      const sx = b.spriteIndex * SPRITE.CELL_W;
      drawSprite(ctx, assets.spritesheet,
        sx, 0, SPRITE.CELL_W, SPRITE.CELL_H,
        b.x * S, b.y * S, S, S
      );
    });
    
    ctx.restore();
  }
  
  const island = {
    canvas, render,
    setBuildings(b) { buildings = b; render(); },
    addBuilding(b) { buildings.push(b); render(); },
    screenToGrid(sx, sy) {
      return {
        x: Math.floor((sx - offsetX) / S),
        y: Math.floor((sy - offsetY) / S)
      };
    },
    gridToScreen(gx, gy) {
      return { x: gx * S + offsetX, y: gy * S + offsetY };
    }
  };
  
  return island;
}
```

- [ ] **Step 1: 写 `island-engine.js`**
- [ ] **Step 2: 在 `main.js` 中测试渲染网格**
- [ ] **Step 3: Commit**

---

### Task 1.5: 建筑数据定义

**Files:**
- Create: `src/data/buildings.js`

```javascript
export const BUILDINGS = [
  {
    id: 'tree', name: '树木', icon: '🌲',
    spriteIndex: 0,
    cost: { gold: 5 }, income: {}, buff: null,
    starRequired: 0, wordRequired: 0, tier: 0
  },
  {
    id: 'lumberjack', name: '伐木场', icon: '🪓',
    spriteIndex: 1,
    cost: { gold: 10 }, income: { wood: 1 },
    buff: { type: 'woodBonus', value: 1, description: '学自然类词 wood+1' },
    starRequired: 1, wordRequired: 5, tier: 0
  },
  {
    id: 'cottage', name: '小屋', icon: '🏠',
    spriteIndex: 2,
    cost: { gold: 50, wood: 20 }, income: { gold: 1 },
    buff: { type: 'streakGold', value: 10, description: 'streak≥3天每日gold+10' },
    starRequired: 2, wordRequired: 10, tier: 0
  },
  {
    id: 'farm', name: '农田', icon: '🌾',
    spriteIndex: 3,
    cost: { gold: 100, wood: 30 }, income: { food: 2 },
    buff: { type: 'autoReview', value: 5, description: '每日自动完成5词复习' },
    starRequired: 5, wordRequired: 25, tier: 1
  },
  {
    id: 'quarry', name: '采石场', icon: '⛏️',
    spriteIndex: 4,
    cost: { gold: 50, wood: 20 }, income: { stone: 1 },
    buff: { type: 'stoneBonus', value: 1, description: '学science词 stone+1' },
    starRequired: 10, wordRequired: 50, tier: 1
  }
];

export function getBuildingById(id) {
  return BUILDINGS.find(b => b.id === id);
}

export function canBuild(building, resources, stars, totalWords) {
  // 检查资源
  for (const [res, cost] of Object.entries(building.cost)) {
    if ((resources[res] || 0) < cost) return { ok: false, reason: '资源不足' };
  }
  // 检查解锁条件
  if (stars < building.starRequired) return { ok: false, reason: `需要 ⭐${building.starRequired}` };
  if (totalWords < building.wordRequired) return { ok: false, reason: `需要 ${building.wordRequired} 词` };
  return { ok: true };
}
```

- [ ] **Step 1: 写 `buildings.js`**
- [ ] **Step 2: Commit**

---

### Task 1.6: ResourceBar 组件

**Files:**
- Create: `src/components/ResourceBar.js`

```javascript
import { SPRITE } from '../data/constants.js';
import { drawSprite } from '../core/asset-loader.js';

export function createResourceBar(assets) {
  const bar = document.createElement('div');
  bar.className = 'resource-bar';
  
  const icons = [
    { key: 'star',  sx: 0 },
    { key: 'gold',  sx: 1 },
    { key: 'wood',  sx: 2 },
    { key: 'stone', sx: 3 },
    { key: 'food',  sx: 4 }
  ];
  
  const elements = {};
  icons.forEach(({ key, sx }) => {
    const item = document.createElement('div');
    item.className = 'resource-item';
    
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = SPRITE.ICON_W;
    iconCanvas.height = SPRITE.ICON_H;
    iconCanvas.className = 'resource-icon';
    const ictx = iconCanvas.getContext('2d');
    ictx.imageSmoothingEnabled = false;
    drawSprite(ictx, assets.icons, sx * SPRITE.ICON_W, 0, SPRITE.ICON_W, SPRITE.ICON_H, 0, 0);
    
    const value = document.createElement('span');
    value.textContent = '0';
    
    item.append(iconCanvas, value);
    bar.appendChild(item);
    elements[key] = value;
  });
  
  return {
    element: bar,
    update(resources) {
      icons.forEach(({ key }) => {
        elements[key].textContent = resources[key] ?? 0;
      });
    }
  };
}
```

- [ ] **Step 1: 写 `ResourceBar.js`**
- [ ] **Step 2: Commit**

---

### Task 1.7: VocabOverlay 组件

**Files:**
- Create: `src/components/VocabOverlay.js`

**职责:**
- 半屏覆盖层，`panel-9slice` 背景
- 显示单词 + 4 个 `.btn-pixel` 选项按钮
- 正确/错误动画 + `rewardForReview` 奖励

> 实施复杂度较高，需完整 DOM 交互。详情见计划书原文 Task 1.6（已升级）。

- [ ] **Step 1: 写 `VocabOverlay.js`**
- [ ] **Step 2: 集成 economy 奖励**
- [ ] **Step 3: Commit**

---

### Task 1.8: 全局状态机 + main.js 入口

**Files:**
- Create: `src/core/state.js`
- Create: `src/main.js`（完整入口）

```javascript
// state.js
import { AppState } from '../data/constants.js';
let state = AppState.IDLE;

const transitions = {
  [AppState.IDLE]:  [AppState.VOCAB, AppState.BUILD],
  [AppState.VOCAB]: [AppState.IDLE],
  [AppState.BUILD]: [AppState.PREVIEW, AppState.IDLE],
  [AppState.PREVIEW]: [AppState.IDLE]
};

export function getState() { return state; }
export function transition(s) {
  if (!transitions[state]?.includes(s)) return false;
  state = s; return true;
}
```

**main.js 启动流程:**
```
preloadAssets → initDB → loadGameData
  → 首次打开 → 初始化数据（开局资源 + 空岛屿 + 词库）
  → 已有数据 → 恢复状态
  → 计算离线收入 → Toast
  → 创建 ResourceBar → IslandEngine → VocabOverlay
  → 启动 ECONOMY_TICK setInterval
  → 启动 30s 自动存档
```

- [ ] **Step 1: 写 `state.js` + `main.js`**
- [ ] **Step 2: 端到端验证：浏览器看到网格 + 资源栏 + 背词按钮**
- [ ] **Step 3: Commit**

---

### Task 1.9: 资源飞入动画

- [ ] 答题后资源图标从答题区飞向资源栏
- [ ] CSS `fly-to-bar` keyframe

---

## Phase 2: 建造系统 (1周)

### Task 2.1: BuildDrawer 组件

**Files:**
- Create: `src/components/BuildDrawer.js`

**职责:**
- 底部抽屉 `slide-panel`，`panel-9slice` 背景
- 建筑列表：spritesheet 缩略图 + 名称 + 花费 + [建造] `.btn-pixel`
- `canBuild` 检查 → 充足=亮色，不足=灰显+提示，未解锁=🔒
- 点击建造 → `transition(PREVIEW)`

- [ ] **Step 1: 写 `BuildDrawer.js`**
- [ ] **Step 2: 集成，验证抽屉打开/关闭**
- [ ] **Step 3: Commit**

---

### Task 2.2: BuildPreview 幽灵预览 + 放置流程

**Files:**
- Create: `src/components/BuildPreview.js`

**职责:**
- 50% opacity 建筑 sprite 跟随 PointerEvent
- 离手时检查格子有效性
- 有效 → 显示确认/取消浮层
- 确认 → 扣资源 + `island.addBuilding()` + Toast

- [ ] **Step 1: 写 `BuildPreview.js`**
- [ ] **Step 2: 集成 PointerEvent 到 IslandEngine**
- [ ] **Step 3: Commit**

---

### Task 2.3: 建造完整流程串联

- [ ] 空地 → 抽屉 → 选建筑 → 预览 → 确认 → 扣资源 → 渲染
- [ ] 资源不够 → 灰显提示
- [ ] 取消 → 回到 IDLE
- [ ] 端到端手动测试

---

## Phase 3-5: 后续阶段

**Phase 3** (1周): 离线收入 + Buff — `calculateOfflineIncome` 启动结算 + `tickIncome` 被动收入 + `calculateBuffs` 叠加 + Toast 通知

**Phase 4** (1周): 进阶系统 — 岛屿等级 + Star 解锁 + 成就 + 每日任务

**Phase 5** (1周): 打磨 — 数值调优 + 像素 art 替换占位图 + 音效 + 兼容测试

（Phase 3-5 详细任务不变，见 v1.0 计划书）

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|-----|------|------|
| 图片加载失败 | Canvas 无法渲染建筑 | `preloadAssets` 启动前检查，失败显示"加载中..." |
| spritesheet 坐标错 | 建筑切图错位 | `SPRITE.CELL_W/CELL_H` 常量统一引用 |
| 九宫格 border-image 兼容 | 特定浏览器无效 | 回退纯色 `border: 2px solid #444` |
| IndexedDB 不可用 | 数据丢失 | 回退 LocalStorage |
| 占位图片太丑 | JACK 不满意 | Phase 5 替换前告知，别在中途纠结 |

---

**文档版本:** v1.1
**更新日期:** 2026-05-24
**状态:** 待执行

**v1.1 变更:**
- 渲染方案：纯 CSS → Canvas（游戏画面）+ CSS/图片（UI面板）
- 新增 `src/assets/images/` 目录 + 6 张占位图片
- 新增 `src/core/asset-loader.js` 预加载器
- 组件全部改用图片资源（九宫格面板 + 图片按钮 + sprite 切图）
- CSS 移到 `src/assets/style.css`（含九宫格 + 三态按钮样式）
- IslandEngine 改用 spritesheet 切图渲染（替代 emoji）
- Phase 1 新增 Task 1.0 (预加载器)，总 task 数 10 个