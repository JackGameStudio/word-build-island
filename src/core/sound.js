/**
 * sound.js
 * 音效引擎 — Web Audio API 程序化生成 8-bit 像素风音效
 * 零外部音频文件，所有音效实时合成
 */

let ctx = null;
let masterGain = null;
let muted = false;
let masterVolume = 0.5;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function gainNode(vol = 0.3) {
  const g = ctx.createGain();
  g.gain.value = muted ? 0 : vol;
  g.connect(masterGain);
  return g;
}

// ─── 音效生成器 ───

function playTone(freq, duration, type = 'square', vol = 0.15, rampDown = true) {
  ensureCtx();
  const osc = ctx.createOscillator();
  const g = gainNode(vol);
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  const now = ctx.currentTime;
  if (rampDown) g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now);
  osc.stop(now + duration);
}

function playSequence(notes, baseVol = 0.12) {
  ensureCtx();
  const now = ctx.currentTime;
  notes.forEach(([freq, start, dur, type = 'square', vol = baseVol]) => {
    const osc = ctx.createOscillator();
    const g = gainNode(vol);
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(g);
    g.gain.setValueAtTime(vol, now + start);
    g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    osc.start(now + start);
    osc.stop(now + start + dur);
  });
}

function playNoise(duration, vol = 0.08) {
  ensureCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  const g = gainNode(vol);
  src.connect(filter);
  filter.connect(g);
  const now = ctx.currentTime;
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  src.start(now);
  src.stop(now + duration);
}

// ─── 15 个音效定义 ───

const SOUNDS = {
  answer_correct() {
    // 上行琶音 C5→E5→G5→C6
    playSequence([
      [523, 0, 0.08], [659, 0.06, 0.08], [784, 0.12, 0.08], [1047, 0.18, 0.15, 'square', 0.18]
    ], 0.14);
  },

  answer_wrong() {
    // 下行 + 低音蜂鸣
    playSequence([
      [330, 0, 0.12, 'sawtooth', 0.1],
      [220, 0.08, 0.2, 'sawtooth', 0.08],
      [110, 0.16, 0.3, 'triangle', 0.06]
    ]);
  },

  button_click() {
    playTone(880, 0.04, 'square', 0.08, false);
  },

  build_place() {
    // 锤子敲击感：噪声 + 低音
    playNoise(0.06, 0.06);
    playTone(200, 0.12, 'triangle', 0.12);
  },

  build_demolish() {
    playNoise(0.1, 0.06);
    playSequence([
      [300, 0, 0.08, 'sawtooth', 0.08],
      [150, 0.06, 0.15, 'sawtooth', 0.06]
    ]);
  },

  chest_open() {
    // 开箱：短琶音 + 闪亮
    playSequence([
      [523, 0, 0.06], [659, 0.05, 0.06], [784, 0.10, 0.06],
      [1047, 0.15, 0.1], [1319, 0.2, 0.15, 'square', 0.2]
    ], 0.16);
  },

  chest_upgrade() {
    // 升级：快速上行
    playSequence([
      [440, 0, 0.05], [554, 0.04, 0.05], [659, 0.08, 0.05],
      [880, 0.12, 0.05], [1109, 0.16, 0.08], [1319, 0.2, 0.15, 'square', 0.2]
    ], 0.16);
  },

  achievement_unlock() {
    // 成就：三音和弦 + 闪亮尾音
    playSequence([
      [523, 0, 0.1], [659, 0, 0.1], [784, 0, 0.1],
      [1047, 0.12, 0.25, 'square', 0.15],
      [1319, 0.2, 0.3, 'triangle', 0.1]
    ], 0.14);
  },

  level_up() {
    // 升级：庄严上行
    playSequence([
      [262, 0, 0.15, 'triangle', 0.12],
      [330, 0.12, 0.12, 'triangle', 0.12],
      [392, 0.22, 0.12, 'triangle', 0.12],
      [523, 0.32, 0.3, 'square', 0.2]
    ], 0.14);
  },

  pickup_item() {
    // 拾取：清脆叮咚
    playSequence([
      [880, 0, 0.06], [1175, 0.05, 0.1, 'sine', 0.15]
    ]);
  },

  star_earned() {
    // 星星：闪亮上行
    playSequence([
      [659, 0, 0.08, 'sine', 0.12],
      [784, 0.06, 0.08, 'sine', 0.12],
      [1047, 0.12, 0.12, 'sine', 0.15],
      [1319, 0.18, 0.2, 'triangle', 0.12]
    ], 0.16);
  },

  daily_refresh() {
    // 每日刷新：轻快铃铛
    playSequence([
      [784, 0, 0.06, 'sine', 0.12],
      [988, 0.08, 0.06, 'sine', 0.12],
      [1175, 0.16, 0.1, 'sine', 0.14]
    ]);
  },

  streak_fire() {
    // 连续打卡：火焰感
    playSequence([
      [392, 0, 0.08, 'sawtooth', 0.06],
      [523, 0.06, 0.08, 'sawtooth', 0.06],
      [659, 0.12, 0.08, 'sawtooth', 0.06],
      [784, 0.18, 0.15, 'square', 0.12]
    ]);
  },

  tick_income() {
    // 被动收入：金币叮当
    playTone(1319, 0.06, 'sine', 0.06);
    setTimeout(() => playTone(1568, 0.06, 'sine', 0.05), 60);
  },

  bg_music: null // 背景音乐暂不实现（需循环，Web Audio 需额外处理）
};

// ─── 公开 API ───

// 确保 AudioContext 在首次用户交互时创建（浏览器策略要求）
document.addEventListener('click', () => ensureCtx(), { once: true });
document.addEventListener('touchstart', () => ensureCtx(), { once: true });
document.addEventListener('keydown', () => ensureCtx(), { once: true });

export function play(name) {
  if (!ctx) return; // AudioContext 未初始化，跳过（等首次用户交互后生效）
  if (ctx.state === 'suspended') { ensureCtx(); if (ctx.state !== 'running') return; }
  const fn = SOUNDS[name];
  if (!fn) return;
  try {
    fn();
  } catch (e) {
    console.warn(`[sound] play "${name}" failed:`, e.message);
  }
}

export function setVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = masterVolume;
}

export function getVolume() {
  return masterVolume;
}

export function mute() {
  muted = true;
  if (masterGain) masterGain.gain.value = 0;
}

export function unmute() {
  muted = false;
  if (masterGain) masterGain.gain.value = masterVolume;
}

export function isMuted() {
  return muted;
}

export function initSound() {
  ensureCtx();
}
