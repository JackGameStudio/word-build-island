/**
 * StreakPanel.js
 * 连续打卡面板 — 像素风滑出面板，展示里程碑奖励
 */

const RES_ICONS = { gold: '🪙', star: '⭐' };

export const STREAK_MILESTONES = [
  { day: 1,   reward: { gold: 5 } },
  { day: 3,   reward: { gold: 20, star: 1 } },
  { day: 7,   reward: { gold: 50, star: 2 } },
  { day: 14,  reward: { gold: 100, star: 3 } },
  { day: 30,  reward: { gold: 200, star: 5 } },
  { day: 60,  reward: { gold: 500, star: 10 } },
  { day: 100, reward: { gold: 1000, star: 20 } },
];

export function createStreakPanel() {
  let currentStreak = 0;
  let claimedMilestones = [];
  let onClaimMilestone = null;

  // ─── DOM ───
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'slide-panel panel-9slice';
  panel.style.cssText = 'padding:16px;overflow-y:auto;';

  // 标题区 + 天数
  const headerDiv = document.createElement('div');
  headerDiv.style.cssText = 'text-align:center;margin-bottom:12px;';

  const titleText = document.createElement('div');
  titleText.style.cssText = 'font-size:14px;margin-bottom:4px;';
  titleText.textContent = '🔥 连续打卡';

  const streakCount = document.createElement('div');
  streakCount.className = 'streak-count';
  streakCount.textContent = '0';

  const streakLabel = document.createElement('div');
  streakLabel.style.cssText = 'font-size:11px;color:var(--color-muted);margin-top:2px;';
  streakLabel.textContent = '天';

  headerDiv.append(titleText, streakCount, streakLabel);

  // 里程碑网格
  const grid = document.createElement('div');
  grid.className = 'streak-milestone-grid';

  // 鼓励文字
  const encouragement = document.createElement('div');
  encouragement.className = 'streak-encouragement';

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-pixel';
  closeBtn.textContent = '✕ 关闭';
  closeBtn.style.cssText = 'margin-top:12px;width:100%;font-size:12px;';

  panel.append(headerDiv, grid, encouragement, closeBtn);
  overlay.appendChild(panel);

  // ─── 鼓励文字 ───
  function getEncouragement(streak) {
    if (streak >= 100) return '传奇打卡王！你已经超越了99%的人！';
    if (streak >= 60) return '你是真正的坚持者！继续冲刺100天！';
    if (streak >= 30) return '一个月达成！习惯已经刻入骨子里！';
    if (streak >= 14) return '两周坚持！你已经超越了大多数人！';
    if (streak >= 7) return '一周达成！势不可挡！';
    if (streak >= 3) return '好的开始！继续保持！';
    if (streak >= 1) return '每日打卡，积少成多！';
    return '今天开始打卡，开启你的岛屿之旅！';
  }

  // ─── 渲染 ───
  function render() {
    grid.innerHTML = '';

    STREAK_MILESTONES.forEach((ms) => {
      const claimed = claimedMilestones.includes(ms.day);
      const reached = currentStreak >= ms.day;
      const isDay1 = ms.day === 1;
      const canClaim = reached && !claimed && !isDay1;

      const card = document.createElement('div');
      card.className = 'streak-milestone-card';

      if (claimed) card.classList.add('streak-milestone--claimed');
      else if (canClaim) card.classList.add('streak-milestone--claimable');
      else if (!reached) card.classList.add('streak-milestone--locked');
      else card.classList.add('streak-milestone--claimed'); // day 1 auto

      // 图标
      const iconDiv = document.createElement('div');
      iconDiv.className = 'streak-milestone-icon';
      if (claimed) {
        iconDiv.textContent = '✓';
        iconDiv.style.color = '#4ade80';
      } else if (canClaim) {
        iconDiv.textContent = '🔥';
      } else {
        iconDiv.textContent = '🔒';
      }

      // 天数
      const dayLabel = document.createElement('div');
      dayLabel.className = 'streak-milestone-day';
      dayLabel.textContent = `${ms.day}天`;

      // 奖励
      const rewardDiv = document.createElement('div');
      rewardDiv.className = 'streak-milestone-reward';
      rewardDiv.innerHTML = Object.entries(ms.reward)
        .map(([k, v]) => `${RES_ICONS[k] || k}+${v}`)
        .join(' ');

      card.append(iconDiv, dayLabel, rewardDiv);

      // 进度条（未到达时）
      if (!reached) {
        const progressOuter = document.createElement('div');
        progressOuter.className = 'streak-milestone-progress-outer';
        const pct = Math.round((currentStreak / ms.day) * 100);
        const progressInner = document.createElement('div');
        progressInner.className = 'streak-milestone-progress-inner';
        progressInner.style.width = `${Math.max(2, pct)}%`;
        progressOuter.appendChild(progressInner);
        card.appendChild(progressOuter);
      }

      // 领取按钮
      if (canClaim) {
        const claimBtn = document.createElement('button');
        claimBtn.className = 'btn-pixel streak-claim-btn';
        claimBtn.textContent = '领取';
        claimBtn.onclick = (e) => {
          e.stopPropagation();
          card.classList.add('streak-milestone--just-claimed');
          setTimeout(() => {
            onClaimMilestone?.(ms);
          }, 450);
        };
        card.appendChild(claimBtn);
      }

      grid.appendChild(card);
    });

    streakCount.textContent = currentStreak;
    encouragement.textContent = getEncouragement(currentStreak);
  }

  // ─── API ───
  function show() {
    overlay.style.display = 'block';
    overlay.classList.add('visible');
    requestAnimationFrame(() => {
      panel.classList.add('open');
      render();
    });
  }

  function hide() {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }

  /**
   * @param {number} streak - 当前连续打卡天数
   * @param {number[]} claimed - 已领取里程碑 day 列表
   */
  function update(streak, claimed) {
    currentStreak = streak;
    claimedMilestones = claimed || [];
    if (overlay.style.display !== 'none') {
      render();
    }
  }

  function setOnClaimMilestone(fn) {
    onClaimMilestone = fn;
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
    setOnClaimMilestone
  };
}