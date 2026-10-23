import * as T from 'three';
import { ROOM_PITCH, doorPosition, type Floor } from '../dungeon';
import { geometryFor } from '../geometry';
import { Random } from '../random';
import { SCALE, type Materials } from './materials';
import { globalPosition, type DungeonArt } from './architecture';
import { AssetManager, assetVariant } from './assets';
import { shrineWater } from './water';
import { roomDecals } from './decals';
import { BIOME_LIGHTING } from './lighting';

/** Instance authored modules per room and per LOD. Collision remains in geometry.ts. */
export function buildImportedDungeon(floor: Floor, m: Materials, assets: AssetManager): DungeonArt {
  const art: DungeonArt = {
    group: new T.Group(),
    torches: [],
    banners: [],
    waters: [],
    mechanisms: [],
    gates: new Map(),
    interactables: new Map(),
  };
  const flameMaterial = new T.MeshBasicMaterial({
    color: new T.Color(BIOME_LIGHTING[floor.biome].torch).multiplyScalar(3),
    toneMapped: false,
  });
  const placements = new Map<string, T.Matrix4[]>();
  const family = ['ruins', 'shrine', 'fungal', 'frozen', 'foundry'][floor.biome];
  const distantPlacements = new Map<string, T.Matrix4[]>();
  const dummy = new T.Object3D();
  const place = (
    id: string,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rotation = 0,
  ) => {
    id = id.replace('ruins_', family + '_');
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, rotation, 0);
    dummy.updateMatrix();
    const target = y < -5 && !id.endsWith('_deep_support') ? distantPlacements : placements;
    const list = target.get(id) ?? [];
    list.push(dummy.matrix.clone());
    target.set(id, list);
  };
  const torch = (p: T.Vector3, seed: number) => {
    place('ruins_brazier', p.x, p.y, p.z);
    const flame = new T.Mesh(new T.ConeGeometry(0.13, 0.45, 7), flameMaterial);
    flame.position.copy(p).add(new T.Vector3(0, 1.23, 0));
    art.group.add(flame);
    const halo = new T.Sprite(
      new T.SpriteMaterial({
        map: m.glow,
        color: BIOME_LIGHTING[floor.biome].torch,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    halo.position.copy(flame.position);
    halo.scale.set(3.2, 3.2, 1);
    art.group.add(halo);
    art.torches.push({
      position: flame.position,
      flame,
      halo,
      seed,
      color: new T.Color(BIOME_LIGHTING[floor.biome].torch),
    });
  };
  for (const room of floor.rooms) {
    art.group.add(roomDecals(room, floor.biome));
    if (floor.biome === 1) {
      const water = shrineWater(room, m);
      art.group.add(water);
      art.waters.push(water);
    }
    placements.clear();
    distantPlacements.clear();
    const geo = geometryFor(room),
      rng = new Random(room.artSeed + ':imported');
    const ox = (room.x * ROOM_PITCH.x - 560) * SCALE,
      oz = (room.y * ROOM_PITCH.y - 380) * SCALE;
    for (const tile of geo.tiles) {
      const x = ox + tile.x * SCALE,
        z = oz + tile.y * SCALE,
        y = tile.elevation * SCALE;
      const variant = assetVariant(`${room.artSeed}:${tile.x}:${tile.y}`, ['a', 'b', 'c']);
      place('ruins_floor_' + variant, x, y, z, 1, 1, 1, (Math.floor(rng.next() * 4) * Math.PI) / 2);
      for (const edge of tile.edge) {
        const dx = [1, 0, -1, 0][edge],
          dz = [0, 1, 0, -1][edge];
        const port =
          ((tile.x < 110 || tile.x > 1010) && Math.abs(tile.y - 380) < 90) ||
          ((tile.y < 110 || tile.y > 650) && Math.abs(tile.x - 560) < 80);
        if ((tile.x + tile.y) % 120 === 0)
          place('ruins_deep_support', x + dx * 0.3, y - 0.4, z + dz * 0.3, 0.8, 1, 0.8);
        if (!port && rng.next() < 0.35)
          place(
            'ruins_railing',
            x + dx * 0.45,
            y,
            z + dz * 0.45,
            1 / 3,
            0.65,
            0.65,
            dx ? Math.PI / 2 : 0,
          );
        if (!port && (edge === 3 || edge === 2) && rng.next() < 0.18)
          place(
            'ruins_wall_broken',
            x + dx * 0.56,
            y,
            z + dz * 0.56,
            0.38,
            0.65,
            0.7,
            dx ? Math.PI / 2 : 0,
          );
      }
    }
    for (const d of geo.decorations) {
      const p = globalPosition(room, d.x, d.y),
        s = d.scale;
      const id =
        d.kind === 'column'
          ? 'ruins_column_a'
          : d.kind === 'statue'
            ? 'ruins_statue'
            : d.kind === 'rubble'
              ? 'ruins_rubble'
              : d.kind === 'urn'
                ? 'ruins_pedestal'
                : d.kind === 'plant'
                  ? 'ruins_rubble'
                  : undefined;
      if (id) place(id, p.x, p.y, p.z, s, s, s, rng.next() * 0.35);
    }
    for (const l of geo.lights) torch(globalPosition(room, l.x, l.y), rng.next() * 10);
    for (const id of room.links) {
      const next = floor.rooms[id],
        pos = doorPosition(room, next),
        p = globalPosition(room, pos.x, pos.y);
      const rotation = pos.x === 560 ? 0 : Math.PI / 2;
      place('ruins_arch_a', p.x, p.y, p.z, 0.8, 0.8, 0.8, rotation);
      const gate = new T.Group();
      gate.position.copy(p);
      gate.rotation.y = rotation;
      const holder = art.gates.get(room.id) ?? new T.Group();
      if (!art.gates.has(room.id)) {
        art.gates.set(room.id, holder);
        art.group.add(holder);
      }
      holder.add(gate);
      for (let x = -0.95; x <= 1; x += 0.32) {
        const bar = new T.Mesh(m.box, m.items.iron);
        bar.position.set(x, 1.25, 0);
        bar.scale.set(0.045, 2.5, 0.045);
        gate.add(bar);
      }
      if (id > room.id) {
        const end = doorPosition(next, room),
          b = globalPosition(next, end.x, end.y),
          delta = b.clone().sub(p);
        const steps = Math.max(1, Math.ceil(delta.length() / 2.8));
        for (let i = 0; i < steps; i++) {
          const point = p.clone().lerp(b, (i + 0.5) / steps);
          place(
            'ruins_bridge',
            point.x,
            point.y,
            point.z,
            0.85,
            1,
            delta.length() / steps / 3,
            Math.abs(delta.x) > Math.abs(delta.z) ? Math.PI / 2 : 0,
          );
        }
      }
    }
    const back = globalPosition(room, 560, 155);
    if (floor.biome === 2)
      for (const side of [-1, 1]) place('fungal_growth', back.x + side * 5, back.y, back.z + 2);
    if (floor.biome === 3)
      for (const side of [-1, 1]) place('frozen_snowbank', back.x + side * 5, back.y, back.z + 2);
    if (floor.biome === 4) {
      place('foundry_furnace', back.x + 4, back.y, back.z + 1);
      place('foundry_chain', back.x - 4, back.y + 3, back.z);
      const mechanism = new T.Group();
      mechanism.position.set(back.x + 4, back.y + 2.2, back.z + 1);
      const gear = assets.instantiate('foundry_gear', 1);
      if (gear) {
        gear.traverse((obj) => {
          if (obj instanceof T.Mesh) obj.userData.imported = true;
        });
        mechanism.add(gear);
      }
      art.group.add(mechanism);
      art.mechanisms.push(mechanism);
      const fire = new T.Mesh(new T.PlaneGeometry(2, 0.9), m.items.lava);
      fire.position.set(back.x + 4, back.y + 0.8, back.z + 0.35);
      art.group.add(fire);
    }
    if (floor.biome === 1) {
      place('shrine_lantern', back.x - 4, back.y, back.z + 1);
      place('shrine_channel', back.x + 4, back.y, back.z + 1);
    }
    place('ruins_doorway', back.x, back.y, back.z, 1.3, 1.3, 1.3);
    for (const side of [-1, 1]) {
      place('ruins_wall_broken', back.x + side * 5, back.y, back.z, 1.3, 1.3, 1.3);
      place('ruins_column_b', back.x + side * 4, back.y, back.z, 0.9, 1.4, 0.9);
      place('ruins_deep_support', back.x + side * 4, back.y, back.z, 0.85, 1, 0.85);
      for (let k = 0; k < 4; k++) {
        const x = back.x + side * (10 + k * 5),
          z = back.z - 12 - k * 4;
        place('ruins_column_a', x, -12, z, 1.2, 4, 1.2);
        place('ruins_deep_support', x, -12, z, 1.2, 1, 1.2);
        if (k % 2 === 0) place('ruins_arch_a', x, -8, z, 2.2, 2.4, 1.5);
      }
    }
    const ip = globalPosition(room, 560, 365);
    art.interactables.set(room.id, new T.Group());
    if (room.kind === 'shrine' || room.kind === 'healing') place('ruins_altar', ip.x, ip.y, ip.z);
    if (room.kind === 'treasure' || room.kind === 'secret')
      place('ruins_tomb', ip.x, ip.y, ip.z, 0.8, 0.7, 0.8);
    if (room.kind === 'exit') place('ruins_stairs', ip.x, ip.y - 1.6, ip.z);
    const lod = new T.LOD();
    const center = globalPosition(room, 560, 380);
    lod.position.copy(center);
    for (let level = 0; level < 3; level++) {
      const group = new T.Group();
      group.position.copy(center).negate();
      for (const [id, matrices] of placements) {
        group.add(...assets.instanceBatches(id, level, matrices));
      }
      lod.addLevel(group, level === 0 ? 0 : level === 1 ? 32 : 65);
    }
    art.group.add(lod);
    for (const [id, matrices] of distantPlacements)
      art.group.add(...assets.instanceBatches(id, 2, matrices));
  }
  return art;
}
