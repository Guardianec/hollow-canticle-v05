# v0.5.0 validation — 2026-10-24

Local review branch: `codex/v0.5.0-blender-visual-overhaul`. Accepted v0.4 remains at
`8c83c8c4baa3476aaa9caa7b37bb9debfe13efd4`; main is unchanged. The user requested
local work. No push, merge or deployment is part of this checkpoint.

## Rebuild and automated checks

- `npm run assets:build`: Blender 4.5.15 LTS, cached lossless material bakes,
  geometry AO, three LODs, six GLB packs, meshoptimizer compression and WebP maps.
- `npm run assets:validate`: 152 assets, 15 PBR families, 505,800 unique LOD0 triangles.
- `npm run lint`, `npm run test`, `npm run build`.
- 102 tests in eight files retain simulation regression coverage. Asset checks load
  every GLB through GLTFLoader/MeshoptDecoder, verify UVs, vertex colors, materials,
  three LODs, finite dimensions and 18-bone cloned rigs. Extreme joint poses,
  support-hand reach, outlines, missing-pack fallback, deterministic selection and
  quality migration are covered. Unit tests do not judge visual quality.

Windows sandbox temp-directory rename failures were resolved by directing TEMP/TMP to
ignored `.cache/test-tmp/`. No application behavior or test timeout was changed.

QA caught two material-pipeline errors: optimization had removed unused UVs, and
Blender's default export put baked AO in COLOR_1 while COLOR_0 remained white. UVs are
now explicitly retained and active vertex color exports to COLOR_0. Browser QA also
caught and fixed a reserved GLSL identifier in the decal shader. Failed intermediate
runs are not counted as successful validation.

Metallic albedo now bakes through emission: diffuse baking had incorrectly attenuated
the metal color before runtime lighting. The validator checks the worn-iron base-color
mean to catch that regression. Imported textures use glTF's flipY=false convention.
Material-study spheres supply white vertex colors for the shared vertex-colored shader.

## Procedural and rendering checks

Production output is served locally on port 4173. The fixed art scene supports all
five regions, four Pilgrims, enemy selection, Saint phase II, attack/parry/dodge/
finisher sampling, three quality levels, materials and old/new views. Captures in
`docs/screenshots/v05/` come from the running browser, not reference composites.

Generated rooms were inspected with seeds `V05-DARK-01`, `V05-DARK-02` and
`V05-DARK-03`; the initial checkpoint also checked `V05-RUINS-A/B/C`. Regional lab
scenes exercise the same imported renderer in gameplay, including Shrine water and
focused outlines. The fixed scene never replaces procedural gameplay. Automated
coverage retains navigation, encounters, projectiles, reflection, targeting, items,
loot, boss patterns and combat semantics.

Desktop, tablet and narrow layouts are inspected. Review controls scroll at short
heights. Keyboard/mouse remain required for gameplay. Reduced motion pauses optional
atmosphere animation in the review scene.

The real duel test recorded one parry and one perfect deflection, followed by a
finisher using the imported models. The cathedral capture is generated room 13 at
depth 3 for `V05-DARK-03`, not the fixed benchmark. High, Medium and Low were changed
through game settings; the final saved preference was restored to High. The narrow
menu was checked at 390×844, gameplay at 1440×900 and the art review at desktop sizes.

Active review views around 60 FPS are observations, not minimum-spec guarantees.
Background tabs throttle to about 1 FPS; those figures are not performance evidence.
Draw-count snapshots are not timings and do not measure shadow, postprocessing or
browser composition costs. Asset-library triangle counts are not per-frame budgets.

## Download and memory

All full-resolution GLBs/maps total about 30.01 MiB; initial Ruins/cast art about
13.93 MiB. Other packs load on demand. Static deployment includes both map resolutions
and all GLBs, so its on-disk size exceeds the initial network load. Blender, source
bakes, reference sheets and screenshots are not shipped by Vite. Exact byte counts
follow after the final build.

| Measurement                             |      Bytes |   MiB |
| --------------------------------------- | ---------: | ----: |
| All GLBs and full-resolution maps       | 31,470,176 | 30.01 |
| Initial Ruins/cast art, High            | 14,609,850 | 13.93 |
| Initial Ruins/cast art, Medium/Low      |  9,378,612 |  8.94 |
| Complete uncompressed static deployment | 41,433,482 | 39.51 |

The initial art totals exclude application code/fonts and include all three GLB LODs.
Network transfer can be smaller with server compression. Compressed file size does
not represent decoded GPU memory.

Ten initial families mean forty 1024px textures on High. RGBA8 plus mipmaps implies
approximately 213 MiB decoded texture storage before geometry, framebuffers, driver
overhead and transient decode copies. Medium/Low reduce that estimate to 53 MiB.
Visiting all regions can retain fifteen families, approximately 320/80 MiB respectively.
These are estimates, not measured GPU-memory readings.

## Polish checkpoint

The full requested polish list, including the enemy-leg fix, is documented in
[POLISH-v0.5.md](POLISH-v0.5.md), along with final browser-review limitations.

## Limits

No multi-hour GPU soak, broad browser/hardware matrix, every extreme orbit angle or
complete five-floor manual combat replay is claimed. Reference parity and artistic
acceptance remain open. The visual review records modeling and animation limitations.
Do not infer those approvals from passing unit tests or successful asset export.

Headroom compressed repetitive build logs on demand. Its configured proxy was
unreachable, so source review used focused local reads; this was not automatic
compression of all tool traffic.
