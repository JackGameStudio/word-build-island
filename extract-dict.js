/**
 * extract-dict.js
 * 从 LearningIsFun dictionary-api.js 提取完整词库
 * 输出 WORD_BANK 格式的 vocabulary.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const srcPath = 'C:/Users/jack/.qclaw/workspace/learningisfun/js/dictionary-api.js';
const outPath = 'C:/Users/jack/.qclaw/workspace/word-island-builder/src/data/vocabulary.js';

let content = fs.readFileSync(srcPath, 'utf8');

// 提取所有 'word': 'meaning' 对
// 支持值中包含中文标点、逗号等
const re = /'([a-z]+)'\s*:\s*'([^']*)'/g;
const entries = [];
let m;
while ((m = re.exec(content)) !== null) {
  entries.push({ word: m[1], meaning: m[2] });
}

console.log(`Extracted ${entries.length} words`);

// 生成 vocabulary.js
const header = `/**
 * vocabulary.js
 * 完整词库 — 从 LearningIsFun 词典自动生成 (~2800+ 词)
 * 每行格式: { word, meaning }
 */

export const WORD_BANK = [`;

const items = entries.map(e => `  { word: "${e.word}", meaning: "${e.meaning}" }`);

const footer = `
];
`;

const output = header + '\n' + items.join(',\n') + footer;

fs.writeFileSync(outPath, output, 'utf8');
console.log(`Written to ${outPath}`);
console.log(`File size: ${output.length} bytes`);
