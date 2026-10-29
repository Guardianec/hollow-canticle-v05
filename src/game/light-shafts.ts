import type { Room } from './dungeon';
import { canStand, geometryFor } from './geometry';
import { Random } from './random';

export interface ShaftOpening {
  x: number;
  y: number;
  radius: number;
  height: number;
  aspect: number;
  aperture: number;
  leanX: number;
  leanY: number;
  strength: number;
  seed: number;
  tint: number;
}

/** A separate art stream keeps fractures stable when weather, enemies or quality change. */
export function shaftOpenings(room: Room, biome: number): ShaftOpening[] {
  const rng = new Random(`${room.artSeed}:${biome}:unseen-fractures:2`);
  const landmark = ['boss', 'shrine'].includes(room.kind);
  const vaulted = ['chasm-crossing', 'root-cathedral', 'split-shrine', 'bell-bastion'].includes(
    room.template,
  );
  const chance = room.kind === 'start' ? 0.7 : vaulted ? 0.58 : 0.16;
  if (!landmark && rng.next() > chance * (biome === 4 ? 0.5 : 1)) return [];
  const tiles = geometryFor(room).tiles.filter(
    (t) => t.x > 190 && t.x < 930 && t.y > 160 && t.y < 600 && canStand(room, t.x, t.y, 20),
  );
  if (!tiles.length) return [];
  const count = landmark ? rng.int(1, 3) : rng.int(1, 2);
  const direction = rng.next() * Math.PI * 2;
  const lean = 0.06 + rng.next() * 0.24;
  const result: ShaftOpening[] = [];
  for (let attempt = 0; result.length < count && attempt < 60; attempt++) {
    const tile = rng.pick(tiles);
    const x = tile.x + (rng.next() - 0.5) * 18,
      y = tile.y + (rng.next() - 0.5) * 18;
    if (!canStand(room, x, y, 20) || result.some((s) => Math.hypot(s.x - x, s.y - y) < 185))
      continue;
    const fracture = rng.next() < 0.45;
    result.push({
      x,
      y,
      radius: fracture ? 0.9 + rng.next() * 1.25 : 1.4 + rng.next() * 1.8,
      height: 11 + rng.next() * 12,
      aspect: fracture ? 0.3 + rng.next() * 0.3 : 0.7 + rng.next() * 0.45,
      aperture: 0.05 + rng.next() * 0.16,
      leanX: Math.cos(direction) * lean + (rng.next() - 0.5) * 0.08,
      leanY: Math.sin(direction) * lean + (rng.next() - 0.5) * 0.08,
      strength: 0.12 + rng.next() * 0.12,
      seed: rng.next() * 100,
      tint: rng.int(0, 2),
    });
  }
  return result.sort((a, b) => b.radius * b.strength - a.radius * a.strength);
}
