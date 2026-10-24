# Hollow Canticle v0.5.0 — local visual review

The five-biome rebuild is integrated into the procedural game. This is a local review
build, with artistic and hardware acceptance limits recorded below. The supplied
sheets remain the target; these browser screenshots show the actual result.

## Scope and provenance

- Accepted v0.4: `8c83c8c4baa3476aaa9caa7b37bb9debfe13efd4`.
- Branch: `codex/v0.5.0-blender-visual-overhaul`. Kept local at the user's request;
  main remains unchanged. Initial Ruins checkpoint: `26bf0b9`.
- Blender 4.5.15 LTS, original Python-authored meshes and procedural material sources.
  No external model library, paid generator or reference-image textures.
- Three.js remains the renderer. Seeded routes, collision, encounters, combat timing,
  projectiles, rewards and progression retain the existing simulation. Save settings
  gain three quality levels with migration from the legacy boolean.

## Procedural assembly

The fixed `?benchmark` scene is an inspection tool. Normal gameplay still generates
its room graph and geometry from the run seed. Imported slabs follow walkable tiles
and elevation; walls, links, bridges and props follow that same room geometry. Room
art seeds choose variants, rotations, rubble and surface wear. Connection dimensions
stay fixed. Water follows actual Shrine walkable tiles and leaves void gaps exposed.
Artistic meshes never become simulation colliders.

The library has **139 environment assets and 13 characters**, each with three LODs.
The unique LOD0 library totals **505,800 triangles**; this is not a per-frame budget.
All five biomes have compatible kits. Shrine adds swept eaves, channels and lanterns;
Fungal adds curved growths and roots; Frozen adds top-facing snow, icicles, ice shards
and drifts; Foundry adds pressure pipes, interlocked chains, gears and furnaces.
Common structural ancestry remains visible, especially in arches and statues.

## Cast and motion

Oathkeeper, Moth, Lancer and Bellbearer have distinct widths, cloth and weapons.
Warden, Duelist, Archer, Assassin, Monk, Hexer, Brute, Saint and Beast are imported.
Spear enemies share Lancer's asset; Cinder Warden soldiers share Oathkeeper's sword
silhouette, while Grave Aegis uses the shield-bearing Warden. Beast has a separate corded body, talons and thorned
back. Faces and fingers remain abstract.

Eighteen semantic bones preserve sampled poses. Armor stays rigid; cloth blends at
elbows/knees and the cloak uses three bones. Open curved shoulder lames, smaller boots
and helmets, layered faulds and a shaped breastplate refine the first checkpoint.
Spear thrusts orient forward; two-handed weapons use support-arm IK. Saint phase II
has an isolated ember rim and cloak flare. Focused targets retain skinned outlines.
Grip polish and extreme cloak/robe poses still merit inspection. There is no physical
cloth simulation or terrain IK.

## Surfaces and darkness

Fifteen shared PBR families have separate base color, tangent normal, roughness and AO
maps at 1024px, with 512px alternatives. Color is sRGB; scalar/normal maps are data.
Metalness is per family. Cycles also bakes geometry AO into vertex color, with mineral
stains and low moss on stone. Export explicitly places this into COLOR_0; optimization
preserves UVs and colors. Seeded decals add moss, dirt, frost and soot. Fungal pores
glow sparsely. Shrine water has moving normals, environment reflections and interaction
ripples; it does not use planar reflections.

The user's darker-vibe correction applies to both gameplay and the review scene:

| Region  | Ambient and moon   | Local light                   | Fog                                     |
| ------- | ------------------ | ----------------------------- | --------------------------------------- |
| Ruins   | Low blue-gray      | Amber pools                   | Cold blue void                          |
| Shrine  | Restrained teal    | Pale cyan/green               | Damp deep teal                          |
| Fungal  | Very low violet    | Purple pools and sparse pores | Heavy violet darkness                   |
| Frozen  | Dim blue moonlight | Icy pale light                | Steel-blue, with brighter snow surfaces |
| Foundry | Low warm fill      | Orange fire                   | Brown smoke and ember haze              |

Directional PCF shadows, contact effects and baked AO anchor forms. A character rim
and stronger metal environment response retain shape in darkness. Torches use bounded
nearest-light selection and seeded flicker. No point-light shadow maps, SSAO or
raymarched volumetrics are implemented.

## Void and performance

There is no ground plane. Supports extend 65 m down. Height fog adds
`1 - exp(-max(0, walkingHeight - worldY)^2 * 0.024)` to distance fog: about 91% opacity
10 m below the path and 99.5% at 15 m. Three broad mist sheets and distant architecture
supply scale. Background and fog colors match.

GLBs use meshoptimizer compression. Instanced material groups share geometry. Room
LODs switch at 32/65 m on High and earlier at lower settings. Distant scenery uses
LOD2. Characters use LOD0 in close combat on High and LOD1 otherwise. Packs load on
demand; the cast loads once across region changes.

High uses 1024px maps, up to 1.5 DPR, 2048px shadows and full particles/decals. Medium
uses 512px maps, 1 DPR, 1024px shadows, earlier LOD and fewer particles. Low uses
512px maps, 0.8 DPR, two dynamic lights and reduced mist, with shadows, bloom,
particles and decals disabled. `?visual=fallback` retains the original presentation.

All full-resolution art is approximately **30.01 MiB** before HTTP compression. Initial
Ruins/cast art is approximately **13.93 MiB**. Other packs load on demand. Deployment
also contains 512px alternatives, code, fonts and licenses. [QA details](QA-v0.5.md).

## Polish checkpoint

The [polish review](POLISH-v0.5.md) covers mixed flagstones, lighting/reflection
corrections, clear descent seals, automatic doorway travel, loading concealment,
readable HUD controls, twelve executions, new contact effects and connected legs
with articulated ankles. The local walking-plane stance solver is not terrain IK.

## Actual screenshots

![Generated room](screenshots/v05/procedural-seed-02.jpg)
![Ruins](screenshots/v05/ruins-dark.jpg)
![Shrine](screenshots/v05/shrine-dark.jpg)
![Fungal](screenshots/v05/fungal-dark.jpg)
![Frozen](screenshots/v05/frozen-dark.jpg)
![Foundry](screenshots/v05/foundry-dark.jpg)
![Oathkeeper and Warden](screenshots/v05/oathkeeper-warden.jpg)
![Moth](screenshots/v05/moth.jpg)
![Lancer](screenshots/v05/lancer-thrust.jpg)
![Bellbearer](screenshots/v05/bellbearer-overhead.jpg)
![Saint](screenshots/v05/saint.jpg)
![Saint phase II](screenshots/v05/saint-phase-two.jpg)
![Bridge and void](screenshots/v05/void.jpg)
![Materials](screenshots/v05/materials.jpg)
![Comparison](screenshots/v05/comparison.jpg)
![Generated cathedral](screenshots/v05/cathedral.jpg)
![Actual perfect deflection](screenshots/v05/perfect-parry.jpg)
![Actual finisher](screenshots/v05/finisher.jpg)

Earlier benchmark captures and the v0.4 baseline remain for history. Reference
traceability is in [V05_ART_DIRECTION.md](V05_ART_DIRECTION.md).

## Remaining acceptance limits

The full content path is implemented, but the result is simpler than the supplied
illustrations. Repeated module silhouettes, armor trim, hand detail, cloth intersections
and long-session GPU behavior remain refinement targets. Automated checks do not
establish art quality. No broad hardware/minimum-spec or complete multi-floor human
playthrough sign-off is claimed. This build supports local inspection and further art
iteration; it does not claim reference parity.
