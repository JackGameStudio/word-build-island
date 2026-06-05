/**
 * vocab-engine.js
 * SM-2 间隔重复算法 + Leitner 5盒逻辑
 * 从 LearningIsFun 迁移，精简适配 Word Island Builder
 */

import { WORD_BANK } from '../data/vocabulary.js';
import { REVIEW_INTERVALS } from '../data/constants.js';

export function initVocabulary() {
  const seen = new Set();
  return WORD_BANK.filter(w => {
    const key = `${w.word}|${w.meaning}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(w => ({
    ...w,
    box: 1,
    ef: 1.0,
    nextReview: null,
    learnedAt: null,
    timesReviewed: 0,
    timesCorrect: 0
  }));
}

export function getDueWords(vocab, now = Date.now()) {
  return vocab.filter(w => w.nextReview === null || w.nextReview <= now);
}

export function gradeWord(word, quality, now = Date.now()) {
  let newEf = word.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEf = Math.max(1.0, newEf);

  if (quality < 3) {
    return {
      ...word,
      box: quality === 0 ? 1 : Math.max(1, word.box - 1),
      nextReview: quality === 0 ? null : now + 86400000,
      ef: newEf,
      learnedAt: word.learnedAt || now,
      timesReviewed: word.timesReviewed + 1
    };
  }

  const newBox = Math.min(5, word.box + 1);
  const adjustedDays = Math.round(REVIEW_INTERVALS[newBox - 1] * newEf);
  return {
    ...word,
    box: newBox,
    nextReview: now + adjustedDays * 86400000,
    ef: newEf,
    learnedAt: word.learnedAt || now,
    timesReviewed: word.timesReviewed + 1,
    timesCorrect: word.timesCorrect + 1
  };
}

export function getBoxStats(vocab) {
  const stats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, total: vocab.length };
  vocab.forEach(w => { stats[w.box] = (stats[w.box] || 0) + 1; });
  return stats;
}

export function getQuizOptions(correctWord, vocab) {
  const others = vocab
    .filter(w => w.word !== correctWord.word)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(w => w.meaning);
  const options = [correctWord.meaning, ...others];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

export function getWordOptions(correctWord, vocab) {
  const others = vocab
    .filter(w => w.word !== correctWord.word && !w.word.startsWith('test_'))
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(w => w.word);
  const options = [correctWord.word, ...others];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}