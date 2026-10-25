# Living Steel & Foundations — implementation and QA

Review date: 2026-10-25. Package version: 0.7.0. This is a branch review
candidate; the accepted public multiplayer deployment has not been replaced.

## Baseline and branch

- Accepted baseline: `273a52afc6f660f771b260df784df8fe96787eb0`.
- Source branch: `codex/v0.6.0-online-multiplayer`, verified up to date before work.
- Work branch: `codex/v0.7.0-living-steel`.
- Release repository: `Guardianec/hollow-canticle-v05`, configured as remote `v05`.
- The older repository is remote `origin`. Neither `main` nor the multiplayer
  branch is a release-work target. No automatic merge or deployment is performed.

## Animation

`AnimationStateMachine` holds per-actor presentation state, independent of the
simulation. It blends locomotion, action poses and additive motion, and is used
by both procedural bodies and imported Blender rigs. Imported actors receive
the same blended pose instead of bypassing the transition with an unsmoothed one.

Locomotion states are idle, long idle, run start, run, turn, run stop, combat idle,
guarded forward movement, backward steps and strafing. Distance advances the gait;
speed changes load the torso, strong turns plant a foot, hips lead the shoulders,
and cloth responds to movement and rotation. Large weapons have restrained turn
lag. Simulation speed and input response retain the accepted baseline values.

Base idle includes breathing, weight shifts, small head/shoulder motion and grip
stabilization. Long-idle flourishes begin after 5–7 seconds and alternate variants
on an 11-second cycle: sword inspection, knife wrist motion, spear adjustment,
greatblade loading, Shinobi's weapon/sidearm checks, and ritual/ranged enemy poses.
Existing enemy body profiles retain different guards, crouches and proportions.

Action transitions retain their preceding pose with 65 ms blend-in; locomotion
changes blend over 120 ms. Attacks keep authoritative startup/contact/recovery
times. Parry interception/recoil and dodge loading/recovery use phase-dependent
poses. Constrained head tracking, torso banking and secondary cloth are additive.
There is no full terrain IK or physical cloth solver.

Combat Lab (`?debug`) exposes reviewed actor, clip, pause/scrub, velocity, turn
rate, close-combat stance, layer names, weights and room geometry. The benchmark
(`?benchmark&view=animation`) adds a neutral studio, orbit/zoom and 16-frame studies.
Preview displacement illustrates the riposte; gameplay displacement belongs to
the simulation. A motion sheet is a rendered clip study, not a recorded match.

## Shinobi

The Ashen Shinobi is a separate original body model on the common semantic rig.
The revised design uses black wrapped cloth, asymmetric lacquer chest strips,
one angular shoulder guard, wrapped forearms/gaiters, soft split boots, a broad
shallow travelling hat, masked face and short split scarf tails. It has no knight
cuirass, metal greaves, steel knee shields, red robe or full-length knight cape.
The curved katana, scabbard and compact bronze springlock are original geometry.
`shinobi_cloth` and `shinobi_lacquer` are independently authored/baked materials.

| Rule                                            | Value                                                      |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Movement multiplier                             | 1.02                                                       |
| Basic startup / recovery                        | 0.12 s / 0.24 s, modified by each chain move               |
| Basic HP damage / pressure / reach              | 9 / 11 / 118 units                                         |
| Melee chain                                     | Cinder draw, Returning ember, Quiet severance, Last cinder |
| Normal / perfect deflection pressure multiplier | 1.2 / 1.4                                                  |
| Riposte eligibility range                       | 245 units, greater than the normal katana reach            |
| Normal / perfect input window                   | 0.65 s / 0.85 s                                            |
| Normal / perfect riposte HP damage              | 16 / 20, capped to leave at least 1 HP                     |
| Normal / perfect riposte pressure               | 58 / 74 before relevant modifiers                          |
| Contact / total duration                        | 0.32 s / 0.76 s                                            |
| Springlock capacity / recharge                  | 3 charges / 9 s per charge                                 |
| Springlock damage / pressure                    | 3 / 10                                                     |
| Offline unlock                                  | 16 Chronicle embers; deterministic, no random unlock       |

A successful melee deflection opens an opportunity against that enemy. A
springlock hit grants one only when the shooter is within 245 units of the hit
target. Attack consumes the opportunity, checks target/range/line of sight,
recoils, bursts forward, cuts, and returns toward the original position. Movement
uses the existing collision resolver in short substeps. Moving targets can evade;
the sequence does not grant blanket invulnerability or guarantee a hit.

Single-player, co-op and duel use authority-owned eligibility and damage. Only
semantic expiry, target and perfect state are synchronized, alongside existing
movement/action timing. Clients cannot declare a successful riposte. The duel
hit queue preserves the riposte flag; nonlethal damage is enforced by authority.
Client movement prediction yields during a riposte. Remote facing interpolates
through the shortest angle, with animation derived locally rather than bone data.

Delayed deflection testing found and fixed a baseline issue: a historical enemy
snapshot could be occluded by the same enemy's moved current body. Occlusion now
compares stable enemy IDs. Tests cover 50–200 ms simulated delayed inputs.
All five characters remain available in online modes and practice.

## Combat effects

Hits and deflections retain directional trails/contact sparks. Perfect deflections
add gold and steel-blue rays plus an expanding ring and local light. Guard breaks
use red fracture sparks and a shockwave, with a clear finisher prompt. Twin blades
cross trails, spear executions pierce linearly, greatblade executions add a heavy
ring, and Shinobi cuts use a narrow white katana flash. Three katana executions
have their own preparation/contact poses.

