import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { makeFloor, doorPosition } from '../src/game/dungeon';
import { geometryFor, CELL } from '../src/game/geometry';
import { World } from '../src/game/world';
import { defaultSave } from '../src/game/save';
import {
  EXECUTIONS,
  EXECUTION_CONTACT,
  EXECUTION_DURATION,
  executionVariant,
} from '../src/game/executions';
import { executionClip, sampleClip, animateCharacter } from '../src/game/presentation/animation';
import { AssetManager, type AssetManifest } from '../src/game/presentation/assets';
import { ImportedActor } from '../src/game/presentation/imported-actor';
import { floorPatches, FLOOR_VARIANTS } from '../src/game/presentation/surfaces';
import {
  bladeRibbon,
  createWeaponEffect,
  updateWeaponEffect,
} from '../src/game/presentation/weapon-effects';

beforeEach(() => {
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});

describe('v0.5 polish regressions', () => {
  it('covers each original cell exactly once without bridging holes or height changes', () => {
    const variants = new Set<string>(),
      sizes = new Set<string>();
    for (let biome = 0; biome < 5; biome++)
      for (const room of makeFloor('FLAGSTONE-CHECK', biome + 1).rooms) {
        const tiles = geometryFor(room).tiles,
          patches = floorPatches(room, tiles);
        expect(patches).toEqual(floorPatches(room, tiles));
        const covered = new Map<string, number>();
        for (const patch of patches) {
          variants.add(patch.variant);
          sizes.add(`${patch.width}x${patch.depth}`);
          for (let x = 0; x < patch.width; x++)
            for (let y = 0; y < patch.depth; y++) {
              const key = `${patch.x - ((patch.width - 1) * CELL) / 2 + x * CELL},${patch.y - ((patch.depth - 1) * CELL) / 2 + y * CELL}`;
              expect(covered.has(key), 'overlapping patches').toBe(false);
              covered.set(key, patch.elevation);
            }
        }
        expect(covered.size).toBe(tiles.length);
        for (const tile of tiles) expect(covered.get(`${tile.x},${tile.y}`)).toBe(tile.elevation);
      }
    expect(variants.size).toBe(FLOOR_VARIANTS.length);
    expect(sizes.size).toBe(4);
  });

  it('walks through a cleared doorway, but never while fighting, waiting, or moving away', () => {
    const w = new World(defaultSave());
    w.start('AUTO-PASSAGE', 'sword');
    const next = w.floor.rooms[w.room.links[0]],
      origin = w.roomId;
    const door = doorPosition(w.room, next);
    Object.assign(w.player, door);
    const direction = { x: Math.sign(next.x - w.room.x), y: Math.sign(next.y - w.room.y) };
    w.movement = { x: 0, y: 0 };
    w.update(0.001);
    expect(w.roomId).toBe(origin);
    w.movement = { x: -direction.x, y: -direction.y };
    w.update(0.001);
    expect(w.roomId).toBe(origin);
    w.enemies = [w.spawnEnemy('warden', 0)];
    w.movement = direction;
    w.update(0.001);
    expect(w.roomId).toBe(origin);
    w.enemies = [];
    w.room.cleared = true;
    Object.assign(w.player, door);
    w.update(0.001);
    expect(w.roomId).toBe(next.id);
    const returnDoor = doorPosition(w.room, w.floor.rooms[origin]);
    Object.assign(w.player, returnDoor);
    w.movement = { x: 0, y: 0 };
    w.enemies = [];
    w.input('interact');
    w.update(0.001);
    expect(w.roomId).toBe(origin);
  });

  it('gives every pilgrim three distinct forms and keeps the gameplay contact in sync', () => {
    for (const weapon of Object.keys(EXECUTIONS)) {
      const contacts = new Set<string>(),
        choices = new Set<number>();
      for (let variant = 0; variant < 3; variant++) {
        choices.add(executionVariant('FORMS', weapon, variant));
        const clip = executionClip(weapon, variant);
        expect(clip.events).toContainEqual({ at: EXECUTION_CONTACT, name: 'execution' });
        contacts.add(JSON.stringify(sampleClip(clip, EXECUTION_CONTACT)));
        const w = new World(defaultSave());
        w.start('FORMS', weapon);
        w.enemies = [w.spawnEnemy('warden', 0)];
        const e = w.enemies[0];
        Object.assign(e, { x: w.player.x + 40, y: w.player.y, state: 'broken', stateAt: w.time });
        w.stats.finishers = variant;
        w.input('interact');
        w.update(0.001);
        expect(w.player.finisherVariant).toBe(executionVariant('FORMS', weapon, variant));
        const sample = animateCharacter(
          `player-${weapon}`,
          w.player,
          w.player.stateAt + EXECUTION_DURATION * EXECUTION_CONTACT,
          false,
          weapon,
          true,
        );
        expect(sample.normalized).toBeCloseTo(EXECUTION_CONTACT);
        expect(w.stats.kills).toBe(1);
        expect(w.stats.finishers).toBe(variant + 1);
      }
      expect(contacts.size).toBe(3);
      expect(choices.size).toBe(3);
    }
  });

  it('moves the pelvis, torso, and both thighs together on every imported rig and LOD', async () => {
    const base = new URL('../public/assets/v05/', import.meta.url);
    const manifest = JSON.parse(
      readFileSync(new URL('manifest.json', base), 'utf8'),
    ) as AssetManifest;
    const bytes = readFileSync(new URL(manifest.packs.pilgrims.file, base));
    const gltf = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const assets = new AssetManager('imported');
    const world = new World(defaultSave());
    for (const [id, record] of Object.entries(manifest.assets).filter(
      ([, r]) => r.kind === 'character',
    )) {
      for (const lod of record.lods)
        assets.templates.set(lod.node, gltf.scene.getObjectByName(lod.node)!);
      for (let level = 0; level < 3; level++) {
        const actor = new ImportedActor(assets, id, level),
          bones = new Map<string, T.Bone>();
        actor.root.traverse((o) => {
          if (o instanceof T.Bone) bones.set(o.userData.name ?? o.name, o);
        });
        const rest = sampleClip({ name: 'rest', keys: [{ at: 0, pose: {} }] }, 0);
        actor.animate(rest, 0);
        actor.root.updateMatrixWorld(true);
        const start = ['torso', 'rightLeg', 'leftLeg'].map((name) =>
          bones.get(name)!.getWorldPosition(new T.Vector3()),
        );
        actor.animate({ ...rest, lift: -0.18, advance: 0.52 }, 0);
        actor.root.updateMatrixWorld(true);
        ['torso', 'rightLeg', 'leftLeg'].forEach((name, i) => {
          const delta = bones.get(name)!.getWorldPosition(new T.Vector3()).sub(start[i]);
          expect(
            delta.distanceTo(new T.Vector3(0, -0.18, 0.52)),
            `${id}/${level}/${name} detached`,
          ).toBeLessThan(0.00001);
        });
        actor.animate(rest, 0);
        actor.root.updateMatrixWorld(true);
        expect(
          bones.get('rightLeg')!.getWorldPosition(new T.Vector3()).distanceTo(start[1]),
        ).toBeLessThan(0.00001);
        for (const kind of ['slash', 'thrust', 'smash', 'sweep', 'grab', 'feint']) {
          const posed = animateCharacter(id, world.player, 0, false, 'sword', true, {
            clip: kind,
            time: 0.58,
          }).pose;
          actor.animate(posed, 0);
          actor.root.updateMatrixWorld(true);
          for (const side of ['right', 'left']) {
            const ankle = bones.get(`${side}Foot`)!;
            expect(ankle, 'foot needs its own articulated ankle').toBeDefined();
            const foot = ankle.localToWorld(new T.Vector3(0, -0.1, 0));
            expect(foot.y, `${id}/${level}/${kind}/${side} foot left the floor`).toBeCloseTo(
              0.02,
              2,
            );
            expect(new T.Vector3(0, 1, 0).transformDirection(ankle.matrixWorld).y).toBeCloseTo(
              1,
              5,
            );
          }
        }
        actor.dispose();
      }
    }
    assets.dispose();
  });

  it('keeps strike and contact geometry finite with reduced motion and flashes disabled', () => {
    const texture = new T.Texture();
    for (const weapon of Object.keys(EXECUTIONS))
      for (const form of EXECUTIONS[weapon]) {
        const effect = {
          x: 560,
          y: 380,
          angle: 1.2,
          life: 0.4,
          maxLife: 0.4,
          kind: 'slash' as const,
          scale: 1.3,
          color: '#eee',
          weapon,
          attackKind: form.kind,
        };
        const ribbon = bladeRibbon(effect);
        expect([...ribbon.attributes.position.array].every(Number.isFinite)).toBe(true);
        ribbon.dispose();
        const contact = { ...effect, kind: 'perfect' as const, contact: true };
        const root = createWeaponEffect(contact, texture);
        for (const time of [0, 0.3, 1]) {
          updateWeaponEffect(root, contact, time, true, false);
          root.traverse((o) => {
            if (o instanceof T.LineSegments)
              expect([...o.geometry.attributes.position.array].every(Number.isFinite)).toBe(true);
            if (o instanceof T.Sprite) expect(o.visible).toBe(false);
          });
        }
        root.traverse((o) => {
          if (o instanceof T.Mesh || o instanceof T.LineSegments) o.geometry.dispose();
          if (o instanceof T.Mesh || o instanceof T.LineSegments || o instanceof T.Sprite)
            (o.material as T.Material).dispose();
        });
      }
    texture.dispose();
  });
});
