/**
 * TreasureChest.js
 * 宝箱组件 — 4 次点击开箱，纯 CSS 动画 + emoji，每次点击赌升级
 * 用法：const chest = createTreasureChest(assets, onComplete);
 *       app.appendChild(chest.element);
 *       chest.show(sessionRewards, vocabArray);
 */

import { CHEST_TIERS, CHEST_UPGRADE_CHANCE, getRank, AppState } from '../data/constants.js';
import { formatIncome } from '../core/economy.js';
import { transition } from '../core/state.js';

const CLICKS_TO_OPEN = 4;

export function createTreasureChest(onComplete) {
  let currentTier = 0;   // 当前宝箱等级 0=木, 1=银...
  let clickCount = 0;
  let sessionRewards = {};
  let vocabArray = [];
  let toastRef = null;

  // ─── DOM ───
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'slide-panel panel-9slice chest-panel';

  // 标题
  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;font-weight:700;text-align:center;margin-bottom:2px;';

  // 宝箱图标（emoji，随等级变化）
  const chestEl = document.createElement('div');
  chestEl.style.cssText = `
    font-size:64px;text-align:center;
    cursor:pointer;user-select:none;
    transition: transform 0.1s ease;
    line-height:1;
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
  panel.append(title, chestEl, hint, dots, rewardPreview, flash);
  panel.style.position = 'relative';
  panel.style.padding = '12px 16px 16px';
  overlay.appendChild(panel);

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
    chestEl.textContent = tier.icon;
    chestEl.style.filter = `drop-shadow(0 0 ${8 + currentTier * 4}px ${tier.glow})`;
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
    chestEl.classList.add('chest-shake');
    setTimeout(() => chestEl.classList.remove('chest-shake'), 400);
  }

  function doFlash() {
    flash.style.opacity = '1';
    setTimeout(() => flash.style.opacity = '0', 350);
  }

  function doUpgrade() {
    currentTier = Math.min(currentTier + 1, CHEST_TIERS.length - 1);
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

    // 爆炸动画
    chestEl.textContent = '💥';
    chestEl.style.fontSize = '72px';
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
    renderDots();

    // 震动反馈
    doShake();
    chestEl.style.transform = 'scale(0.9)';
    setTimeout(() => chestEl.style.transform = '', 100);

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

  chestEl.addEventListener('click', handleClick);

  function show(rewards, vocab) {
    sessionRewards = { ...rewards };
    vocabArray = vocab || [];
    currentTier = 0;
    clickCount = 0;

    transition(AppState.CHEST);

    overlay.style.display = 'block';
    overlay.classList.add('visible');
    requestAnimationFrame(() => panel.classList.add('open'));

    updateChestVisual();
    renderDots();
    hint.textContent = `点击第 1/${CLICKS_TO_OPEN} 次开锁...`;
    rewardPreview.textContent = getPreviewText();
    chestEl.textContent = CHEST_TIERS[0].icon;
    chestEl.style.fontSize = '64px';
  }

  function hide() {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
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
