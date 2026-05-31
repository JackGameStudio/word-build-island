/**
 * tts.js
 * TTS 模块 — 使用浏览器 Web Speech API 朗读单词
 * 支持中英文朗读，无需后端
 */

let voiceLoaded = false;
let preferredVoice = null;

// 延迟加载语音列表（部分浏览器需要等待）
function ensureVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      pickVoice(voices);
      resolve();
    } else {
      speechSynthesis.onvoiceschanged = () => {
        const v = speechSynthesis.getVoices();
        pickVoice(v);
        resolve();
      };
    }
  });
}

function pickVoice(voices) {
  // 优先选英文语音
  preferredVoice = voices.find(v => v.lang.startsWith('en') && v.localService) ||
                   voices.find(v => v.lang.startsWith('en')) ||
                   voices.find(v => v.lang.startsWith('zh')) ||
                   voices[0] || null;
  voiceLoaded = true;
}

/**
 * 朗读英文单词
 * @param {string} text - 要朗读的文本
 * @param {object} [opts] - 选项 { rate, pitch, lang }
 * @returns {Promise}
 */
export function speakEnglish(text, opts = {}) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }

    // 取消当前朗读
    speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = opts.lang || 'en-US';
    utter.rate = opts.rate || 0.85;   // 稍慢，适合背单词
    utter.pitch = opts.pitch || 1;
    utter.volume = opts.volume || 1;

    if (preferredVoice) utter.voice = preferredVoice;

    utter.onend = () => resolve();
    utter.oneror = () => resolve();

    speechSynthesis.speak(utter);
  });
}

/**
 * 朗读中文释义
 * @param {string} text - 中文文本
 */
export function speakChinese(text) {
  return speakEnglish(text, { lang: 'zh-CN', rate: 0.9 });
}

/**
 * 朗读单词 + 释义（顺序：先英文，停 300ms，再中文）
 * @param {{ word:string, meaning:string }} entry
 */
export async function speakWord(entry) {
  await speakEnglish(entry.word);
  await new Promise(r => setTimeout(r, 350));
  await speakChinese(entry.meaning);
}

/**
 * 停止朗读
 */
export function stopSpeaking() {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
}

// 初始化时尝试加载语音
ensureVoices();
