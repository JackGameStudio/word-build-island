/**
 * vocabulary.js
 * 内置词库 — 从 LearningIsFun vocabularies.csv 迁移
 * 结构: { word, meaning, phonetic, example, prefix, root, suffix }
 */

export const WORD_BANK = [
  { word: "creatures",   meaning: "生物",              phonetic: "", example: "All living creatures need water.",     prefix: "", root: "cre-",  suffix: "" },
  { word: "unusual",     meaning: "不寻常",            phonetic: "", example: "It was an unusual day.",               prefix: "un-", root: "usu-", suffix: "" },
  { word: "volunteer",   meaning: "志愿者",            phonetic: "", example: "She works as a volunteer.",           prefix: "", root: "vol-",  suffix: "" },
  { word: "breathe",     meaning: "呼吸",              phonetic: "", example: "We breathe fresh air.",                prefix: "", root: "breath", suffix: "" },
  { word: "furry",       meaning: "毛茸茸的",          phonetic: "", example: "The cat has a furry tail.",            prefix: "", root: "fur",   suffix: "-y" },
  { word: "charity",     meaning: "慈善",              phonetic: "", example: "They donate money to charity.",        prefix: "", root: "car-",  suffix: "" },
  { word: "singer",      meaning: "歌手",              phonetic: "", example: "The singer has a beautiful voice.",   prefix: "", root: "sing",  suffix: "-er" },
  { word: "assistant",   meaning: "助手",              phonetic: "", example: "My assistant helps me.",               prefix: "as-", root: "sist", suffix: "-ant" },
  { word: "distance",    meaning: "距离",              phonetic: "", example: "The distance is not far.",             prefix: "dis-", root: "st-", suffix: "-ance" },
  { word: "prefer",      meaning: "更喜欢",            phonetic: "", example: "I prefer tea to coffee.",              prefix: "pre-", root: "fer",  suffix: "" },
  { word: "attract",     meaning: "吸引",              phonetic: "", example: "Magnets attract iron.",                prefix: "at-", root: "tract", suffix: "" },
  { word: "vacancy",     meaning: "空缺",              phonetic: "", example: "There is a vacancy at the office.",    prefix: "", root: "vac-",  suffix: "" },
  { word: "mates",       meaning: "伙伴",              phonetic: "", example: "He and his mates play football.",      prefix: "", root: "mat",   suffix: "" },
  { word: "complete",    meaning: "完成",              phonetic: "", example: "Please complete the task.",            prefix: "com-", root: "ple-", suffix: "" },
  { word: "potential",   meaning: "潜力",              phonetic: "", example: "She has great potential.",             prefix: "", root: "poten-", suffix: "" },
  { word: "divided",     meaning: "分为",              phonetic: "", example: "The cake was divided equally.",        prefix: "di-", root: "vid-", suffix: "" },
  { word: "temperature", meaning: "温度",              phonetic: "", example: "The temperature is rising.",           prefix: "", root: "temper", suffix: "-ature" },
  { word: "barely",      meaning: "仅仅",              phonetic: "", example: "He barely passed the test.",           prefix: "", root: "bare",  suffix: "-ly" },
  { word: "surround",    meaning: "环绕",              phonetic: "", example: "Mountains surround the city.",         prefix: "sur-", root: "round", suffix: "" },
  { word: "straw",       meaning: "稻草",              phonetic: "", example: "The farmer used straw for the roof.",  prefix: "", root: "straw", suffix: "" },
  { word: "raise",       meaning: "提高",              phonetic: "", example: "She helped raise money.",              prefix: "", root: "rais",  suffix: "" },
  { word: "organization", meaning: "组织",             phonetic: "", example: "They work for a big organization.",    prefix: "", root: "organ", suffix: "-ization" },
  { word: "aim",         meaning: "目的",              phonetic: "", example: "What is your aim?",                    prefix: "", root: "aim",   suffix: "" },
  { word: "physical",    meaning: "身体的",            phonetic: "", example: "She does physical exercise.",          prefix: "", root: "phys-", suffix: "-ical" },
  { word: "emotion",     meaning: "情绪",              phonetic: "", example: "He shows no emotion.",                 prefix: "e-", root: "mot-", suffix: "-ion" },
  { word: "social",      meaning: "社会的",            phonetic: "", example: "She enjoys social activities.",        prefix: "", root: "soci-", suffix: "-al" },
  { word: "organize",    meaning: "组织",              phonetic: "", example: "They organize events.",                prefix: "", root: "organ", suffix: "-ize" },
  { word: "trained",     meaning: "训练",              phonetic: "", example: "The dog is well trained.",             prefix: "", root: "train", suffix: "-ed" }
];

/* 剩余词(Phase 5 补全): least favourite choice = 最不喜欢的选择
   以上 28 词为 MVP 词库，后续从 CSV 补全至 ~84 词 */