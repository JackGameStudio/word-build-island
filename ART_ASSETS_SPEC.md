# Word Island Builder — Pixel Art Asset Spec

## terrain.png
- **Size:** 128×320 px (2 columns × 5 rows, each tile 64×64)
- **Style:** Top-down pixel art, 16px style, seamless tiling

| Row | Terrain | Col 0 (light tile) | Col 1 (dark tile) | Buildable |
|-----|---------|-------------------|--------------------|-----------|
| 0   | Grass   | 🌿 light variant | 🌿 dark variant   | ✅        |
| 1   | Sand    | 🏖️ light variant | 🏖️ dark variant   | ✅        |
| 2   | Water   | 🌊 light variant | 🌊 dark variant   | ❌        |
| 3   | Forest  | 🌲 light variant | 🌲 dark variant   | ✅        |
| 4   | Stone   | 🪨 light variant | 🪨 dark variant   | ❌        |

The two tiles per row alternate in a checkerboard pattern (x+y)%2 to avoid flat repetition.

---

## spritesheet.png
- **Size:** 320×64 px (5 columns × 1 row, each cell 64×64)
- **Style:** Top-down pixel art, 16px style, transparent background
- **Existing:** Placeholder with colored squares + emoji text

| Col | Building   | Icon |
|-----|-----------|------|
| 0   | Tree      | 🌲   |
| 1   | Lumberjack| 🪓   |
| 2   | Cottage   | 🏠   |
| 3   | Farm      | 🌾   |
| 4   | Quarry    | ⛏️   |

---

## icons.png
- **Size:** 125×25 px (5 columns × 1 row, each icon 25×25)
- **Style:** Pixel art resource icons

| Col | Resource |
|-----|----------|
| 0   | Star ⭐  |
| 1   | Gold 🪙  |
| 2   | Wood 🪵  |
| 3   | Stone 🪨 |
| 4   | Food 🌾  |

---

## buttons.png (optional)
- **Size:** 240×24 px (3 states × 1 row, each 80×24)
- **States:** Normal | Hover | Disabled

---

## panel-9slice.png (optional)
- **Size:** 64×64 px
- **Style:** 9-slice border for UI panels