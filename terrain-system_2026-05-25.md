# Word Island Builder — 地形系统 + 飞入动画修复 (2026-05-25 16:00-17:30)

## Objective
1. 木头中后期过多 → 平衡调整
2. 背词飞入动画重叠 + 不飞向资源栏 → 改用 Element.animate() + 动态计算资源栏位置
3. 岛屿地形系统 → terrain.png spritesheet + DEFAULT_ISLAND_TERRAIN + 可建造性检查

## Changes

### Wood Balance (buildings.js)
- Tree: wood 2→1/tick
- Lumberjack: wood 3→2/tick
- Buff (+1 to all wood buildings) 不变，核心价值在全局加成

### Fly Animations (VocabOverlay.js + main.js)
- 多个资源错开 16-18px 消除重叠
- 用 Element.animate() 替代 CSS keyframe，动态计算资源栏位置
- 答对动画 0.8s，tick 收入 1.2s

### Terrain System (4 files)
- `constants.js`: TERRAIN 枚举(GRASS/SAND/WATER/FOREST/STONE) + DEFAULT_ISLAND_TERRAIN 12×12
- `asset-loader.js`: drawTerrainTile() + terrain 图片预加载
- `island-engine.js`: 地形贴图渲染 + fallback 纯色 + setTerrainMap/getTerrainType/isBuildable
- `main.js`: 地形初始化/存档恢复/幽灵预览可建造性检查

### Placeholder Asset
- `terrain.png`: 128×320px 白盒图，5行×2列，PowerShell + System.Drawing 生成

### Spec Doc
- `ART_ASSETS_SPEC.md`: 完整美术资产规格

## Commits
- `1273aee` — wood balance + fly animation fixes
- `4f1f7b8` — terrain system + placeholder terrain.png

## Key Decisions
- 地形用 spritesheet 行号=地形类型，列号=棋盘格变体(0/1)
- 水/石不可建造，幽灵预览自动变红
- 无地形图时自动降级到 fallback 纯色
- 旧存档自动补默认地形（向后兼容）