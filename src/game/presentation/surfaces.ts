import type { Room } from '../dungeon';
import { CELL, type Tile } from '../geometry';
import { Random } from '../random';

export const FLOOR_VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
export interface FloorPatch {
  x: number;
  y: number;
  elevation: number;
  width: number;
  depth: number;
  variant: string;
  rotation: number;
}

/** Partition the actual walk surface; never bridge a void or flatten a stair. */
export function floorPatches(room: Room, tiles: readonly Tile[]): FloorPatch[] {
  const rng = new Random(room.artSeed + ':flagstones');
  const remaining = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  const order = tiles.map((tile) => ({ tile, rank: rng.next() })).sort((a, b) => a.rank - b.rank);
  const result: FloorPatch[] = [];
  for (const { tile } of order) {
    if (!remaining.has(`${tile.x},${tile.y}`)) continue;
    const sizes = rng.pick([
      [
        [2, 1],
        [1, 2],
        [2, 2],
      ],
      [
        [1, 2],
        [2, 2],
        [2, 1],
      ],
      [
        [2, 2],
        [2, 1],
        [1, 2],
      ],
      [[1, 1]],
    ]);
    let width = 1,
      depth = 1;
    for (const [w, d] of sizes) {
      let valid = true;
      for (let x = 0; x < w; x++)
        for (let y = 0; y < d; y++) {
          const neighbour = remaining.get(`${tile.x + x * CELL},${tile.y + y * CELL}`);
          if (
            !neighbour ||
            neighbour.elevation !== tile.elevation ||
            ((w > 1 || d > 1) && (neighbour.edge.length > 0 || neighbour.zone !== 'floor'))
          )
            valid = false;
        }
      if (valid) {
        width = w;
        depth = d;
        break;
      }
    }
    for (let x = 0; x < width; x++)
      for (let y = 0; y < depth; y++) remaining.delete(`${tile.x + x * CELL},${tile.y + y * CELL}`);
    result.push({
      x: tile.x + ((width - 1) * CELL) / 2,
      y: tile.y + ((depth - 1) * CELL) / 2,
      elevation: tile.elevation,
      width,
      depth,
      variant: rng.pick([...FLOOR_VARIANTS]),
      rotation: rng.int(0, width === depth ? 3 : 1) * (width === depth ? Math.PI / 2 : Math.PI),
    });
  }
  return result;
}
