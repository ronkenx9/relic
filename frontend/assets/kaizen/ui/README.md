# RELIC x KAIZENVERSE Batch 5 UI Assets

Batch 5 UI assets are code-native HTML/CSS components in `frontend/index.html`, driven by `src/game/main.ts`.

## Covered Assets

- `health bar` - HUD meter that degrades with deaths.
- `style meter` - HUD meter derived from blocks, progress, and airtime.
- `archetype badge` - HUD identity plate with generated archetype icon, name, and tagline.
- `score card` - HUD score cluster for deaths, blocks, and current era.
- `run complete card` - forged result modal with portrait, stats, evidence, and rank.
- `mint button` - end-card action linking to the deployed Mantle Sepolia RELIC contract.
- `share button` - end-card action copying the viral run text.
- `forge loading screen` - animated gate state while wallet history is being read and forged.
- `kaizen stamp` - end-card circular forged stamp.

These assets are intentionally implemented as live UI components instead of static PNGs so they can reflect wallet-derived state at runtime.
