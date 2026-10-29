# v0.8.0 — Trials of the Five Realms: candidate QA

Updated 2026-10-29. This is an implementation candidate, **not release acceptance**.
Package version remains 0.7.0 until the missing acceptance checks pass. Multiplayer
identifies itself separately as protocol 8 / build `0.8.0-candidate`.

## Baseline and repository

Base: `adb533e96da2565925a05ee3c58bc256733c4775`, the accepted Living Steel head.
The configured `origin` points at the older `Guardianec/hollow-canticle` repository;
fetching and fast-forwarding its main did not provide v0.7. The requested repository
was fetched as `v05` (`Guardianec/hollow-canticle-v05`), whose main matched the
accepted commit. Work uses `codex/v0.8.0-five-realms`, pushed there immediately.
No v0.7 history was overwritten and no merge is authorized or performed.

Baseline install, lint, build, 176 tests and the separate 43-test server invocation
passed. The latter tests overlap the full suite. Living Steel layers, Shinobi,
authoritative Riposte, shared room geometry, five presets, VFX, quickbar/satchel,
tutorial and authoritative co-op/Duel were verified in the source and tests.
Rendered tutorial, quickbar and Lab samples were inspected. A complete baseline
solo floor, co-op floor and Duel were **not** manually completed before editing;
that requested baseline manual gate was not fully satisfied.

## Automated validation

Latest validation on 2026-10-29:

