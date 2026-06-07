/**
 * ResourceBar.js
 * 复古像素风顶部资源栏 — icons.png 像素 icon + 描边数字
 */

import { drawIcon } from '../core/asset-loader.js';
import { ICON_COLS } from '../data/constants.js';

const ICONS = [
  { key: 'star',  col: ICON_COLS.star },
  { key: 'gold',  col: ICON_COLS.gold },
  { key: 'wood',  col: ICON_COLS.wood },
  { key: 'stone', col: ICON_COLS.stone }
];

export function createResourceBar(assets) {
  const bar = document.createElement('div');
  bar.className = 'resource-bar';
  const iconsImg = assets.icons;

  const elements = {};

  ICONS.forEach(({ key, col }) => {
    const item = document.createElement('div');
    item.className = 'resource-item';

    const canvas = document.createElement('canvas');
    canvas.className = 'icon';
    canvas.dataset.res = key;
    canvas.width  = 24;
    canvas.height = 24;

    const ctx = canvas.getContext('2d');
    drawIcon(ctx, iconsImg, col, 0, 0);

    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = '0';

    item.append(canvas, value);
    bar.appendChild(item);
    elements[key] = value;
  });

  return {
    element: bar,
    update(resources, level = 1) {
      ICONS.forEach(({ key }) => {
        elements[key].textContent = resources[key] ?? 0;
      });
    }
  };
}
