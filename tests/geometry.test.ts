import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCHETYPES, makeFloor, doorPosition } from '../src/game/dungeon';
import {
  canStand,
  geometryFor,
  navigationReachable,
  insideRoom,
  pathBetween,
} from '../src/game/geometry';
import { CameraDirector } from '../src/game/presentation/camera';
import { globalPosition } from '../src/game/presentation/architecture';
import { World } from '../src/game/world';
import { defaultSave } from '../src/game/save';

beforeEach(() => {
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
describe('v0.2 spatial grammar', () => {
  it('routes combatants around the chasm instead of directly through empty space', () => {
    const room = makeFloor('PATH', 1).rooms[1];
    room.template = 'chasm-crossing';
    const path = pathBetween(room, { x: 735, y: 380 }, { x: 560, y: 100 });
    expect(path.length).toBeGreaterThan(12);
    for (const p of path) expect(canStand(room, p.x, p.y)).toBe(true);
    expect(path.at(-1)?.y).toBe(100);
  });
  it('uses genuinely different topologies across seeds', () => {
    const topologies = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const f = makeFloor('TOPOLOGY-' + i, 1);
      topologies.add(JSON.stringify(f.rooms.map((r) => [r.x, r.y, r.links])));
      expect(f.rooms.find((r) => r.kind === 'exit')!.links).toEqual([
        f.rooms.find((r) => r.kind === 'boss')!.id,
      ]);
    }
    expect(topologies.size).toBeGreaterThan(90);
  });
  it('connects every portal and combat spawn in all ten authored shapes', () => {
    for (const template of ARCHETYPES) {
      const room = makeFloor('GEOMETRY', 1).rooms[1];
      room.template = template;
      const nav = navigationReachable(room),
        points = [...nav].map((key) => key.split(',').map(Number));
      expect(nav.size).toBeGreaterThan(450);
      for (const p of [
        { x: 80, y: 380 },
        { x: 1040, y: 380 },
        { x: 560, y: 86 },
        { x: 560, y: 674 },
        { x: 455, y: 430 },
        { x: 735, y: 380 },
        { x: 650, y: 470 },
      ]) {
        expect(canStand(room, p.x, p.y), template + ' spawn ' + JSON.stringify(p)).toBe(true);
        expect(
          points.some(([x, y]) => Math.hypot(x - p.x, y - p.y) < 22),
          template + ' disconnected portal',
        ).toBe(true);
      }
      const shape = geometryFor(room);
      expect(shape.tiles.length).toBeGreaterThan(170);
      expect(shape.tiles.length).toBeLessThan(350);
      for (const tile of shape.tiles)
        if (canStand(room, tile.x, tile.y))
          expect(
            nav.has(tile.x + ',' + tile.y),
            template + ' isolated floor ' + tile.x + ',' + tile.y,
          ).toBe(true);
    }
  });
  it('keeps decoration and lights attached to physical surfaces and doors clear', () => {
    for (let i = 0; i < 500; i++) {
      const floor = makeFloor('DECORATION-' + i, 1 + (i % 30));
      for (const room of floor.rooms) {
        const geo = geometryFor(room);
        for (const l of geo.lights) expect(insideRoom(room, l.x, l.y)).toBe(true);
        for (const id of room.links) {
          const d = doorPosition(room, floor.rooms[id]);
          for (const o of geo.obstacles)
            expect(Math.hypot(o.x - d.x, o.y - d.y)).toBeGreaterThan(o.radius + 50);
        }
      }
    }
  }, 30000);
  it('builds deterministic geometry while preserving irregular floor silhouettes', () => {
    const a = makeFloor('REPEAT', 6),
      b = makeFloor('REPEAT', 6);
    expect(geometryFor(a.rooms[2])).toEqual(geometryFor(b.rooms[2]));
    expect(insideRoom(a.rooms[0], 85, 90)).toBe(false);
  });
});
describe('independent exploration and duel presentation', () => {
  it('keeps the Saint crown, raised weapon, and player feet in the boss frame', () => {
    const w = new World(defaultSave());
    w.start('BOSS-FRAME', 'sword');
    w.enemies = [w.spawnEnemy('boss', 0)];
    w.enemies[0].x = w.player.x + 85;
    w.enemies[0].y = w.player.y;
    const director = new CameraDirector(w);
    director.resize(1440, 900);
    for (let i = 0; i < 180; i++)
      director.update(1 / 60, globalPosition(w.room, w.player.x, w.player.y));
    for (const [entity, height] of [
      [w.enemies[0], 5.8],
      [w.player, 0],
    ] as const) {
      const point = globalPosition(w.room, entity.x, entity.y, height).project(director.camera);
      expect(Math.abs(point.y)).toBeLessThan(0.95);
    }
  });
  it('accounts for raised stair surfaces when unprojecting aim', () => {
    const w = new World(defaultSave());
    w.start('STAIRS', 'sword');
    w.room.template = 'processional-stair';
    w.player.x = 560;
    w.player.y = 140;
    const director = new CameraDirector(w);
    director.resize(1440, 900);
    const player = globalPosition(w.room, w.player.x, w.player.y);
    director.update(0.1, player);
    const point = player.clone().project(director.camera),
      result = director.screenToWorld((point.x + 1) * 720, (1 - point.y) * 450, 1440, 900);
    expect(result.x).toBeCloseTo(560, 4);
    expect(result.y).toBeCloseTo(140, 4);
  });
  it('ray casts the mouse to the same simulation position after the camera changes', () => {
    const w = new World(defaultSave());
    w.start('CAMERA', 'sword', true);
    w.enemies[0].x = w.player.x + 85;
    w.enemies[0].y = w.player.y;
    const director = new CameraDirector(w);
    director.resize(1440, 900);
    const player = globalPosition(w.room, w.player.x, w.player.y);
    for (let i = 0; i < 180; i++) director.update(1 / 60, player);
    expect(director.duel).toBeGreaterThan(0.98);
    expect(director.camera.position.y).toBeLessThan(4);
    const pixel = player.clone().project(director.camera),
      sim = director.screenToWorld((pixel.x + 1) * 720, (1 - pixel.y) * 450, 1440, 900);
    expect(sim.x).toBeCloseTo(w.player.x, 4);
    expect(sim.y).toBeCloseTo(w.player.y, 4);
    expect(Math.hypot(...Object.values(director.movement(1, 0)))).toBeCloseTo(1, 5);
  });
  it('frames every group combatant, then returns to exploration after combat', () => {
    const w = new World(defaultSave());
    w.start('CAMERA', 'sword', true);
    w.enemies[0].x = w.player.x + 85;
    w.enemies[0].y = w.player.y;
    const director = new CameraDirector(w),
      player = globalPosition(w.room, w.player.x, w.player.y);
    director.resize(1440, 900);
    for (let i = 0; i < 180; i++) director.update(1 / 60, player);
    w.enemies.push(w.spawnEnemy('spear', 1));
    for (let i = 0; i < 180; i++) director.update(1 / 60, player);
    expect(director.mode).toBe('combat-wide');
    expect(director.camera.position.y).toBeGreaterThan(5);
    for (const e of [w.player, ...w.enemies]) {
      const p = globalPosition(w.room, e.x, e.y, 1).project(director.camera);
      expect(Math.abs(p.x)).toBeLessThan(0.9);
      expect(Math.abs(p.y)).toBeLessThan(0.9);
    }
    w.enemies = [];
    for (let i = 0; i < 180; i++) director.update(1 / 60, player);
    expect(director.mode).toBe('exploration');
  });
});
