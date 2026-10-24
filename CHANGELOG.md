# Changelog

## 0.5.0 polish — 2026-10-24 (local checkpoint)

- Reduced bloom and Shrine reflections while retaining separate regional lighting.
- Mixed six flagstone layouts into seeded surface patches and varied architectural detail.
- Added three executions per pilgrim, shared-root body motion and articulated ankles.
- Rebuilt strike and melee/projectile deflection effects with thin trails and contact sparks.
- Added clear descent seals, automatic doorway passage, E/click fallback and readable HUD icons.
- Concealed initial/biome loading and suspended simulation until art settles.
- Validated 152 assets and 102 tests; see `docs/POLISH-v0.5.md` for captures and review limits.
- Publication uses a separate v0.5 repository and browser-save namespace to preserve
  the alpha; validation expands to 105 tests including save isolation and migration.

## 0.5.0 — 2026-10-23 (local visual review build)

- Expanded the Blender pipeline to all five biomes: 124 environment assets, 13 rigged
  characters and 15 PBR families, with three LODs throughout.
- Preserved seeded gameplay generation. Authored modules follow existing walkable
  tiles, connections and art seeds; visual detail does not alter collision or combat.
- Restored darker regional lighting: blue/amber Ruins, teal Shrine, violet Fungal,
  moonlit Frozen and smoky orange Foundry. Added seeded decals and reactive Shrine water.
- Refined armor, cloth, weapon silhouettes, two-handed grips and the Saint phase-II cue.
- Added meshoptimizer GLB compression, lazy pack/material loading, UV/color preservation
  checks and three gameplay quality levels with legacy setting migration.
- Added complete cast/biome review controls, screenshots and updated validation notes.
  This remains a local review build with documented artistic and hardware limits.

## 0.5.0-benchmark — 2026-10-23 (Ruins art gate candidate)

- Preserved v0.4 at `8c83c8c4baa3476aaa9caa7b37bb9debfe13efd4` and began the isolated
  `codex/v0.5.0-blender-visual-overhaul` branch. Main is unchanged.
- Added a reproducible, headless Blender 4.5 pipeline: 23 Ruins modules, Oathkeeper and
  Warden rigs, authored sword/shield, UVs, three LODs and geometry-baked vertex AO.
- Baked seven shared PBR families; generated 1024px/512px WebP runtime maps with Sharp.
- Added a central GLB resource owner, skinned cloning, seeded module selection, per-room
  instancing, imported/procedural modes and graceful pack failure fallback.
- Retargeted existing semantic poses to Blender rest frames, including skinned focus outlines.
- Added world-space height extinction, deep supports, gradient void and slow chasm mist.
- Added a fixed Ruins benchmark, material study, close duel and old/new comparison.
- This is not complete v0.5 acceptance. Four biome rebuilds, the remaining cast and further
  art refinement are gated on a convincing Ruins benchmark. See the visual review.

## 0.4.0 — 2026-10-23 (arsenal review build)

- Built from accepted v0.3 SHA `17dd5e932f48609993fee133185265fe0e701400` on
  `codex/v0.4.0-arsenal-ranged-loot`; the checkpoint and main branches remain unchanged.
- Added four Pilgrims with distinct models/stances, four-step chains, counters, heavy,
  dodge and advancing attacks, plus different cast animations and inherent traits.
- Added Silver Needle (3/8s), Moth Knives (5/5s), Pilgrim’s Javelin (2/11s) and Last Toll
  (2/12.5s), sequential recharge, charge HUD and replenishment feedback.
- Added Archer/Acolyte support compositions, LOS/ally lanes, retreat/panic behavior,
  bounded predictive aim, additional melee patterns, and a new attack in each Saint phase.
- Added swept projectiles, wall collision, standard dissipation, perfect reflection,
  shooter recoil/guard breaks, distinct pooled metallic/magic effects and audio.
- Added ten bounded consumables, committed use, eight refreshable timed effects,
  physical pickups, inventory cycling, duration HUD and item/recharge synergies.
