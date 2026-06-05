/**
 * TutorialGuide.js — 精灵气泡引导
 * IslandMaster.png 精灵 + 右侧对话气泡（箭头指向角色）
 * 遮罩 + 按钮高亮 + 逐字打字 + 事件驱动
 * 精灵气泡固定在屏幕下半部，不随按钮移动
 */

const STEPS = [
  { text: '我是这座岛的守护星灵。只要学习词语，星之力就会回流到岛上。来试试？', highlight: 'vocabBtn' },
  { text: '就是这样！ 星之力回来了！还赚到金币！建一个伐木场吧。点建造，在岛上找块空地放下就好。', highlight: 'buildBtn' },
  { text: '就是这样！开始建吧！你问哪里能收集更多星之力 ？写在《星图》里，打开看看吧！', highlight: 'roadmapBtn' },
];

export function createTutorialGuide(spriteUrl, getRefs) {
  let step = -1;
  let visible = false;
  let typing = false;
  let typeTimer = null;
  let charIdx = 0;
  let currentFullText = '';
  let highlightEl = null;

  // CSS
  if (!document.getElementById('tut-style')) {
    const s = document.createElement('style');
    s.id = 'tut-style';
    s.textContent = `
      @keyframes tut-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      @keyframes tut-glow { 0%,100%{box-shadow:0 0 0 0 rgba(167,139,250,0)} 50%{box-shadow:0 0 0 8px rgba(167,139,250,0.45)} }
      .tut-glow { animation:tut-glow 1.5s ease-in-out infinite; border-radius:8px; }
    `;
    document.head.appendChild(s);
  }

  // ─── 遮罩（透明，仅拦截点击）───
  const mask = document.createElement('div');
  mask.style.cssText = 'display:none;position:fixed;inset:0;z-index:100;background:transparent;cursor:default;';
  mask.addEventListener('click', handleClick);

  // ─── 容器（固定：屏幕下半部居中）───
  const container = document.createElement('div');
  container.style.cssText = `
    position:fixed; bottom:130px; left:50%; z-index:101;
    display:none; align-items:flex-end; gap:0;
    pointer-events:none;
    filter:drop-shadow(0 4px 20px rgba(0,0,0,0.5));
    transition:opacity 0.12s; opacity:0;
    transform:translateX(-50%);
  `;
  mask.appendChild(container);

  // ─── 精灵 ───
  const spriteEl = document.createElement('img');
  spriteEl.src = spriteUrl;
  spriteEl.style.cssText = 'width:120px;height:auto;flex-shrink:0;animation:tut-bounce 2s ease-in-out infinite;';

  // ─── 气泡 ───
  const bubble = document.createElement('div');
  bubble.style.cssText = `
    position:relative;
    background:#1e1b2e; color:#e2e8f0;
    border:2px solid #a78bfa;
    border-radius:14px;
    padding:10px 16px;
    width:220px; max-width:340px;
    font-size:13px; line-height:1.5;
    pointer-events:auto; flex-shrink:0;
    margin-left:-6px;
  `;

  const arrow = document.createElement('div');
  arrow.style.cssText = `
    position:absolute; left:-10px; bottom:45px;
    width:0; height:0;
    border-top:8px solid transparent;
    border-bottom:8px solid transparent;
    border-right:10px solid #a78bfa;
  `;
  bubble.appendChild(arrow);

  const arrowInner = document.createElement('div');
  arrowInner.style.cssText = `
    position:absolute; left:-7px; bottom:46px;
    width:0; height:0;
    border-top:7px solid transparent;
    border-bottom:7px solid transparent;
    border-right:9px solid #1e1b2e;
  `;
  bubble.appendChild(arrowInner);

  const textEl = document.createElement('div');
  textEl.style.cssText = 'min-height:78px;';
  bubble.appendChild(textEl);

  const hint = document.createElement('div');
  hint.style.cssText = 'color:#a78bfa;font-size:11px;margin-top:6px;opacity:0;text-align:center;';
  bubble.appendChild(hint);

  container.append(spriteEl, bubble);
  document.body.appendChild(mask);

  // ─── 高亮 ───
  function clearGlow() {
    if (highlightEl) {
      highlightEl.classList.remove('tut-glow');
      highlightEl = null;
    }
  }
  function setGlow(sel) {
    clearGlow();
    const target = getRefs()[sel];
    if (target) {
      highlightEl = target;
      target.classList.add('tut-glow');
    }
  }

  // ─── 打字 ───
  function stopTyping() {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    typing = false;
  }
  function startTyping() {
    stopTyping();
    charIdx = 0;
    textEl.textContent = '';
    typing = true;
    hint.style.opacity = '0';
    typeTimer = setInterval(() => {
      if (charIdx >= currentFullText.length) {
        stopTyping();
        hint.textContent = '点击闪烁按钮继续';
        hint.style.opacity = '0.8';
        return;
      }
      textEl.textContent = currentFullText.slice(0, charIdx + 1);
      charIdx++;
    }, 35);
  }

  function handleClick(e) {
    if (!visible) return;
    if (typing) {
      stopTyping();
      textEl.textContent = currentFullText;
      typing = false;
      return;
    }
    if (!highlightEl || !e) return;
    const r = highlightEl.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      const target = highlightEl;
      stopTyping();
      visible = false;
      container.style.opacity = '0';
      clearGlow();
      mask.style.display = 'none';
      container.style.display = 'none';
      target.click();
    }
  }

  // ─── 显隐 ───
  function show(stepIdx) {
    if (stepIdx >= STEPS.length || stepIdx <= step) return;
    step = stepIdx;
    const s = STEPS[stepIdx];
    currentFullText = s.text;
    visible = true;

    stopTyping();
    textEl.textContent = '';
    hint.style.opacity = '0';

    mask.style.display = 'block';
    container.style.display = 'flex';
    setGlow(s.highlight);

    requestAnimationFrame(() => {
      container.style.opacity = '1';
      setTimeout(startTyping, 300);
    });
  }

  function hide() {
    stopTyping();
    visible = false;
    container.style.opacity = '0';
    clearGlow();

    setTimeout(() => {
      if (!visible) {
        mask.style.display = 'none';
        container.style.display = 'none';
      }
    }, 250);
  }

  return { show, hide };
}
