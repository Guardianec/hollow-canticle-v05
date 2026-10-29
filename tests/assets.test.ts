import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  AssetManager,
  assetVariant,
  packForBiome,
  characterAsset,
  type AssetManifest,
} from '../src/game/presentation/assets';
import { ImportedActor } from '../src/game/presentation/imported-actor';
import { sampleClip } from '../src/game/presentation/animation';
import { parseSave } from '../src/game/save';

const root = new URL('../public/assets/v05/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as AssetManifest;
afterEach(() => vi.unstubAllGlobals());

describe('Blender runtime contract', () => {
  it('migrates legacy quality and validates the three detail levels', () => {
    expect(
      parseSave(JSON.stringify({ version: 2, settings: { quality: false } })).settings.detail,
    ).toBe('low');
    expect(
      parseSave(JSON.stringify({ version: 2, settings: { detail: 'medium' } })).settings.detail,
    ).toBe('medium');
    expect(
      parseSave(JSON.stringify({ version: 2, settings: { detail: 'unknown' } })).settings.detail,
    ).toBe('high');
  });
  it('has three measured LODs, existing GLBs and valid shared material IDs', () => {
    for (const [id, asset] of Object.entries(manifest.assets)) {
      expect(asset.lods).toHaveLength(3);
      expect(asset.lods[0].triangles, id).toBeGreaterThan(0);
      expect(asset.lods[2].triangles, id).toBeLessThan(asset.lods[0].triangles);
      expect(existsSync(new URL(manifest.packs[asset.pack].file, root))).toBe(true);
    }
    for (const family of Object.values(manifest.materials))
      for (const map of [family.baseColor, family.normal, family.roughness, family.ao])
        expect(existsSync(new URL(map, root))).toBe(true);
  });
  it('loads real GLBs, resolves multi-material modules and keeps finite bounds', async () => {
    const manager = new AssetManager('imported');
    for (const pack of Object.values(manifest.packs)) {
      const bytes = readFileSync(new URL(pack.file, root));
      const gltf = await new GLTFLoader()
        .setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      for (const [id, asset] of Object.entries(manifest.assets)) {
        if (manifest.packs[asset.pack] !== pack) continue;
        for (const lod of asset.lods) {
          const object = gltf.scene.getObjectByName(lod.node)!;
          expect(object, id).toBeDefined();
          manager.templates.set(lod.node, object);
          if (id === 'shinobi') {
            expect(object.userData.design).toContain('no knight cuirass');
            const families = new Set<string>();
            object.traverse((child) => {
              if (child instanceof T.Mesh)
                for (const material of Array.isArray(child.material)
                  ? child.material
                  : [child.material])
                  families.add(material.name);
            });
            expect(families.has('shinobi_cloth')).toBe(true);
            expect(families.has('shinobi_lacquer')).toBe(true);
            expect(families.has('crimson_cloth')).toBe(false);
          }
          if (asset.kind === 'character')
            expect([
              'sword',
              'twins',
              'spear',
              'great',
              'shinobi',
              'bow',
              'bell',
              'claw',
            ]).toContain(object.userData.weapon);
          const box = new T.Box3().setFromObject(object);
          expect(
            [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(
              Number.isFinite,
            ),
          ).toBe(true);
          expect(box.max.y - box.min.y, id).toBeGreaterThan(0.1);
          if (!id.endsWith('_deep_support'))
            expect(box.max.y - box.min.y, id).toBeLessThan(id === 'fungal_landmark' ? 12 : 8);
        }
      }
      let darkestVertex = 1;
      gltf.scene.traverse((obj) => {
        if (obj instanceof T.Mesh) {
          expect(obj.geometry.getAttribute('uv'), obj.name).toBeDefined();
          expect(obj.geometry.getAttribute('color'), obj.name).toBeDefined();
          const color = obj.geometry.getAttribute('color');
          for (let i = 0; i < color.count; i++)
            darkestVertex = Math.min(darkestVertex, color.getX(i));
        }
        if (obj instanceof T.Mesh)
          for (const material of Array.isArray(obj.material) ? obj.material : [obj.material])
            expect(manifest.materials[material.name]).toBeDefined();
      });
      expect(darkestVertex, 'baked vertex AO must survive as COLOR_0').toBeLessThan(0.95);
    }
    const batches = manager.instanceBatches('ruins_arch_a', 0, [new T.Matrix4()]);
    expect(batches.length).toBeGreaterThan(1);
    for (const id of Object.entries(manifest.assets)
      .filter(([, asset]) => asset.kind === 'character')
      .map(([id]) => id))
      for (const level of [0, 1, 2]) {
        const actor = new ImportedActor(manager, id, level);
        actor.setOutline(1);
        for (const arm of [-2.9, -1.6, -0.45, 0.4]) {
          actor.animate(
            sampleClip(
              {
                name: 'check',
                keys: [
                  {
                    at: 0,
                    pose: {
                      rightArm: [arm, 0.3, 0.2],
                      rightForearm: [-0.8, 0, 0],
                      rightShin: [0.8, 0, 0],
                      torso: [0.6, 0, 0],
                      lift: 0.1,
                    },
                  },
                ],
              },
              0,
            ),
            0,
            id === 'lancer',
            id === 'saint' ? 2 : 1,
          );
          actor.root.updateMatrixWorld(true);
          if (['spear', 'great'].includes(actor.root.userData.weapon)) {
            const bones = new Map<string, T.Bone>();
            actor.root.traverse((obj) => {
              if (obj instanceof T.Bone) bones.set(obj.userData.name ?? obj.name, obj);
            });
            const fore = bones.get('leftForearm')!,
              shoulder = bones.get('leftArm')!;
            const grip = bones
              .get('blade')!
              .localToWorld(
                new T.Vector3(0, actor.root.userData.weapon === 'spear' ? 0.35 : 0.04, 0),
              );
            const hand = fore.localToWorld(new T.Vector3(0, -0.35, 0));
            const reach = fore.position.length() + 0.35;
            const unavoidable = Math.max(
              0,
              grip.distanceTo(shoulder.getWorldPosition(new T.Vector3())) - reach,
            );
            expect(hand.distanceTo(grip), `${id} support hand`).toBeLessThan(unavoidable + 0.04);
          }
          actor.root.traverse((obj) => {
            if (obj instanceof T.SkinnedMesh) {
              expect(obj.skeleton.bones.length).toBeGreaterThanOrEqual(15);
              obj.computeBoundingBox();
              expect(obj.boundingBox!.max.y).toBeLessThan(4);
              expect(obj.boundingBox!.min.y).toBeGreaterThan(-2);
            }
          });
        }
        actor.dispose();
      }
    batches.forEach((batch) => batch.dispose());
    manager.dispose();
  }, 15000);
  it('selects seeded variants and maps biome and combat silhouettes', () => {
    const variants = ['a', 'b', 'c'];
    expect(assetVariant('seed:room:tile', variants)).toBe(assetVariant('seed:room:tile', variants));
    expect(
      new Set(Array.from({ length: 40 }, (_, i) => assetVariant(`seed:${i}`, variants))).size,
    ).toBe(3);
    expect(packForBiome(0)).toBe('ruins');
    expect([0, 1, 2, 3, 4].map(packForBiome)).toEqual([
      'ruins',
      'shrine',
      'fungal',
      'frozen',
      'foundry',
    ]);
    expect(packForBiome(5)).toBeUndefined();
    expect(characterAsset('player-sword')).toBe('oathkeeper');
    expect(characterAsset('shield')).toBe('warden');
    expect(characterAsset('warden')).toBe('oathkeeper');
    expect(characterAsset('boss')).toBe('saint');
    expect(characterAsset('player-twins')).toBe('moth');
  });
  it('uses fallback without network in fallback mode and handles missing packs', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetch);
    const fallback = new AssetManager('fallback');
    expect(fallback.isBiomeSettled(0)).toBe(true);
    await fallback.preloadBiome(0);
    expect(fetch).not.toHaveBeenCalled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new AssetManager('imported');
    expect(manager.isBiomeSettled(0)).toBe(false);
    await manager.preloadBiome(0);
    expect(manager.isBiomeSettled(0)).toBe(true);
    expect(manager.isBiomeSettled(1)).toBe(false);
    expect(manager.has('ruins_arch_a')).toBe(false);
    expect(manager.instantiate('ruins_arch_a')).toBeUndefined();
    expect(manager.missing.has('ruins')).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    manager.dispose();
    fallback.dispose();
  });
});