| Check                              | Result                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm install`                      | PASS; Node 22.12 engine warning from eslint-visitor-keys, which requests 22.13+ on Node 22   |
| `npm run assets:build`             | PASS, two complete reproducible Blender builds during implementation                         |
| `npm run assets:validate`          | PASS: 168 assets, 20 PBR families, 660,353 aggregate LOD0 asset triangles                    |
| `npm run lint`                     | PASS before the final hazard posture correction; rerun recorded below                        |
| `npm run build`                    | PASS, production client emitted; final rerun recorded below                                  |
| `npm run build:server`             | PASS; final rerun recorded below                                                             |
| `npm run test`                     | 200/200 before the additional hazard guard-break regression test; final count recorded below |
| `npm run test:server`              | 45/45 before the final hazard posture correction; final rerun recorded below                 |
| Shaft + Five Realms targeted tests | 23/23 including the new hazard guard-break/ward test                                         |
| Built server `/healthz`            | PASS: `{ "ok": true, "protocol": 8, "build": "0.8.0-candidate" }`                            |

The full asset/rig contract exceeded Vitest's default five seconds on one run.
Its timeout is now 15 seconds for loading every real GLB and checking all rigs/LODs;
assertions were retained. The next full run passed. Tests use a workspace-local
TEMP/TMP and local WebSocket access; this environment otherwise denies those sockets.

The 10,000-floor test checks one reachable boss, no boss in start, connected graphs,
correct realm mapping, and that removing the boss disconnects the exit from start.
Independent gameplay checks reject descent even if an invalid/debug route reaches
the exit. Existing geometry/socket/gate tests remain active.

Area tests exercise all five kinds, warnings, damage timing, no duplicate ticks,
entry/exit, expiry, status expiry, dodge immunity, ward protection and posture breaks.
Real two-client room tests check semantic area/status replication and server-owned
damage. Session scenarios cover 2/3/4-player boss clears, exactly 20 HP revival,
party wipes, one guardian rather than duplicates, and modest stat scaling.
Old-protocol joins are rejected before room mutation. Existing Duel and Shinobi
Riposte tests remain in the suite.

## CPU and networking measurements

[Raw authority profile](metrics/v08-simulation.json), refreshed 2026-10-29. Each
scenario simulates 1,800 ticks / 60 seconds; these are instrumented CPU timings,
**not rendered FPS**. Invincible players keep pressure active. Weather and graphics
labels here do not measure a GPU; cosmetics remain outside authority simulation.

| Scenario                             | Mean tick ms | p95 tick ms | Process RSS MiB |
| ------------------------------------ | -----------: | ----------: | --------------: |
| Ordinary Ruins                       |       0.0161 |      0.0301 |            93.0 |
| Fungal mixed room                    |       0.0182 |      0.0361 |            97.4 |
| Frozen scenario                      |       0.0069 |      0.0108 |            92.5 |
| Two-player Foundry pressure          |       0.0837 |      0.1919 |            97.8 |
| Solo guardian                        |       0.0130 |      0.0240 |            98.8 |
| Four-player guardian                 |       0.0208 |      0.0403 |            94.6 |
| Four-player multiple areas           |       0.0661 |      0.1281 |            95.5 |
| Four-player guardian / Extreme label |       0.0376 |      0.0903 |           111.2 |

The profile records aggregate AI and area execution time separately. Client
animation, particles and weather CPU/GPU timings have not been isolated reliably.

[Local load sample](metrics/v08-load.json): five rooms, twenty SDK clients, eight
enemies per room including guardians, projectiles and areas, 15.01 seconds.
Rooms sustained 29.92–30.05 ticks/s. Combined server **and clients** used 38.1%
of one core, RSS 159.9 MiB, heap 54.1 MiB, event-loop p95 27.36 ms / max 45.97 ms.
Payload traffic was about 4,586 downstream and 589 upstream bytes/client/s,
excluding framing/TLS. This short local sample is not a sustained Render Free test.

## Rendering measurements

**FPS: BLOCKED BY BROWSER THROTTLING.** The IAB reported roughly 0–2 FPS while
the tab was throttled. The user explicitly requested recording FPS as blocked.
Those values are not hardware performance results and cannot establish playability.
Detected adapter: NVIDIA RTX 4070 SUPER through ANGLE/D3D11. Debug captures preserve
the drawing buffer, which also differs from ordinary production rendering.

[Fungal fixed-scene counters](metrics/v08-render.json), 1280×720, 2026-10-25,
before the subsequent shaft rewrite:

| Preset   | Draw calls | Approx triangles | Visible weather | Geometries / textures |
| -------- | ---------: | ---------------: | --------------: | --------------------: |
| Very Low |        181 |          251,000 |              12 |              221 / 50 |
| Low      |        299 |          946,000 |              42 |              230 / 50 |
| Medium   |        625 |        2,636,000 |             119 |              231 / 65 |
| High     |        629 |        2,845,000 |             345 |              231 / 65 |
| Extreme  |      1,001 |        6,155,000 |             915 |              239 / 65 |

Very Low reduced this scene's calls by 71% and triangles by 91% against High,
in addition to reduced render scale, no shadows/bloom and lower texture resolution.
This demonstrates lower workload, not an FPS guarantee. Extreme's six million
submitted triangles and transparency still need sustained GPU profiling.

[Updated Ruins shaft scene](metrics/v08-shafts.json), 1254×884, 2026-10-28:

| Preset   | Calls | Approx triangles | Weather | Geometries / textures |
| -------- | ----: | ---------------: | ------: | --------------------: |
| Very Low |    74 |           67,000 |       9 |              119 / 38 |
| Low      |   120 |          288,000 |      32 |              130 / 38 |
| Medium   |   287 |        1,141,000 |      90 |              134 / 52 |
| High     |   292 |        1,698,000 |     260 |              134 / 53 |

The last fixed-scene Extreme capture was blocked by browser automatic approval;
an earlier updated Extreme Ruins and Shrine sample had already been inspected.
These two tables use different scenes and must not be compared as a before/after.

GPU timestamp queries, transparent overdraw, client heap bytes and long-session
texture/geometry growth remain unmeasured. Resource reuse/disposal is checked at
object level in tests; that does not establish a leak-free multi-floor GPU soak.

## Shaft refinement

The former crossed striped cards were replaced by soft analytic cone volumes.
A separate seeded art stream selects 0–3 separated openings on safe room tiles;
bosses/shrines receive openings, ordinary chambers only occasionally do. Width,
height, lean, slit/oval shape, top aperture, brightness and regional tint vary.
Beams fade at floor and into the unseen dark vault; no outdoor sky is introduced.
Noise, broken aperture density and sparse drifting dust replace the repeated bands.

Very Low/Low retain the strongest opening with one density sample. Medium/High/
Extreme use 2/3/5 samples, richer noise and 8/16/32 dust points per opening.
The fixed pool supports three physical openings, even though Extreme's generic
atmosphere budget permits up to five. Opening positions remain stable across presets.
Reduced motion freezes drift. Critical combat attenuates shafts and weather.

Tests sample 175 floors across all realms: deterministic positions, at least 500
distinct anchors and 100 shapes, safe standable anchors, minimum spacing, and
counts from zero through three. They also check stable resources, reduced motion,
quality switching, disabling shafts and disposal. Saved updated Ruins/Shrine and
Very Low–High images were inspected; no warnings/errors appeared in those browser checks.

## Manual evidence and remaining acceptance

See the [capture index](screenshots/v08/README.md) for exact images, dates, old
captures and missing sequences. Five guardian models, each realm's atmosphere,
Fungal preset comparisons, phase presentation and selected area samples have
rendered evidence. Controlled Lab steps are not complete floor playthroughs.

Still required for final release:

- Complete an unassisted solo floor and a two-player floor; play a four-player
  boss scenario and a Duel. Exercise each boss and hazard interactively through
  phase II, and check all five Pilgrims' fight duration/damage/guard routes.
- Finish the requested 18-scene capture set and six motion sequences, including
  four-player combat, Ruins fire, spores, resonance, latest ice readability,
  blizzard and moving shaft dust. Capture the latest fixed-scene Extreme comparison.
- Obtain valid focused-browser FPS for all presets/scenarios and integrated-GPU
  measurements; profile client animation/weather/particles and transparency.
- Run repeated multi-floor transitions and a longer memory/network soak.
- Review boss anticipation/recovery, four-player ground readability, Fungal art
  quality, deeper-cycle difficulty, item economy and healing windows with players.

Browser automatic approval review rejected the remaining UI verification while
selecting Extreme because its account usage limit was reached. The action was
not executed; the review did not determine it unsafe. No alternate browser,
raw CDP or indirect execution was used to bypass the rejection. CLI checks and
local service tests continued independently. This is a concrete acceptance blocker,
not evidence that the missing playtests passed.

## Final rerun

The final full run passed **201/201 tests in 14 files** (64.90 seconds).
The separate server invocation passed **45/45 tests in two files** (14.41 seconds);
these 45 tests are included in the full count. Lint, production client build and
server build passed after the hazard posture correction. Asset validation remains
168 assets / 20 families. `npm install` changed no dependency versions.

Final source review also connected the configured weather layer counts to separate
distance/height/wind bands within the same GPU buffer. The prior implementation
varied count/range but did not consume the layer parameter. This final visual
correction requires browser confirmation alongside the latest frost fix; saved
screenshots/counters predate it. The focused atmosphere/shaft rerun passed 23/23
tests, and lint and the production client build passed after that correction.
