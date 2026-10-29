# Hollow Canticle v0.8.0 — Trials of the Five Realms

Implementation candidate, updated 2026-10-29. **Acceptance remains incomplete.**
Package stays 0.7.0; multiplayer identifies protocol 8 / `0.8.0-candidate`.
No merge or public deployment was performed. This report follows the requested
29 delivery topics; [QA](QA-v0.8.md) records exact evidence and blockers.

1. **Base:** `adb533e96da2565925a05ee3c58bc256733c4775`, accepted Living Steel
   and fetched main of `Guardianec/hollow-canticle-v05`. The older configured
   origin did not contain v0.7 and was not used as the implementation base.
2. **Branch:** `codex/v0.8.0-five-realms`, tracking `v05` in the requested repository.
3. **Final SHA:** reported in the delivery message; `git rev-parse HEAD` identifies
   the checkpoint. A committed document cannot embed its own commit hash.
4. **Original audit:** [all eleven requirements](ORIGINAL-REQUEST-AUDIT-v0.8.md),
   each with implementation, evidence, tests and limitations. Items 4/5/6/7/9 remain
   PARTIAL because final balance/art/playtest/performance acceptance is unestablished.
5. **HP/guard:** full roster vitality exceeds max guard. Default strike damage
   increases 13→15; authored damage remains attack-specific. Guard recovery
   decreases 8/16→4.5/9 near/far before vitality modifiers. Depth HP growth caps
   asymptotically at ×1.32. Five Pilgrim weapon stats remain, including Shinobi's
   9 raw katana damage and deflect/Riposte/guard-break route. Human duration tuning is open.
6. **Punish AI:** fast archetypes physically advance against visible heals/actual
   whiff recovery; casters mark ground against heals, distance or repeated dodges.
   Repeated empty parries/dodges sometimes elicit delayed sweeps. Adaptation has a
   4.5-second cooldown, range/LOS and threat reservations. It reads current committed
   states, never future input. Dodge invulnerability remains. A real whiff marker
   distinguishes a miss from an attack whose hit-processing step merely ran.
7. **AoE:** semantic source/team/biome/kind, position/radii, warning/arm/expiry,
   HP/posture/tick/status. Telegraph→active→0.65s fading. Authority steps once,
   records per-area/per-player ticks before callbacks and removes expiry. Co-op
   shares one system; clients render only. Caps are 2/3/4/5 at 1/2/3/4 players.
   Zones reduce simultaneous scheduled threats. Dodges, wards and existing incoming
   modifiers apply; full posture uses shared stagger handling. No particle networking.
8. **Ruins:** ember flask, 1.25s warning, radius 76, 4.8s patch; 6 HP / 5 posture
   per 0.8s. Small positional denial, lob/burst/flame presentation.
9. **Shrine:** resonance, 1.5s warning, 24-unit annulus expands to radius 145 over
   1.8s; 9 HP / 24 posture with 0.6s tick gating. The center becomes safe as it passes.
10. **Fungal:** spores, 1.5s warning, radius 102, 5.2s cloud; 4 HP / 3 posture per
    0.9s. Brief 1.3s poison reduces guard recovery to 60%; no long damage tail.
11. **Frozen:** eruption/field, 1.4s warning, radius 94, 3.8s; 5 HP / 8 posture per
    0.85s. Frost lasts 0.9s, movement ×0.88 and dodge recovery +0.06s. Crystal eruption
    and dark-edged telegraph improve snow contrast; latest visual fix needs recapture.
12. **Foundry:** molten splash, 1.3s warning, radius 83, 3.1s; 11 HP / 8 posture per
    0.7s. Hot cracked ground, sparks/smoke and shader distortion approximation.
    Semantic lobs are not parryable; ordinary projectile reflection rules remain.
13. **Boss every floor:** main route start→combat→combat→elite→boss→descent, with
    side branches before the boss. Procedural links cannot bypass it, and independent
    offline/server descent checks require its clear. Validated on 10,000 floors.
14. **Five bosses:** five distinct Blender skinned silhouettes in regional packs,
    not Saint recolors; details below. Lab practices each independently.
