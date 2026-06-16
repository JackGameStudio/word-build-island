/**
 * TreasureChest.js
 * 宝箱组件 — 4 次点击开箱，canvas 像素图 + 赌升级
 * 用法：const chest = createTreasureChest(assets, onComplete);
 *       app.appendChild(chest.element);
 *       chest.show(sessionRewards, vocabArray);
 */

import { play as playSound } from '../core/sound.js';

import { CHEST_TIERS, CHEST_UPGRADE_CHANCE, getRank, AppState } from '../data/constants.js';
import { formatIncome } from '../core/economy.js';
import { transition } from '../core/state.js';

const CLICKS_TO_OPEN = 4;
const CELL_SIZE = 200;

export function createTreasureChest(assets, onComplete) {
  let currentTier = 0;   // 当前宝箱等级 0=木, 1=铁...
  let clickCount = 0;
  let sessionRewards = {};
  let vocabArray = [];
  let toastRef = null;
  let isOpened = false;

  // ─── DOM ───
  const overlay = document.createElement('div');
  overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:100;background:var(--color-overlay);cursor:default;';

  const panel = document.createElement('div');
  panel.className = 'panel-9slice';
  panel.style.cssText = `
    position:fixed; bottom:130px; left:50%; z-index:101;
    transform:translateX(-50%);
    display:none;
    width:240px;
    padding:12px 16px 16px;
    filter:drop-shadow(0 4px 20px rgba(0,0,0,0.5));
    transition:opacity 0.12s;
    opacity:0;
  `;

  // 标题
  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;font-weight:700;text-align:center;margin-bottom:2px;';

  // 宝箱画布（canvas 150×150，CSS 缩放到合适大小）
  const chestCanvas = document.createElement('canvas');
  chestCanvas.width = CELL_SIZE;
  chestCanvas.height = CELL_SIZE;
  chestCanvas.style.cssText = `
    display:block;margin:0 auto;
    width:200px;height:200px;
    image-rendering:pixelated;
    cursor:pointer;user-select:none;
    transition: transform 0.1s ease;
    -webkit-tap-highlight-color:transparent;
  `;

  // 提示文字
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;font-size:11px;color:var(--color-muted);margin:2px 0;';

  // 进度点
  const dots = document.createElement('div');
  dots.style.cssText = 'display:flex;justify-content:center;gap:6px;margin:4px 0;';

  // 奖励预览
  const rewardPreview = document.createElement('div');
  rewardPreview.style.cssText = 'text-align:center;font-size:12px;color:var(--color-correct);min-height:20px;';

  // 升级闪光层
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:absolute;inset:0;border-radius:12px;
    background:radial-gradient(circle,rgba(255,255,255,0.8),transparent 70%);
    opacity:0;pointer-events:none;transition:opacity 0.3s;
  `;

  // 恢复原始 DOM 顺序：标题 → 宝箱 → 提示 → 进度 → 奖励预览
  panel.append(title, chestCanvas, hint, dots, rewardPreview, flash);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // ─── Canvas 绘制 ───
  function drawChest(open) {
    const ctx = chestCanvas.getContext('2d');
    const img = assets.chestbox;
    if (!img) return;

    const row = Math.min(currentTier, 4); // spritesheet 5 行，tier 0-4
    const col = open ? 1 : 0;

    ctx.clearRect(0, 0, CELL_SIZE, CELL_SIZE);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      img,
      col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE,
      0, 0, CELL_SIZE, CELL_SIZE
    );
  }

  function renderDots() {
    dots.innerHTML = '';
    for (let i = 0; i < CLICKS_TO_OPEN; i++) {
      const d = document.createElement('span');
      d.style.cssText = i < clickCount
        ? 'font-size:18px;'
        : 'font-size:18px;filter:grayscale(1);opacity:0.4;';
      d.textContent = i < clickCount ? '●' : '○';
      dots.appendChild(d);
    }
  }

  function updateChestVisual() {
    const tier = CHEST_TIERS[currentTier];
    drawChest(false);
    chestCanvas.style.filter = `drop-shadow(0 0 ${8 + currentTier * 4}px ${tier.glow})`;
    title.textContent = `${tier.name} — 点击开锁！`;
    title.style.color = tier.color;
    rewardPreview.textContent = getPreviewText();
  }

  function getPreviewText() {
    const tier = CHEST_TIERS[currentTier];
    let preview = `奖励倍率 ×${tier.multi}`;
    if (currentTier < CHEST_TIERS.length - 1) {
      const next = CHEST_TIERS[currentTier + 1];
      const chance = Math.round(CHEST_UPGRADE_CHANCE[clickCount] * 100);
      preview += `  |  下次升级概率 ${chance}%`;
    }
    return preview;
  }

  function doShake() {
    chestCanvas.classList.add('chest-shake');
    setTimeout(() => chestCanvas.classList.remove('chest-shake'), 400);
  }

  function doFlash() {
    flash.style.opacity = '1';
    setTimeout(() => flash.style.opacity = '0', 350);
  }

  function doUpgrade() {
    currentTier = Math.min(currentTier + 1, CHEST_TIERS.length - 1);
    playSound('chest_upgrade');
    doFlash();
    updateChestVisual();
    if (toastRef) toastRef.show(`⬆️ 升级为 ${CHEST_TIERS[currentTier].name}！`);
  }

  function doOpen() {
    // 计算最终奖励
    const tier = CHEST_TIERS[currentTier];
    const finalReward = {};
    Object.entries(sessionRewards).forEach(([k, v]) => {
      finalReward[k] = Math.floor(v * tier.multi);
    });

    // 绘制打开状态
    playSound('chest_open');
    isOpened = true;
    drawChest(true);
    doFlash();

    // 资源飞出
    setTimeout(() => {
      const desc = formatIncome(finalReward);
      rewardPreview.textContent = `获得：${desc}`;
      rewardPreview.style.color = '#fbbf24';
      hint.textContent = '🎉 宝箱已打开！';

      // 飞到资源栏
      if (onComplete) onComplete(finalReward);

      setTimeout(() => hide(), 1800);
    }, 600);
  }

  function handleClick() {
    if (clickCount >= CLICKS_TO_OPEN) return;
    clickCount++;
    playSound('button_click');
    renderDots();

    // 震动反馈
    doShake();
    chestCanvas.style.transform = 'scale(0.9)';
    setTimeout(() => chestCanvas.style.transform = '', 100);

    if (clickCount >= CLICKS_TO_OPEN) {
      // 开箱！
      hint.textContent = '即将打开...';
      setTimeout(doOpen, 500);
      return;
    }

    // 赌升级
    const chance = CHEST_UPGRADE_CHANCE[clickCount - 1] || 0;
    const rolled = Math.random();
    if (rolled < chance && currentTier < CHEST_TIERS.length - 1) {
      setTimeout(() => doUpgrade(), 300);
    } else {
      hint.textContent = `没升级... 再点 ${CLICKS_TO_OPEN - clickCount} 次开箱`;
    }
  }

  chestCanvas.addEventListener('click', handleClick);

  function show(rewards, vocab) {
    sessionRewards = { ...rewards };
    vocabArray = vocab || [];
    currentTier = 0;
    clickCount = 0;
    isOpened = false;

    transition(AppState.CHEST);

    overlay.style.display = 'block';
    panel.style.display = 'block';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.opacity = '1';
      });
    });

    updateChestVisual();
    renderDots();
    hint.textContent = `点击第 1/${CLICKS_TO_OPEN} 次开锁...`;
    rewardPreview.textContent = getPreviewText();
  }

  function hide() {
    panel.style.opacity = '0';
    setTimeout(() => {
      panel.style.display = 'none';
      overlay.style.display = 'none';
    }, 200);
    transition(AppState.IDLE);
  }

  // ─── 注入 CSS 动画（只注入一次）───
  if (!document.getElementById('chest-styles')) {
    const style = document.createElement('style');
    style.id = 'chest-styles';
    style.textContent = `
      @keyframes chest-shake {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        20%  { transform: translateX(-6px) rotate(-3deg); }
        40%  { transform: translateX(6px) rotate(3deg); }
        60%  { transform: translateX(-4px) rotate(-2deg); }
        80%  { transform: translateX(4px) rotate(2deg); }
      }
      .chest-shake { animation: chest-shake 0.4s ease; }
    `;
    document.head.appendChild(style);
  }

  return {
    element: overlay,
    show,
    hide,
    setToast(t) { toastRef = t; }
  };
}
