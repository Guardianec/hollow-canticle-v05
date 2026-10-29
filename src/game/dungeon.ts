import { BIOMES, ENEMIES } from './data';
import { Random, recentWeight } from './random';
import { geometryFor } from './geometry';
export type RoomKind =
  | 'start'
  | 'combat'
  | 'elite'
  | 'treasure'
  | 'shrine'
  | 'hazard'
  | 'healing'
  | 'secret'
  | 'exit'
  | 'boss';
export type Modifier = 'Quiet' | 'Darkness' | 'Resonant' | 'Blood pact' | 'Unstable' | 'Silence';
export interface Room {
  id: number;
  x: number;
  y: number;
  kind: RoomKind;
  name: string;
  template: string;
  variant: number;
  links: number[];
  enemies: string[];
  budget: number;
  modifier: Modifier;
  elite: 'Patient' | 'Relentless' | 'Armored';
  visited: boolean;
  cleared: boolean;
  claimed: boolean;
  artSeed: string;
  landmark: string;
  transition: boolean;
}
export interface Floor {
  depth: number;
  biome: number;
  hybrid: number | null;
  rooms: Room[];
  seed: string;
}
export interface Obstacle {
  x: number;
  y: number;
  radius: number;
  type: 'pillar' | 'rubble' | 'tomb';
}
export const ROOM_PITCH = { x: 1200, y: 840 };
export const ARCHETYPES = [
  'broken-cloister',
  'chasm-crossing',
  'hanging-prison',
  'sunken-court',
  'root-cathedral',
  'split-shrine',
  'furnace-gallery',
  'bell-bastion',
  'processional-stair',
  'forgotten-library',
];
const NAMES = [
  'Cloister of Ash',
  'The Thousand-Fathom Walk',
  'The Hanging Penitents',
  'Court of the Drowned',
  'The Rootbound Chapel',
  'Shrine Above the Silence',
  'The Cinder Works',
  'Watch of the Unrung',
  'The Procession of Stone',
  'The Unwritten Archive',
];
const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
export function makeFloor(seed: string, depth: number): Floor {
  const rng = new Random(seed + ':v2:floor:' + depth),
    biome = (depth - 1) % BIOMES.length,
    rooms: Room[] = [],
    history: string[] = [];
  const occupied = (x: number, y: number) => rooms.some((r) => r.x === x && r.y === y);
  const add = (x: number, y: number, kind: RoomKind) => {
    const affinity =
      biome === 1
        ? ['sunken-court', 'split-shrine']
        : biome === 2
          ? ['root-cathedral', 'hanging-prison']
          : biome === 3
            ? ['processional-stair', 'chasm-crossing']
            : biome === 4
              ? ['furnace-gallery', 'bell-bastion']
              : ['broken-cloister', 'bell-bastion'];
    const template =
      kind === 'start'
        ? rng.pick(['chasm-crossing', 'broken-cloister', 'split-shrine'])
        : rng.weighted(
            ARCHETYPES,
            (t) => recentWeight(t, history.slice(-3)) * (affinity.includes(t) ? 3 : 1),
          );
    history.push(template);
    const budget =
        kind === 'boss'
          ? 10
          : kind === 'elite'
            ? 8
            : depth === 1 && rooms.length > 2 && kind === 'combat'
              ? 5
              : Math.min(9, 3 + Math.floor(depth / 2)),
      enemies = encounter(rng, kind, budget, biome, depth);
    rooms.push({
      id: rooms.length,
      x,
      y,
      kind,
      name:
        kind === 'start'
          ? 'Pilgrim’s Overlook'
          : kind === 'exit'
            ? 'The Stairs Beneath'
            : kind === 'boss'
              ? [
                  'The Marshal’s Tribunal',
                  'The Submerged Bell',
                  'The Living Cathedral',
                  'The Last Watch',
                  'The Furnace Heart',
                ][biome]
              : kind === 'healing'
                ? 'The Quiet Cistern'
                : NAMES[ARCHETYPES.indexOf(template)],
      template,
      variant: rng.int(0, 3),
      links: [],
      enemies,
      budget,
      modifier:
        enemies.length && depth > 1
          ? rng.weighted(
              ['Quiet', 'Darkness', 'Resonant', 'Blood pact', 'Unstable', 'Silence'] as const,
              (m) => (m === 'Quiet' ? 4 : 1),
            )
          : 'Quiet',
      elite: rng.pick(['Patient', 'Relentless', 'Armored'] as const),
      visited: false,
      cleared: !enemies.length,
      claimed: false,
      artSeed: seed + ':' + depth + ':' + rooms.length,
      landmark:
        kind === 'boss'
          ? 'bell'
          : template === 'forgotten-library'
            ? 'library'
            : template === 'hanging-prison'
              ? 'cage'
              : template === 'root-cathedral'
                ? 'root'
                : biome === 4
                  ? 'furnace'
                  : rng.pick(['statue', 'bell', 'tree', 'altar']),
      transition: kind === 'exit',
    });
    return rooms.length - 1;
  };
  const link = (a: number, b: number) => {
    if (!rooms[a].links.includes(b)) {
      rooms[a].links.push(b);
      rooms[b].links.push(a);
    }
  };
  add(0, 0, 'start');
  add(1, 0, 'combat');
  link(0, 1);
  let previous = 1;
  for (const kind of ['combat', 'elite', 'boss', 'exit'] as RoomKind[]) {
    const base = rooms[previous],
      d = rng.pick(DIRS.filter((d) => !occupied(base.x + d.x, base.y + d.y) && base.x + d.x >= 1));
    const id = add(base.x + d.x, base.y + d.y, kind);
    link(previous, id);
    previous = id;
  }
  const exitId = rooms.length - 1,
    bossId = exitId - 1;
  const a = rooms[1],
    b = rooms[2],
    dx = b.x - a.x,
    dy = b.y - a.y;
  for (const side of rng.shuffle([1, -1])) {
    const ax = a.x - dy * side,
      ay = a.y + dx * side,
      bx = b.x - dy * side,
      by = b.y + dx * side;
    if (!occupied(ax, ay) && !occupied(bx, by) && ax >= 0 && bx >= 0) {
      const c = add(ax, ay, 'healing'),
        d = add(bx, by, 'treasure');
      link(1, c);
      link(c, d);
      link(d, 2);
      break;
    }
  }
  if (rooms.length === 6)
    for (const anchor of [...rooms].filter((r) => r.id > 0 && r.id < bossId)) {
      let done = false;
      for (const d of DIRS) {
        const e = { x: -d.y, y: d.x },
          p = [
            { x: anchor.x + d.x, y: anchor.y + d.y },
            { x: anchor.x + d.x + e.x, y: anchor.y + d.y + e.y },
            { x: anchor.x + e.x, y: anchor.y + e.y },
          ];
        if (p.every((p) => !occupied(p.x, p.y))) {
          const ids = p.map((v, i) =>
            add(v.x, v.y, (['healing', 'treasure', 'hazard'] as const)[i]),
          );
          link(anchor.id, ids[0]);
          link(ids[0], ids[1]);
          link(ids[1], ids[2]);
          link(ids[2], anchor.id);
          done = true;
          break;
        }
      }
      if (done) break;
    }
  const desired = rng.int(13, 18),
    kinds: RoomKind[] = ['treasure', 'healing', 'shrine', 'hazard', 'combat', 'elite'];
  for (let tries = 0; rooms.length < desired && tries < 400; tries++) {
    const base = rng.pick(rooms.filter((r) => r.id !== 0 && r.id !== exitId && r.id !== bossId)),
      d = rng.pick(DIRS),
      x = base.x + d.x,
      y = base.y + d.y;
    if (occupied(x, y) || x < -1 || x > 6 || Math.abs(y) > 4) continue;
    const id = add(x, y, kinds[(rooms.length + depth) % kinds.length]);
    link(base.id, id);
    for (const r of rooms)
      if (
        r.id !== id &&
        r.id !== 0 &&
        r.id !== exitId &&
        r.id !== bossId &&
        Math.abs(r.x - x) + Math.abs(r.y - y) === 1 &&
        rng.next() < 0.42
      )
        link(id, r.id);
  }
  for (const r of rng.shuffle(
    rooms.filter((r) => r.id > 0 && r.id !== bossId && r.id !== exitId),
  )) {
    const d = DIRS.find((d) => !occupied(r.x + d.x, r.y + d.y));
    if (d) {
      link(r.id, add(r.x + d.x, r.y + d.y, 'secret'));
      break;
    }
  }
  rooms[0].visited = true;
  return { seed, depth, biome, hybrid: depth > 5 ? (biome + rng.int(1, 4)) % 5 : null, rooms };
}
export function encounter(
  rng: Random,
  kind: RoomKind,
  budget: number,
  biome: number,
  depth: number,
): string[] {
  if (kind === 'boss') return ['boss'];
  const ranged = ENEMIES.filter(
    (e) => ['archer', 'hexer'].includes(e.id) && e.affinity.includes(biome),
  );
  if (
    (kind === 'combat' || kind === 'elite') &&
    depth >= 2 &&
    rng.next() < (depth < 4 ? 0.27 : 0.38)
  ) {
    const support = rng.pick(ranged);
    const front = ENEMIES.filter(
      (e) =>
        !['boss', 'archer', 'hexer'].includes(e.id) &&
        e.affinity.includes(biome) &&
        e.cost + support.cost <= budget,
    );
    if (front.length) return [rng.pick(front).id, support.id];
  }
  if (kind === 'elite')
    return [
      rng.pick(ENEMIES.filter((e) => e.cost >= 4 && e.id !== 'boss' && e.affinity.includes(biome)))
        .id,
    ];
  if (kind !== 'combat') return [];
  if (depth === 1 && budget < 5) return [rng.pick(['warden', 'spear'])];
  const compositions = [
    ['shield', 'spear'],
    ['brute', 'assassin'],
    ['monk', 'beast'],
    ['duelist', 'warden'],
    ['warden', 'spear'],
    ['monk', 'warden'],
  ];
  const pairs = compositions.filter((pair) => {
    const defs = pair.map((id) => ENEMIES.find((e) => e.id === id)!);
    return (
      defs.every((e) => e.affinity.includes(biome)) &&
      defs.reduce((n, e) => n + e.cost, 0) <= budget
    );
  });
  if (pairs.length && rng.next() < 0.7) return [...rng.pick(pairs)];
  const pool = ENEMIES.filter(
      (e) =>
        !['boss', 'archer', 'hexer'].includes(e.id) &&
        e.cost <= budget &&
        e.affinity.includes(biome),
    ),
    first = rng.pick(pool),
    result = [first.id],
    support = pool.filter(
      (e) => e.cost <= budget - first.cost && (first.speed < 110 || e.speed < 110),
    );
  if (support.length && rng.next() > 0.35) result.push(rng.pick(support).id);
  return result;
}
export function obstaclesFor(room: Room, _biome: number): Obstacle[] {
  return geometryFor(room).obstacles;
}
export function reachable(floor: Floor, from = 0): Set<number> {
  const seen = new Set([from]),
    queue = [from];
  for (let i = 0; i < queue.length; i++)
    for (const id of floor.rooms[queue[i]].links)
      if (!seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
  return seen;
}
export function doorPosition(a: Room, b: Room): { x: number; y: number } {
  return { x: b.x > a.x ? 1040 : b.x < a.x ? 80 : 560, y: b.y > a.y ? 674 : b.y < a.y ? 86 : 380 };
}
