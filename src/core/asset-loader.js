/**
 * asset-loader.js
 * 图片资源预加载器 — 启动时全部加载完毕再进入游戏
 */

const ASSET_LIST = {
  spritesheet: '/src/assets/images/spritesheet.png',
  terrain:     '/src/assets/images/terrain.png',
  icons:       '/src/assets/images/icons.png',
  panelBG:     '/src/assets/images/panel-9slice.png',
  btnNormal:   '/src/assets/images/btn-normal.png',
  btnHover:    '/src/assets/images/btn-hover.png',
  btnDisabled: '/src/assets/images/btn-disabled.png',
  rock:        '/src/assets/images/rock.png',
  treeSheet:   '/src/assets/images/Tree_spritesheet.png',
  villagerSheet: '/src/assets/images/villager.png',
  chestbox:    '/src/assets/images/chestbox.png',
  // 海盗系统新资产
  wartower:    '/src/assets/images/wartower.png',
  barracks:    '/src/assets/images/barracks.png',
  windmillBody: '/src/assets/images/Windmill_body.png',
  windmillFans: '/src/assets/images/Windmill_Fans.png',
  soldier:     '/src/assets/images/soldier.png',
  pirate:      '/src/assets/images/pirate.png',
  pirateship:  '/src/assets/images/pirateship.png',
  // 防御塔射弹 & VFX
  arrow:       '/src/assets/images/arrow.png',
  hitVFX:      '/src/assets/images/HitVFX.png',
  dustVFX:     '/src/assets/images/dustVFX.png',
  FightVFX:    '/src/assets/images/FightVFX.png'
};

/**
 * 预加载所有图片资源
 * @param {(progress: number) => void} onProgress 0→1 进度回调
 * @returns {Promise<Object<string, HTMLImageElement>>}
 */
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

/**
 * 从 spritesheet 切图绘制到目标 Canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} spritesheet
 * @param {number} col    — 第几列（0-based）
 * @param {number} sw,sh — 单格尺寸
 * @param {number} dx,dy — 画到 Canvas 的哪个坐标
 * @param {number} [dw],[dh] — 绘制尺寸（可选，默认 sw/sh）
 */
export function drawSprite(ctx, spritesheet, col, sw, sh, dx, dy, dw, dh) {
  ctx.drawImage(
    spritesheet,
    col * sw, 0, sw, sh,
    dx, dy, dw ?? sw, dh ?? sh
  );
}

/**
 * 从 terrain spritesheet 切地形 tile 绘制
 * terrain.png 布局：每行一种地形，每行有 2 列（亮/暗棋盘格）
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} terrainImg
 * @param {number} terrainType — TERRAIN 枚举值（行号）
 * @param {number} tileVariant — 0 或 1（棋盘格亮/暗）
 * @param {number} dx,dy — 绘制位置
 * @param {number} size   — 绘制尺寸（默认 CELL_SIZE）
 */
export function drawTerrainTile(ctx, terrainImg, terrainType, tileVariant, dx, dy, size = 64) {
  const col = tileVariant % 2; // 每行 2 列
  ctx.drawImage(
    terrainImg,
    col * size, terrainType * size, size, size,
    dx, dy, size, size
  );
}

/**
 * 从 icons 图集切图标绘制
 */
export function drawIcon(ctx, iconsImg, col, x, y) {
  ctx.drawImage(iconsImg, col * 24, 0, 24, 24, x, y, 24, 24);
}
