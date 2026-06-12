# Procedural World Assets

Batch 3 world assets are implemented in `src/game/scenery.ts` and `src/game/world.ts` as
runtime Three.js assets rather than static images or GLB files.

Current coverage:

- Neon Ward rooftop background: neon biome skyline, lit windows, abstract sign panels.
- Origins alley background: warm alley pipes and lamps in the origins biome.
- Crucible / bear-market red storm background: crucible sky, ember particles, hot debris rocks.
- Floor tiles: instanced voxel ground blocks with per-block color variation and biome palettes.
- Rupture portal: animated canvas swirl plus rotating energy rings at the finish.
- Rain overlay: neon biome switches the atmosphere particle field into rain mode.
- Neon signs: abstract emissive glyph panels in the neon biome.

The assets are deterministic from the generated level segments and do not introduce network
or model loading dependencies.
