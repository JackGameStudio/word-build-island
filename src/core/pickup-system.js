/**
 * pickup-system.js
 * 地图拾取物系统 — 石材随机出现 + Canvas 渲染 + 点击收集
 *
 * 刷新逻辑：
 *   - 每天首次在线时，在石材地砖上生成 1~3 块石材
 *   - 地图最多 6 个拾取物
 *   - 离线≥24h → 旧物品自动过期（"被小动物搬走了"）
 */

import { ISLAND_GRID_SIZE, TERRAIN, DEFAULT_ISLAND_TERRAIN } from '../data/constants.js';

const MAX_ITEMS = 6;
const DAILY_STONE_MIN = 1;
const DAILY_STONE_MAX = 3;
const EXPIRE_HOURS = 24; // 超过 24h 未捡消失

const ITEM_DEFS = {
  stone: { icon: '🪨', type: 'stone', reward: { stone: 3 }, glow: '#a0a0a0' }
  // 未来扩展: wood_overflow: { icon: '🪵', type: 'wood', reward: { wood: 2 }, glow: '#c49a48' }
};

let _itemIdCounter = 0;

export function createPickupSystem(terrainMap = null) {
  const terrain = terrainMap || DEFAULT_ISLAND_TERRAIN;
  let items = [];            // 当前地图上的拾取物
  let lastSpawnDate = '';    // 上次刷新日期（YYYY-MM-DD）
  let onPickup = null;       // 回调: (itemReward) => void
  let lastSpawnTime = 0;     // 上次刷新时间戳

  // ─── 渲染函数引用（由 island-engine 设置）───
  let renderFn = null;

  function setRenderFn(fn) { renderFn = fn; }

  // ─── 获取所有石地砖坐标 ───
  function getStoneTiles() {
    const tiles = [];
    for (let y = 0; y < ISLAND_GRID_SIZE; y++) {
      for (let x = 0; x < ISLAND_GRID_SIZE; x++) {
        if (terrain[y]?.[x] === TERRAIN.STONE) {
          tiles.push({ x, y });
        }
      }
    }
    return tiles;
  }

  // ─── 获得已被占用的格位（建筑 + 已有拾取物）───
  function getOccupiedCells(buildings) {
    const set = new Set();
    (buildings || []).forEach(b => set.add(`${b.x},${b.y}`));
    items.forEach(it => set.add(`${it.gx},${it.gy}`));
    return set;
  }

  // ─── 每日刷新石材 ───
  function trySpawn(todayDate, buildings = []) {
    if (todayDate === lastSpawnDate) return 0;
    lastSpawnDate = todayDate;
    lastSpawnTime = Date.now();

    // 清理过期物品
    const now = Date.now();
    items = items.filter(it => (now - it.createdAt) < EXPIRE_HOURS * 3600 * 1000);

    // 还能放几个？
    const slots = MAX_ITEMS - items.length;
    if (slots <= 0) return 0;

    const stoneTiles = getStoneTiles();
    if (stoneTiles.length === 0) return 0;

    const occupied = getOccupiedCells(buildings);
    const available = stoneTiles.filter(t => !occupied.has(`${t.x},${t.y}`));
    if (available.length === 0) return 0;

    // 随机数量
    const count = Math.min(
      Math.floor(Math.random() * (DAILY_STONE_MAX - DAILY_STONE_MIN + 1)) + DAILY_STONE_MIN,
      slots,
      available.length
    );

    // Fisher-Yates shuffle 取前 count 个
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }

    for (let i = 0; i < count; i++) {
      const tile = available[i];
      items.push({
        id: `item_${++_itemIdCounter}`,
        type: 'stone',
        gx: tile.x,
        gy: tile.y,
        createdAt: now
      });
    }

    return count;
  }

  // ─── 拾取检测 ───
  function pickup(gx, gy) {
    const idx = items.findIndex(it => it.gx === gx && it.gy === gy);
    if (idx === -1) return null;

    const item = items[idx];
    items.splice(idx, 1);

    const def = ITEM_DEFS[item.type];
    if (def && onPickup) {
      onPickup({ ...def.reward });
    }

    if (renderFn) renderFn();
    return { ...def.reward };
  }

  // ─── 渲染拾取物到 Canvas ───
  function render(ctx, offsetX, offsetY, cellSize, timeMs) {
    items.forEach(it => {
      const def = ITEM_DEFS[it.type];
      if (!def) return;

      const cx = it.gx * cellSize + offsetX + cellSize / 2;
      const cy = it.gy * cellSize + offsetY + cellSize / 2;
      const r = cellSize * 0.25; // 16px on 64px grid

      // 脉冲动画
      const elapsed = timeMs - it.createdAt;
      const pulse = 1 + 0.15 * Math.sin(elapsed * 0.003); // ~2s 周期

      ctx.save();

      // 发光光晕
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(elapsed * 0.005);
      ctx.fillStyle = def.glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.6 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // 主体圆
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#7f8c8d';
      ctx.beginPath();
      ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 图标
      ctx.font = `${cellSize * 0.35}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, cx, cy);

      ctx.restore();
    });
  }

  // ─── 命中测试 ───
  function hitTest(screenX, screenY, offsetX, offsetY, cellSize) {
    for (const it of items) {
      const cx = it.gx * cellSize + offsetX + cellSize / 2;
      const cy = it.gy * cellSize + offsetY + cellSize / 2;
      const r = cellSize * 0.3;
      const dx = screenX - cx;
      const dy = screenY - cy;
      if (dx * dx + dy * dy <= r * r) {
        return it;
      }
    }
    return null;
  }

  // ─── 持久化 ───
  function getState() {
    return { items: [...items], lastSpawnDate, lastSpawnTime };
  }

  function loadState(state) {
    if (!state) return;
    items = (state.items || []).map(it => ({ ...it }));
    lastSpawnDate = state.lastSpawnDate || '';
    lastSpawnTime = state.lastSpawnTime || 0;
    // 从最大 id 恢复计数器
    items.forEach(it => {
      const num = parseInt(String(it.id).replace('item_', ''), 10);
      if (num > _itemIdCounter) _itemIdCounter = num;
    });
  }

  function setOnPickup(fn) { onPickup = fn; }

  function setTerrainMap(map) {
    Object.assign(terrain, map);
  }

  return {
    getItems: () => items,
    trySpawn,
    pickup,
    hitTest,
    render,
    setRenderFn,
    getState,
    loadState,
    setOnPickup,
    setTerrainMap
  };
}