/**
 * ResourceBar.js
 * 顶部资源栏 — icons.png 切片 + panel-9slice 背景
 */

import { SPRITE } from '../data/constants.js';
import { drawIcon } from '../core/asset-loader.js';

const ICONS = [
  { key: 'star',  label: '星星', col: 0 },
  { key: 'gold',  label: '金币', col: 1 },
  { key: 'wood',  label: '木材', col: 2 },
  { key: 'stone', label: '石材', col: 3 }
];

export function createResourceBar(assets) {
  const bar = document.createElement('div');
  bar.className = 'resource-bar panel-9slice';

  const elements = {};

  ICONS.forEach(({ key, label, col }) => {
    const item = document.createElement('div');
    item.className = 'resource-item';
    item.title = label;

    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = SPRITE.ICON_W;
    iconCanvas.height = SPRITE.ICON_H;
    iconCanvas.className = 'resource-icon';
    iconCanvas.style.cssText = 'image-rendering:pixelated;';

    const ictx = iconCanvas.getContext('2d');
    ictx.imageSmoothingEnabled = false;
    if (assets.icons) {
      drawIcon(ictx, assets.icons, col, 0, 0);
    } else {
      // fallback: 彩色点
      const colors = ['#FFD700','#FFD700','#8B4513','#808080'];
      ictx.fillStyle = colors[col];
      ictx.fillRect(4, 4, 16, 16);
    }

    const value = document.createElement('span');
    value.textContent = '0';

    item.append(iconCanvas, value);
    bar.appendChild(item);
    elements[key] = value;
  });

  // 岛屿等级
  const lvItem = document.createElement('div');
  lvItem.className = 'resource-item';
  const lvSpan = document.createElement('span');
  lvSpan.textContent = 'Lv.1';
  lvSpan.style.cssText = 'color:var(--color-muted);font-size:11px;margin-left:auto;';
  lvItem.appendChild(lvSpan);
  bar.appendChild(lvItem);
  elements.level = lvSpan;

  return {
    element: bar,
    update(resources, level = 1) {
      ICONS.forEach(({ key }) => {
        elements[key].textContent = resources[key] ?? 0;
      });
      elements.level.textContent = `Lv.${level}`;
    }
  };
}