# Hollow Canticle v0.5 — production art direction

Both supplied sheets are preserved in [references/v05](references/v05/). They are shape, material, light and composition references, never runtime textures. The release brief is retained as source context. All generated meshes and textures are original.

## Ruins benchmark and procedural game

Build and review one fixed Ruins scene before migrating the other four biomes. Include the Oathkeeper, Warden, slabs, damaged wall, true curved arch, fluted columns, stairs, bridge, statue, rubble, braziers and distant architecture. A model inventory alone does not pass this gate. Compare actual browser screenshots against both sheets.

The first checkpoint established this benchmark; the user's continuation authorized
the remaining biome/cast implementation. The benchmark remains a QA fixture. All
playable rooms and connections must remain seeded and procedural. The user's later
correction prioritizes darkness: use local light pools and readable shadows, with
blue/amber Ruins, damp teal Shrine, low violet Fungal, dim moonlit Frozen and smoky
orange Foundry. Do not brighten every region to the same exposure or ambient fill.

## Character rules

Use approximately seven heads of height, long legs, narrow waists and readable shoulders. Continuous shaped armor plates overlap cloth, leather and boots. Keep faces recessed in hoods or visored helmets. Avoid spherical shoulders and rectangular limbs. Spend detail on helmet, shoulder silhouette, split tabard, cloak folds and weapon profile. Oathkeeper has asymmetric armor and a balanced sword; Moth has a narrow red hood and twin blades; Lancer has disciplined vertical cloth lines and a long spear; Bellbearer has broad layered armor and a greatblade. Warden carries a tall worn shield; the Saint has a thin ceremonial silhouette and a broken radial halo.

## Architecture rules

Adopt meters, Z-up in Blender, Y-up in glTF. Tile pitch is 1 m; finished walking surfaces sit at zero. Floors slightly overlap at their lower edges, with erosion confined to exposed upper edges. Walls span 3 m, arches have 2.8 m openings and 4.5 m crowns, columns stand 5 m high. Origins are centered on the floor footprint. Steps rise 0.2 m per 0.4 m tread. Connections retain exact grid dimensions while crowns, broken ends and face relief vary. Use wedge-built voussoirs, continuous molded column profiles, inset carvings, bevels, chipping and displaced stone. Damage needs asymmetry rather than arbitrary rotations at every connection.

## Material rules

Dry stone: desaturated warm gray, roughness 0.78–0.96, dark pores and warm worn edges. Carved stone: finer grain and sharper relief, roughness 0.65–0.84. Moss collects in damp cracks, not uniformly across every face. Worn iron: metalness 0.85–1, roughness 0.4–0.7; steel has brighter edges and roughness 0.25–0.5. Aged bronze is warm and subdued. Cloth is matte, woven and folded; leather has directional grain. Bake distinct base color, tangent normal, roughness and AO maps from Blender nodes. Base color uses sRGB; scalar and normal maps use linear data. Shared 1024 maps for principal families; avoid unique texture sets per wall.

## Light and atmosphere rules

Cold blue gray ambient light must leave unlit recesses dark. Local amber torch pools guide the route and reveal stone relief. Keep bloom restricted to hot sources. Use global distance fog plus world-space height fog whose opacity rises rapidly below the walking surface. Pillars extend far below the opacity threshold. Add slow, broad noise mist within chasms; particles stay sparse. No visible ground plane or pillar termination. Shrine mist is teal, Fungal purple/teal, Frozen pale blue, Foundry smoky brown with ember light.

## Composition rules

The playable route has the highest useful contrast. Broken parapets expose the chasm. Tall rear silhouettes and distant bridges imply scale without obscuring combat. Foreground architecture must permit target readability. Warm interactables and weapons separate from the cold world. Keep the existing deterministic 2D navigation independent of visual mesh detail.

## Traceability

| Asset family                                        | First sheet    | Second sheet |
| --------------------------------------------------- | -------------- | ------------ |
| Ruins floors, walls, arches, columns, bridge, props | panels 1, 5    | panels 1, 2  |
| Oathkeeper and Warden                               | panels 2, 3, 9 | panels 5, 6  |
| Stone, iron, bronze, cloth                          | panel 6        | panel 3      |
| Deep supports, distance structures, mist            | panel 8        | panel 4      |
| Shrine, Fungal, Frozen and Foundry kits             | panel 7        | panel 8      |

Do not claim reference fidelity from successful asset export. Review silhouette, surface response, void depth, route readability and measured browser performance separately.
