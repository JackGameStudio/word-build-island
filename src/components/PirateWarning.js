/**
 * PirateWarning.js
 * 海盗事件警告条 — 倒计时 / 战斗中 / 战果
 */

export function createPirateWarning() {
  const bar = document.createElement('div');
  bar.style.cssText = `
    position:absolute;top:48px;left:50%;transform:translateX(-50%);z-index:200;
    padding:8px 16px;border-radius:4px;font-size:12px;font-weight:bold;
    display:none;pointer-events:none;white-space:nowrap;
    text-shadow:1px 1px 0 #000;
  `;

  let currentPhase = 'idle';

  function update(pirateState) {
    const { phase, wave, pirates = [], soldiers = [], waveTimer } = pirateState || {};

    // 无变化则跳过
    if (phase === currentPhase) return;
    currentPhase = phase;

    switch (phase) {
      case 'idle':
        bar.style.display = 'none';
        break;
      case 'warning':
        bar.style.display = 'block';
        bar.style.background = 'rgba(239,68,68,0.85)';
        bar.style.color = '#fff';
        bar.textContent = `⚠️  海盗来袭！第 ${wave} 波 · ${formatTicks(waveTimer)}`;
        setTimeout(() => {
          bar.style.background = 'rgba(239,68,68,0.9)';
        }, 500);
        break;
      case 'combat':
        bar.style.display = 'block';
        bar.style.background = 'rgba(220,38,38,0.9)';
        bar.style.color = '#fff';
        const alive = pirates.filter(p => p.alive).length;
        const aliveSoldiers = soldiers.filter(s => s.hp > 0).length;
        bar.textContent = `⚔️  战斗中！第 ${wave} 波 · 海盗 ×${alive} · 士兵 ×${aliveSoldiers}`;
        break;
      case 'victory':
        bar.style.display = 'block';
        bar.style.background = 'rgba(34,197,94,0.85)';
        bar.style.color = '#fff';
        bar.textContent = `✅ 击退海盗！第 ${wave} 波完成`;
        setTimeout(() => { bar.style.display = 'none'; currentPhase = 'idle'; }, 3000);
        break;
      case 'defeat':
        bar.style.display = 'block';
        bar.style.background = 'rgba(239,68,68,0.9)';
        bar.style.color = '#fff';
        const destroyed = pirateState.buildingsDestroyed?.length || 0;
        bar.textContent = `💀 海盗造成了破坏！${destroyed} 座建筑被毁`;
        setTimeout(() => { bar.style.display = 'none'; currentPhase = 'idle'; }, 4000);
        break;
      default:
        bar.style.display = 'none';
    }
  }

  function formatTicks(ticks) {
    const totalSec = Math.floor(ticks * 18); // 18s/tick
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  return { element: bar, update };
}
