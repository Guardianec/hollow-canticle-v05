import type { Room, Obstacle } from './dungeon';
import { Random } from './random';
export const CELL = 40;
export interface Tile {
  x: number;
  y: number;
  elevation: number;
  zone: 'floor' | 'bridge' | 'stairs' | 'feature';
  edge: number[];
}
export interface Decoration {
  x: number;
  y: number;
  elevation: number;
  kind: 'column' | 'rubble' | 'plant' | 'banner' | 'candle' | 'statue' | 'chain' | 'shelf' | 'urn';
  scale: number;
  rotation: number;
}
export interface Geometry {
  tiles: Tile[];
  obstacles: Obstacle[];
  decorations: Decoration[];
  lights: { x: number; y: number }[];
  shape: string;
}
const cache = new WeakMap<Room, Geometry>();
export function insideRoom(room: Room, x: number, y: number): boolean {
  if (x < 50 || x > 1070 || y < 65 || y > 700) return false;
  const rect = (cx: number, cy: number, w: number, h: number) =>
    Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2;
  if (room.template === 'duel-arena') return rect(560, 380, 800, 480);
  const arms = rect(560, 380, 1040, 104) || rect(560, 380, 104, 650),
    t = room.template;
  if (t === 'split-shrine')
    return (
      arms ||
      (x - 560) ** 2 / 270 ** 2 + (y - 380) ** 2 / 225 ** 2 < 1 ||
      rect(220, 220, 180, 150) ||
      rect(350, 260, 240, 80)
    );
  if (t === 'chasm-crossing' || t === 'hanging-prison')
    return (
      arms ||
      rect(565, 380, 455, 330) ||
      rect(160, 390, 180, 230) ||
      rect(960, 380, 180, 260) ||
      rect(560, 130, 230, 120) ||
      rect(560, 640, 265, 110)
    );
  if (t === 'processional-stair')
    return arms || rect(590, 400, 450, 350) || rect(390, 180, 360, 140) || rect(810, 580, 290, 155);
  if (t === 'sunken-court')
    return arms || rect(560, 390, 610, 330) || rect(310, 230, 210, 200) || rect(800, 530, 180, 220);
  if (t === 'root-cathedral')
    return (
      arms || (x - 560) ** 2 / 315 ** 2 + (y - 385) ** 2 / 230 ** 2 < 1 || rect(870, 180, 220, 150)
    );
  if (t === 'forgotten-library')
    return arms || rect(570, 380, 580, 350) || rect(300, 165, 290, 130) || rect(820, 610, 290, 150);
  if (t === 'furnace-gallery')
    return arms || rect(560, 380, 510, 400) || rect(900, 200, 280, 180) || rect(225, 570, 280, 150);
  return arms || rect(575, 385, 540, 365) || rect(290, 230, 230, 180) || rect(850, 550, 220, 190);
}
export function canStand(room: Room, x: number, y: number, radius = 16): boolean {
  for (const [dx, dy] of [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [radius * 0.7, radius * 0.7],
    [-radius * 0.7, -radius * 0.7],
  ])
    if (!insideRoom(room, x + dx, y + dy)) return false;
  return true;
}
export function elevationAt(room: Room, _x: number, y: number): number {
  if (room.template === 'duel-arena') return 0;
  if (room.template === 'sunken-court') return y > 475 ? -10 : Math.max(0, (250 - y) * 0.18);
  if (room.template === 'processional-stair' || room.template === 'split-shrine')
    return Math.max(0, (270 - y) * 0.32);
  return Math.max(0, (210 - y) * 0.24);
}
export function geometryFor(room: Room): Geometry {
  const old = cache.get(room);
  if (old) return old;
  const rng = new Random(room.artSeed + ':decoration'),
    tiles: Tile[] = [],
    decorations: Decoration[] = [];
  for (let y = 80; y <= 680; y += CELL)
    for (let x = 80; x <= 1040; x += CELL) {
      if (!insideRoom(room, x, y)) continue;
      const edge: number[] = [];
      [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ].forEach(([dx, dy], i) => {
        if (!insideRoom(room, x + dx * CELL, y + dy * CELL)) edge.push(i);
      });
      const bridge =
        (Math.abs(y - 380) < 65 && (x < 320 || x > 840)) ||
        (Math.abs(x - 560) < 65 && (y < 210 || y > 580));
      tiles.push({
        x,
        y,
        elevation: elevationAt(room, x, y),
        zone: bridge ? 'bridge' : y < 270 ? 'stairs' : 'floor',
        edge,
      });
      if (edge.length && rng.next() < 0.3 && x > 130 && x < 990 && y > 135 && y < 630) {
        const kind = rng.weighted(['rubble', 'plant', 'urn', 'candle'] as const, (k) =>
          k === 'plant' ? 4 : k === 'rubble' ? 3 : 1,
        );
        decorations.push({
          x: x + rng.int(-10, 10),
          y: y + rng.int(-10, 10),
          elevation: elevationAt(room, x, y),
          kind,
          scale: rng.int(6, 14) / 10,
          rotation: rng.next() * Math.PI * 2,
        });
      }
    }
  const columns = (
    room.template === 'duel-arena'
      ? []
      : [
          { x: 380, y: 260 },
          { x: 750, y: 500 },
          { x: 340, y: 555 },
          { x: 800, y: 235 },
        ]
  ).filter((p) => canStand(room, p.x, p.y, 28));
  const obstacles: Obstacle[] = columns.map((p, i) => ({
    ...p,
    radius: 24,
    type: i === 3 && room.variant % 2 ? 'rubble' : 'pillar',
  }));
  for (const p of columns) {
    decorations.push({
      ...p,
      elevation: elevationAt(room, p.x, p.y),
      kind: 'column',
      scale: 1,
      rotation: 0,
    });
    if (rng.next() > 0.25)
      decorations.push({
        x: p.x + 10,
        y: p.y + 5,
        elevation: elevationAt(room, p.x, p.y),
        kind: 'banner',
        scale: 1,
        rotation: 0,
      });
  }
  const feature = [
    { x: 670, y: 270 },
    { x: 450, y: 240 },
    { x: 680, y: 290 },
  ].find((p) => canStand(room, p.x, p.y, 32));
  if (feature && room.template !== 'duel-arena') {
    const kind =
      room.landmark === 'library' ? 'shelf' : room.landmark === 'cage' ? 'chain' : 'statue';
    decorations.push({
      ...feature,
      elevation: elevationAt(room, feature.x, feature.y),
      kind,
      scale: 1.7,
      rotation: 0,
    });
    if (kind !== 'chain') obstacles.push({ ...feature, radius: 30, type: 'tomb' });
  }
  const lights = [
    { x: 385, y: 275 },
    { x: 775, y: 275 },
    { x: 380, y: 510 },
    { x: 800, y: 505 },
    { x: 150, y: 350 },
    { x: 965, y: 350 },
    { x: 560, y: 130 },
    { x: 560, y: 630 },
  ].filter((p) => insideRoom(room, p.x, p.y));
  const geometry = { tiles, obstacles, decorations, lights, shape: room.template };
  cache.set(room, geometry);
  return geometry;
}
export function navigationReachable(room: Room): Set<string> {
  const seen = new Set<string>(),
    queue = [{ x: 560, y: 400 }];
  seen.add('560,400');
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dy] of [
      [20, 0],
      [-20, 0],
      [0, 20],
      [0, -20],
    ]) {
      const p = { x: queue[i].x + dx, y: queue[i].y + dy },
        key = p.x + ',' + p.y;
      if (!seen.has(key) && canStand(room, p.x, p.y)) {
        seen.add(key);
        queue.push(p);
      }
    }
  return seen;
}
export function pathBetween(
  room: Room,
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] {
  const obstacles = geometryFor(room).obstacles;
  const valid = (x: number, y: number) =>
    canStand(room, x, y) && obstacles.every((o) => Math.hypot(o.x - x, o.y - y) > o.radius + 18);
  const snap = (p: { x: number; y: number }) => {
    const candidates = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = Math.round(p.x / 20) * 20 + dx * 20,
          y = Math.round(p.y / 20) * 20 + dy * 20;
        if (valid(x, y)) candidates.push({ x, y });
      }
    return candidates.sort(
      (a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
    )[0];
  };
  const start = snap(from),
    end = snap(to);
  if (!start || !end) return [];
  const key = (p: { x: number; y: number }) => p.x + ',' + p.y,
    queue = [start],
    parents = new Map<string, string | null>([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (key(p) === key(end)) {
      const result = [];
      let at: string | null = key(end);
      while (at) {
        const [x, y] = at.split(',').map(Number);
        result.unshift({ x, y });
        at = parents.get(at) ?? null;
      }
      return result;
    }
    for (const [dx, dy] of [
      [20, 0],
      [-20, 0],
      [0, 20],
      [0, -20],
    ]) {
      const next = { x: p.x + dx, y: p.y + dy },
        k = key(next);
      if (!parents.has(k) && valid(next.x, next.y)) {
        parents.set(k, key(p));
        queue.push(next);
      }
    }
  }
  return [];
}