- Replaced guaranteed ordinary relics with seeded weighted loot, capped pity,
  restricted run pools, rarity weights and four ranged-system relics.
- Added model-based selection with a clear outline and qualitative discipline details.
  Per the follow-up correction, gameplay outlines the focused enemy. Cinematic combat
  hides the cursor, mouse motion/Tab switches focus, and exploration restores free aiming.
- Preserved v1 progress with a v2 schema migration and added ten local run summaries.
  Expanded the laboratory and automated projectile, item, loot, focus and journey checks.
- Retained the accepted dungeon, animation framework, group pressure, boss phase two,
  atmosphere and cameras. Full multi-floor human balance sign-off remains outstanding.

## 0.3.0 — 2026-10-23 (review build)

- Added archetype body/stance profiles, articulated elbows and knees, support grips,
  asymmetric armor, a clawed Beast, and the Saint's removable mantle and revealed crown.
- Replaced Actor state-pose blocks with sampled multijoint clips, directional cuts,
  distinct thrust/sweep/smash/grab/feint tracks, weapon executions, and transition blending.
- Added overlapping preparations with immutable impact reservations and longer
  spacing around evasive attacks. Enemies reposition and avoid striking through allies.
- Added contextual mixups, deep-floor sequences, authored encounter pairs, and
  behavioral Patient, Relentless, and Armored elite traits.
- Added phase-two Saint sequences and a delayed floor echo that can be escaped.
- Changed Oathkeeper's normal parry window from 240 to 220 ms; perfect timing remains
  85 ms. Empty parries add guard damage and reduce the normal window, with reset on
  a successful deflection or quiet interval. Input buffering remains.
- Added weapon/type-specific trails, a blue-white parry core, biome-colored impact
  debris/ripples, contact shadows, cool rim light, and contact-timed execution impacts.
- Added combat-wide/boss/finisher framing and a combat lab with compositions,
  elites, biome/depth/pattern selection, clip scrubbing, stepping, and timing telemetry.
- Expanded regression coverage to 52 tests. Preserved dungeon/navigation, relics,
  saves, and the v0.2 deployment. Human full-run balance sign-off remains outstanding.

## 0.2.0 — 2026-10-23

- Replaced the flat Canvas room board with a WebGL 2.5D world: irregular raised
  platforms, physical bridges and stairways, tall architecture, lower ruins, and a following camera.
- Rebuilt seeded floor topology with turning main routes, guaranteed loops, side
  branches, protected exits, secrets, and ten authored spatial grammars.
- Shared geometry now drives navigation, collision, decoration, lighting anchors,
  and placement. Added enemy pathfinding around voids and visible encounter gates.
- Added a low-angle cinematic duel presentation, combat-detail articulated rigs,
  distinct weapon meshes/trails, impact bursts, recoil, and finisher framing.
- Added local torch lighting, shadows, bloom, foreground visibility cutouts,
  biome atmosphere, animated water/cloth, fungi/roots, frost, machinery, and transition dressing.
- Reworked HUD, discovered minimap, quiet titles, and QA graph/performance tools.
- Preserved v1 saves and combat timing values. Corrected ice momentum for camera-relative movement.
- Added geometry/navigation/camera tests, production chunking, visual comparison docs,
  a generated original stone material, and dependency/asset credits.

## 0.1.0 — 2026-10-23

- Added seeded, branching dungeon floors, recovery routes, secrets, and endless descent.
- Added buffered parry combat, perfect deflections, counters, posture, dodges, adaptive finishers, and Focus resonance.
- Added eight enemy archetypes, a two-phase guardian, four weapon identities, and eighteen event-driven relics.
- Added five biomes, deep-floor mutations, encounter modifiers, procedural masonry, particles, light pools, and generated audio.
- Added safe training, rewards, pause, settings, a death chronicle, weapon unlocks, and versioned local saves.
- Added deterministic tests, 10,000-floor stress validation, CI, and a GitHub Pages workflow.