15. **Phases:** phase II changes patterns, pace and staggered area lanes near half HP.
    Marshal gains sword chains; Prelate crossing waves/orbs; Crown advancing pounces;
    Sentinel faster spear pressure/stronger snowfall; Tyrant repeated hammer/molten
    pressure. Material/body reveal changes presentation; armor does not physically
    detach. Later cycles add a bounded attack variant. Finishers remove 32% max boss
    HP; one break cannot delete a full boss. Short titles/intros and recovery remain.
16. **Co-op bosses:** one guardian. HP ×1/1.45/1.8/2.1; guard ×1/1.12/1.22/1.3.
    Normal HP only ×1/1.08/1.14/1.2. Encounter budgets ×1/1.55/2.05/2.55 diversify
    roles/support/elites. Bosses at 3–4 players receive at most one thematic add.
    Target stickiness prevents mid-swing switching, subsequent choices favor another
    reachable player; phase-II zones can mark a second member. Boss clear revives at
    **exactly 20 HP**; wipe leaves boss uncleared. Retained personal boss relic choices
    exclude Faded rarity; an exhausted pool yields the existing rare offering.
17. **Fungal overhaul:** irregular torn/folded caps, roots/gills/cups, wall/hanging
    growth, mycelial surfaces and rare large landmarks. Several coherent palettes and
    localized emissive pores/veins, with shared base/roughness/normal/AO materials.
    Repeated forms use instancing and three LODs; small fungus avoids shadow casting.
18. **Assets:** ten new fungal categories × three LODs, three new PBR families
    (teal/gills/ochre), five guardian rigs. Complete library: 168 assets, 20 families,
    660,353 aggregate LOD0 asset triangles, 38.46 MiB GLBs plus 1024 textures.
    Those totals include existing content; biome packs load separately.
19. **Weather architecture:** data-driven regional parameters, gradual local intensity,
    wind and a reusable 1,800-point GPU buffer. Critical combat reduces decorative
    weather. No weather networking/damage. Existing biome audio remains; separate
    weather-event audio was not expanded.
20. **Each realm:** Ruins ash/dust/gusts/banners; Shrine leaks/rainlike curtains/mist/
    cheap ripples; Fungal drifting spores/motes; Frozen snow/crystals/intermittent
    blizzard; Foundry rising ash/embers/heat colors. Wind moves particles/banners/
    High–Extreme cloth, never characters. Ambient spores do not poison.
21. **Light shafts:** independent seeded art stream selects zero to three separated
    safe openings; rarer in ordinary chambers, richer near guardians/shrines/vaults.
    Radius/height/lean/slit-or-oval shape/aperture/brightness/tint vary. Analytic cone
    intersections soften volume edges; sparse density samples add broken-aperture
    noise/mist, with dust inside. Floor/high-darkness fades, no outdoor sky. Positions
    stay fixed across quality changes. [Updated High image](screenshots/v08/shafts-high.jpg).
22. **Profiles:** all retain regional cues and critical telegraphs. See table below.
    Geometry/buffers are reused, unused biome resources trimmed, decorative weather
    attenuated before combat, and reduced motion freezes atmosphere drift.
23. **Extreme:** richer shaft noise, weather layers/range, four fog layers, distant
    architecture, denser decorative combat VFX, 4096 shadows and higher resolution.
    High retains full atmosphere. Hardware spectacle/readability acceptance is pending.
24. **Very Low:** no shadows/bloom, 512 texture variants, early LOD, current-room
    visibility, reduced small fungus and sparse weather/simple shaft. Actor scratch
    rotations reduce allocations at every level. Dynamic resolution was not introduced
    without a stable measured experiment.
25. **Performance:** [QA tables/raw metrics](QA-v0.8.md). Fungal Very Low submits
    71% fewer calls and 91% fewer triangles than High. Updated Ruins is 74 calls/67k
    triangles Very Low versus 292/1.698M High. These are workload counters, not GPU
    timings. FPS is **blocked by browser throttling**, as directed by the user.
    Instrumented authority and short twenty-client load samples passed; GPU/client
    subsystem timings, integrated hardware and long memory soak remain open.
