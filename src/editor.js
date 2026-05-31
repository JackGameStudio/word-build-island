/**
 * editor.js
 * Word Island Builder - 地图编辑器 MVP
 * 20×20 俯视网格 + Layer 系统 + localStorage 导出
 */

import { preloadAssets } from './core/asset-loader.js';
import { CELL_SIZE, TERRAIN, TERRAIN_TILE_COUNT } from './data/constants.js';

// ─── 常量 ───
const EDITOR_GRID = 20;
const CELL = 32; // 像素

// ─── 状态 ───
let terrainMap = [];  // [layer][y][x]
let currentLayer = 0;
let currentTerrain = 0;
let brushSize = 1;
let showGrid = true;
let isPainting = false;
let isErasing = false;
let lastPaintX = -1;
let lastPaintY = -1;

// ─── 地形颜色（fallback） ───
const TERRAIN_COLORS = [
  ['#4a7c4f', '#3d6b42'], // 0 草地
  ['#d4b483', '#c9a76e'], // 1 沙滩
  ['#2980b9', '#2471a3'], // 2 海水
  ['#2d5a27', '#244f20'], // 3 森林
  ['#7f8c8d', '#6c7a7b'], // 4 岩石
];

const TERRAIN_NAMES = ['草地', '沙滩', '海水', '森林', '岩石'];

// ─── 初始化 ───
function initTerrainMap() {
  terrainMap = [];
  for (let l = 0; l < 3; l++) {
    const layer = [];
    for (let y = 0; y < EDITOR_GRID; y++) {
      const row = [];
      for (let x = 0; x < EDITOR_GRID; x++) {
        row.push(TERRAIN.WATER); // 默认海水
      }
      layer.push(row);
    }
    terrainMap.push(layer);
  }
}

// ─── 预设形状 ───
function applyPreset(shape) {
  initTerrainMap();

  switch (shape) {
    case 'default':
      fillRect(4, 4, 12, 12, TERRAIN.GRASS, 0);
      fillRect(3, 3, 14, 14, TERRAIN.SAND, 0);
      break;

    case 'circle': {
      const cx = 10, cy = 10, r = 7;
      for (let y = 0; y < EDITOR_GRID; y++) {
        for (let x = 0; x < EDITOR_GRID; x++) {
          const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (d < r - 2) terrainMap[0][y][x] = TERRAIN.GRASS;
          else if (d < r) terrainMap[0][y][x] = TERRAIN.SAND;
        }
      }
      break;
    }

    case 'long':
      fillRect(2, 8, 16, 4, TERRAIN.GRASS, 0);
      fillRect(1, 7, 18, 1, TERRAIN.SAND, 0);
      fillRect(1, 12, 18, 1, TERRAIN.SAND, 0);
      break;

    case 'L':
      fillRect(4, 4, 2, 12, TERRAIN.GRASS, 0);
      fillRect(4, 14, 12, 2, TERRAIN.GRASS, 0);
      terrainMap[0][3][4] = TERRAIN.SAND;
      terrainMap[0][3][5] = TERRAIN.SAND;
      terrainMap[0][15][4] = TERRAIN.SAND;
      terrainMap[0][15][5] = TERRAIN.SAND;
      break;
  }

  render();
  updateInfo();
}

function fillRect(x, y, w, h, type, layer) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (y + dy < EDITOR_GRID && x + dx < EDITOR_GRID) {
        terrainMap[layer][y + dy][x + dx] = type;
      }
    }
  }
}

// ─── 笔刷 ───
function paint(x, y) {
  const half = Math.floor(brushSize / 2);
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < EDITOR_GRID && ny >= 0 && ny < EDITOR_GRID) {
        if (isErasing) {
          terrainMap[currentLayer][ny][nx] = TERRAIN.WATER;
        } else {
          terrainMap[currentLayer][ny][nx] = currentTerrain;
        }
      }
    }
  }
  render();
  updateInfo();
}

// ─── 渲染 ───
let canvas, ctx;

function render() {
  if (!canvas) return;

  canvas.width = EDITOR_GRID * CELL;
  canvas.height = EDITOR_GRID * CELL;

  // 合并图层（从下到上，非 WATER 的覆盖下层）
  const merged = [];
  for (let y = 0; y < EDITOR_GRID; y++) {
    const row = [];
    for (let x = 0; x < EDITOR_GRID; x++) {
      let t = TERRAIN.WATER;
      for (let l = 0; l <= currentLayer; l++) {
        if (terrainMap[l][y][x] !== TERRAIN.WATER) {
          t = terrainMap[l][y][x];
        }
      }
      row.push(t);
    }
    merged.push(row);
  }

  // 绘制
  for (let y = 0; y < EDITOR_GRID; y++) {
    for (let x = 0; x < EDITOR_GRID; x++) {
      const t = merged[y][x];
      const variant = (x + y) % 2;
      const color = TERRAIN_COLORS[t][variant];

      ctx.fillStyle = color;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  // 网格
  if (showGrid) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= EDITOR_GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(canvas.width, i * CELL);
      ctx.stroke();
    }

    // 坐标文字
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < EDITOR_GRID; y++) {
      for (let x = 0; x < EDITOR_GRID; x++) {
        ctx.fillText(`${x},${y}`, x * CELL + CELL / 2, y * CELL + CELL / 2);
      }
    }
  }
}

// ─── 坐标转换 ───
function canvasToGrid(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((cx - rect.left) / CELL);
  const y = Math.floor((cy - rect.top) / CELL);
  return {
    x: Math.max(0, Math.min(EDITOR_GRID - 1, x)),
    y: Math.max(0, Math.min(EDITOR_GRID - 1, y))
  };
}

