/**
 * AchievementsPanel.js
 * 成就面板 — 查看所有成就及解锁状态
 */

import { ACHIEVEMENTS } from '../data/achievements.js';

export function createAchievementsPanel() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'slide-panel panel-9slice';
  panel.style.cssText = 'padding:16px;overflow-y:auto;';

  const title = document.createElement('div');
  title.style.cssText = 'text-align:center;font-size:14px;margin-bottom:12px;';
  title.textContent = '🏆 成就';

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-pixel';
  closeBtn.textContent = '✕ 关闭';
  closeBtn.style.cssText = 'margin-top:12px;width:100%;font-size:12px;';

  panel.append(title, list, closeBtn);
  overlay.appendChild(panel);

  function render(unlockedIds = []) {
    list.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
      const row = document.createElement('div');
      const isUnlocked = unlockedIds.includes(a.id);
      row.style.cssText = `
        display:flex;align-items:center;gap:8px;
        padding:8px;border-radius:4px;
        background:${isUnlocked ? 'rgba(74,222,128,0.1)' : 'rgba(0,0,0,0.2)'};
        opacity:${isUnlocked ? 1 : 0.5};
      `;

      const icon = document.createElement('span');
      icon.textContent = a.icon;
      icon.style.fontSize = '20px';

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;';
      info.innerHTML = `
        <div style="font-size:12px;">${a.name} ${isUnlocked ? '✅' : '🔒'}</div>
        <div style="font-size:10px;color:var(--color-muted);">${a.desc}</div>
      `;

      row.append(icon, info);
      list.appendChild(row);
    });
  }

  function show(unlockedIds) {
    render(unlockedIds);
    overlay.style.display = 'block';
    overlay.classList.add('visible');
    requestAnimationFrame(() => panel.classList.add('open'));
  }

  function hide() {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }

  closeBtn.onclick = hide;
  overlay.onclick = (e) => {
    if (e.target === overlay) hide();
  };

  return { element: overlay, show, hide };
}
