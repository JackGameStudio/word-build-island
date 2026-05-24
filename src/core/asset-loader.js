/**
 * asset-loader.js
 * 图片资源预加载器 — 启动时全部加载完毕再进入游戏
 */

const ASSET_LIST = {
  spritesheet: '/src/assets/images/spritesheet.png',
  icons:       '/src/assets/images/icons.png',
  panelBG:     '/src/assets/images/panel-9slice.png',
  btnNormal:   '/src/assets/images/btn-normal.png',
  btnHover:    '/src/assets/images/btn-hover.png',
  btnDisabled:  '/src/assets/images/btn-disabled.png'
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
 * 从 icons 图集切图标绘制
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} iconsImg
 * @param {number} col — 0=star,1=gold,2=wood,3=stone,4=food
 * @param {number} x,y — 绘制位置
 */
export function drawIcon(ctx, iconsImg, col, x, y) {
  ctx.drawImage(iconsImg, col * 24, 0, 24, 24, x, y, 24, 24);
}
