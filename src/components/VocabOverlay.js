/**
 * VocabOverlay.js
 * 背词覆盖层 — 半屏滑出 + 九宫格面板 + 图片按钮
 * 答题 → 奖励 → 资源飞入 → 自动关闭（5词一组）
 */

import { getDueWords, gradeWord, getQuizOptions } from '../core/vocab-engine.js';
import { rewardForReview, mergeResources } from '../core/economy.js';
import { transition } from '../core/state.js';
import { AppState } from '../data/constants.js';

export function createVocabOverlay(assets, vocabArray, onReward) {
  let currentIndex = 0;
  let sessionRewards = {};
  let currentWord = null;
  let toastRef = null;

  // ─── DOM 结构 ───
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'slide-panel panel-9slice vocab-panel';

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-pixel';
  closeBtn.textContent = '✕ 退出';
  closeBtn.style.cssText = 'align-self:flex-end;font-size:11px;padding:4px 10px;margin-bottom:4px;';
  closeBtn.onclick = hide;

  const wordEl = document.createElement('div');
  wordEl.className = 'vocab-word';

  const optionsGrid = document.createElement('div');
  optionsGrid.className = 'vocab-options';

  const progressEl = document.createElement('div');
  progressEl.style.cssText = 'text-align:center;font-size:11px;color:var(--color-muted);margin-top:8px;';

  panel.append(closeBtn, wordEl, optionsGrid, progressEl);
  overlay.appendChild(panel);

  // ─── 开始一组（最多5个到期词） ───
  function startSession() {
    const due = getDueWords(vocabArray).slice(0, 5);
    if (due.length === 0) {
      toastRef?.show('今天没有需要复习的词 🎉');
      hide();
      return;
    }
    currentIndex = 0;
    sessionRewards = {};
    showWord(due[currentIndex]);
    overlay.style.display = 'block';
    overlay.classList.add('visible');
    requestAnimationFrame(() => panel.classList.add('open'));
  }

  // ─── 显示当前词 + 4 个选项 ───
  function showWord(word) {
    currentWord = word;
    const options = getQuizOptions(word, vocabArray);

    wordEl.textContent = word.word;
    progressEl.textContent = `${currentIndex + 1} / 5`;

    optionsGrid.innerHTML = '';
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn-pixel';
      btn.textContent = opt;
      btn.style.fontSize = '11px';
      btn.onclick = () => handleAnswer(opt, btn);
      optionsGrid.appendChild(btn);
    });
  }

  // ─── 处理答题 ───
  function handleAnswer(selectedMeaning, btnEl) {
    const isCorrect = selectedMeaning === currentWord.meaning;
    const quality = isCorrect ? 5 : 1;

    const idx = vocabArray.findIndex(w => w.word === currentWord.word);
    if (idx !== -1) {
      vocabArray[idx] = gradeWord(vocabArray[idx], quality);
    }

    if (isCorrect) {
      btnEl.style.background = '#4ade80';
      const reward = rewardForReview(currentWord, quality);
      sessionRewards = mergeResources(sessionRewards, reward);
      animateFly(btnEl, reward);
    } else {
      btnEl.style.background = '#f87171';
      btnEl.classList.add('shake');
      const correctBtn = Array.from(optionsGrid.children)
        .find(b => b.textContent === currentWord.meaning);
      if (correctBtn) correctBtn.style.background = '#4ade80';
    }

    setTimeout(() => {
      currentIndex++;
      if (currentIndex >= 5 || currentIndex >= getDueWords(vocabArray).slice(0, 5).length) {
        finishSession();
      } else {
        showWord(getDueWords(vocabArray).slice(0, 5)[currentIndex]);
      }
    }, isCorrect ? 800 : 1500);
  }

  // ─── 一组结束 ───
  function finishSession() {
    const totalReward = { ...sessionRewards };
    onReward?.(totalReward);
    const desc = formatReward(totalReward);
    toastRef?.show(`本轮收获: ${desc}`);
    hide();
  }

  // ─── 资源飞入动画（飞向顶部资源栏）───
  function animateFly(fromEl, reward) {
    const rect = fromEl.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top;
    const bar = document.querySelector('.resource-bar');
    const barRect = bar?.getBoundingClientRect();
    const targetY = barRect ? barRect.top + barRect.height / 2 : 48;

    Object.entries(reward).filter(([,v]) => v > 0).forEach(([res, val], idx) => {
      const el = document.createElement('span');
      el.textContent = `+${val} ${resIcon(res)}`;
      const offsetY = idx * 18;
      const dy = targetY - (startY + offsetY);
      el.style.cssText = `
        position:fixed; left:${startX}px; top:${startY + offsetY}px;
        font-size:16px; color:var(--color-correct);
        pointer-events:none; z-index:999;
      `;
      document.body.appendChild(el);
      const anim = el.animate([
        { opacity: 1, transform: 'scale(1) translate(0, 0)' },
        { opacity: 0, transform: `scale(0.4) translate(${idx * 20 - 10}px, ${dy}px)` }
      ], { duration: 800, easing: 'ease-out', fill: 'forwards' });
      anim.onfinish = () => el.remove();
    });
  }

  function resIcon(res) {
    return { gold: '🪙', wood: '🪵', stone: '🪨', food: '🌾', star: '⭐' }[res] || res;
  }

  function formatReward(r) {
    return Object.entries(r).map(([k, v]) => `+${v}${resIcon(k)}`).join(' ');
  }

  function hide() {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    transition(AppState.IDLE);
  }

  function show() { startSession(); }

  return {
    element: overlay,
    show,
    hide,
    get isVisible() { return overlay.style.display !== 'none'; },
    /** 注入 toast 引用 */
    setToast(t) { toastRef = t; }
  };
}