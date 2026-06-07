/**
 * npcs.js
 * NPC 静态定义 — 岛民类型、解锁条件、任务池
 */

export const NPC_DEFS = [
  { id: 'villager_1', name: '村民阿木', type: 'villager', questPool: ['build', 'vocab', 'collect'] },
  { id: 'villager_2', name: '村民小梅', type: 'villager', questPool: ['build', 'vocab', 'collect', 'special'] },
  { id: 'villager_3', name: '村民铁柱', type: 'villager', questPool: ['build', 'vocab', 'collect'] },
  { id: 'villager_4', name: '村民翠花', type: 'villager', questPool: ['build', 'vocab', 'collect', 'special'] },
  { id: 'villager_5', name: '村民阿福', type: 'villager', questPool: ['build', 'vocab', 'collect'] },
];

/**
 * 从建筑列表中获取已解锁但未拥有的建筑 ID 列表
 */
export function getUnbuiltUnlocked(defs, buildings, level) {
  return defs
    .filter(b => b.levelRequired <= level && !buildings.some(bld => bld.id === b.id))
    .map(b => b.id);
}
