# Architecture — v0.4

The simulation is a 2D action game. Three.js provides a render-only 2.5D world; it does
not add a 3D physics engine or duplicate combat entities. Phaser runs the scene clock
in headless mode. Native input and HTML UI sit above the WebGL canvas.

## Runtime

- `main.ts`: startup, headless Phaser, UI refresh, optional local QA reference.
- `game/scene.ts`: input, camera-relative movement, raycast aiming, bounded 120 Hz
  simulation steps, focus loss, renderer lifecycle, and brief encounter entry slowdown.
- `game/world.ts`: authoritative player/enemy states, combat, rewards, progression,
  and shared navigation collision. Weapon windows and damage values remain in `data.ts`.
- `combat.ts`: pure defense resolution, pressure formulas, buffering, finisher naming.
- `dungeon.ts`: seeded macro graph, progression roles, encounters, topology, and ports.
- `geometry.ts`: authored unions of platforms/arms/alcoves, elevations, semantic tiles,
  light anchors, decorations, flood-fill validation, and obstacle-aware navigation.
- `presentation/architecture.ts`: physical floor slabs, foundations, bridges, arches,
  masonry, props, gates, landmarks, biome surfaces, and lower ruins.
- `presentation/materials.ts`: shared materials, original image texture, procedural
  fabric, low-cost beveled blocks, room batches, and player visibility cutout shader.
- `presentation/actors.ts`: articulated humanoids, enemy silhouettes, weapon meshes,
  cloth deformation, support-hand targeting, combat LOD, and per-joint mesh merging.
- `presentation/profiles.ts`: proportions, stance, guard, cloth scale, and gait vocabulary.
- `presentation/animation.ts`: normalized multijoint keyframes, semantic attack families,
  archetype/phase variants, hit-window metadata, and pure sampling.
- `threat.ts`: immutable committed impact reservations, preparation budget, and defense spacing.
- `presentation/camera.ts`: high exploration framing, close perspective duet framing,
  interpolation, contact/finisher framing, screen/world mapping, movement basis.
- `presentation/effects.ts`: streamed spark lines, trails, radial impacts, contact light,
  and attack ground cues, derived from simulation events.
- `presentation/renderer.ts`: floor/actor lifecycle, nearby lights, animation, layered
  atmosphere, water, bloom/output, quality switching, GPU-resource disposal, telemetry.
- `presentation/hud.ts`: restrained resource meters, discovered map, posture, prompts,
  training cues, and quiet announcements.
- `audio.ts`, `save.ts`, `random.ts`, `ui.ts`: synthesized cues/biome air, validated local
  persistence, independent deterministic streams, and menus/QA tools respectively.

## Coordinates and simulation

Player and enemy coordinates remain local to the active area. The renderer places
that area within the floor's global layout using a fixed cell pitch and a 0.025 scale.
Neighbors are rendered before entry, including their connecting bridges. Crossing a
port preserves progression state and interpolates the visible traversal across the
bridge. Floors after a stairway are regenerated and use a short descent fade.

The renderer queries elevation without changing combat distances or defensive
windows. Camera orientation controls movement basis; mouse rays intersect the ground
and convert back to local simulation coordinates. Tests exercise this conversion in
the close camera. World state is shared between exploration and combat representations.

The duel camera activates for a nearby significant single opponent or a finisher.
Groups use combat-wide framing that fits the living combatants. The same articulated entity gains finer visible
armor detail during close presentation; there is no second health or timing model.
Finishers retain the close view after the enemy leaves the living-target list.

## Generation pipeline

Seed → turning main path → optional cycle → branch growth/shortcuts → protected
exit and secret leaf → biome-weighted architecture grammar → shared navigation
surface → encounter composition → elevation → semantic decoration → lighting.

The exit has only its guardian connection. Required navigation never depends on a
secret. A generation-history penalty suppresses recently used architecture. Each
archetype has a clear fighting lane, with irregular traversal modules around it.
Flood fills verify portals and generated floor components. Pathfinding is invoked
for blocked enemy approaches rather than running for every frame of every actor.

Decoration uses its own seed and semantic locations: edge rubble/foliage, architectural
columns/banners, story features outside passage lanes, torch anchors, and lower ruins.
The stair area blends the next biome's materials and introduces its features. Deep
mutations layer environmental rules and art rather than merely applying a tint.

## Rendering costs and ownership

Each room has shared instanced batches, allowing native room-level frustum culling.
A custom 20-triangle beveled block replaces expensive generic rounded cubes. Rigid
actor pieces merge by material within animated joints; the cape remains deformable.
One directional light casts a bounded shadow map; six nearest torches illuminate the
scene without shadow maps. High quality adds bloom, fog sprites, and atmosphere.

World impacts feed a capped stream of lines and short-lived effect meshes. Room
changes clear actor ownership; floor changes release unique geometry, materials,
instancing buffers, and sprite materials. Shared material/geometry resources persist.
No reference image is used by the runtime. The original generated stone material is
an albedo/bump input, not a prerendered scene.

## Persistence

The v2 parser migrates v1 settings, discoveries, weapon unlocks, tutorial,
embers, and counters. No saved gameplay state is rewritten for the visual overhaul.
Unknown/malformed saves retain safe defaults. Active runs still do not resume on reload.

## Combat presentation and coordination

Simulation state/time maps to normalized clip time; an enemy contact is at 0.58,
matching the tell-to-active boundary. Rendering never fires damage events. Player
startup/recovery and execution contact are also sampled from simulation time. Joint
rotation blends are render-only. Elbows/knees articulate separately; two-handed
weapons use bounded analytic support-hand targeting, not terrain or full-body IK.

