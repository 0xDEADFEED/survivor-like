# SurvivorLike Plan

## Direction

Build a low-poly 3D arena survivor-like inspired by games such as Megabonk and Vampire Survivors. The first version should prioritize feel, readability, and a complete gameplay loop over production art.

The prototype should use simple primitive shapes, flat colors, shadows, motion, and effects. Art should stay cheap until the core loop is fun.

## Recommended Stack

- Vite
- TypeScript
- Three.js
- HTML/CSS overlay for UI
- Simple custom collision checks at first
- No full physics engine until the game needs terrain, ramps, or more physical chaos

## Visual Style

- Low-poly 3D
- Chunky silhouettes
- Flat materials
- Strong readable colors
- Simple shadows and fog
- No detailed textures in the first pass
- Juice through motion, hit flashes, particles, trails, and camera shake

## Prototype Art Rules

- Every gameplay object should have a distinct silhouette.
- Color should communicate behavior.
- Green or blue means player, XP, or helpful objects.
- Red or orange means enemies or danger.
- Yellow or white means attacks and hit effects.
- Purple means elites or special threats.
- Placeholder art is acceptable if gameplay remains readable.

## Core MVP

1. Player moves around a flat 3D arena with WASD or arrow keys.
2. Camera follows smoothly from an angled top-down view.
3. Enemies spawn outside the visible area and chase the player.
4. Player attacks automatically.
5. Enemies take damage, die, and drop XP gems.
6. XP gems magnet toward the player when nearby.
7. Player levels up after collecting enough XP.
8. Level-up pauses the game and offers 3 upgrade choices.
9. Difficulty scales over time.
10. Player dies when health reaches zero.
11. Game shows a death screen with stats and restart.

## First Playable Slice

The first build should be a greybox vertical slice:

1. Low-poly player shape moves on a flat arena.
2. Smooth follow camera.
3. Red blob enemies chase the player.
4. Orbiting mace weapon damages enemies.
5. Enemies pop into XP gems.
6. XP gems magnet into the player.
7. Level-up choices mutate player stats.
8. Timer, health, XP, level, and kill count are visible.

## Initial Placeholder Objects

- Player: capsule, squat cylinder, or simple character made from primitives.
- Basic enemy: red sphere/blob.
- Heavy enemy: larger purple or dark red blob.
- Fast enemy: small orange shape.
- XP gem: glowing octahedron or crystal.
- Orbiting mace: sphere or spiked primitive on a circular path.
- Arena: flat plane with subtle grid or tiles.
- Props later: rocks, pillars, crates, trees, or abstract blockers.

## First Weapons

### Orbiting Maces

The recommended first weapon. Maces orbit the player and damage enemies on contact.

Good early upgrade hooks:

- More maces
- More damage
- Faster orbit speed
- Larger orbit radius
- More knockback

### Bonk Hammer

A signature weapon for the Megabonk-style feel. The hammer swings in an arc at intervals and knocks enemies back.

Good early upgrade hooks:

- Wider swing arc
- More damage
- Shorter cooldown
- More knockback
- Double swing

### Later Weapon Ideas

- Rock Toss: throws a projectile at the nearest enemy.
- Ground Slam: radial pulse centered on the player.
- Boomerang Axe: travels outward and returns.
- Lightning Zap: chains between nearby enemies.
- Rolling Boulder: travels through crowds and pushes enemies aside.

## Initial Upgrade Pool

- +1 Orbiting Mace
- +20% Damage
- +15% Spin Speed
- +10% Move Speed
- +25% Pickup Radius
- +20 Max Health
- +15% Knockback
- +10% Attack Size

## Enemy Types

### Basic Chaser

Simple enemy that walks directly toward the player.

### Heavy Chaser

Slower enemy with more health and a larger body.

### Swarmer

Small, fast, low-health enemy that pressures movement.

### Dasher

Pauses briefly, then rushes toward the player.

### Mini-Boss

Large enemy with high health that appears at milestone times and drops a large amount of XP.

## Systems

### Game

Owns renderer setup, scene setup, main loop, fixed timestep decisions, and high-level game state.

### Player

Owns position, movement, health, XP, level, stats, and current upgrade modifiers.

### EnemyManager

Owns enemy spawning, enemy updates, wave scaling, and enemy cleanup.

### WeaponManager

Owns active weapons, attack timers, targeting, and weapon collision.

### PickupManager

Owns XP gem creation, magnet behavior, pickup checks, and cleanup.

### UpgradeSystem

Owns upgrade definitions, random level-up choices, and applying stat changes.

### Effects

Owns hit flashes, particles, trails, floating numbers, death pops, and camera shake.

### UI

Owns HTML/CSS overlay elements such as health, XP, timer, level-up cards, pause, and death screen.

## Development Milestones

### 1. Movement Feel

- Create Vite + TypeScript + Three.js app.
- Add player placeholder.
- Add arena plane.
- Add camera follow.
- Add movement controls.

### 2. Enemy Pressure

