/**
 * DailyTasksPanel.js
 * 每日任务面板 — 像素风滑出面板，显示 3 个今日任务
 */

import { getTaskById, checkTaskComplete } from '../data/tasks.js';

const RES_ICONS = { gold: '🪙', wood: '🪵', stone: '🪨', star: '⭐' };

export function createDailyTasksPanel() {
  let currentTasks = [];
  let currentProgress = {};
  let currentClaimed = [];
  let onClaimReward = null;

  // ─── DOM 结构 ───
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'slide-panel panel-9slice';
  panel.style.cssText = 'padding:16px;overflow-y:auto;';

  // 标题
  const title = document.createElement('div');
  title.style.cssText = 'text-align:center;font-size:14px;margin-bottom:12px;';
  title.textContent = '📋 每日任务';

  // 任务列表
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  // 全部完成提示（默认隐藏）
  const allDoneBanner = document.createElement('div');
  allDoneBanner.style.cssText = `
    display:none;
    text-align:center;
    padding:10px;
    margin-bottom:12px;
    background:rgba(74,222,128,0.15);
    border:2px solid #4ade80;
  `;
  allDoneBanner.innerHTML = '<div style="font-size:18px;">🎉 全部完成！</div><div style="font-size:11px;color:var(--color-muted);">额外奖励：<span style="color:#FFD700;">⭐ +1</span></div>';

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-pixel';
  closeBtn.textContent = '✕ 关闭';
  closeBtn.style.cssText = 'margin-top:12px;width:100%;font-size:12px;';

  panel.append(title, allDoneBanner, list, closeBtn);
  overlay.appendChild(panel);

  // ─── 渲染 ───
  function render() {
    list.innerHTML = '';
    let allClaimed = true;

    currentTasks.forEach(taskId => {
      const task = getTaskById(taskId);
      if (!task) return;

      const { done, current } = checkTaskComplete(task, currentProgress);
      const claimed = currentClaimed.includes(taskId);

      if (!claimed) allClaimed = false;

      const card = document.createElement('div');
      card.style.cssText = `
        padding:10px;
        background:${claimed ? 'rgba(74,222,128,0.12)' : done ? 'rgba(255,215,0,0.08)' : 'rgba(0,0,0,0.2)'};
        border:2px solid ${claimed ? '#4ade80' : done ? '#ffd700' : '#444'};
      `;

      // 任务名称 + 说明
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
      header.innerHTML = `
        <div>
          <div style="font-size:12px;font-weight:700;">${task.name}</div>
          <div style="font-size:10px;color:var(--color-muted);">${task.description}</div>
        </div>
        <span style="font-size:16px;">${claimed ? '✓' : done ? '✅' : ''}</span>
      `;

      // 进度条
      const barOuter = document.createElement('div');
      barOuter.style.cssText = `
        height:10px;
        background:rgba(0,0,0,0.3);
        border:1px solid #555;
        margin-bottom:6px;
        overflow:hidden;
      `;
      const pct = Math.min(100, Math.round((current / task.goal) * 100));
      const barInner = document.createElement('div');
      barInner.style.cssText = `
        width:${pct}%;
        height:100%;
        background:${done ? '#4ade80' : '#ffd700'};
        transition:width 300ms ease;
      `;
      barOuter.appendChild(barInner);

      // 进度文字 + 奖励
      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:10px;';

      const progressText = document.createElement('span');
      progressText.style.cssText = 'color:var(--color-muted);';
      progressText.textContent = `${current}/${task.goal}`;

      const rewardText = document.createElement('span');
      rewardText.innerHTML = Object.entries(task.reward)
        .map(([k, v]) => `${RES_ICONS[k] || k} +${v}`)
        .join(' ');

      footer.appendChild(progressText);

      // 操作按钮
      if (claimed) {
        const claimedLabel = document.createElement('span');
        claimedLabel.textContent = '✓ 已领取';
        claimedLabel.style.cssText = 'color:#4ade80;';
        footer.appendChild(claimedLabel);
      } else if (done) {
        const claimBtn = document.createElement('button');
        claimBtn.className = 'btn-pixel';
        claimBtn.textContent = '领取';
        claimBtn.style.cssText = 'font-size:10px;padding:2px 8px;min-width:auto;';
        claimBtn.onclick = (e) => {
          e.stopPropagation();
          card.classList.add('daily-task--just-claimed');
          setTimeout(() => {
            onClaimReward?.(taskId);
          }, 450);
        };
        footer.appendChild(claimBtn);
      } else {
        footer.appendChild(rewardText);
      }

      card.append(header, barOuter, footer);
      list.appendChild(card);
    });

    // 全部完成且全领取
    if (allClaimed && currentTasks.length === 3) {
      allDoneBanner.style.display = 'block';
    } else {
      allDoneBanner.style.display = 'none';
    }
  }

  function show() {
    overlay.style.display = 'block';
    overlay.classList.add('visible');
    requestAnimationFrame(() => panel.classList.add('open'));
    render();
  }

  function hide() {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }

  /**
   * 更新面板数据
   * @param {string[]} tasks - 今日任务 id 列表
   * @param {Record<string, number>} progress - 进度对象
   * @param {string[]} claimed - 已领取的任务 id 列表
   */
  function update(tasks, progress, claimed) {
    currentTasks = tasks;
    currentProgress = progress;
    currentClaimed = claimed;
    if (overlay.style.display !== 'none') {
      render();
    }
  }

  function setOnClaimReward(fn) {
    onClaimReward = fn;
  }

  closeBtn.onclick = hide;
  overlay.onclick = (e) => {
    if (e.target === overlay) hide();
  };

  return {
    element: overlay,
    show,
    hide,
    update,
    setOnClaimReward
  };
}