Profiles distinguish the disciplined Warden, asymmetric Aegis, sideways Duelist,
linear Lancer, low Reaver, upright robed Cantor, heavy Bellbreaker, hunched clawed
Sporebound, and elongated Saint. Motion recipes share semantic foundations while
altering multi-joint poses, guard, cadence, and stride per archetype. Death and
some recoveries still share a foundation and need further authored polishing.

Two enemies may prepare at once. Commitments reserve impact time with at least
480 ms between ordinary attacks (400 ms at depth 5+) and 720 ms around specials.
The reservation persists briefly after contact; interrupted enemies release it.
Patterns branch only between commitments. The phase-two Saint marks a floor
location before its delayed echo; leaving it or evading avoids the returning hit.

The combat laboratory replaces the active test floor, clears reservations/effects,
and isolates run/relic progression from the saved Chronicle. Clip scrubbing and
explicit camera selection are debug-only. A paused lab camera can snap to its
selected frame for inspection; normal camera transitions remain interpolated.

## v0.4 simulation components

- `characters.ts`: four data-driven disciplines, ranged capacities/casts and melee move multipliers.
- `projectiles.ts`: reusable bounded projectile store; swept circle contacts, ordered wall/actor
  resolution, ally-team filtering, expiry and environment/LOS tests. Coordinates remain 2D.
- `arsenal.ts`: authoritative firing, ranged AI, projectile defense/reflection and impact hooks.
  World supplies movement, damage, tell and break callbacks; the renderer makes no hit decisions.
- `items.ts`: ten item definitions and a five-total/two-per-kind selected-item inventory.
- `buffs.ts`: timed active effects, refresh policy, ward consumption and centralized modifiers.
- `loot.ts`: independent seeded reward stream, run pool, rarity selection, category weights and pity.
- `world.ts`: integrates move clocks, item commitment, recharge, effect expiry, pickup interaction,
  focus commands and existing combat/progression. Charges and durations advance in simulation time;
  pause, rewards and hit-stop freeze them. Room transitions clear projectiles and retain buffs/charges.

ThreatDirector accepts projectile travel time measured to the player’s contact radius, subtracting
launch offset and projectile radius. Reservations predict arrival at commitment, without reading
future input or steering released arrows. Player movement can change actual arrival time.
Ranged support rechecks ally lanes on release and uses physical wall collision in flight.

The same selected enemy is returned by World’s target getter for camera, HUD and combat.
The scene treats relative mouse gestures as target input in cinematic mode; renderer projection
maps those gestures to visible opponents. World validates target IDs and keeps attacks aimed at
the selected opponent. Simulation still resolves contacts independently of camera/animation.
Entering a room clears selection; target death falls back to a living opponent. Escape/pause and
leaving close framing release pointer capture and restore menu/free-aim behavior.

## v0.4 presentation

`presentation/gallery.ts` presents the four actual rigs in a disposable menu WebGL canvas.
It uses the same body profiles, weapons, idle sampler and selected-model hull outline as gameplay.
`Actor` creates an extruded-backface outline only for actors that need one; hidden shells do not
render. Gameplay hides the player hull and outlines only the focused enemy, following the user’s
correction. The player keeps existing rim lighting. Stronger focus width is an accessibility toggle.

`presentation/arsenal.ts` owns fixed pools of 48 projectile groups, 12 room pickup groups and eight
projectile-parry groups. Arrow fans and orb compression rings share prebuilt geometry/materials;
no geometry is created per projectile frame or projectile-parry event. Existing melee effects retain
the accepted effect lifecycle. Velocity trails, reflected colors, ground cues, debug paths and edge
warnings read simulation state. Camera group framing includes live hostile projectiles.

HUD shows empty/full charge marks and recharge, selected offering/capacity, and at most five buff
icons with remaining duration. Pause gives item/effect details; debug run stats expose all counters.

## Persistence and determinism

Save schema v2 remains under `hollow-canticle:v1` to retain existing installations. Its parser accepts
numeric versions 1/2, validates settings/counters/IDs, and maps unlocked or used weapons to characters.
New accessibility/tutorial fields default safely. Run inventory/buffs are deliberately transient.
Normal run settlement stores at most ten local summaries under `hollow-canticle:local-runs:v1`.
Malformed/unavailable history storage cannot prevent a run from ending. Reset removes both keys.
Training/lab settlement never writes these summaries or progression. No networking is involved.

Dungeon, attack choice and loot use separate seeded streams. Relic choices depend on owned relics
and the same sequence of reward interactions. Cosmetic particle RNG is separate. Four new ranged
relic hooks operate in Arsenal/recharge; the existing melee relic event system remains intact.

## v0.5 presentation assets

AssetManager owns shared textures, materials and named GLB templates. A promise per
pack deduplicates requests; cast loading precedes biome loading and happens once.
Only requested material families load. GLTFLoader uses MeshoptDecoder. SkeletonUtils
clones rigs; environment parts instance by material and per-room LOD. Quantized root
transforms are retained in instance matrices. ImportedActor owns its outline shells
and isolated Saint phase materials, while shared maps/geometry belong to AssetManager.

Imported dungeon assembly reads the existing room geometry and art seeds. It never
changes simulation collision. Biome lighting, height fog, decals and Shrine water
are presentation layers. Missing packs preserve the original procedural builder.
High/Medium/Low settings choose texture size, DPR, shadows, LOD, particles and decals.
Legacy quality booleans migrate to High/Low without changing the v2 storage key.
