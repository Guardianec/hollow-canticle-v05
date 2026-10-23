import * as T from 'three';
import { ROOM_PITCH, doorPosition, type Floor, type Room } from '../dungeon';
import { geometryFor, elevationAt, insideRoom } from '../geometry';
import { Random } from '../random';
import { Batches, Materials, SCALE, type MaterialName } from './materials';
import { AssetManager } from './assets';
import { buildImportedDungeon } from './imported-dungeon';

export interface Torch {
  position: T.Vector3;
  flame: T.Mesh;
  halo: T.Sprite;
  seed: number;
  color: T.Color;
}
export interface DungeonArt {
  group: T.Group;
  torches: Torch[];
  banners: T.Mesh[];
  waters: T.Mesh[];
  mechanisms: T.Group[];
  gates: Map<number, T.Group>;
  interactables: Map<number, T.Group>;
}
export function globalPosition(room: Room, x: number, y: number, height = 0): T.Vector3 {
  return new T.Vector3(
    (room.x * ROOM_PITCH.x + x - 560) * SCALE,
    elevationAt(room, x, y) * SCALE + height,
    (room.y * ROOM_PITCH.y + y - 380) * SCALE,
  );
}

export function buildDungeon(floor: Floor, m: Materials, assets?: AssetManager): DungeonArt {
  if (floor.biome === 0 && assets?.has('ruins_floor_a'))
    return buildImportedDungeon(floor, m, assets);
  const group = new T.Group(),
    torches: Torch[] = [],
    banners: T.Mesh[] = [],
    waters: T.Mesh[] = [],
    mechanisms: T.Group[] = [],
    gates = new Map<number, T.Group>(),
    interactables = new Map<number, T.Group>();
  let batch = new Batches(m);
  const flameMaterial = new T.MeshBasicMaterial({
    color: new T.Color(3.5, 0.72, 0.08),
    toneMapped: false,
  });
  const baseColor = ['#a0afb1', '#809b99', '#898599', '#b4c1c5', '#9d8674'][floor.biome];
  const box = (
    mat: MaterialName,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rot = 0,
    color = '#ffffff',
  ) => batch.add('rounded', mat, x, y, z, sx, sy, sz, rot, color);
  const column = (x: number, y: number, z: number, height: number, width = 0.8) => {
    box('trim', x, y + 0.18, z, width * 1.55, 0.36, width * 1.55);
    for (let h = 0.4; h < height; h += 0.48)
      box(
        'stone',
        x,
        y + h + 0.22,
        z,
        width,
        0.43,
        width,
        (Math.floor(h * 2) % 2) * 0.03,
        baseColor,
      );
    box('trim', x, y + height + 0.05, z, width * 1.55, 0.35, width * 1.55);
    box('trim', x, y + height + 0.3, z, width * 1.7, 0.18, width * 1.7);
  };
  const arch = (x: number, y: number, z: number, rot: number, width = 2.8, height = 4.2) => {
    const right = new T.Vector3(Math.cos(rot), 0, -Math.sin(rot));
    for (const sign of [-1, 1]) {
      const px = x + right.x * width * 0.5 * sign,
        pz = z + right.z * width * 0.5 * sign;
      column(px, y, pz, height - 0.8, 0.56);
      box('darkStone', px, y - 4, pz, 0.75, 8, 0.75);
    }
    for (let i = 0; i < 11; i++) {
      const a = (Math.PI * i) / 10,
        p = new T.Vector3(
          x + right.x * Math.cos(a) * width * 0.5,
          y + height - 0.8 + Math.sin(a) * width * 0.4,
          z + right.z * Math.cos(a) * width * 0.5,
        );
      box('stone', p.x, p.y, p.z, 0.48, 0.65, 0.68, rot);
    }
  };
  const torch = (p: T.Vector3, seed: number, blue = false) => {
    box('iron', p.x, p.y + 0.45, p.z, 0.13, 0.9, 0.13);
    batch.add('cylinder', 'bronze', p.x, p.y + 0.93, p.z, 0.45, 0.22, 0.45);
    const flame = new T.Mesh(new T.ConeGeometry(0.15, 0.53, 7), flameMaterial);
    flame.position.copy(p).add(new T.Vector3(0, 1.25, 0));
    flame.scale.set(0.8, 1.1, 0.8);
    group.add(flame);
    const color = new T.Color(blue ? '#86e3e0' : '#ff9b3c');
    const halo = new T.Sprite(
      new T.SpriteMaterial({
        map: m.glow,
        color,
        transparent: true,
        opacity: 0.24,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.position.copy(flame.position);
    halo.scale.set(3.4, 3.4, 1);
    group.add(halo);
    torches.push({ position: flame.position, flame, halo, seed, color });
  };
  for (const room of floor.rooms) {
    batch = new Batches(m);
    const approaching = (floor.biome + 1) % 5;
    const geo = geometryFor(room),
      rng = new Random(room.artSeed + ':masonry'),
      ox = (room.x * ROOM_PITCH.x - 560) * SCALE,
      oz = (room.y * ROOM_PITCH.y - 380) * SCALE;
    for (const tile of geo.tiles) {
      const x = ox + tile.x * SCALE,
        z = oz + tile.y * SCALE,
        h = tile.elevation * SCALE;
      // A visible foundation and individually offset slabs create physical edges and shadows.
      box('darkStone', x, h - 0.5, z, 1.03, 0.95, 1.03);
      const divisions = rng.next() > 0.7 ? 1 : 2;
      for (let i = 0; i < divisions; i++)
        for (let j = 0; j < divisions; j++) {
          const tint = new T.Color(baseColor)
            .lerp(
              new T.Color(['#a0afb1', '#809b99', '#898599', '#b4c1c5', '#9d8674'][approaching]),
              room.transition ? Math.max(0, Math.min(1, (450 - tile.y) / 300)) : 0,
            )
            .multiplyScalar(0.76 + rng.next() * 0.38);
          const size = 1 / divisions;
          box(
            'stone',
            x + (i - (divisions - 1) / 2) * size,
            h - 0.065 + rng.next() * 0.035,
            z + (j - (divisions - 1) / 2) * size,
            size - 0.025,
            0.17,
            size - 0.025,
            rng.next() * 0.025,
            '#' + tint.getHexString(),
          );
        }
      for (const edge of tile.edge) {
        const dx = [1, 0, -1, 0][edge],
          dz = [0, 1, 0, -1][edge];
        // Cliffs descend into lower ruins. Sparse broken parapets leave the chasm readable.
        if ((tile.x + tile.y) % 120 === 0) {
          box('darkStone', x + dx * 0.36, h - 4, z + dz * 0.36, 0.95, 7, 0.95, 0, '#7b8e95');
        }
        const port =
          ((tile.x < 110 || tile.x > 1010) && Math.abs(tile.y - 380) < 90) ||
          ((tile.y < 110 || tile.y > 650) && Math.abs(tile.x - 560) < 80);
        if (!port && rng.next() > 0.32) {
          const hh = tile.zone === 'bridge' ? 0.45 : rng.next() > 0.75 ? 1.4 : 0.7;
          box(
            'stone',
            x + dx * 0.48,
            h + hh * 0.5,
            z + dz * 0.48,
            dx ? 0.19 : 1,
            hh,
            dz ? 0.19 : 1,
            0,
            baseColor,
          );
          box(
            'trim',
            x + dx * 0.48,
            h + hh + 0.06,
            z + dz * 0.48,
            dx ? 0.29 : 1.05,
            0.13,
            dz ? 0.29 : 1.05,
          );
        }
        if (!port && rng.next() < 0.28)
          for (let k = 0; k < 3; k++)
            batch.add(
              'sphere',
              'moss',
              x + dx * 0.4 + rng.next() * 0.25,
              h - 0.1 - k * 0.32,
              z + dz * 0.4,
              0.34,
              0.4,
              0.28,
              0,
              floor.biome === 3 ? '#c6d6d8' : '#536b3d',
            );
        if (!port && (edge === 3 || edge === 2) && rng.next() > 0.47) {
          const tall = 2.2 + rng.next() * 2.3;
          for (let k = 0; k < tall; k += 0.55)
            box(
              'darkStone',
              x + dx * 0.5,
              h + k + 0.24,
              z + dz * 0.5,
              dx ? 0.42 : 1.03,
              0.49,
              dz ? 0.42 : 1.03,
              0,
              baseColor,
            );
          box(
            'trim',
            x + dx * 0.5,
            h + tall,
            z + dz * 0.5,
            dx ? 0.58 : 1.12,
            0.18,
            dz ? 0.58 : 1.12,
          );
        }
      }
      if (
        (floor.biome === 3 || (room.transition && approaching === 3 && tile.y < 320)) &&
        tile.edge.length &&
        rng.next() > 0.55
      )
        box('snow', x, h + 0.05, z, 0.95, 0.07, 0.85);
      if (rng.next() < 0.07 && tile.zone !== 'bridge')
        for (let k = 0; k < 3; k++)
          batch.add(
            'sphere',
            'stone',
            x + rng.next() * 0.7 - 0.35,
            h + 0.08,
            z + rng.next() * 0.7 - 0.35,
            0.06 + rng.next() * 0.16,
            0.1,
            0.08 + rng.next() * 0.16,
            rng.next() * 6,
            '#8d9a94',
          );
    }
    // Actual inter-room bridges occupy the gap, visible before entering the next area.
    for (const id of room.links)
      if (id > room.id) {
        const next = floor.rooms[id],
          a = globalPosition(
            room,
            ...(Object.values(doorPosition(room, next)) as [number, number]),
          ),
          b = globalPosition(
            next,
            ...(Object.values(doorPosition(next, room)) as [number, number]),
          );
        const mid = a.clone().lerp(b, 0.5),
          delta = b.clone().sub(a),
          len = delta.length() + 1;
        const alongX = Math.abs(delta.x) > Math.abs(delta.z);
        box('darkStone', mid.x, mid.y - 0.55, mid.z, alongX ? len : 2.45, 0.9, alongX ? 2.45 : len);
        const steps = Math.ceil(len / 0.45);
        for (let i = 0; i <= steps; i++) {
          const p = a.clone().lerp(b, i / steps);
          box(
            floor.biome === 3 ? 'wood' : 'stone',
            p.x,
            p.y - 0.03,
            p.z,
            alongX ? 0.42 : 2.3,
            0.16,
            alongX ? 2.3 : 0.42,
          );
          if (i % 3 === 0)
            for (const side of [-1, 1]) {
              const px = p.x + (alongX ? 0 : 1.08) * side,
                pz = p.z + (alongX ? 1.08 : 0) * side;
              box('iron', px, p.y + 0.6, pz, 0.09, 1.2, 0.09);
            }
        }
        for (const side of [-1, 1])
          box(
            'iron',
            mid.x + (alongX ? 0 : 1.08) * side,
            mid.y + 0.95,
            mid.z + (alongX ? 1.08 : 0) * side,
            alongX ? len : 0.06,
            0.065,
            alongX ? 0.06 : len,
          );
      }
    // Modular architecture and clustered semantic decoration.
    for (const d of geo.decorations) {
      const p = globalPosition(room, d.x, d.y),
        s = d.scale;
      if (d.kind === 'column') {
        column(p.x, p.y, p.z, 3.8 + rng.next() * 2.5, 0.73);
        // Flying buttress fragments reach well beyond the playable silhouette.
        if (d.x < 500) box('darkStone', p.x - 0.8, p.y + 3, p.z, 1.7, 0.48, 0.65, 0, baseColor);
      } else if (d.kind === 'banner') {
        const mesh = new T.Mesh(new T.PlaneGeometry(0.78, 2.15, 3, 9), m.items.cloth);
        mesh.position.set(p.x + 0.4, p.y + 2.1, p.z + 0.2);
        group.add(mesh);
        banners.push(mesh);
        box('iron', p.x + 0.4, p.y + 3.22, p.z + 0.2, 1.1, 0.06, 0.06);
      } else if (d.kind === 'plant') {
        for (let i = 0; i < 10; i++)
          batch.add(
            'cone',
            'moss',
            p.x + rng.next() * 0.6 - 0.3,
            p.y + 0.09 + rng.next() * 0.12,
            p.z + rng.next() * 0.6 - 0.3,
            0.11 * s,
            0.22 * s,
            0.18 * s,
            rng.next() * 6,
            rng.pick(['#526946', '#78885b', '#9da46c']),
          );
        for (let i = 0; i < 3; i++)
          box('wood', p.x, p.y + 0.02, p.z, 0.5 + s * 0.25, 0.035, 0.04, rng.next() * 6, '#8a8670');
        if (floor.biome === 2 || floor.hybrid === 2) {
          const height = 0.5 + rng.next() * 1.5;
          batch.add('cylinder', 'trim', p.x, p.y + height * 0.5, p.z, 0.1, height, 0.1);
          batch.add('mushroom', 'fungus', p.x, p.y + height, p.z, 0.9 * s, 0.7 * s, 0.8 * s);
        }
      } else if (d.kind === 'rubble') {
        for (let i = 0; i < 5; i++)
          batch.add(
            'sphere',
            'stone',
            p.x + rng.next() * 0.8 - 0.4,
            p.y + 0.12,
            p.z + rng.next() * 0.8 - 0.4,
            0.2 + rng.next() * 0.35,
            0.2 + rng.next() * 0.25,
            0.2 + rng.next() * 0.35,
            rng.next() * 6,
            baseColor,
          );
      } else if (d.kind === 'urn') {
        batch.add('sphere', 'bronze', p.x, p.y + 0.3, p.z, 0.38, 0.65, 0.38);
        batch.add('cylinder', 'darkStone', p.x, p.y + 0.63, p.z, 0.18, 0.12, 0.18);
      } else if (d.kind === 'candle') {
        for (let i = 0; i < 3; i++) {
          const xx = p.x + i * 0.12,
            hh = 0.1 + rng.next() * 0.2;
          batch.add('cylinder', 'trim', xx, p.y + hh / 2, p.z, 0.06, hh, 0.06);
          const flame = new T.Mesh(new T.SphereGeometry(0.035, 4, 3), flameMaterial);
          flame.position.set(xx, p.y + hh + 0.04, p.z);
          group.add(flame);
        }
      } else if (d.kind === 'shelf') {
        for (let i = 0; i < 4; i++) {
          box('wood', p.x, p.y + 0.5 + i * 0.6, p.z, 3, 0.09, 0.7);
          for (let j = 0; j < 12; j++)
            box(
              j % 3 ? 'cloth' : 'wood',
              p.x - 1.3 + j * 0.23,
              p.y + 0.7 + i * 0.6,
              p.z,
              0.15,
              0.35,
              0.38,
              0,
              rng.pick(['#b9a179', '#77989d', '#a86655']),
            );
        }
      } else if (d.kind === 'statue') {
        column(p.x, p.y, p.z, 0.8, 1.1);
        batch.add('cone', 'stone', p.x, p.y + 2.1, p.z, 1.3, 2.4, 1.1);
        batch.add('sphere', 'trim', p.x, p.y + 3.5, p.z, 0.7, 0.95, 0.7);
        box('stone', p.x + 0.85, p.y + 2.8, p.z, 1.7, 0.35, 0.4, -0.25);
        box('iron', p.x + 0.85, p.y + 1.7, p.z, 0.1, 3.4, 0.1);
      } else if (d.kind === 'chain') {
        for (const side of [-1, 1])
          for (let k = 0; k < 16; k++)
            batch.add(
              'cylinder',
              'iron',
              p.x + side * 0.65,
              p.y + k * 0.28 + 1,
              p.z,
              0.1,
              0.2,
              0.1,
            );
        for (let k = 0; k < 9; k++) {
          const a = (k * Math.PI * 2) / 9;
          box(
            'iron',
            p.x + Math.cos(a) * 0.85,
            p.y + 1.4,
            p.z + Math.sin(a) * 0.85,
            0.05,
            1.9,
            0.05,
          );
        }
        box('iron', p.x, p.y + 0.5, p.z, 1.8, 0.1, 1.8);
      }
    }
    for (const l of geo.lights)
      torch(
        globalPosition(room, l.x, l.y),
        rng.next() * 10,
        (floor.biome === 1 || (room.transition && approaching === 1 && l.y < 380)) &&
          rng.next() > 0.3,
      );
    const gateRoot = new T.Group();
    group.add(gateRoot);
    gates.set(room.id, gateRoot);
    gateRoot.position.y = 3;
    gateRoot.visible = false;
    for (const id of room.links) {
      const pos = doorPosition(room, floor.rooms[id]),
        p = globalPosition(room, pos.x, pos.y),
        rotation = pos.x === 560 ? 0 : Math.PI / 2;
      arch(p.x, p.y, p.z, rotation, 2.5, 3.2);
      const gate = new T.Group();
      gate.position.copy(p);
      gate.rotation.y = rotation;
      gateRoot.add(gate);
      for (let x = -1; x <= 1; x += 0.32) {
        const bar = new T.Mesh(m.box, m.items.iron);
        bar.position.set(x, 1.3, 0);
        bar.scale.set(0.055, 2.6, 0.055);
        bar.castShadow = true;
        gate.add(bar);
      }
    }
    // A monumental backdrop behind each combat space, not a generic arena.
    const back = globalPosition(room, 560, 180);
    arch(back.x, back.y, back.z, 0, 5.3, 6.4);
    const lower = globalPosition(room, 300, 230);
    box('darkStone', lower.x - 4, -6, lower.z, 1.8, 0.65, 20, 0, '#7897a5');
    for (let i = 0; i < 7; i++) {
      column(lower.x - 4, -12, lower.z - 8 + i * 2.8, 6.8, 0.6);
      box('trim', lower.x - 4, -5.5, lower.z - 8 + i * 2.8, 2.1, 0.2, 0.3);
    }
    if (room.landmark === 'bell') {
      batch.add('cone', 'bronze', back.x, back.y + 4, back.z, 1.6, 1.6, 1.6);
      batch.add('sphere', 'iron', back.x, back.y + 3.5, back.z, 0.22, 0.5, 0.22);
    }
    if (floor.biome === 2 || floor.hybrid === 2 || (room.transition && approaching === 2)) {
      for (const side of [-1, 1]) {
        const mushroom = globalPosition(room, 560 + side * 210, 210);
        batch.add(
          'cylinder',
          'darkStone',
          mushroom.x,
          mushroom.y + 1.6,
          mushroom.z,
          0.45,
          3.2,
          0.45,
        );
        batch.add('mushroom', 'fungus', mushroom.x, mushroom.y + 3.2, mushroom.z, 3.6, 2.2, 3.4);
        const points = [
          new T.Vector3(mushroom.x - 1, -0.1, mushroom.z + 1),
          new T.Vector3(mushroom.x - 1.4, 0.2, mushroom.z),
          new T.Vector3(mushroom.x, 1, mushroom.z),
          new T.Vector3(mushroom.x + 0.3, 2, mushroom.z),
        ];
        const root = new T.Mesh(
          new T.TubeGeometry(new T.CatmullRomCurve3(points), 12, 0.14, 5, false),
          m.items.wood,
        );
        root.castShadow = true;
        group.add(root);
      }
    }
    if (floor.biome === 3 || floor.hybrid === 3)
      for (let i = 0; i < 9; i++) {
        const icicle = new T.Mesh(
          m.cone,
          new T.MeshStandardMaterial({ color: '#9fc8dd', metalness: 0.15, roughness: 0.25 }),
        );
        icicle.position.set(back.x - 2 + i * 0.5, back.y + 5.8, back.z);
        icicle.rotation.x = Math.PI;
        icicle.scale.set(0.16, 0.6 + rng.next() * 0.9, 0.16);
        group.add(icicle);
      }
    if (floor.biome === 1 || floor.hybrid === 1 || (room.transition && approaching === 1)) {
      const surface: number[] = [];
      for (const tile of geo.tiles)
        if (
          (room.transition && approaching === 1 ? tile.y < 320 : tile.y >= 480) &&
          tile.x > 320 &&
          tile.x < 780
        ) {
          const x = (tile.x - 560) * SCALE,
            y = -(tile.y - 550) * SCALE,
            s = 0.51,
            z = (tile.elevation - elevationAt(room, 560, 550)) * SCALE;
          surface.push(
            x - s,
            y - s,
            z,
            x + s,
            y - s,
            z,
            x + s,
            y + s,
            z,
            x - s,
            y - s,
            z,
            x + s,
            y + s,
            z,
            x - s,
            y + s,
            z,
          );
        }
      const waterGeometry = new T.BufferGeometry();
      waterGeometry.setAttribute('position', new T.Float32BufferAttribute(surface, 3));
      waterGeometry.computeVertexNormals();
      const water = new T.Mesh(
        waterGeometry,
        new T.MeshStandardMaterial({
          color: '#246675',
          metalness: 0.7,
          roughness: 0.18,
          transparent: true,
          opacity: 0.64,
          side: T.DoubleSide,
        }),
      );
      water.userData.baseZ = Float32Array.from(surface.filter((_, i) => i % 3 === 2));
      water.rotation.x = -Math.PI / 2;
      water.position.copy(globalPosition(room, 560, 550)).add(new T.Vector3(0, 0.08, 0));
      group.add(water);
      waters.push(water);
      // A falling stream continues below the walkways into the mist.
      const fall = new T.Mesh(
        new T.PlaneGeometry(1.8, 13, 4, 18),
        new T.MeshBasicMaterial({
          color: '#86cbd8',
          transparent: true,
          opacity: 0.18,
          side: T.DoubleSide,
          depthWrite: false,
        }),
      );
      fall.position.copy(globalPosition(room, 180, 400)).add(new T.Vector3(-1, -6, 0));
      group.add(fall);
      waters.push(fall);
    }
    if (floor.biome === 4 || floor.hybrid === 4 || (room.transition && approaching === 4)) {
      const p = globalPosition(room, 880, 170);
      box('iron', p.x, p.y + 1, p.z, 2.4, 2, 1.8);
      box('lava', p.x, p.y + 1, p.z + 1, 1.8, 1.1, 0.1);
      for (let k = 0; k < 4; k++)
        box('iron', p.x - 0.7 + k * 0.45, p.y + 1, p.z + 1.06, 0.08, 1.4, 0.1);
      box('lava', ox + 560 * SCALE, -6, oz + 400 * SCALE, 32, 0.12, 22);
      for (let k = 0; k < 4; k++) box('iron', p.x + 2, p.y + 2 + k * 0.6, p.z, 1.1, 0.16, 1.1);
      const mechanism = new T.Group();
      mechanism.position.copy(p).add(new T.Vector3(0, 2.35, 0));
      const hub = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 0.2, 12), m.items.bronze);
      mechanism.add(hub);
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI * 2) / 10,
          tooth = new T.Mesh(m.box, m.items.iron);
        tooth.position.set(Math.sin(a) * 0.65, 0, Math.cos(a) * 0.65);
        tooth.scale.set(0.2, 0.22, 0.2);
        mechanism.add(tooth);
      }
      group.add(mechanism);
      mechanisms.push(mechanism);
    }
    // Quiet, legible physical objects replace arrow-shaped portal buttons.
    const interact = new T.Group(),
      p = globalPosition(room, 560, 365);
    interact.position.copy(p);
    group.add(interact);
    interactables.set(room.id, interact);
    if (['treasure', 'secret'].includes(room.kind)) {
      box('wood', p.x, p.y + 0.35, p.z, 1.2, 0.65, 0.72);
      for (const dx of [-0.4, 0.4]) box('bronze', p.x + dx, p.y + 0.38, p.z, 0.06, 0.7, 0.77);
    }
    if (room.kind === 'shrine' || room.kind === 'healing') {
      batch.add('cylinder', 'trim', p.x, p.y + 0.3, p.z, 1.5, 0.6, 1.5);
      batch.add(
        'cylinder',
        room.kind === 'healing' ? 'iron' : 'bronze',
        p.x,
        p.y + 0.65,
        p.z,
        1.1,
        0.2,
        1.1,
      );
      torch(p.clone().add(new T.Vector3(0.9, 0, 0.5)), room.id);
    }
    if (room.kind === 'exit')
      for (let i = 0; i < 9; i++)
        box('darkStone', p.x, p.y - i * 0.13, p.z - i * 0.32, 2.2, 0.15, 0.36);
    batch.build(group);
  }
  // Lower ruins and giant pillars recede through blue fog, well below the playable level.
  batch = new Batches(m);
  const rng = new Random(floor.seed + ':distant');
  for (let i = 0; i < 100; i++) {
    const room = rng.pick(floor.rooms),
      x = (room.x * ROOM_PITCH.x + rng.int(-600, 600)) * SCALE,
      z = (room.y * ROOM_PITCH.y + rng.int(-500, 500)) * SCALE;
    if (
      insideRoom(
        room,
        560 + (x - room.x * ROOM_PITCH.x * SCALE) / SCALE,
        380 + (z - room.y * ROOM_PITCH.y * SCALE) / SCALE,
      ) &&
      rng.next() > 0.5
    )
      continue;
    column(x, -14, z, rng.int(5, 13), 0.65 + rng.next() * 0.9);
    if (i % 4 === 0) box('darkStone', x, -8, z, 7, 0.5, 2.2, 0, '#698392');
  }
  batch.build(group);
  return { group, torches, banners, waters, mechanisms, gates, interactables };
}
