/**
 * NpcQuestPanel.js
 * NPC 任务弹窗 UI — 支持 offer（接取）和 claim（领取）两阶段
 */

export function createNpcQuestPanel() {
  const element = document.createElement('div');
  element.style.cssText = `
    display:none; position:fixed; top:0; left:0; right:0; bottom:0;
    background:rgba(0,0,0,0.55); z-index:200;
    align-items:center; justify-content:center;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background:var(--color-surface,#2a2a3e);
    border:2px solid #555; border-radius:12px;
    padding:24px 28px; min-width:280px; max-width:360px;
    text-align:center; color:#eee;
  `;
  element.appendChild(panel);

  /* ── 各 UI 元素 ── */
  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:8px;';
  panel.appendChild(nameEl);

  const descEl = document.createElement('div');
  descEl.style.cssText = 'font-size:13px;color:#bbb;margin-bottom:16px;line-height:1.5;';
  panel.appendChild(descEl);

  /* 进度条 */
  const progressContainer = document.createElement('div');
  progressContainer.style.cssText = `
    background:#333; border-radius:6px; height:14px; margin-bottom:6px;
    overflow:hidden; position:relative;
  `;
  const progressFill = document.createElement('div');
  progressFill.style.cssText = `
    background:linear-gradient(90deg,#27ae60,#2ecc71); height:100%;
    border-radius:6px; transition:width 300ms ease; width:0%;
  `;
  progressContainer.appendChild(progressFill);
  panel.appendChild(progressContainer);

  const progressText = document.createElement('div');
  progressText.style.cssText = 'font-size:11px;color:#999;margin-bottom:16px;';
  panel.appendChild(progressText);

  /* 奖励 */
  const rewardEl = document.createElement('div');
  rewardEl.style.cssText = 'font-size:12px;color:#ffd700;margin-bottom:16px;';
  panel.appendChild(rewardEl);

  /* 按钮行 */
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:10px; justify-content:center;';
  panel.appendChild(btnRow);

  const primaryBtn = document.createElement('button');
  primaryBtn.className = 'btn-pixel';
  primaryBtn.style.cssText = 'padding:8px 20px;font-size:13px;';
  btnRow.appendChild(primaryBtn);

  const secondaryBtn = document.createElement('button');
  secondaryBtn.className = 'btn-pixel';
  secondaryBtn.style.cssText = 'padding:8px 20px;font-size:13px;background-image:url("/src/assets/images/btn-hover.png");';
  btnRow.appendChild(secondaryBtn);

  /* ── 内部状态 ── */
  let onAcceptCb = null;
  let onDeclineCb = null;
  let onClaimCb = null;
  let onAbandonCb = null;
  let progressGetter = null; // () => { pct, label }

  function getTaskDescription(quest) {
    if (!quest) return '';
    if (quest.type === 'build') {
      return `请建造一座 ${quest.target.buildingName || quest.target.buildingId}`;
    }
    if (quest.type === 'vocab') {
      return `请学习 ${quest.target.count} 个新单词`;
    }
    if (quest.type === 'collect') {
      const NAMES = { gold: '金币', wood: '木材', stone: '石材' };
      return `请收集 ${quest.target.amount} ${NAMES[quest.target.resource] || quest.target.resource}`;
    }
    return '';
  }

  function getRewardText(reward) {
    if (!reward) return '';
    const ICONS = { gold: '🪙', wood: '🪵', stone: '🪨', star: '⭐' };
    return Object.entries(reward)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${ICONS[k] || k}+${v}`)
      .join('  ');
  }

  /* ── offer 阶段 ── */
  function renderOfferPhase(npcData) {
    const q = npcData.quest;
    nameEl.textContent = npcData.name || '村民';
    descEl.textContent = getTaskDescription(q);
    rewardEl.textContent = '奖励：' + getRewardText(q?.reward);

    // 进度显示
    if (progressGetter) {
      const info = progressGetter();
      const pct = Math.min(100, info.pct || 0);
      progressFill.style.width = `${pct}%`;
      progressFill.style.background = 'linear-gradient(90deg,#3498db,#2980b9)';
      progressText.textContent = info.label || `${Math.round(pct)}%`;
    } else {
      progressFill.style.width = '0%';
      progressText.textContent = '0 / ?';
    }
    progressContainer.style.display = 'block';
    progressText.style.display = 'block';

    primaryBtn.textContent = '接';
    primaryBtn.onclick = () => { if (onAcceptCb) onAcceptCb(); };

    secondaryBtn.textContent = '不接';
    secondaryBtn.style.display = 'inline-block';
    secondaryBtn.onclick = () => { if (onDeclineCb) onDeclineCb(); };
  }

  /* ── claim 阶段 ── */
  function renderClaimPhase(npcData) {
    nameEl.textContent = '任务完成！';
    descEl.textContent = getTaskDescription(npcData.quest);
    rewardEl.textContent = '奖励：' + getRewardText(npcData.quest?.reward);

    progressFill.style.width = '100%';
    progressFill.style.background = 'linear-gradient(90deg,#27ae60,#2ecc71)';
    progressText.textContent = '已完成！';
    progressContainer.style.display = 'block';
    progressText.style.display = 'block';

    primaryBtn.textContent = '领取';
    primaryBtn.onclick = () => { if (onClaimCb) onClaimCb(); };

    secondaryBtn.style.display = 'none';
  }

  /* ── progress 阶段（进行中）── */
  function renderProgressPhase(npcData) {
    const q = npcData.quest;
    nameEl.textContent = npcData.name || '村民';
    descEl.textContent = getTaskDescription(q);
    rewardEl.textContent = '奖励：' + getRewardText(q?.reward);

    if (progressGetter) {
      const info = progressGetter();
      const pct = Math.min(100, info.pct || 0);
      progressFill.style.width = `${pct}%`;
      progressFill.style.background = 'linear-gradient(90deg,#f39c12,#e67e22)';
      progressText.textContent = `进行中 · ${info.label || `${Math.round(pct)}%`}`;
    } else {
      progressFill.style.width = '0%';
      progressText.textContent = '进行中';
    }
    progressContainer.style.display = 'block';
    progressText.style.display = 'block';

    primaryBtn.style.display = 'none';

    secondaryBtn.textContent = '放弃任务';
    secondaryBtn.style.display = 'inline-block';
    secondaryBtn.onclick = () => { if (onAbandonCb) onAbandonCb(); };
  }

  /* ═══════════════════════════════════════════
     公开 API
     ═══════════════════════════════════════════ */

  /**
   * 显示面板
   * @param {object}   npcData    - NPC 数据对象（含 name, quest）
   * @param {string}   phase      - 'offer' | 'claim' | 'progress'
   * @param {Function} onAccept    - offer 阶段「接」回调
   * @param {Function} onDecline   - offer 阶段「不接」回调
   * @param {Function} onClaim     - claim 阶段「领取」回调
   * @param {Function} onAbandon   - progress 阶段「放弃任务」回调
   * @param {Function} getProgress - () => { pct, label }  可选进度获取函数
   */
  function show(npcData, phase, onAccept, onDecline, onClaim, onAbandon, getProgress) {
    onAcceptCb = onAccept || null;
    onDeclineCb = onDecline || null;
    onClaimCb = onClaim || null;
    onAbandonCb = onAbandon || null;
    progressGetter = getProgress || null;

    if (phase === 'offer') {
      renderOfferPhase(npcData);
    } else if (phase === 'claim') {
      renderClaimPhase(npcData);
    } else if (phase === 'progress') {
      renderProgressPhase(npcData);
    }

    element.style.display = 'flex';
  }

  function hide() {
    element.style.display = 'none';
    onAcceptCb = null;
    onDeclineCb = null;
    onClaimCb = null;
    onAbandonCb = null;
    progressGetter = null;
    primaryBtn.style.display = 'inline-block';
  }

  element.addEventListener('click', (e) => {
    if (e.target === element) hide();
  });

  return { element, show, hide };
}