// ─── 信息更新 ───
function updateInfo() {
  let buildable = 0;
  for (let y = 0; y < EDITOR_GRID; y++) {
    for (let x = 0; x < EDITOR_GRID; x++) {
      if (terrainMap[0][y][x] === TERRAIN.GRASS) buildable++;
    }
  }
  const el = document.getElementById('info-buildable');
  if (el) el.textContent = buildable;

  const layerNames = ['0 - 地面', '1 - 高地', '2 - 建筑'];
  const layerEl = document.getElementById('info-layer');
  if (layerEl) layerEl.textContent = layerNames[currentLayer];
}

function updateCoordInfo(x, y) {
  const coordEl = document.getElementById('coord-overlay');
  if (coordEl) coordEl.textContent = `${x}, ${y}`;

  const infoCoordEl = document.getElementById('info-coord');
  if (infoCoordEl) infoCoordEl.textContent = `${x}, ${y}`;

  const t = terrainMap[currentLayer][y][x];
  const terrainEl = document.getElementById('info-terrain');
  if (terrainEl) terrainEl.textContent = TERRAIN_NAMES[t] || '未知';
}

// ─── 导出 ───
function exportToGame() {
  const name = prompt('输入岛形状名称（A/B/C...）：', 'A');
  if (!name) return;

  const data = {
    name,
    size: EDITOR_GRID,
    terrainMap: terrainMap[0], // 地面层
    layers: terrainMap.slice(1),
    timestamp: Date.now()
  };

  const shapes = JSON.parse(localStorage.getItem('islandShapes') || '{}');
  shapes[name] = data;
  localStorage.setItem('islandShapes', JSON.stringify(shapes));

  alert(`✅ 已导出到 localStorage！\n游戏会自动读取「${name}」`);
}

function saveShape() {
  const name = prompt('输入保存名称：');
  if (!name) return;

  const data = {
    terrainMap,
    currentLayer,
    timestamp: Date.now()
  };

  const saved = JSON.parse(localStorage.getItem('editorShapes') || '{}');
  saved[name] = data;
  localStorage.setItem('editorShapes', JSON.stringify(saved));

  alert(`✅ 形状「${name}」已保存！`);
}

function loadShape() {
  const saved = JSON.parse(localStorage.getItem('editorShapes') || '{}');
  const names = Object.keys(saved);
  if (names.length === 0) {
    alert('没有保存的形状');
    return;
  }

  const name = prompt(`已保存的形状：\n${names.join('\n')}\n\n输入要加载的名称：`);
  if (!name || !saved[name]) {
    alert('未找到该形状');
    return;
  }

  const data = saved[name];
  terrainMap = data.terrainMap;
  currentLayer = data.currentLayer || 0;
  render();
  updateInfo();
  alert(`✅ 已加载「${name}」！`);
}

// ─── 主入口 ───
async function bootstrap() {
  initTerrainMap();

  canvas = document.getElementById('editor-canvas');
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 事件：绘画
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) {
      isPainting = true;
      isErasing = false;
      const { x, y } = canvasToGrid(e.clientX, e.clientY);
      lastPaintX = x;
      lastPaintY = y;
      paint(x, y);
      updateCoordInfo(x, y);
    } else if (e.button === 2) {
      isPainting = true;
      isErasing = true;
      const { x, y } = canvasToGrid(e.clientX, e.clientY);
      paint(x, y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = canvasToGrid(e.clientX, e.clientY);
    updateCoordInfo(x, y);

    if (isPainting) {
      // 插值（避免快速移动漏格）
      if (lastPaintX >= 0) {
        const dx = x - lastPaintX;
        const dy = y - lastPaintY;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        for (let i = 1; i <= steps; i++) {
          const ix = Math.round(lastPaintX + (dx * i) / steps);
          const iy = Math.round(lastPaintY + (dy * i) / steps);
          paint(ix, iy);
        }
      }
      paint(x, y);
      lastPaintX = x;
      lastPaintY = y;
    }
  });

  canvas.addEventListener('pointerup', () => {
    isPainting = false;
    isErasing = false;
    lastPaintX = -1;
    lastPaintY = -1;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // UI 按钮
  document.querySelectorAll('.terrain-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.terrain-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTerrain = parseInt(btn.dataset.terrain);
    });
  });

  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLayer = parseInt(btn.dataset.layer);
      render();
      updateInfo();
    });
  });

  document.querySelectorAll('.brush-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      brushSize = parseInt(btn.dataset.size);
    });
  });

  const gridCheckbox = document.getElementById('show-grid');
  if (gridCheckbox) {
    gridCheckbox.addEventListener('change', (e) => {
      showGrid = e.target.checked;
      render();
    });
  }

  document.querySelectorAll('.shape-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const shape = btn.dataset.shape;
      if (shape === 'empty') {
        initTerrainMap();
        render();
        updateInfo();
      } else {
        applyPreset(shape);
      }
    });
  });

  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportToGame);

  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveShape);

  const loadBtn = document.getElementById('load-btn');
  if (loadBtn) loadBtn.addEventListener('click', loadShape);

  // 初始渲染
  applyPreset('default');
}

bootstrap().catch(err => {
  document.getElementById('editor-app').innerHTML = `<div style="padding:40px;color:red">编辑器启动失败: ${err.message}</div>`;
  console.error('Editor bootstrap failed:', err);
});