- Spawn enemies around the player.
- Make enemies chase the player.
- Add contact damage.
- Add player health and death.

### 3. First Weapon

- Add orbiting mace.
- Damage enemies on contact.
- Add knockback.
- Add enemy death.

### 4. XP Loop

- Drop XP gems.
- Add magnet pickup.
- Add XP bar.
- Add level progression.

### 5. Upgrade Loop

- Pause on level-up.
- Show 3 upgrade choices.
- Apply chosen upgrade.
- Resume game.

### 6. Juice Pass

- Add hit flashes.
- Add enemy death pop.
- Add simple particles.
- Add attack trails.
- Add camera shake.
- Add basic audio hooks if useful.

### 7. Content Pass

- Add Bonk Hammer.
- Add enemy variants.
- Add wave milestones.
- Add mini-boss.
- Add start/death/restart flow.

### 8. Enemy Behavior Pass

- Add ranged spitters with a visible line telegraph before firing.
- Add shieldbearers that reduce frontal weapon damage but can be beaten by flanking hits, ground slam, and lightning.
- Add hostile projectile cleanup and collision separate from player weapon projectiles.
- Fold spitters and shieldbearers into the time-based wave director.

### 9. Arena Depth Pass

- Add cheap 3D arena variation with readable landmark props.
- Keep navigation simple at first; use arena pieces for visual depth before adding complex collision.
- Make spawn edges and boss entrances feel more intentional with arena landmarks.
- Current pass: added flat visual shelves, ramp-like floor details, route markers, and perimeter spawn gates that enemies favor.
- Removed experiment: platform/ramp height zones, ledge collision, prop collision, and enemy terrain steering were removed because they made movement unclear.

### 10. Proper Terrain Rebuild

