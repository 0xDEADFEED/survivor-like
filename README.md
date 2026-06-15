# SurvivorLike

A low-poly 3D survivor-like prototype inspired by Megabonk and Vampire Survivors.

The current build focuses on a complete greybox gameplay loop:

- WASD or arrow-key movement, with Space to hop
- Smooth angled follow camera
- Enemy spawning and chase behavior
- Automatic orbiting mace weapon
- Automatic Bonk Hammer swing
- Unlockable Rock Toss, Ground Slam, Boomerang Axe, and Lightning Zap weapons
- Weapon-specific upgrade trees after each weapon is unlocked
- Enemy damage, knockback, death, and XP drops
- Basic chasers, swarmers, dashers, spitters, shieldbearers, heavy enemies, and timed mini-bosses
- Time-based wave director with basic, swarmer, dasher, spitter, shield, heavy, and mixed boss phases
- Enemy health bars, boss health bar, and floating damage numbers
- Mace trails, hammer impact rings, hit-stop, and stronger camera feedback
- Data-stamped heightfield terrain test with terrain-aware player/enemy/effect heights, player hopping, mouse aiming, camera framing, and pause-menu flat/debug toggles
- Low-poly landmark blockers, small ground clutter, perimeter spawn gates, blocker projectile cover, enemy blocker steering, and terrain debug bounds
- XP magnet pickup
- Level-up upgrade choices
- Upgrade evolutions for fire trails, double hammer swings, pickup pulses, dash bursts, and damage glow
- Pause screen with current stats, upgrade counts, and active evolutions
- Pause actions for resume, restart, and return to start screen
- Settings for sound, screen shake, damage numbers, and reduced particles
- Placeholder synth audio for hits, pickups, level-ups, hammer swings, bosses, hurt, and death
- Persisted best-run tracking in local storage
- Coins earned from runs and skip choices
- Character selection with distinct stat profiles and starting weapons
- Start-screen meta shop for starting health, move speed, pickup radius, and rerolls
- Level-up reroll and skip actions
- Wave-change and boss warning toast messages
- Boss defeat reward upgrade choice
- Timer, health, XP, level, and kill HUD
- Start, death, restart, and run-summary scoring flow

## Run

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://localhost:5173/
```

During a run, press `P` or `Escape` to pause, inspect the current build, restart, or return to the start screen.

## Code Shape

Gameplay still lives primarily in `src/main.ts`, but shared foundations have been split out:

- `src/game/config.ts` holds tuning values for player stats, weapons, enemies, and wave timing.
- `src/game/types.ts` holds shared gameplay types.
- `src/game/storage.ts` owns settings and best-run persistence.
- `src/game/audio.ts` owns lightweight Web Audio placeholder sounds.
- `src/game/terrain.ts` owns terrain stamp data and pure terrain sampling.

## Checks

```bash
npm run verify:terrain
npm run build
```

## Build

```bash
npm run build
```

## Notes

This prototype intentionally uses primitive shapes and flat colors so iteration can stay focused on movement, combat pressure, progression, and game feel before spending time on production art.
