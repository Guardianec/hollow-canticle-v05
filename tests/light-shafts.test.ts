import * as T from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFloor } from '../src/game/dungeon';
import { canStand } from '../src/game/geometry';
import { shaftOpenings } from '../src/game/light-shafts';
import { LightShafts } from '../src/game/presentation/light-shafts';
import { World } from '../src/game/world';
import { defaultSave } from '../src/game/save';
import { GRAPHICS_LEVELS } from '../src/game/graphics';

beforeEach(() => {
  vi.stubGlobal('location', { search: '?debug' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
describe('light through unseen fractures', () => {
  it('varies placement and openings between rooms while retaining safe stable floor anchors', () => {
    const positions = new Set<string>(),
      counts = new Set<number>(),
      shapes = new Set<string>();
    for (let seed = 0; seed < 35; seed++)
      for (let biome = 0; biome < 5; biome++) {
        const floor = makeFloor(`FRACTURES-${seed}`, biome + 1);
        for (const room of floor.rooms) {
          const openings = shaftOpenings(room, biome);
          counts.add(openings.length);
          expect(openings).toEqual(shaftOpenings(room, biome));
          expect(openings.length).toBeLessThanOrEqual(3);
          if (room.kind === 'boss') expect(openings.length).toBeGreaterThan(0);
          for (const o of openings) {
            expect(canStand(room, o.x, o.y, 20)).toBe(true);
            expect(o.height).toBeGreaterThan(o.radius * 3);
            expect(Math.hypot(o.leanX, o.leanY)).toBeLessThan(0.4);
            expect(
              openings.filter((p) => p !== o).every((p) => Math.hypot(o.x - p.x, o.y - p.y) >= 185),
            ).toBe(true);
            positions.add(`${Math.round(o.x)},${Math.round(o.y)}`);
            shapes.add(`${o.radius.toFixed(1)}:${o.aspect.toFixed(1)}:${o.height.toFixed(0)}`);
          }
        }
      }
    expect(positions.size).toBeGreaterThan(500);
    expect(shapes.size).toBeGreaterThan(100);
    expect([...counts].sort()).toEqual([0, 1, 2, 3]);
  });
  it('keeps the main opening fixed across presets, attenuates hazards and freezes dust for reduced motion', () => {
    const w = new World(defaultSave());
    w.start('FRACTURE-QA', 'sword');
    w.enterRoom(w.floor.rooms.find((r) => r.kind === 'boss')!.id);
    const shafts = new LightShafts(),
      camera = new T.Vector3(10, 8, 12),
      objects = [...shafts.root.children];
    let position: T.Vector3 | undefined;
    for (const detail of GRAPHICS_LEVELS) {
      w.save.settings.detail = detail;
      shafts.update(w, camera, 0);
      const main = shafts.root.children[0] as T.Mesh<T.CylinderGeometry, T.ShaderMaterial>;
      expect(main.visible).toBe(true);
      position ??= main.position.clone();
      expect(main.position).toEqual(position);
      expect(main.geometry.type).toBe('CylinderGeometry');
      const power = main.material.uniforms.strength.value;
      shafts.update(w, camera, 3);
      expect(main.material.uniforms.strength.value).toBeLessThan(power);
      w.visualTime = 123;
      w.save.settings.reducedMotion = true;
      shafts.update(w, camera, 0);
      expect(main.material.uniforms.clock.value).toBe(0);
      w.save.settings.reducedMotion = false;
    }
    expect(shafts.root.children).toEqual(objects);
    w.weather.shafts = false;
    shafts.update(w, camera, 0);
    expect(shafts.root.children.every((c) => !c.visible)).toBe(true);
    shafts.dispose();
    expect(shafts.root.children).toHaveLength(0);
  });
});
