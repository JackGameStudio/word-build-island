---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 0f267e50c7b61bb0b41044a6e3e9958c_5f026e58618611f1832e5254006c9bbf
    ReservedCode1: uoCFu+ACAueHE7amIWsgRg6pUGRrwnE0tnNcFsz4jP2wEXLuS2iZOVrfvFGKFa4a3aPgrQnfRi9lC4gXITC+tw9UuYacw3Ueya7Q1bD1Wj+E0J+/NcpjhcpkpdShWIj2J2CXHWuXrVc7y4WDhRT6Z8dhDsuLp1wEGtKDcnvwkVDSuUZJycsVj35jOtU=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 0f267e50c7b61bb0b41044a6e3e9958c_5f026e58618611f1832e5254006c9bbf
    ReservedCode2: uoCFu+ACAueHE7amIWsgRg6pUGRrwnE0tnNcFsz4jP2wEXLuS2iZOVrfvFGKFa4a3aPgrQnfRi9lC4gXITC+tw9UuYacw3Ueya7Q1bD1Wj+E0J+/NcpjhcpkpdShWIj2J2CXHWuXrVc7y4WDhRT6Z8dhDsuLp1wEGtKDcnvwkVDSuUZJycsVj35jOtU=
---

# NPC 任务发放系统设计

**日期**: 2026-06-06  
**状态**: 设计中  
**关联**: Phase 6 — NPC 系统  

---

## 1. 概述

在 Word Island Builder 岛屿上引入可漫游的 NPC，核心功能为随机任务发放。NPC 使用用户提供的 3×3 spritesheet（villager.png，每帧 32×32），支持四方向行走动画。随岛屿等级解锁更多 NPC（早期 1 个，后期扩充）。

---

## 2. NPC 渲染架构

### 2.1 渲染管线位置

```
地形层 → 建筑层（按 layer+y 排序）→ NPC 层 → 幽灵预览 → 拾取物层
```

NPC 插入建筑层之后、幽灵预览之前，确保 NPC 在建筑上方走动但不遮挡建造预览。

### 2.2 Spritesheet 格式

| 属性 | 值 |
|------|-----|
| 尺寸 | 96×96 |
| 帧尺寸 | 32×32 |
| 布局 | 3 行 × 3 列 |
| 行 0 | Front（朝下） |
| 行 1 | Side（朝左，朝右时水平翻转） |
| 行 2 | Back（朝上） |
| Idle 帧 | 行 0 列 1（Front 第二帧） |
| Walk 帧 | 每行 3 帧循环 |

### 2.3 方向映射

| 移动方向 | Spritesheet 行 | 是否翻转 |
|----------|---------------|----------|
| down | 0 (Front) | 否 |
| up | 2 (Back) | 否 |
| left | 1 (Side) | 否 |
| right | 1 (Side) | 是（水平翻转） |

### 2.4 气泡指示器

- 任务就绪时：NPC 头顶显示白色「!」气泡（脉冲动画）
- 任务完成待领取：不显示气泡
- 无任务/冷却中：不显示气泡

### 2.5 引擎接口新增

```js
// island-engine.js
setNPCs(list)           // 设置 NPC 数组
getNPCs()               // 获取 NPC 列表
findNPCAt(gx, gy)       // 查找指定格子的 NPC
```

---

## 3. NPC 行为与漫游

### 3.1 状态机

```
IDLE → WANDERING → IDLE
  ↓
QUEST_READY → IDLE
```

### 3.2 漫游逻辑

- 独立计时器，每隔 2-4 秒随机方向（上/下/左/右，均匀分布）
- 移动前检测目标格合法性：
  - 不能是水（TERRAIN.WATER）或岩石（TERRAIN.STONE）
  - 不能有建筑占用
  - 不能有其他 NPC
- 不合法则重试，连续 3 次失败则原地暂停一轮
- 移动为瞬间跳格，非平滑过渡

### 3.3 任务触发

- 点击 NPC → 命中测试 → 若 state === 'quest_ready' → 弹出任务面板
- 任务从 NPC 专属任务池随机抽取
- 完成一个任务后进入冷却

---

## 4. 任务系统

### 4.1 任务类型

| 类型 | 示例 | 关键参数 |
|------|------|----------|
| `build` | "建造一个伐木场" | buildingId |
| `vocab` | "学习 5 个新单词" | count (3-8) |
| `collect` | "收集 100 木材" | resource + amount |

### 4.2 生成规则

- 建造类：从已解锁但未拥有的建筑中随机选取
- 词汇类：数量 3-8 随机
- 收集类：目标量 = `base × level × 0.8`（取整）
- NPC 任务池定义在静态数据中（`data/npcs.js`）

### 4.3 进度追踪

- 建造类：检测目标建筑是否存在于 `data.island.buildings` 中，存在即完成
- 词汇类：检测新学单词增量（任务接取时记录 `data.stats.wordsCorrect` 基线）
- 收集类：检测当前资源量是否 ≥ 目标量（不扣除，仅验证曾达到）

### 4.4 奖励

| 类型 | 基础奖励 |
|------|----------|
| build | gold + 建筑对应资源加成 |
| vocab | gold + wood + star |
| collect | gold + 目标资源少量返还 |
| 全部 | +1 star |

### 4.5 冷却与跳过

- 完成任务后 8 分钟冷却
- 手动跳过任务：冷却 30 分钟

---

## 5. 数据结构

### 5.1 NPC 静态定义 (`src/data/npcs.js`)

```js
export const NPC_DEFS = [
  {
    id: 'villager_1',
    name: '村民阿木',
    type: 'villager',
    unlockLevel: 1,
    questPool: ['build', 'vocab', 'collect']
  },
  // 后续解锁…
];
```

### 5.2 存档运行时数据 (`data.npcs`)

```js
[{
  id: 'villager_1',
  gx: 5, gy: 5,
  state: 'quest_ready',    // 'idle' | 'wandering' | 'quest_ready'
  quest: {
    type: 'build',
    target: { buildingId: 'cottage' },
    reward: { gold: 80, wood: 20, star: 1 },
    claimed: false
  },
  cooldownUntil: 0
}]
```

### 5.3 初始化逻辑

- 新游戏：按 unlockLevel 在岛上随机空地生成 NPC
- 已有存档：加载 data.npcs，兼容旧存档（无 npcs 则按等级初始化）
- 岛屿升级：检查新解锁 NPC，在随机空地生成
- 首个 NPC（villager_1）生成在码头附近（(5,7) 或邻近空地）

---

## 6. 文件规划

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/data/npcs.js` | 新建 | NPC 静态定义 |
| `src/core/npc-engine.js` | 新建 | NPC 漫游、动画、任务逻辑 |
| `src/components/NpcQuestPanel.js` | 新建 | 任务弹窗 UI |
| `src/core/island-engine.js` | 修改 | 添加 NPC 渲染层 + 引擎接口 |
| `src/main.js` | 修改 | 挂载 NPC 系统、存档、初始化 |
| `src/assets/images/villager.png` | 已有 | 村民 spritesheet |

---

## 7. 边界条件

- 旧存档兼容：`data.npcs` 不存在时按当前 island.level 初始化
- 建筑拆除不影响 NPC 任务：若建造类任务的目标建筑已被拆除后重建，progress 按建筑存在判断
- NPC 不走上水/石，不会卡死在角落
- 多 NPC 不重叠
- 缩放不影响点击命中（需适配 scale 参数）
*（内容由AI生成，仅供参考）*