Biome bursts retain stone dust, water, spores, snow/ice and embers. Central profile
density scales effects. Effect groups are reused in a bounded pool (up to 64 free
groups, at most three of each signature); particle rendering uses fixed buffers.
Reduced motion limits secondary movement/camera effects without removing tells.
The flash toggle suppresses bright cores while sparks and rings stay readable.

## Room geometry

A cached layout defines floor cells, collision membership, exposed edges, door
sockets and visual wall exclusions. Both renderers consume those edges; imported
scenery is rejected from walkable floor unless covered by an existing obstacle,
and from socket exclusion zones. The former independent backdrop-wall placement
could occupy the axial route and is now subject to those checks.

Closed gates use the same uncleared/encounter state for visible bars and movement
blocking. Cleared gates open both. The overlay shows floor cells (green), walls
(red), sockets (yellow), axial paths (blue) and obstacles (orange).

The stress test generates 2,000 floors across 30 depths. It checks continuous
collision clearance and obstacle clearance along every reserved socket route,
plus wall/decor exclusions; a separate test routes every actual linked doorway.
These checks passed. Five further seeds (`V07-VISUAL-0` through `V07-VISUAL-4`)
were generated and their laboratory rooms visually reviewed across all five
biomes with the shared geometry overlay. The rendered floor and wall edges
matched the overlay in those samples. Mathematical checks and these samples do
not establish exhaustive visual coverage of every generated floor.

## Graphics, UX and migration

All runtime profiles live in `src/game/graphics.ts`.

| Profile  | DPR cap | Shadow map | Torch lights | Particle density | Fog layers | LOD distances |
| -------- | ------- | ---------- | ------------ | ---------------- | ---------- | ------------- |
| Very Low | 0.6     | Off        | 1            | 0.25             | 0          | 8 / 18        |
| Low      | 0.8     | Off        | 2            | 0.45             | 1          | 16 / 40       |
| Medium   | 1       | 1024       | 3            | 0.7              | 2          | 22 / 50       |
| High     | 1.5     | 2048       | 5            | 1                | 3          | 32 / 65       |
| Extreme  | 2       | 4096       | 6            | 1.6              | 3          | 48 / 95       |

Very Low also disables decals, distant architecture and bloom, and uses lower
texture resolution. Extreme extends draw distance to 210 units, increases bloom
and environmental particles, and retains detailed geometry farther away.
Repeated environment modules stay instanced. Lighting is budgeted around nearby
torches and impact feedback. Dynamic resolution and reduced-rate animation LOD
were left disabled; weather and light shafts remain later-release work.

The quickbar shows quantities and names with a larger outlined selection, uses
the existing 1/2 cycling controls, and briefly displays the selected description.
The pause satchel lists icons, quantities, descriptions, use times and durations,
including a clear empty state. Inventory storage was reused.

First launch offers optional practice or immediate play. Tutorial can be replayed
from the menu or character selection and skipped at any time. One deterministic
courtyard replaces full-dungeon generation for training. It teaches movement,
camera/focus, attacks, parry/perfect timing, dodge, guard break, finisher, ranged,
projectile deflection/reflection, item cycling/use and Shinobi riposte. The training
opponent repeats controlled slashes; arrow practice follows the melee lessons.
Completion persists. Save version 2 and the existing local save key are retained;
progression, Chronicle and old graphics settings migrate safely.

## Validation and limits

- Baseline: install, lint, 147 tests, client build and server build passed.
- Release suite: **176 tests passed across 12 files**, including real WebSocket
  room tests, four-client Shinobi state, all-five-character duel simulation,
  delayed defensive input, nonlethal/ranged ripostes, geometry, graphics parsing,
  item cycling and tutorial persistence.
- Additional exported-model checks passed for the separate Shinobi materials
  and body-design metadata.
- Lint/type checking, production client/server builds and asset validation passed.
- The built production server returned a healthy `/healthz` response and started
  a real two-client co-op session with both players using Shinobi. Both clients
  received the new riposte fields; the server console showed no runtime errors.
- Runtime asset inventory: **153 assets, 17 PBR families, 512,190 LOD0 triangles**;
  GLBs plus high-resolution maps total about **31.87 MiB** before HTTP compression.
- The production browser loaded the new model and all five reviewed biomes with
  no observed console errors.
  Updated motion studies and review images are in [screenshots/v07](screenshots/v07/).
- [Server load results](metrics/v07-load.json): five four-player rooms with eight
  enemies each and Shinobi included, over 20 seconds. Measured 29.95–30.05 ticks/s,
  about 164 MiB RSS, 58.8 MiB heap, 19.5% of one CPU core and 20.2 ms event-loop p95.
  Server and 20 SDK clients shared one local process; these are not Render results.
- [Browser render samples](metrics/v07-render.json) cover the visible crowd
  benchmark and five profiles. Shader/texture warm-up is excluded by the viewer's
  sampling gate. GPU resource counts are not memory byte estimates. This isolated
  workload is not a sustained dungeon, boss or online-rendering FPS guarantee.

The warmed production crowd samples reached 60 FPS for all five profiles on this
machine. Very Low/Low recorded 77 draw calls and 69,099 triangles; Medium recorded
133 calls and 137,970 triangles; High/Extreme recorded 133 calls and 250,708
triangles. Shadow passes contribute to those totals. Counts remained bounded at
124 geometries and 96–98 textures during quality switching. Initial shader/texture
switching can stall a frame, so transition samples are excluded.

Remaining acceptance work: sustained human PvP balancing (including riposte
fairness), integrated-GPU playtests, multi-floor manual journeys, broader random
seed visual inspection, and artistic comparison against all three reference boards.
The procedural art does not claim painted-reference fidelity. The screenshots
and samples establish reviewable implementation, not completed human sign-off.
