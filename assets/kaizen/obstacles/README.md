# RELIC x KAIZENVERSE Batch 4 Obstacles

Batch 4 obstacle and boss assets are procedural Three.js runtime meshes in `src/game/obstacles.ts`.

## Covered Assets

- `bear shadow` - dark winter segment silhouette for `dark_zone` traps.
- `red candle slash` - emissive slash marker layered over `spike_pop` traps.
- `gas debris` - floating red shards and smoke on `toll_gate` traps.
- `ghost token` - fleeing translucent token for `runaway_coin` traps.
- `save lantern` - quiet-year lantern lives in `src/game/scenery.ts`.
- `failed transaction glitch` - cyan/red glitch marker for `fake_exit` traps.
- `cursed trade boss card` - card prop paired with `runaway_coin` full-exit moments.

These are intentionally code-native assets so every wallet-generated level can place them from the existing `TrapEvent` grammar without maintaining a separate sprite atlas.
