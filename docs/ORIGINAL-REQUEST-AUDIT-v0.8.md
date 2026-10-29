# Original major-patch request audit — v0.8 candidate

Updated 2026-10-29. **Release acceptance is PARTIAL.** PASS means the implemented
requirement has direct source and regression evidence; it does not imply every
manual scenario in the release brief has been completed. PARTIAL identifies an
unmet acceptance gate, even where the underlying feature exists. No item is
silently moved to a later release. Package remains 0.7.0 until acceptance.

Baseline: `adb533e96da2565925a05ee3c58bc256733c4775`.
Branch: `codex/v0.8.0-five-realms` in `Guardianec/hollow-canticle-v05`.
See [QA](QA-v0.8.md), [implementation report](RELEASE-v0.8.md), and
[capture inventory](screenshots/v08/README.md).

## 1. Animation — PASS

**Implemented:** Living Steel locomotion/action/additive layers and transitions
are retained. Guardians use Blender rigs, semantic attack poses, anticipation,
impact/recovery and phase presentation; ambient wind affects cloth on High/Extreme.
**Evidence:** `src/game/presentation/animation.ts`, `imported-actor.ts`, `actors.ts`,
`tools/blender/guardians.py`; guardian and phase frame captures.
**Tests:** animation/overhaul/assets suites check layer behavior, finite posed bounds,
support hands and all imported rigs/LODs.
**Remaining limitations:** shared semantic clips rather than five bespoke mocap sets;
no full cloth simulation. Sustained human boss-readability sign-off remains outstanding.

## 2. Worldgen fixes — PASS

**Implemented:** one room-layout/collision source, wall/door sockets and gates remain;
the required boss dominates the exit route and server/offline descent requires its clear.
**Evidence:** `src/game/geometry.ts`, `dungeon.ts`, imported dungeon builder,
`shared/session.ts`, `World.interact`.
**Tests:** existing geometry/polish suites and 10,000-floor connectivity, mapping,
boss placement and exit-dominator validation; invalid-route descent rejection.
**Remaining limitations:** finite seeded graph/layout families; manual multi-floor
travel soak is still required for release QA.

## 3. VFX — PASS

**Implemented:** pooled v0.7 impact/perfect-deflect/guard-break/execution effects
remain, with five regional ground treatments, thrown presentation, cloud/ice/molten
layers and phase impacts. Critical telegraph meshes have their own fixed pool.
**Evidence:** `presentation/effects.ts`, `weapon-effects.ts`, `presentation/areas.ts`;
molten, frost-warning and phase captures.
**Tests:** existing effect budgets and new resource reuse/clear/dispose tests.
**Remaining limitations:** final frost outline/crystal refinement lacks a refreshed
browser capture; every effect under four-player weather load needs visual sign-off.

## 4. Difficulty — PARTIAL

**Implemented:** full roster HP exceeds max guard; bounded depth growth; slower guard
recovery; physical heal/whiff counters; bounded early-parry/dodge adaptation;
mixed party budgets; five authoritative hazards; distinct two-phase guardians.
Shinobi retains 9 raw katana damage and his deflect/Riposte/finisher route.
**Evidence:** `data.ts`, `realms.ts`, `World.tryContextAttack`, `areas.ts`,
`shared/scaling.ts`, `threat.ts`.
**Tests:** HP/guard invariants across realms/party sizes, bounded scaling, physical
heal counter, AoE/status/guard break and co-op scenarios. Existing character tests retained.
**Remaining limitations:** no complete unassisted five-Pilgrim timing/balance study;
cannot yet claim mash/heal/dodge acceptance targets from actual play. Browser approval
and FPS limitations are documented in QA. These are release gates, not future scope.

## 5. Mushrooms — PARTIAL

**Implemented:** ten new Blender-authored categories with three LODs each: tiny
cluster, thin cluster, wide cap, shelf, glowing cup, lantern, spore sac, landmark,
hanging growth and wall infestation. Irregular organic geometry, roots/gills,
localized emissive detail, three new PBR families, mycelial surfaces and instancing.
**Evidence:** `tools/blender/fungi.py`, materials/biomes/build scripts, manifest,
`fungal.glb`, Fungal preset screenshots.
**Tests:** complete asset build/validation, PBR/UV/AO/LOD/finite-bounds contracts.
**Remaining limitations:** generated authored geometry still needs artistic acceptance
against the concept boards; the inspected samples are not a complete close-up review
of all ten forms. GPU transition soak and landmark readability remain open.

