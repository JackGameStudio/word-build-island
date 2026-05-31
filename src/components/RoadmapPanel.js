/**
 * RoadmapPanel.js
 * 双轨 Roadmap — 建筑（左）+ 词汇（右），T0→T4 自下而上
 * show(builtBuildings, vocabulary)
 */

import { BUILDINGS, countLearnedWords } from '../data/buildings.js';

// 词汇里程碑
const VOCAB_MILESTONES = [
  { icon: '🌱', name: '第 1 词', count: 1 },
  { icon: '🌿', name: '10 词', count: 10 },
  { icon: '🌳', name: '50 词', count: 50 },
  { icon: '🏔️', name: '100 词', count: 100 },
  { icon: '🏯', name: '200 词', count: 200 },
  { icon: '🏙️', name: '500 词', count: 500 },
  { icon: '👑', name: '1000 词', count: 1000 }
];

const TIER_STYLES = [
  { label: 'T0 · 开局',   color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
  { label: 'T1 · 起步',   color: '#4ade80', bg: 'rgba(74,222,128,0.06)' },
  { label: 'T2 · 发展',   color: '#60a5fa', bg: 'rgba(96,165,250,0.06)' },
  { label: 'T3 · 繁荣',   color: '#c084fc', bg: 'rgba(192,132,252,0.06)' },
  { label: 'T4 · 传奇',   color: '#fbbf24', bg: 'rgba(251,191,36,0.08)' }
];

export function createRoadmapPanel() {
  let builtIds = [];
  let totalWords = 0;
  let totalStars = 0;

  const overlay = document.createElement('div');
  overlay.className = 'overlay-backdrop';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'slide-panel panel-9slice';
  panel.style.cssText = 'padding:12px;width:440px;max-width:94vw;max-height:85vh;overflow-y:auto;';

  const title = document.createElement('div');
  title.style.cssText = 'text-align:center;font-size:14px;font-weight:700;margin-bottom:10px;';
  title.textContent = '🗺️ 发展路线图';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;gap:12px;';

  // 左列：建筑
  const buildCol = document.createElement('div');
  buildCol.style.cssText = 'flex:1;display:flex;flex-direction:column-reverse;gap:2px;';

  const buildHeader = document.createElement('div');
  buildHeader.style.cssText = 'text-align:center;font-size:11px;font-weight:700;padding:4px 0;border-bottom:2px solid #4ade80;margin-bottom:6px;';
  buildHeader.textContent = '🏗️ 建筑 Roadmap';

  // 右列：词汇
  const vocabCol = document.createElement('div');
  vocabCol.style.cssText = 'flex:1;display:flex;flex-direction:column-reverse;gap:2px;';

  const vocabHeader = document.createElement('div');
  vocabHeader.style.cssText = 'text-align:center;font-size:11px;font-weight:700;padding:4px 0;border-bottom:2px solid #60a5fa;margin-bottom:6px;';
  vocabHeader.textContent = '📖 词汇 Roadmap';

  const buildInner = document.createElement('div');
  buildInner.style.cssText = 'display:flex;flex-direction:column-reverse;';
  const vocabInner = document.createElement('div');
  vocabInner.style.cssText = 'display:flex;flex-direction:column-reverse;';

  buildCol.append(buildHeader, buildInner);
  vocabCol.append(vocabHeader, vocabInner);
  grid.append(buildCol, vocabCol);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-pixel';
  closeBtn.textContent = '✕ 关闭';
  closeBtn.style.cssText = 'width:100%;font-size:12px;margin-top:10px;';
  closeBtn.onclick = hide;

  panel.append(title, grid, closeBtn);
  overlay.appendChild(panel);

  // ─── 渲染 ───
  function render() {
    buildInner.innerHTML = '';
    vocabInner.innerHTML = '';

    // 按 tier 分组建筑
    const tierGroups = {};
    for (const b of BUILDINGS) {
      const t = b.tier ?? 0;
      if (!tierGroups[t]) tierGroups[t] = [];
      tierGroups[t].push(b);
    }

    // 建筑列：从 T0 到 T4（column-reverse 让它自下而上）
    for (let t = 0; t <= 4; t++) {
      const group = tierGroups[t] || [];
      if (t > 0 && group.length > 0) {
        const sep = document.createElement('div');
        sep.style.cssText = `text-align:center;font-size:10px;font-weight:700;color:${TIER_STYLES[t]?.color || '#666'};padding:4px 0;margin:4px 0;border-top:1px dashed #444;`;
        sep.textContent = TIER_STYLES[t]?.label || `T${t}`;
        buildInner.appendChild(sep);
      }

      for (const b of group) {
        const built = builtIds.includes(b.id);
        const row = createBuildRow(b, built);
        buildInner.appendChild(row);
      }
    }

    // 词汇列
    for (let i = 0; i < VOCAB_MILESTONES.length; i++) {
      const m = VOCAB_MILESTONES[i];
      const achieved = totalWords >= m.count;
      const row = createVocabRow(m, achieved);
      vocabInner.appendChild(row);
    }
  }

  function createBuildRow(building, built) {
    const row = document.createElement('div');
    const canAfford = totalStars >= (building.starRequired || 0) && totalWords >= (building.wordRequired || 0);
    const bg = built ? 'rgba(74,222,128,0.1)' : canAfford ? TIER_STYLES[building.tier]?.bg || 'transparent' : 'transparent';
    row.style.cssText = `
      display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:6px;
      background:${bg};font-size:10px;min-height:36px;
      opacity:${built ? '1' : canAfford ? '0.85' : '0.45'};
    `;

    const icon = document.createElement('span');
    icon.style.cssText = `font-size:16px;flex-shrink:0;${built ? '' : 'filter:grayscale(0.5);'}`;
    icon.textContent = building.icon;
    if (built) icon.title = '已建造';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;line-height:1.3;display:flex;align-items:center;';

    const name = document.createElement('div');
    name.style.cssText = `font-weight:700;${built ? 'color:var(--color-correct);' : ''}`;
    name.textContent = building.name;

    info.append(name);

    const status = document.createElement('span');
    status.style.cssText = `flex-shrink:0;font-size:14px;${built ? '' : 'filter:grayscale(0.3);opacity:0.7;'}`;
    status.textContent = built ? '✅' : '⭐';

    row.append(icon, info, status);
    return row;
  }

  function createVocabRow(milestone, achieved) {
    const row = document.createElement('div');
    row.style.cssText = `
      display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:6px;
      background:${achieved ? 'rgba(96,165,250,0.1)' : 'transparent'};
      font-size:10px;min-height:36px;
      opacity:${achieved ? '1' : '0.45'};
    `;

    const icon = document.createElement('span');
    icon.style.cssText = `font-size:16px;flex-shrink:0;${achieved ? '' : 'filter:grayscale(0.5);'}`;
    icon.textContent = milestone.icon;

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;line-height:1.3;';

    const name = document.createElement('div');
    name.style.cssText = `font-weight:700;${achieved ? 'color:#60a5fa;' : ''}`;
    name.textContent = milestone.name;

    const cond = document.createElement('div');
    cond.style.cssText = 'color:var(--color-muted);font-size:9px;';
    const pct = Math.min(100, Math.round((totalWords / milestone.count) * 100));
    const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
    cond.textContent = `${bar} ${totalWords}/${milestone.count}`;

    info.append(name, cond);

    const status = document.createElement('span');
    status.style.cssText = `flex-shrink:0;font-size:14px;${achieved ? '' : 'filter:grayscale(0.3);opacity:0.7;'}`;
    status.textContent = achieved ? '✅' : '⭐';

    row.append(icon, info, status);
    return row;
  }

  function show(builtBuildings, vocabulary) {
    builtIds = (builtBuildings || []).map(b => b.id);
    totalWords = countLearnedWords(vocabulary || []);
    totalStars = (builtBuildings || []).reduce((sum, b) => {
      const def = BUILDINGS.find(d => d.id === b.id);
      return sum + (def?.starRequired || 0);
    }, 0);

    overlay.style.display = 'block';
    overlay.style.backgroundColor = 'var(--color-overlay)';
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      panel.classList.add('open');
    });
    render();
  }

  function hide() {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  return { element: overlay, show, hide };
}
