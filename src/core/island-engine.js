/**
 * island-engine.js
 * Canvas 渲染引擎 — 俯视 12×12 网格 + sprite 切图 + 拖拽平移 + 幽灵预览
 * 混合方案：Canvas 负责游戏画面，外部 CSS 负责 UI 面板
 */

import { ISLAND_GRID_SIZE, CELL_SIZE, SPRITE } from '../data/constants.js';
import { drawSprite } from './asset-loader.js';

export function createIslandEngine(container, assets) {
  const G = ISLAND_GRID_SIZE;
  const S = CELL_SIZE;

  const canvas = document.createElement('canvas');
  canvas.width = G * S;
  canvas.height = G * S;
  canvas.style.cssText = 'display:block;background:#1a1a2e;image-rendering:pixelated;';

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let buildings = [];
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

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);

    // 草地双色格子
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#4a7c4f' : '#3d6b42';
        ctx.fillRect(x * S, y * S, S, S);
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

  // ─── Pointer events ───
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    const pos = getPos(e);
    dragStartX = pos.x;
    dragStartY = pos.y;
    dragOffsetX = offsetX;
    dragOffsetY = offsetY;
    isDragging = true;
    wasPanning = false;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const pos = getPos(e);
    const dx = pos.x - dragStartX;
    const dy = pos.y - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      wasPanning = true;
    }
    offsetX = dragOffsetX + dx;
    offsetY = dragOffsetY + dy;
    render();
  });

  canvas.addEventListener('pointerup', (e) => {
    isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
  });

  // ─── API ───
  const island = {
    canvas,
    render,
    wasPanning,
    resetPanFlag() { wasPanning = false; },

    setBuildings(b) { buildings = b; render(); },
    getBuildings() { return buildings; },

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