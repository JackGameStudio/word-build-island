/**
 * island-engine.js
 * Canvas 渲染引擎 — 俯视 12×12 网格 + 地形贴图 + sprite 建筑 + 拖拽平移 + 幽灵预览
 * 混合方案：Canvas 负责游戏画面，外部 CSS 负责 UI 面板
 */

import { ISLAND_GRID_SIZE, CELL_SIZE, SPRITE, TERRAIN, DEFAULT_ISLAND_TERRAIN } from '../data/constants.js';
import { drawSprite, drawTerrainTile } from './asset-loader.js';
import { getBuildingById } from '../data/buildings.js';

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

  // 战斗状态
  let combatState = { pirates: [], soldiers: [], phase: 'idle' };

  // 非战斗驻守士兵
  let offDutySoldiers = [];

  // 战斗单位 sprite 常量（3×3 spritesheet, 同 villager）
  const COMBAT_FRAME_W = 32;
  const COMBAT_FRAME_H = 32;
  const COMBAT_COLS = 3;
  const COMBAT_RENDER_H = 32; // 单位高度绘制在格子之上

  // 拖拽状态
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let wasPanning = false;

  // ─── 渲染 ───

  /**
   * 绘制单个战斗单位（3×3 spritesheet, 同 villager 布局）
   * Row 0: 下, Row 1: 左/右, Row 2: 上
   */
  function drawCombatUnit(ctx, sheet, unit, now) {
    const px = unit.x * CELL_SIZE - COMBAT_FRAME_W / 2;
    const py = unit.y * CELL_SIZE - COMBAT_RENDER_H;

    // 动画帧（200ms/帧）
    unit._lastFrameTime = unit._lastFrameTime || 0;
    if (now - unit._lastFrameTime > 200) {
      unit._walkFrame = ((unit._walkFrame || 0) + 1) % COMBAT_COLS;
      unit._lastFrameTime = now;
    }
    const col = unit._walkFrame || 0;

    // 方向决定行
    const dir = unit._direction || 0; // 0=下, 1=左, 2=右, 3=上
    let srcRow, flipX = false;
    if (dir === 0) { srcRow = 0; }
    else if (dir === 2) { srcRow = 1; flipX = true; }
    else if (dir === 1) { srcRow = 1; }
    else { srcRow = 2; }

    ctx.save();
    if (flipX) {
      ctx.translate(px + COMBAT_FRAME_W / 2, py);
      ctx.scale(-1, 1);
      ctx.drawImage(sheet,
        col * COMBAT_FRAME_W, srcRow * COMBAT_FRAME_H, COMBAT_FRAME_W, COMBAT_FRAME_H,
        -COMBAT_FRAME_W / 2, 0, COMBAT_FRAME_W, COMBAT_RENDER_H);
    } else {
      ctx.drawImage(sheet,
        col * COMBAT_FRAME_W, srcRow * COMBAT_FRAME_H, COMBAT_FRAME_W, COMBAT_FRAME_H,
        px, py, COMBAT_FRAME_W, COMBAT_RENDER_H);
    }
    ctx.restore();

    // 血条
    const hpRatio = unit.hp / unit.maxHp;
    const barX = px - 2;
    const barY = py - 8;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, COMBAT_FRAME_W + 4, 4);
    ctx.fillStyle = hpRatio > 0.5 ? '#4ade80' : hpRatio > 0.25 ? '#facc15' : '#ef4444';
    ctx.fillRect(barX, barY, (COMBAT_FRAME_W + 4) * hpRatio, 4);
  }

  /** 绘制静态海盗船（单张 image, 非 spritesheet） */
  function drawShip(ctx, sheet, ship) {
    const w = sheet.naturalWidth || 64;
    const h = sheet.naturalHeight || 64;
    const scale = CELL_SIZE / Math.max(w, h);
    const dw = w * scale * 0.9;
    const dh = h * scale * 0.9;
    const px = ship.x * CELL_SIZE - dw / 2;
    const py = ship.y * CELL_SIZE - dh / 2;
    ctx.drawImage(sheet, px, py, dw, dh);
  }

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

    // 战斗单位 drawable（海盗 + 士兵）
    // fightVFX 活跃时隐藏对应 pair 的 sprite，淡出中显示幸存者
    if (combatState.phase !== 'idle') {
      // 船只（全阶段可见）
      if (combatState.ships) {
        for (const s of combatState.ships) {
          drawables.push({ sortKey: s.y * CELL_SIZE, ship: s });
        }
      }
      const csIds = combatState._combatSoldierIds || new Set();
      const cpIds = combatState._combatPirateIds || new Set();
      for (const p of combatState.pirates) {
        if (p.alive && (combatState.phase !== 'combat' || !cpIds.has(p.id))) {
          drawables.push({ sortKey: (p.y + 1) * CELL_SIZE, pirate: p });
        }
      }
      for (const s of combatState.soldiers) {
        if (s.hp > 0 && (combatState.phase !== 'combat' || !csIds.has(s.id))) {
          drawables.push({ sortKey: (s.y + 1) * CELL_SIZE, soldier: s });
        }
      }
    } else {
      // 非战斗：驻守士兵在地图上走动
      for (const s of offDutySoldiers) {
        if (s.alive !== false) {
          drawables.push({ sortKey: (s.y + 0.5) * CELL_SIZE, soldier: s });
        }
      }
    }

    drawables.sort((a, b) => a.sortKey - b.sortKey);

    const npcNow = performance.now();
    const combatNow = performance.now();
    for (const d of drawables) {
      if (d.b) {
        const b = d.b;
        if (b.id === 'tree' && assets.treeSheet) {
          const variant = b.treeVariant ?? 0;
          ctx.drawImage(assets.treeSheet,
            variant * 64, 0, 64, 64,
            b.x * CELL_SIZE, b.y * CELL_SIZE - 16, CELL_SIZE, CELL_SIZE
          );
        } else if (b.spriteKey && assets[b.spriteKey]) {
          const img = assets[b.spriteKey];
          const levels = b.spriteLevels || 3;
          const colW = img.naturalWidth / levels;
          const srcX = ((b.level || 1) - 1) * colW;
          const drawH = img.naturalHeight;
          const extraH = drawH - CELL_SIZE;
          ctx.drawImage(img,
            srcX, 0, colW, drawH,
            b.x * CELL_SIZE, b.y * CELL_SIZE - extraH, CELL_SIZE, drawH);
          // 风车风扇旋转
          if (b.fansSprite && assets[b.fansSprite]) {
            const fansImg = assets[b.fansSprite];
            const pivot = b.fansPivot || { x: 47, y: 32 };
            const cx = b.x * CELL_SIZE + pivot.x;
            const cy = b.y * CELL_SIZE - extraH + pivot.y;
            const angle = (performance.now() / 5000) * Math.PI * 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            const fw = fansImg.naturalWidth;
            const fh = fansImg.naturalHeight;
            ctx.drawImage(fansImg, -fw / 2, -fh / 2, fw, fh);
            ctx.restore();
          }
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
      } else if (d.pirate && assets.pirate) {
        drawCombatUnit(ctx, assets.pirate, d.pirate, combatNow);
      } else if (d.soldier && assets.soldier) {
        drawCombatUnit(ctx, assets.soldier, d.soldier, combatNow);
      } else if (d.ship && assets.pirateship) {
        drawShip(ctx, assets.pirateship, d.ship);
      }
    }

    // ─── 射弹 & VFX（在单位上方绘制）───
    if (combatState.projectiles && assets.arrow) {
      const renderNow = performance.now();
      for (const pr of combatState.projectiles) {
        const elapsed = renderNow - pr.startTime;
        const t = Math.min(1, Math.max(0, elapsed / pr.duration));
        const px = pr.startX + (pr.endX - pr.startX) * t;
        const py = pr.startY + (pr.endY - pr.startY) * t;
        const angle = Math.atan2(pr.endY - pr.startY, pr.endX - pr.startX);
        const arrowW = 48, arrowH = 21;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle);
        ctx.drawImage(assets.arrow, -arrowW / 2, -arrowH / 2, arrowW, arrowH);
        ctx.restore();
      }
    }
    if (combatState.vfx) {
      const renderNow = performance.now();
      // 为 fightVFX 构建单位位置查找表（跟随移动单位）
      let soldierMap, pirateMap;
      if (combatState._hasFightVFX) {
        soldierMap = {}; pirateMap = {};
        for (const s of combatState.soldiers) { soldierMap[s.id] = s; }
        for (const p of combatState.pirates) { pirateMap[p.id] = p; }
      }
      for (const v of combatState.vfx) {
        const elapsed = renderNow - v.startTime;
        const t = elapsed / v.duration;
        if (t < 0 || t >= 1) continue;
        if (v.type === 'hit' && assets.hitVFX) {
          // 闪光：快速放大后收缩消失
          const scale = t < 0.2 ? 1 + t * 5 : 1 + (1 - t) * 1.25;
          const alpha = t < 0.15 ? 1 : 1 - (t - 0.15) / 0.85;
          ctx.save();
          ctx.globalAlpha = alpha;
          const s = 28 * scale;
          ctx.drawImage(assets.hitVFX, v.x - s / 2, v.y - s / 2, s, s);
          ctx.restore();
        } else if (v.type === 'dust' && assets.dustVFX) {
          // 尘土：从小到大扩散 + 淡出
          const scale = 0.4 + t * 1.2;
          const alpha = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
          ctx.save();
          ctx.globalAlpha = alpha;
          const s = 34 * scale;
          ctx.drawImage(assets.dustVFX, v.x - s / 2, v.y - s / 2, s, s);
          ctx.restore();
        } else if (v.type === 'fightVFX' && assets.FightVFX) {
          // 近战持续扬尘：跟随士兵-海盗中点 + 交战中振荡 / 脱离后淡出
          let mx = v.x, my = v.y;
          if (v.soldierId && soldierMap) {
            const ss = soldierMap[v.soldierId];
            const pp = pirateMap[v.pirateId];
            if (ss && pp && ss._px != null && pp._px != null) {
              mx = (ss._px + pp._px) / 2;
              my = (ss._py + pp._py) / 2;
            }
          }
          const age = renderNow - v.startTime;
          const scaleT = Math.min(age / 800, 1);
          let scale;
          if (v.alive) {
            // 交战中：进场膨胀后维持正弦脉动
            const ageT = age / 800;
            if (ageT < 0.15) {
              scale = 0.4 + (ageT / 0.15) * 1.2;
            } else {
              scale = 1.3 + 0.3 * Math.sin(ageT * 10);
            }
          } else {
            // 脱离近战：保持最后大小线性淡出
            scale = 0.4 + scaleT * 1.2;
          }
          let alpha;
          if (v.alive) {
            // 交战中：快速进场后维持正弦振荡
            const ageT = age / 800;
            if (ageT < 0.15) {
              alpha = (ageT / 0.15) * 0.8;
            } else {
              alpha = 0.8 + 0.1 * Math.sin(ageT * 10);
            }
          } else {
            // 脱离近战：800ms 内线性淡出
            const fadeT = (renderNow - v.lastAlive) / 800;
            alpha = Math.max(0, 0.8 * (1 - fadeT));
          }
          ctx.save();
          ctx.globalAlpha = Math.max(0, alpha);
          const s = 34 * scale;
          ctx.drawImage(assets.FightVFX, mx - s / 2, my - s / 2, s, s);
          ctx.restore();
        }
      }
    }

    // 建筑 HP 条（战斗中）
    for (const b of buildings) {
      const maxHp = b.maxHp || 80;
      if (b.hp === undefined || b.hp >= maxHp) continue;
      const bx = b.x * CELL_SIZE;
      const by = b.y * CELL_SIZE;
      const bw = CELL_SIZE - 8;
      const bh = 4;
      const pct = Math.max(0, b.hp / maxHp);
      ctx.fillStyle = '#333';
      ctx.fillRect(bx + 4, by - 8, bw, bh);
      ctx.fillStyle = pct > 0.5 ? '#4f4' : pct > 0.25 ? '#fc3' : '#f33';
      ctx.fillRect(bx + 4, by - 8, bw * pct, bh);
    }

    // 防御塔弹药数（战斗中）
    if (combatState.phase !== 'idle' && combatState.towers) {
      const towerById = {};
      for (const t of combatState.towers) {
        towerById[t.id] = t;
      }
      for (const b of buildings) {
        if (b.id !== 'defense_tower') continue;
        const tw = towerById[b.id];
        if (!tw) continue;

        const bx = b.x * CELL_SIZE;
        const by = b.y * CELL_SIZE;
        ctx.textAlign = 'center';
        if (tw.arrows <= 0) {
          ctx.fillStyle = '#f33';
          ctx.font = 'bold 13px Silkscreen, monospace';
        } else {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 13px Silkscreen, monospace';
        }
        // 4-direction outline matching resource bar style
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(`${tw.arrows}`, bx + CELL_SIZE / 2, by - 6);
        ctx.fillText(`${tw.arrows}`, bx + CELL_SIZE / 2, by - 6);
      }
    }

    // 幽灵预览
    if (ghost) {
      const { id, spriteIndex, gx, gy, valid } = ghost;

      // 范围预览（防御建筑）
      if (ghost.range) {
        ctx.save();
        ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc((gx + 0.5) * S, (gy + 0.5) * S, ghost.range * S, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

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
      } else if (ghost.spriteKey && assets[ghost.spriteKey]) {
        const img = assets[ghost.spriteKey];
        const spriteLevels = ghost.spriteLevels || 3;
        const colW = img.naturalWidth / spriteLevels;
        const drawH = img.naturalHeight;
        const extraH = drawH - CELL_SIZE;
        ctx.drawImage(img,
          0, 0, colW, drawH,
          gx * S, gy * S - extraH, S, drawH);
        // 风车风扇预览（静态）
        if (ghost.fansSprite && assets[ghost.fansSprite]) {
          const fansImg = assets[ghost.fansSprite];
          const pivot = ghost.fansPivot || { x: 47, y: 32 };
          const cx = gx * S + pivot.x;
          const cy = gy * S - extraH + pivot.y;
          const fw = fansImg.naturalWidth;
          const fh = fansImg.naturalHeight;
          ctx.drawImage(fansImg, cx - fw / 2, cy - fh / 2, fw, fh);
        }
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
      let range;
      if (building?.tierLevels) {
        // 建筑定义（放置预览）→ Lv1 范围
        range = building.tierLevels[0]?.range;
      } else if (building?.id && building?.level) {
        // 已放置建筑（移动）→ 当前等级范围
        const def = getBuildingById(building.id);
        if (def?.tierLevels) {
          const tier = def.tierLevels.find(t => t.level === building.level);
          range = tier?.range;
        }
      }
      ghost = {
        id: building?.id,
        spriteIndex: building?.spriteIndex,
        spriteKey: building?.spriteKey,
        spriteLevels: building?.spriteLevels,
        fansSprite: building?.fansSprite,
        fansPivot: building?.fansPivot,
        range,
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
    getMoveBuildingIndex() { return moveState?.buildingIndex ?? -1; },

    /** 设置战斗状态（海盗/士兵）触发重绘 */
    setCombatState(state) {
      combatState = state;
      render();
    },

    /** 设置非战斗驻守士兵列表 */
    setOffDutySoldiers(list) {
      offDutySoldiers = list;
    }
  };

  return island;
}