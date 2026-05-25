/**
 * island-engine.js
 * Canvas 渲染引擎 — 俯视 12×12 网格 + 地形贴图 + sprite 建筑 + 拖拽平移 + 幽灵预览
 * 混合方案：Canvas 负责游戏画面，外部 CSS 负责 UI 面板
 */

import { ISLAND_GRID_SIZE, CELL_SIZE, SPRITE, TERRAIN, DEFAULT_ISLAND_TERRAIN } from '../data/constants.js';
import { drawSprite, drawTerrainTile } from './asset-loader.js';

/** 不可建造的地形类型 */
const BLOCKED_TERRAIN = new Set([TERRAIN.WATER, TERRAIN.STONE]);

export function createIslandEngine(container, assets) {
  const G = ISLAND_GRID_SIZE;
  const S = CELL_SIZE;

  const canvas = document.createElement('canvas');
  canvas.width = G * S;
  canvas.height = G * S;
  canvas.style.cssText = 'display:block;background:#1a3a5c;image-rendering:pixelated;';

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let buildings = [];
  let terrainMap = structuredClone(DEFAULT_ISLAND_TERRAIN);
  let offsetX = 0;
  let offsetY = 0;

  // 幽灵预览
  let ghost = null; // { spriteIndex, gx, gy, valid }

  // 拖拽状态
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let wasPanning = false;

  // ─── 渲染 ───
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);

    // 地形层
    const hasTerrain = !!assets.terrain;
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const type = terrainMap[y]?.[x] ?? 0;
        const variant = (x + y) % 2; // 棋盘格亮/暗
        if (hasTerrain) {
          drawTerrainTile(ctx, assets.terrain, type, variant, x * S, y * S, S);
        } else {
          // fallback 纯色
          const colors = [
            ['#4a7c4f', '#3d6b42'], // grass
            ['#d4b483', '#c9a76e'], // sand
            ['#2980b9', '#2471a3'], // water
            ['#2d5a27', '#244f20'], // forest
            ['#7f8c8d', '#6c7a7b'], // stone
          ];
          const [c1, c2] = colors[type] || colors[0];
          ctx.fillStyle = variant === 0 ? c1 : c2;
          ctx.fillRect(x * S, y * S, S, S);
        }
      }
    }

    // 建筑 sprite
    buildings.forEach(b => {
      if (b.spriteIndex !== undefined && assets.spritesheet) {
        drawSprite(ctx, assets.spritesheet,
          b.spriteIndex, SPRITE.CELL_W, SPRITE.CELL_H,
          b.x * S, b.y * S, S, S
        );
      } else {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(b.x * S + 4, b.y * S + 4, S - 8, S - 8);
        ctx.font = `${S * 0.5}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.icon || '🏠', b.x * S + S / 2, b.y * S + S / 2);
      }
    });

    // 幽灵预览
    if (ghost) {
      const { spriteIndex, gx, gy, valid } = ghost;

      // 高亮格子
      ctx.fillStyle = valid ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)';
      ctx.fillRect(gx * S, gy * S, S, S);

      // 半透明 sprite
      ctx.globalAlpha = 0.5;
      if (assets.spritesheet && spriteIndex !== undefined) {
        drawSprite(ctx, assets.spritesheet, spriteIndex, SPRITE.CELL_W, SPRITE.CELL_H,
          gx * S, gy * S, S, S);
      } else {
        ctx.fillStyle = '#888';
        ctx.fillRect(gx * S + 4, gy * S + 4, S - 8, S - 8);
      }
      ctx.globalAlpha = 1;

      // 边框
      ctx.strokeStyle = valid ? '#4ade80' : '#f87171';
      ctx.lineWidth = 2;
      ctx.strokeRect(gx * S + 1, gy * S + 1, S - 2, S - 2);
      ctx.lineWidth = 1;
    }

    ctx.restore();
  }

  // ─── Pointer events（移动端双指平移，桌面端单指平移）───
  const pointers = new Map(); // pointerId → { startX, startY }
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  function getMidpoint(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }

  function getPinchDist(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // 判断是否触摸设备（touch 为主输入）
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 1;

  canvas.addEventListener('pointerdown', (e) => {
    const pos = getPos(e);
    pointers.set(e.pointerId, pos);

    if (pointers.size === 1) {
      // 单指：桌面单指拖拽，移动端不触发平移（给 ghost 预览用）
      dragStartX = pos.x;
      dragStartY = pos.y;
      dragOffsetX = offsetX;
      dragOffsetY = offsetY;
      isDragging = !isTouchDevice; // 桌面端才支持单指拖拽
      wasPanning = false;
    } else if (pointers.size === 2) {
      // 双指：进入平移模式
      isDragging = true;
      wasPanning = false;
      const entries = [...pointers.values()];
      const mid = getMidpoint(entries[0], entries[1]);
      dragStartX = mid.x;
      dragStartY = mid.y;
      dragOffsetX = offsetX;
      dragOffsetY = offsetY;
      pinchStartDist = getPinchDist(entries[0], entries[1]);
      pinchStartScale = 1;
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, getPos(e));

    if (!isDragging) return;

    if (pointers.size === 1 && !isTouchDevice) {
      // 桌面单指拖拽
      const pos = getPos(e);
      const dx = pos.x - dragStartX;
      const dy = pos.y - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasPanning = true;
      offsetX = dragOffsetX + dx;
      offsetY = dragOffsetY + dy;
    } else if (pointers.size >= 2) {
      // 双指平移
      const entries = [...pointers.values()];
      const mid = getMidpoint(entries[0], entries[1]);
      const dx = mid.x - dragStartX;
      const dy = mid.y - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasPanning = true;
      offsetX = dragOffsetX + dx;
      offsetY = dragOffsetY + dy;
    }
    render();
  });

  canvas.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      isDragging = pointers.size === 1 && !isTouchDevice;
    }
    canvas.releasePointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      isDragging = pointers.size === 1 && !isTouchDevice;
    }
  });

    // ─── API ───
  const island = {
    canvas,
    render,
    wasPanning,
    resetPanFlag() { wasPanning = false; },

    setBuildings(b) { buildings = b; render(); },
    getBuildings() { return buildings; },

    setTerrainMap(map) { terrainMap = map; render(); },
    getTerrainMap() { return terrainMap; },
    getTerrainType(gx, gy) { return terrainMap[gy]?.[gx] ?? 0; },
    isBuildable(gx, gy) { return !BLOCKED_TERRAIN.has(terrainMap[gy]?.[gx] ?? 0); },

    addBuilding(b) { buildings.push(b); render(); },

    removeBuilding(index) {
      if (index >= 0 && index < buildings.length) {
        buildings.splice(index, 1);
        render();
      }
    },

    // ─── 幽灵预览 ───
    setGhost(building, gx, gy, valid) {
      ghost = { spriteIndex: building?.spriteIndex, gx, gy, valid };
      render();
    },
    clearGhost() { ghost = null; render(); },
    getGhost() { return ghost; },

    screenToGrid(sx, sy) {
      return {
        x: Math.floor((sx - offsetX) / S),
        y: Math.floor((sy - offsetY) / S)
      };
    },

    gridToScreen(gx, gy) {
      return { x: gx * S + offsetX, y: gy * S + offsetY };
    },

    isInBounds(gx, gy) {
      return gx >= 0 && gx < G && gy >= 0 && gy < G;
    },

    isOccupied(gx, gy) {
      return buildings.some(b => b.x === gx && b.y === gy);
    }
  };

  return island;
}