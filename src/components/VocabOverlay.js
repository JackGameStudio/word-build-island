/**
 * VocabOverlay.js
 * 背词覆盖层 — 半屏滑出 + 九宫格面板
 * 模式自动决定：Box 1~3 固定选择题，Box 4~5 随机出现排字游戏
 */

import { getDueWords, gradeWord, getQuizOptions } from '../core/vocab-engine.js';
import { rewardForReview, mergeResources } from '../core/economy.js';
import { transition } from '../core/state.js';
import { AppState, getRank } from '../data/constants.js';
import { speakWord, speakEnglish, stopSpeaking } from '../core/tts.js';

const MODE = {
  CHOICE: 'choice',
  SPELLING: 'spelling'
};

export function createVocabOverlay(assets, vocabArray, onSessionComplete, getBuffs = () => ({}), getEffectiveNow = () => Date.now(), onStarEarned = () => {}, starEcon = null) {
  let currentIndex = 0;
  let sessionRewards = {};
  let currentWord = null;
  let toastRef = null;
  let mode = MODE.CHOICE;
  let allSessionWords = [];
  let sessionResults = []; // [{box, quality}]

  // ─── DOM 结构 ───
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'slide-panel panel-9slice vocab-panel';

  // 顶部栏：段位（居中）+ 语音（右侧）
  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;justify-content:center;align-items:center;position:relative;margin-bottom:6px;min-height:36px;';

  // 段位标签（居中，放大 100%）
  const rankTag = document.createElement('span');
  rankTag.style.cssText = 'font-size:20px;padding:6px 16px;border-radius:12px;font-weight:700;letter-spacing:1px;color:#fff;';

  // 语音按钮（右侧绝对定位，仅图标）
  const speakBtn = document.createElement('button');
  speakBtn.className = 'btn-pixel';
  speakBtn.textContent = '🔊';
  speakBtn.title = '朗读';
  speakBtn.style.cssText = 'position:absolute;right:0;top:50%;transform:translateY(-50%);font-size:18px;padding:4px 8px;min-width:auto;line-height:1;';

  topBar.append(rankTag, speakBtn);

  // 点击遮罩关闭（与其他面板一致）
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });
  speakBtn.onclick = () => currentWord && speakWord(currentWord);

  // 单词显示区
  const wordEl = document.createElement('div');
  wordEl.className = 'vocab-word';

  const meaningEl = document.createElement('div');
  meaningEl.style.cssText = 'text-align:center;font-size:14px;color:var(--color-muted);margin-bottom:8px;display:none;';

  // ── 选择题选项区 ──
  const answerArea = document.createElement('div');
  answerArea.className = 'vocab-options';

  // ── 排字游戏区（默认隐藏）──
  const spellArea = document.createElement('div');
  spellArea.style.cssText = 'display:none;flex-direction:column;align-items:center;gap:8px;';

  // 答案行：已选字母（点选可撤回）
  const answerRow = document.createElement('div');
  answerRow.style.cssText = 'display:flex;gap:4px;justify-content:center;flex-wrap:wrap;min-height:44px;align-items:center;';

  // 字母池：待选字母方块
  const letterPool = document.createElement('div');
  letterPool.style.cssText = 'display:flex;gap:4px;justify-content:center;flex-wrap:wrap;';

  // 排字按钮行
  const spellBtnRow = document.createElement('div');
  spellBtnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;';

  const spellClear = document.createElement('button');
  spellClear.className = 'btn-pixel';
  spellClear.textContent = '🔄';
  spellClear.title = '重排';
  spellClear.style.cssText = 'font-size:16px;padding:6px 12px;min-width:auto;line-height:1;';

  const spellSubmit = document.createElement('button');
  spellSubmit.className = 'btn-pixel';
  spellSubmit.textContent = '✅';
  spellSubmit.title = '确定';
  spellSubmit.style.cssText = 'font-size:18px;padding:6px 20px;min-width:auto;line-height:1;';

  spellBtnRow.append(spellClear, spellSubmit);
  spellArea.append(answerRow, letterPool, spellBtnRow);

  const progressEl = document.createElement('div');
  progressEl.style.cssText = 'text-align:center;font-size:11px;color:var(--color-muted);margin-top:8px;';

  // 星星进度条（Box 3~5 可见）
  const starProgressBar = document.createElement('div');
  starProgressBar.style.cssText = 'display:none;justify-content:center;align-items:center;gap:6px;margin-bottom:6px;font-size:13px;';
  const starProgressLabel = document.createElement('span');
  starProgressLabel.textContent = '⭐';
  const starProgressText = document.createElement('span');
  starProgressText.style.cssText = 'font-size:12px;color:var(--color-muted);min-width:48px;text-align:center;';
  const starProgressTrack = document.createElement('div');
  starProgressTrack.style.cssText = 'width:120px;height:8px;background:#333;border-radius:4px;overflow:hidden;border:1px solid #555;';
  const starProgressFill = document.createElement('div');
  starProgressFill.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg,#facc15,#f59e0b);border-radius:3px;transition:width 0.3s ease;';
  starProgressTrack.appendChild(starProgressFill);
  starProgressBar.append(starProgressLabel, starProgressText, starProgressTrack);

  const STAR_THRESHOLDS = { 3: 30, 4: 10, 5: 2 };

  function updateStarProgress(box) {
    if (!starEcon || box < 3) {
      starProgressBar.style.display = 'none';
      return;
    }
    starProgressBar.style.display = 'flex';
    const state = starEcon.getState();
    const count = state[`box${box}`] || 0;
    const threshold = STAR_THRESHOLDS[box] || 1;
    starProgressText.textContent = `${count}/${threshold}`;
    starProgressFill.style.width = `${Math.min(100, (count / threshold) * 100)}%`;
  }

  function flashStarProgress(box) {
    starProgressBar.style.transition = 'none';
    starProgressFill.style.width = '100%';
    starProgressFill.style.background = '#facc15';
    starProgressFill.style.boxShadow = '0 0 12px #facc15';
    starProgressText.textContent = '满格！';

    requestAnimationFrame(() => {
      starProgressBar.style.transition = '';
      setTimeout(() => {
        starProgressFill.style.boxShadow = '';
        starProgressFill.style.background = 'linear-gradient(90deg,#facc15,#f59e0b)';
        updateStarProgress(box);
      }, 600);
    });
  }

  panel.append(starProgressBar, topBar, wordEl, meaningEl, answerArea, spellArea, progressEl);
  overlay.appendChild(panel);

  // ─── 排字游戏状态 ───
  let spellLetters = [];
  let spellAnswer  = [];
  let spellPool    = [];

  // ─── 自动决定模式（Box 4~5 随机出排字）──
  function autoDecideMode() {
    if (!currentWord) return;
    const box = currentWord.box || 1;
    if (box >= 4 && Math.random() < 0.5) {
      mode = MODE.SPELLING;
    } else {
      mode = MODE.CHOICE;
    }
  }

  // ─── 开始一组（最多5个到期词）──
  function startSession() {
    const due = getDueWords(vocabArray, getEffectiveNow()).slice(0, 5);
    if (due.length === 0) {
      toastRef?.show('今天没有需要复习的词 🎉');
      hide();
      return;
    }
    allSessionWords = due;
    currentIndex = 0;
    sessionRewards = {};
    sessionResults = [];
    overlay.style.display = 'block';
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      panel.classList.add('open');
    });
    showCurrentQuestion();
  }

  function showCurrentQuestion() {
    currentWord = allSessionWords[currentIndex];
    progressEl.textContent = `${currentIndex + 1} / ${allSessionWords.length}`;
    autoDecideMode();
    updateRankTag();
    updateStarProgress(currentWord.box || 1);
    renderCurrentQuestion();
  }

  // ─── 段位标签更新 ───
  function updateRankTag() {
    if (!currentWord) { rankTag.style.display = 'none'; return; }
    const rank = getRank(currentWord.box);
    rankTag.textContent = `${rank.icon}${rank.name}`;
    rankTag.style.background = rank.color;
    rankTag.style.display = '';
    const now = getEffectiveNow();
    const nextReview = currentWord.nextReview;
    if (nextReview) {
      const days = Math.max(1, Math.round((nextReview - now) / 86400000));
      rankTag.title = `下次复习：${days} 天后`;
    } else {
      rankTag.title = '新词，随时可复习';
    }
  }

  // ─── 渲染当前题目 ───
  function renderCurrentQuestion() {
    const isChoice = mode === MODE.CHOICE;

    answerArea.style.display  = isChoice ? '' : 'none';
    spellArea.style.display   = isChoice ? 'none' : 'flex';
    meaningEl.style.display  = 'none';

    if (isChoice) {
      wordEl.textContent = currentWord.word;
      wordEl.style.display = '';
      const options = getQuizOptions(currentWord, allSessionWords);
      answerArea.innerHTML = '';
      options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = 'btn-pixel';
        btn.textContent = opt;
        btn.style.fontSize = '11px';
        btn.onclick = () => handleChoiceAnswer(opt, btn);
        answerArea.appendChild(btn);
      });
    } else {
      wordEl.style.display = '';
      wordEl.textContent = currentWord.meaning;
      meaningEl.style.display = '';
      meaningEl.textContent = `🔤 ${currentWord.word.length} 个字母 · 点选字母排列成单词`;

      speakEnglish(currentWord.word);

      spellLetters = currentWord.word.toLowerCase().split('');
      spellAnswer  = [];
      spellPool    = [...spellLetters].sort(() => Math.random() - 0.5);
      renderSpellUI();

      spellSubmit.disabled = false;
      spellSubmit.textContent = '✅';
      spellSubmit.onclick = handleSpellSubmit;

      spellClear.onclick = () => {
        spellPool    = [...spellLetters].sort(() => Math.random() - 0.5);
        spellAnswer  = [];
        renderSpellUI();
      };
    }
  }

  // ─── 渲染排字 UI ───
  function renderSpellUI() {
    answerRow.innerHTML = '';
    if (spellAnswer.length === 0) {
      const hint = document.createElement('span');
      hint.style.cssText = 'color:var(--color-muted);font-size:12px;line-height:40px;';
      hint.textContent = '👇 点击下方字母排列';
      answerRow.appendChild(hint);
    } else {
      spellAnswer.forEach((letter, i) => {
        const tile = document.createElement('button');
        tile.className = 'spell-tile';
        tile.textContent = letter;
        tile.onclick = () => {
          spellAnswer.splice(i, 1);
          spellPool.push(letter);
          renderSpellUI();
        };
        answerRow.appendChild(tile);
      });
    }

    letterPool.innerHTML = '';
    spellPool.forEach((letter, i) => {
      const tile = document.createElement('button');
      tile.className = 'spell-tile spell-tile--pool';
      tile.textContent = letter;
      tile.onclick = () => {
        spellPool.splice(i, 1);
        spellAnswer.push(letter);
        renderSpellUI();
      };
      letterPool.appendChild(tile);
    });
  }

  // ─── 选择题答题 ───
  function handleChoiceAnswer(selectedMeaning, btnEl) {
    const isCorrect = selectedMeaning === currentWord.meaning;
    processAnswer(isCorrect, btnEl, selectedMeaning !== currentWord.meaning ? currentWord.meaning : null);
  }

  // ─── 排字游戏提交 ───
  function handleSpellSubmit() {
    if (spellAnswer.length === 0) return;
    const userAnswer = spellAnswer.join('');
    const isCorrect = userAnswer === currentWord.word.toLowerCase();
    spellSubmit.disabled = true;
    spellClear.disabled  = true;
    answerRow.querySelectorAll('button').forEach(b => b.disabled = true);
    letterPool.querySelectorAll('button').forEach(b => b.disabled = true);
    processAnswer(isCorrect, spellSubmit, isCorrect ? null : currentWord.word);
  }

  // ─── 通用答题处理 ───
  function processAnswer(isCorrect, el, correctAnswer) {
    const quality = isCorrect ? 5 : 1;
    sessionResults.push({ box: currentWord.box || 1, quality });

    const idx = vocabArray.findIndex(w => w.word === currentWord.word);
    if (idx !== -1) {
      vocabArray[idx] = gradeWord(vocabArray[idx], quality, getEffectiveNow());
    }

    if (isCorrect) {
      el.style.background = '#4ade80';
      el.textContent = '✅';

      if (mode === MODE.SPELLING) {
        answerRow.querySelectorAll('button').forEach(b => { b.style.background = '#4ade80'; b.disabled = true; });
        letterPool.querySelectorAll('button').forEach(b => { b.style.background = '#4ade80'; b.disabled = true; });
      }

      const buffs = getBuffs ? getBuffs() : {};
      const reward = rewardForReview(currentWord, quality, buffs);
      sessionRewards = mergeResources(sessionRewards, reward);
      animateFly(el, reward);
      if (reward.star > 0) onStarEarned(reward.star);

      // 星星经济 — 实时累加 + 进度条更新
      if (starEcon) {
        const box = currentWord.box || 1;
        const earned = starEcon.record(box, quality);
        if (earned > 0) {
          flashStarProgress(box);
          setTimeout(() => onStarEarned(earned), 200);
        } else if (box >= 3) {
          updateStarProgress(box);
        }
      }

    } else {
      el.style.background = '#f87171';
      if (mode === MODE.SPELLING) {
        answerRow.querySelectorAll('button').forEach(b => b.style.background = '#f87171');
        letterPool.querySelectorAll('button').forEach(b => b.style.background = '#f87171');
      } else {
        el.classList.add('shake');
      }

      if (correctAnswer) {
        if (mode === MODE.SPELLING) {
          const hint = document.createElement('div');
          hint.style.cssText = 'font-size:30px;color:#4ade80;margin-bottom:8px;text-align:center;font-weight:bold;';
          hint.textContent = `正确答案：${correctAnswer}`;
          spellArea.insertBefore(hint, answerRow);
          setTimeout(() => hint.remove(), 10200);
        } else {
          const correctBtn = Array.from(answerArea.children)
            .find(b => b.textContent === correctAnswer);
          if (correctBtn) correctBtn.style.background = '#4ade80';
        }
      }
    }

    stopSpeaking();

    setTimeout(() => {
      currentIndex++;
      if (currentIndex >= allSessionWords.length) {
        finishSession();
      } else {
        showCurrentQuestion();
      }
    }, isCorrect ? 800 : 10200);
  }

  function finishSession() {
    const totalReward = { ...sessionRewards };
    hide();
    setTimeout(() => onSessionComplete?.(totalReward, allSessionWords, sessionResults), 350);
  }

  // ─── 资源飞入动画 ───
  function animateFly(fromEl, reward) {
    const rect    = fromEl.getBoundingClientRect();
    const startX  = rect.left + rect.width / 2;
    const startY  = rect.top;
    const bar     = document.querySelector('.resource-bar');
    const barRect = bar?.getBoundingClientRect();
    const targetY = barRect ? barRect.top + barRect.height / 2 : 48;

    Object.entries(reward).filter(([, v]) => v > 0).forEach(([res, val], idx) => {
      // 星星走独立大动画，跳过普通飞入
      if (res === 'star') return;

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
    return { gold: '🪙', wood: '🪵', stone: '🪨', star: '⭐' }[res] || res;
  }

  function hide() {
    stopSpeaking();
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
    setToast(t) { toastRef = t; }
  };
}