- Use one authoritative terrain data source, such as a small heightfield grid or a list of stamped height shapes.
- Generate the rendered terrain mesh from that same data source so visuals and gameplay cannot disagree.
- Sample player/enemy height from the terrain data every frame; do not use separate hand-placed height boxes.
- Keep blockers separate from height. Only tall, obvious objects such as boulders, pillars, walls, or trees should block movement.
- Do not add ambiguous ledges. If a surface is not walkable, it should read as a wall or obstacle immediately.
- Add debug overlays before tuning: height sample marker, blocker bounds, spawn gate markers, and player collision circle.
- Start with gentle slopes and broad ramps only; avoid sharp step-ups until the core movement still feels good.
- Let enemies follow terrain height, but only avoid major blockers. Hordes should not get trapped by fine terrain detail.
- Gate this rebuild behind an easy toggle so flat arena movement can remain the fallback while terrain is tested.
- Current pass: added a shared smooth heightfield sampler, generated the terrain mesh from it, and wired player/enemy/effect heights to that same sampler behind pause-menu terrain/debug toggles.
- Current pass: added height-tinted terrain colors, a debug wireframe, and a live player terrain-sample marker.
- Current pass: removed leftover slab/grid route visuals, terrain-anchored props and spawn gates, raycast mouse aiming against the terrain mesh, and made the camera look at the player's terrain height.
- Current pass: added terrain normal sampling, slope-aligned ground effects, a slope readout, and a debug normal arrow for tuning surface tilt.
- Current pass: added a small set of obvious colliding boulder blockers, terrain-debug blocker bounds, and reduced non-blocking props to low ground clutter so collision reads clearly.
- Current pass: added player collision and spawn gate terrain debug rings, plus blocker cover for player and hostile projectiles.
- Current pass: added lightweight enemy blocker steering and spawn-position rejection so hordes flow around terrain cover instead of spawning or grinding inside it.
- Current pass: converted height shapes and blocker placement into explicit terrain stamp data so the generated mesh, sampler, debug stats, and gameplay collision tune from a clearer source of truth.
- Current pass: moved terrain stamp data and pure height/normal sampling into `src/game/terrain.ts` so rendering, gameplay, and future tooling share a small terrain model instead of embedding terrain math in the main loop.
- Current pass: added `npm run verify:terrain` to compile and check terrain stamps, sampled height bounds, blocker spacing, start-area readability, and terrain normals.
- Current pass: added terrain-debug outlines for height stamps, with plateau and hill boundaries sampled onto the same terrain mesh surface.
- Current pass: moved surface route tint into terrain route stamps and extended terrain verification to check tint data.
- Current pass: moved slope sampling into the terrain model and added a max readable slope verifier so terrain stamps cannot silently become too steep.
- Current pass: added optional terrain-normal alignment for anchored world props, applied to boulder blockers and low clutter while keeping spawn gates upright.
- Current pass: separated boulder visual footprint from a smaller gameplay collision radius, added subtle terrain-grounded blocker pads, and strengthened route tint for better normal-play readability.
- Current pass: added Space-bar hopping with coyote/input-buffer forgiveness, air control, landing squash/dust, gentle slope speed modulation, and a pause-codex hop readout to move terrain traversal closer to arcade Megabonk-style movement.
- Current pass: added authored ramp height stamps, four broad diagonal ramp approaches into the existing raised areas, ramp debug outlines, and verifier coverage for ramp dimensions and high/low ends.
- Current pass: increased terrain height variation significantly, widened plateau/ramp blends to keep movement readable, raised the slope verifier target carefully, and strengthened height/bank vertex colors so elevation reads without debug overlays.
- Current pass: shifted the terrain renderer toward a chunkier low-poly style with faceted terrain geometry and generated stone accent chunks around plateau/ramp stamp edges, while keeping the height sampler as the movement source of truth.
- Current pass: added irregular low-poly mesa cap meshes with dark sides over plateau interiors, plus subtler skirt/cap-stone accents, so raised areas read more like authored Megabonk-style terrain chunks instead of smooth heightfield hills.
- Current pass: added segmented ramp deck meshes generated from ramp stamps, with dark side faces and offset top surfaces, so ramps visually read as intentional constructed approaches into the mesa caps.
- Current pass: improved hop traversal feel with terrain-grounded player shadow, short landing carry/momentum preservation, and a terrain/air-aware camera that lifts and eases its look target over jumps and elevation changes.
- Current pass: added a moving-hop forward kick and a light landing bonk pulse that chips and pushes nearby enemies on hard landings, making hops over ramps/mesas mechanically useful instead of purely cosmetic.
- Current pass: made hard landings more readable with a distinct gold terrain-aligned thud ring on every hard landing, plus brighter spark bursts and stronger shove feedback when the landing bonk connects with enemies.
- Current pass: added airborne enemy skimming so hopping high enough over non-boss enemies avoids contact damage, shoves them aside, and emits a small blue skim chip effect, making jump timing a real terrain/combat decision.
- Current pass: added slope-assisted ramp jumps driven by terrain normals, with extra lift/carry, boosted takeoff particles, and a pause-codex Jump Boost readout for tuning.
- Current pass: pushed terrain readability toward Megabonk-style visual language with stronger top/side material separation, brighter ramp decks, generated ramp rails/cross-bands, darker plateau rims/cliff faces, backed-off fog, stronger angled light, and a lower camera angle.
- Current pass: increased terrain verticality, added generated hard ledge-wall collision around plateau tops with ramp openings, made ledges participate in spawn/projectile/enemy collision checks, and deepened visual cliff drops so raised terrain behaves more like Megabonk-style mesas.
- Current pass: moved ledge-wall generation/top-bottom sampling into the terrain model, rendered explicit vertical wall faces from those ledges, and expanded `npm run verify:terrain` to check ledge count, ramp openings, normalized wall data, and tall rendered drops.
- Current pass: changed terrain height sampling from additive rounded plateaus to highest-stamp sampling with flatter mesa interiors, widened/tallied ramp approaches for the new mesa heights, and updated terrain verification to distinguish hard plateau edges from walkable ramp slopes.
- Current pass: added ledge-impact collision details and player feedback so running into hard mesa walls produces a short wall scrape, terrain chips, and a small camera bump instead of silently sliding.
- Current pass: stitched mesa tops to hard ledge lips by keeping plateau height flat up to the generated wall line, lowering wall-top offsets, and adding terrain verification that ledge wall tops remain visually aligned with the mesa surface.
- Current pass: pivoted away from smooth terrain entirely: removed hill/noise height stamps, changed terrain sampling to clean flat slabs plus planar ramp rectangles, flattened the base renderer, expanded explicit plateau top meshes, and removed old skirt/chunk decoration that made terrain look detached.
- Current pass: fixed plateau top mesh winding and brightened slab tops so the platforms read as solid surfaces, changed ledge collision to one-way blocking so low-side climbing is blocked but high-side drop-offs are allowed, and added a falling transition when stepping off tall slabs.
- Current pass: replaced the old layered ramp decks/marks with simple wedge-block ramp geometry, matched ramp sampling to the visible wedge footprint, and added solid ramp side collision so the player enters ramps from their low face instead of popping up through the sides.

### 11. Reward Event Pass

- Add elite/chest-style drops that create temporary reasons to move into danger.
- Add small coin piles or timed reward markers.
- Tune rewards so risky movement feels worth it without breaking the upgrade cadence.

### 12. Weapon Evolution Pass

- Add capstone evolutions when a weapon receives enough upgrades.
- Start with strongly visible changes: mace orbit pattern, hammer shockwaves, lightning storms, axe split-return, and slam aftershocks.
- Show evolution state clearly in the pause codex.

## Design Priorities

1. The player should always understand what is dangerous.
2. Movement should feel responsive before combat gets complex.
3. Combat should be automatic but still reward positioning.
4. Upgrades should visibly change the run.
5. Enemy pressure should create movement decisions, not just clutter.
6. Visual polish should come from timing, animation, and feedback before custom assets.

## Deferred Ideas

- Full character models
- Detailed animation rigs
- Real terrain
- Physics engine
- Procedural biomes
- Meta progression
- Save system
- Multiple playable characters
- Online leaderboard
- Controller support
