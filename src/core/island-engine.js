/**
 * island-engine.js
 * Canvas 渲染引擎 — 俯视 12×12 网格 + 地形贴图 + sprite 建筑 + 拖拽平移 + 幽灵预览
 * 混合方案：Canvas 负责游戏画面，外部 CSS 负责 UI 面板
 */

import { ISLAND_GRID_SIZE, CELL_SIZE, SPRITE, TERRAIN, DEFAULT_ISLAND_TERRAIN } from '../data/constants.js';
import { drawSprite, drawTerrainTile } from './asset-loader.js';

/** 不可建造的地形类型 */
const BLOCKED_TERRAIN = new Set([TERRAIN.WATER, TERRAIN.STONE]);
/** 码头只能造在水上 */
const DOCK_ONLY_TERRAIN = new Set([TERRAIN.WATER]);

/** 缩放范围 */
const SCALE_MIN = 0.5;
const SCALE_MAX = 2.0;
const ZOOM_STEP = 1.08; // 每级滚轮缩放系数

export function createIslandEngine(container, assets, pickupSystem = null, customAssets = null) {
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
  let scale = 1.0;

  // NPC 引擎引用
  let npcEngine = null;

  // 幽灵预览
  let ghost = null; // { spriteIndex, gx, gy, valid }

  // 移动建筑模式
  let moveState = null; // { building, buildingIndex }

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
    ctx.scale(scale, scale);

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

    // 建筑 + NPC 按底部 Y 混排绘制（Painter's Algorithm）
    const drawables = [];

    // 建筑 drawable
    for (const b of buildings) {
      if (moveState && b === moveState.building) continue;
      drawables.push({ sortKey: (b.y + 1) * CELL_SIZE, b });
    }

    // NPC drawable
    if (npcEngine) {
      const npcs = npcEngine.getNPCs();
      for (const n of npcs) {
        drawables.push({ sortKey: n.py, npc: n });
      }
    }

    drawables.sort((a, b) => a.sortKey - b.sortKey);

    const npcNow = performance.now();
    for (const d of drawables) {
      if (d.b) {
        const b = d.b;
        if (b.id === 'tree' && assets.treeSheet) {
          const variant = b.treeVariant ?? 0;
          ctx.drawImage(assets.treeSheet,
            variant * 64, 0, 64, 64,
            b.x * CELL_SIZE, b.y * CELL_SIZE - 16, CELL_SIZE, CELL_SIZE
          );
        } else if (b.spriteIndex !== undefined && assets.spritesheet) {
          drawSprite(ctx, assets.spritesheet,
            b.spriteIndex, SPRITE.CELL_W, SPRITE.CELL_H,
            b.x * CELL_SIZE, b.y * CELL_SIZE, CELL_SIZE, CELL_SIZE
          );
        } else {
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(b.x * CELL_SIZE + 4, b.y * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);
          ctx.font = `${CELL_SIZE * 0.5}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.icon || '🏠', b.x * CELL_SIZE + CELL_SIZE / 2, b.y * CELL_SIZE + CELL_SIZE / 2);
        }
      } else if (d.npc) {
        npcEngine.renderNPC(ctx, d.npc, assets, npcNow);
      }
    }

    // 幽灵预览
    if (ghost) {
      const { id, spriteIndex, gx, gy, valid } = ghost;

      // 高亮格子
      ctx.fillStyle = valid ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)';
      ctx.fillRect(gx * S, gy * S, S, S);

      // 半透明 sprite
      ctx.globalAlpha = 0.5;
      if (id === 'tree' && assets.treeSheet) {
        const variant = ghost.treeVariant ?? 0;
        ctx.drawImage(assets.treeSheet,
          variant * 64, 0, 64, 64,
          gx * S, gy * S - 16, S, S
        );
      } else if (assets.spritesheet && spriteIndex !== undefined) {
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

    // ─── 拾取物层 ───
    if (pickupSystem) {
      pickupSystem.render(ctx, offsetX, offsetY, S, performance.now());
    }

    ctx.restore();
  }

  // ─── Pointer events（移动端双指平移+缩放，桌面端单指平移）───
  const pointers = new Map(); // pointerId → { startX, startY }
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchStartOffsetX = 0;
  let pinchStartOffsetY = 0;
  let pinchStartMid = null; // { x, y } — 双指起始中点
  let pinchThresholdExceeded = false; // 已越过拖拽死区

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
    if (moveState) return; // 移动模式中不处理拖拽
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
      pinchThresholdExceeded = false;
    } else if (pointers.size === 2) {
      // 双指：进入平移+缩放模式
      isDragging = true;
      wasPanning = false;
      pinchThresholdExceeded = false;
      const entries = [...pointers.values()];
      pinchStartMid = getMidpoint(entries[0], entries[1]);
      dragStartX = pinchStartMid.x;
      dragStartY = pinchStartMid.y;
      dragOffsetX = offsetX;
      dragOffsetY = offsetY;
      pinchStartDist = getPinchDist(entries[0], entries[1]);
      pinchStartScale = scale;
      pinchStartOffsetX = offsetX;
      pinchStartOffsetY = offsetY;
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    if (moveState) return; // 移动模式中不处理拖拽
    pointers.set(e.pointerId, getPos(e));

    if (!isDragging) return;

    if (pointers.size === 1 && !isTouchDevice) {
      // 桌面单指拖拽
      const pos = getPos(e);
      const dx = pos.x - dragStartX;
      const dy = pos.y - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasPanning = true;
      if (wasPanning) {
        offsetX = dragOffsetX + dx;
        offsetY = dragOffsetY + dy;
      }
    } else if (pointers.size >= 2 && pinchStartMid) {
      // 双指平移 + 缩放
      const entries = [...pointers.values()];
      const mid = getMidpoint(entries[0], entries[1]);
      const dx = mid.x - dragStartX;
      const dy = mid.y - dragStartY;

      // 死区判断
      if (!pinchThresholdExceeded) {
        const currentDist = getPinchDist(entries[0], entries[1]);
        const distRatio = Math.abs(currentDist - pinchStartDist) / pinchStartDist;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && distRatio < 0.02) return;
        pinchThresholdExceeded = true;
      }

      // 缩放：基于双指距离变化
      const currentDist = getPinchDist(entries[0], entries[1]);
      const zoomFactor = currentDist / pinchStartDist;
      const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, pinchStartScale * zoomFactor));

      // 以 pinch 起始中点为缩放原点做补偿
      const zoomedOffsetX = pinchStartMid.x - (pinchStartMid.x - pinchStartOffsetX) * newScale / pinchStartScale;
      const zoomedOffsetY = pinchStartMid.y - (pinchStartMid.y - pinchStartOffsetY) * newScale / pinchStartScale;

      // 叠加平移量
      offsetX = zoomedOffsetX + (mid.x - pinchStartMid.x);
      offsetY = zoomedOffsetY + (mid.y - pinchStartMid.y);
      scale = newScale;

      wasPanning = true;
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
      pinchStartMid = null;
    }
  });

  // ─── 滚轮缩放 ───
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const pos = getPos(e);
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const oldScale = scale;
    const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale * factor));

    if (newScale === oldScale) return;

    // 以鼠标位置为缩放原点做平移补偿
    offsetX = pos.x - (pos.x - offsetX) * newScale / oldScale;
    offsetY = pos.y - (pos.y - offsetY) * newScale / oldScale;
    scale = newScale;

    render();
  }, { passive: false });

    // ─── API ───
  const island = {
    canvas,
    render,
    get wasPanning() { return wasPanning; },
    resetPanFlag() { wasPanning = false; },

    setBuildings(b) { buildings = b; render(); },
    getBuildings() { return buildings; },

    setTerrainMap(map) { terrainMap = map; render(); },
    getTerrainMap() { return terrainMap; },
    getTerrainType(gx, gy) { return terrainMap[gy]?.[gx] ?? 0; },
    isBuildable(gx, gy) { return !BLOCKED_TERRAIN.has(terrainMap[gy]?.[gx] ?? 0); },

    /** 根据建筑类型判断该格是否可建造 */
    isBuildableFor(buildingId, gx, gy) {
      const terrain = terrainMap[gy]?.[gx] ?? 0;
      if (buildingId === 'dock') return DOCK_ONLY_TERRAIN.has(terrain);
      return !BLOCKED_TERRAIN.has(terrain);
    },

    addBuilding(b) { buildings.push(b); render(); },

    removeBuilding(index) {
      if (index >= 0 && index < buildings.length) {
        buildings.splice(index, 1);
        render();
      }
    },

    // ─── 幽灵预览 ───
    setGhost(building, gx, gy, valid) {
      ghost = {
        id: building?.id,
        spriteIndex: building?.spriteIndex,
        treeVariant: building?._ghostVariant ?? building?.treeVariant,
        gx, gy, valid
      };
      render();
    },
    clearGhost() { ghost = null; render(); },
    getGhost() { return ghost; },

    screenToGrid(sx, sy) {
      return {
        x: Math.floor((sx - offsetX) / (S * scale)),
        y: Math.floor((sy - offsetY) / (S * scale))
      };
    },

    gridToScreen(gx, gy) {
      return { x: gx * S * scale + offsetX, y: gy * S * scale + offsetY };
    },

    isInBounds(gx, gy) {
      return gx >= 0 && gx < G && gy >= 0 && gy < G;
    },

    isOccupied(gx, gy, excludeIndex = -1) {
      return buildings.some((b, i) => i !== excludeIndex && b.x === gx && b.y === gy);
    },

    /** 拾取物命中测试 */
    hitTestPickup(sx, sy) {
      if (!pickupSystem) return null;
      return pickupSystem.hitTest(sx, sy, offsetX, offsetY, S, scale);
    },

    getOffset() { return { x: offsetX, y: offsetY }; },
    getScale() { return scale; },
    getPickupSystem() { return pickupSystem; },

    /** 查找指定格子上的建筑索引（-1 表示无） */
    findBuildingAt(gx, gy) {
      return buildings.findIndex(b => b.x === gx && b.y === gy);
    },

    /** 设置 NPC 引擎引用 */
    setNPCEngine(ref) { npcEngine = ref; },

    /** 查找指定格子上的 NPC 索引（-1 表示无） */
    findNPCAt(gx, gy) {
      return npcEngine ? npcEngine.findNPCAt(gx, gy) : -1;
    },

    /** 开始移动建筑 */
    startMoveBuilding(index) {
      if (index < 0 || index >= buildings.length) return false;
      moveState = { building: buildings[index], buildingIndex: index };
      return true;
    },
    /** 结束移动：新位置有效则放置，否则回原位 */
    endMoveBuilding(gx, gy) {
      if (!moveState) return false;
      const b = moveState.building;
      const idx = moveState.buildingIndex;
      const inBounds = isInBounds(gx, gy);
      const occupied = buildings.some((bld, i) => i !== idx && bld.x === gx && bld.y === gy);
      const buildable = isBuildableFor(b.id, gx, gy);
      const valid = inBounds && !occupied && buildable;
      if (valid) { b.x = gx; b.y = gy; }
      moveState = null;
      ghost = null;
      render();
      return valid;
    },
    /** 取消移动 */
    cancelMoveBuilding() {
      moveState = null;
      ghost = null;
      render();
    },
    isMoving() { return moveState !== null; },
    getMoveBuilding() { return moveState?.building ?? null; },
    getMoveBuildingIndex() { return moveState?.buildingIndex ?? -1; }
  };

  return island;
}