26. **Protocol:** version 8 adds areas/status expiry/area attack semantics; server
    owns boss damage/state/phase/target. Health exposes protocol/build. Incompatible
    clients show **MULTIPLAYER SERVER UPDATE REQUIRED**; old joins are rejected.
    Deploy client/server together. Duel disables PvE areas and attenuates atmosphere.
    Shared boss Lab command requires `CANTICLE_LAB=1`, co-op host and valid biome;
    default public configuration does not enable it.
27. **Save compatibility:** schema/key stay v2 / `hollow-canticle:v05`; transient
    encounter state requires no save migration. Tests preserve Chronicle, Shinobi,
    unlocks, tutorial flags and graphics preference. No progress reset.
28. **Tests/tooling:** baseline checks; complete asset pipeline; client/server builds;
    lint; unit/integration, 10,000 floors, real two-client area/status authority,
    2/3/4-player clear/revival and prior Duel/Riposte regression. [QA](QA-v0.8.md)
    records final counts. Lab adds hazards/guardians, boss phase/HP/guard/attack,
    pause/step, weather/wind/density/shafts/preset and local capture/telemetry.
    Telemetry includes run duration/damage/parries/perfects and guard breaks/deaths/
    AoE hits/phase duration. No online analytics. Separate encounter-duration history
    is not implemented; run time and phase times are available.
29. **Limits:** complete solo/two-player floors, four-player boss, Duel and every
    guardian through phase II remain unplayed manually. Full captures, human art/
    balance sign-off and sustained hardware/memory profiling are unfinished. Automatic
    browser approval review rejected remaining UI actions because of a usage limit;
    no bypass was attempted. FPS remains invalid. Armor does not detach, semantic
    lobs cannot be parried, weather audio was not expanded and animation remains
    shared-rig choreography. These are explicit limits, not completed acceptance.

## Roster and guardian values

| Enemy    |  HP | Guard |
| -------- | --: | ----: |
| Warden   | 105 |    70 |
| Shield   | 148 |   100 |
| Duelist  | 102 |    68 |
| Spear    | 108 |    74 |
| Assassin |  80 |    54 |
| Monk     | 120 |    82 |
| Brute    | 188 |   105 |
| Beast    |  98 |    62 |
| Archer   |  72 |    46 |
| Hexer    |  86 |    55 |

| Realm   | Guardian        | HP / guard | Identity                                                           |
| ------- | --------------- | ---------: | ------------------------------------------------------------------ |
| Ruins   | Ashen Marshal   |  330 / 112 | Crested commander, sword/shield, counter timing and ember denial   |
| Shrine  | Drowned Prelate |  350 / 118 | Mitred ritual robe, bell staff, delayed orbs and resonance         |
| Fungal  | Spore Crown     |  390 / 104 | Root armor, fungal crown/claws, grabs/pounces and spores           |
| Frozen  | Pale Sentinel   |  365 / 116 | Ice pauldrons/mask, long spear, feints and frost spacing           |
| Foundry | Forge Tyrant    |  440 / 132 | Furnace grate/chimneys/chain hammer, heavy slams and molten ground |

## Quality budgets

| Preset   | Weather base / layers / range | Shaft samples / dust per opening      | Pixel ratio cap / shadows |
| -------- | ----------------------------- | ------------------------------------- | ------------------------- |
| Very Low | 18 / 1 / 13                   | 1 / 2, strongest opening              | 0.6 / off                 |
| Low      | 64 / 1 / 17                   | 1 / 4, strongest opening              | 0.8 / off                 |
| Medium   | 180 / 2 / 23                  | 2 / 8, up to two                      | 1.0 / 1024                |
| High     | 520 / 3 / 30                  | 3 / 16, up to three                   | 1.5 / 2048                |
| Extreme  | 1380 / 5 / 45                 | 5 / 32, up to three authored openings | 2.0 / 4096                |

Actual density varies with intensity/combat; render scale also respects device pixel
ratio. Keep this candidate separate from accepted v0.7. Resolve PARTIAL audit items,
set 0.8.0 only after acceptance, repeat validation, then obtain merge approval.
