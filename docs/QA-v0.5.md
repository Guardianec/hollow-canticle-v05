# v0.5 Ruins benchmark QA — 2026-10-23

This record covers the first benchmark milestone, not full five-biome release acceptance.
The art gate is still open. See [visual review](VISUAL_REVIEW-v0.5.md).

## Baseline and automated validation

Accepted v0.4 SHA: `8c83c8c4baa3476aaa9caa7b37bb9debfe13efd4`. Before edits,
lint, 92 tests and production build passed. The Windows sandbox denied Vitest's default
temporary-cache rename. Setting `TEMP` and `TMP` to the workspace `.cache/` resolved it.

The candidate passes:

- `npm install` (installed free Sharp and Node declarations; no runtime content service).
- `npm run assets:build` with Blender 4.5.15 LTS, including bakes, LODs, GLBs,
  WebP encoding and validation. Repeated builds use the lossless bake cache.
- `npm run assets:validate`: 25 assets, seven material families, three LODs per asset.
- `npm run lint` and `npm run build`.
- `npm run test`: **96 passing tests in seven files**. All 92 prior tests remain.

A second full asset build produced identical GLB SHA-256 hashes:

```text
ruins.glb    72dbc525ba1c1f4ad37a73eb7cb7663fc44afa53f181c2623a5a028e0d852985
pilgrims.glb bb27ea738dbd2682d5f5351b84c0700595abd526ce83bdc31c863e3490badae7
```

The new tests load the actual binary glTF files through GLTFLoader, validate named nodes,
finite bounds, skeletons, LOD budgets, material IDs and referenced map existence. They
exercise multi-material instancing, cloned skin deformation and focused-outline shells,
seeded selection, biome fallback selection and missing-pack/fallback behavior. No unit
test is claimed to judge image quality.

One intermediate 10,000-floor stress run timed out while Blender was baking on the same
CPU. It passed again after the bake finished, with no simulation change or timeout increase.
The supplied Node runtime is 22.12; npm reports an existing ESLint dependency engine
warning. README continues to recommend Node 24 LTS.

## Browser checks

Served the actual `dist/` build on localhost port 4173 and inspected its rendering and
console. Reviewed exploration, close duel, bridge/void, surface study and old/new views.
Reviewed overhead, thrust and finisher samples, along with the added parry/dodge scrubs.
High, Medium and Low settings render; Low drops to about 49 main-view calls and 65k
triangles in the fixed exploration view, compared with about 83 calls and 477k on High.
These are scene counts, not comprehensive GPU throughput measurements.

Imported gameplay was inspected on seeds `V05-RUINS-A`, `V05-RUINS-B` and
`V05-RUINS-C` via the seeded-run UI and regeneration controls. A spawned Warden in
duel range rendered with a working skinned focus outline. Procedural fallback was
checked using `?visual=fallback`. There were no captured JavaScript or shader compilation
errors in those checks. Earlier development-only precision warnings came from the
graphics driver; an obsolete shadow-map constant was replaced before final validation.

The benchmark and fallback menu were inspected at 390px width, and the benchmark at
768px width. Controls fit; the game
retains its existing keyboard/mouse requirement. Viewport overrides were reset afterward.
Background browser tabs throttle animation to approximately 1 FPS, so that figure must
not be used as a performance result. Approximately 60 FPS was seen with an active view;
there is no broad hardware, thermal, long-session or minimum-spec sign-off.

Automated regression coverage includes simulation navigation, encounter generation,
projectiles, reflection, targeting, items, loot, boss patterns and combat semantics.
This session did not manually replay every combat mechanic, complete all five floors,
test every extreme orbit angle or approve the visual quality target.

## Known acceptance gaps

Only Ruins, Oathkeeper and Warden have imported benchmark assets. Other cast members,
the Saint, four other biome kits, decals, water improvements and the complete requested
screenshot set remain unfinished. Character posing is functional but armor design,
shoulder transitions, cloak motion and grip fidelity need further art work. Platforms
and wall fragments still expose repetition. Do not describe this branch as completed
v0.5 or as matching the supplied art sheets.

The initial branch push was rejected by automatic approval review because exporting
repository contents to the GitHub remote had not been specifically authorized. Local
work continued; remote publication requires explicit approval for that destination and data.
