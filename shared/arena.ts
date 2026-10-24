import type { World } from '../src/game/world';
import { makeFloor } from '../src/game/dungeon';
import { Random } from '../src/game/random';
export function configureArena(world: World, seed: string): void {
  world.floor = makeFloor(seed, 1);
  world.roomId = 0;
  world.floor.biome = new Random(seed + ':arena').pick([0, 3, 4]);
  Object.assign(world.room, {
    template: 'duel-arena',
    kind: 'start',
    modifier: 'Quiet',
    cleared: true,
    links: [],
    name:
      world.floor.biome === 0
        ? 'Ruined Cloister'
        : world.floor.biome === 3
          ? 'Frozen Court'
          : 'Ember Platform',
  });
  world.obstacles = [];
}