## 6. Extreme/weather/light shafts — PARTIAL

**Implemented:** regional ash/dust, leaks/rain/mist, spores, snow/blizzard, furnace
embers; gradual intensity/wind; local GPU buffer; fog/water/cloth responses.
All presets retain atmospheric identity. Seeded, varied analytic shaft volumes
replace fixed striped cards. Extreme adds density, range, fog, shadow and shaft detail.
**Evidence:** atmosphere/graphics/shaft modules, renderer, five regional images,
Fungal preset comparison and updated shaft captures.
**Tests:** quality density, combat attenuation, deterministic safe/varied openings,
stable main opening, reduced motion, resource disposal.
**Remaining limitations:** final full comparison/capture matrix and moving dust/blizzard
sequences are blocked by automatic browser approval usage limits. No ambient audio
expansion specific to weather events was added; existing biome ambience remains.
Artistic spectacle and combat readability still need final human approval.

## 7. Optimization/Very Low — PARTIAL

**Implemented:** pooled GPU weather/dust, bounded area visuals, instanced fungus/LODs,
small-fungus shadow removal, reduced room visibility, biome resource trimming,
less per-joint allocation, weather attenuation under critical combat, cheaper Very Low.
**Evidence:** presentation modules, graphics profiles, raw CPU/load/render metrics.
**Tests:** resource reuse/dispose tests, measured authority scenarios and local load
sample. Fungal Very Low submits 71% fewer calls and 91% fewer triangles than High
in the recorded fixed scene.
**Remaining limitations:** valid FPS is explicitly blocked by browser throttling,
as accepted by the user. Client/GPU timing, integrated GPUs and a long transition
memory soak remain unverified. Dynamic resolution was not introduced without evidence.

## 8. Shinobi — PASS

**Implemented:** distinct v0.7 rig/katana/springlock, low raw HP damage, high guard
pressure, nonlethal melee/ranged Riposte, server eligibility/range/expiry checks retained.
**Evidence:** characters, riposte, arsenal, protocol and existing Shinobi Blender asset.
**Tests:** arsenal, character/animation and real four-client authoritative Riposte checks.
**Remaining limitations:** extended new-enemy balance playthrough still required;
no excessive normal katana damage compensation was applied.

## 9. Boss every floor — PARTIAL

**Implemented:** one mandatory realm guardian per generated floor, five distinct
Blender silhouettes/patterns, two phases, guard-based finishers that cannot delete
a full boss, boss titles/intros, bounded repeat-cycle variants, target switching,
one optional support add for 3–4 players and modest party HP scaling. Personal boss
relic rewards and exactly-20-HP room-clear revival remain.
**Evidence:** realms/dungeon/session/world, guardian pipeline, five boss images.
**Tests:** 10,000 floors, five mappings, phase patterns, HP/guard ratios, sealed
descent, single guardian scaling, 2/3/4-player clear/revival and wipe scenarios.
**Remaining limitations:** all five encounters need complete interactive phase-II
playtests, and a four-player boss recording is missing. Phase reveal currently uses
material/body presentation rather than physically detachable armor/shield pieces.

## 10. Item switching clarity — PASS

**Implemented:** offering quickbar, quantity/name/use description, keyboard cycling,
satchel descriptions and buff timers retained. Crimson Vial has a readable 0.8-second
commitment and unchanged 30 HP healing; loot rates are not inflated.
**Evidence:** UI/HUD/items/inventory modules and captured quickbar.
**Tests:** inventory, arsenal, use timing/interruption and personal multiplayer rewards.
**Remaining limitations:** complete harder-floor item-economy playtests remain outstanding.

## 11. Tutorial — PASS

**Implemented:** optional first-run/replay courtyard retained, with a brief AREA
ATTACKS lesson: leave marked ground before it becomes dangerous. Shinobi's extra
Riposte teaching remains; save flags and opt-out remain compatible.
**Evidence:** `training.ts`, `World` training progression, UI first-run flow.
**Tests:** training/save regression tests; existing courtyard manually inspected.
**Remaining limitations:** the added AoE lesson needs a final interactive replay
after the last implementation changes.

## Release decision

Five requirements remain PARTIAL (4, 5, 6, 7, 9). Final release acceptance has
**not** been reached. No package version bump or merge should represent this as
accepted v0.8. The concrete blockers and outstanding evidence are in QA; the feature
work is retained and reviewable on its dedicated pushed branch.
