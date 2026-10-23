import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  AssetManager,
  assetVariant,
  packForBiome,
  characterAsset,
  type AssetManifest,
} from '../src/game/presentation/assets';
import { ImportedActor } from '../src/game/presentation/imported-actor';
import { sampleClip } from '../src/game/presentation/animation';

const root = new URL('../public/assets/v05/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as AssetManifest;
afterEach(() => vi.unstubAllGlobals());

describe('Blender runtime contract', () => {
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
      const gltf = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      );
      for (const [id, asset] of Object.entries(manifest.assets)) {
        if (manifest.packs[asset.pack] !== pack) continue;
        for (const lod of asset.lods) {
          const object = gltf.scene.getObjectByName(lod.node)!;
          expect(object, id).toBeDefined();
          manager.templates.set(lod.node, object);
          const box = new T.Box3().setFromObject(object);
          expect(
            [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(
              Number.isFinite,
            ),
          ).toBe(true);
          expect(box.max.y - box.min.y, id).toBeGreaterThan(0.1);
          if (id !== 'ruins_deep_support') expect(box.max.y - box.min.y, id).toBeLessThan(8);
        }
      }
      gltf.scene.traverse((obj) => {
        if (obj instanceof T.Mesh)
          for (const material of Array.isArray(obj.material) ? obj.material : [obj.material])
            expect(manifest.materials[material.name]).toBeDefined();
      });
    }
    const batches = manager.instanceBatches('ruins_arch_a', 0, [new T.Matrix4()]);
    expect(batches.length).toBeGreaterThan(1);
    for (const id of ['oathkeeper', 'warden']) {
      const actor = new ImportedActor(manager, id, 0);
      actor.setOutline(1);
      actor.animate(
        sampleClip(
          {
            name: 'check',
            keys: [
              {
                at: 0,
                pose: { rightArm: [-1.6, 0.3, 0.2], rightForearm: [-0.8, 0, 0], lift: 0.1 },
              },
            ],
          },
          0,
        ),
        0,
      );
      actor.root.updateMatrixWorld(true);
      actor.root.traverse((obj) => {
        if (obj instanceof T.SkinnedMesh) {
          expect(obj.skeleton.bones.length).toBeGreaterThanOrEqual(15);
          obj.computeBoundingBox();
          expect(obj.boundingBox!.max.y).toBeLessThan(4);
          expect(obj.boundingBox!.min.y).toBeGreaterThan(-2);
        }
      });
      actor.dispose();
    }
    batches.forEach((batch) => batch.dispose());
    manager.dispose();
  });
  it('selects variants deterministically and leaves unbuilt biomes on fallback', () => {
    const variants = ['a', 'b', 'c'];
    expect(assetVariant('seed:room:tile', variants)).toBe(assetVariant('seed:room:tile', variants));
    expect(
      new Set(Array.from({ length: 40 }, (_, i) => assetVariant(`seed:${i}`, variants))).size,
    ).toBe(3);
    expect(packForBiome(0)).toBe('ruins');
    for (const biome of [1, 2, 3, 4]) expect(packForBiome(biome)).toBeUndefined();
    expect(characterAsset('player-sword')).toBe('oathkeeper');
    expect(characterAsset('shield')).toBe('warden');
    expect(characterAsset('boss')).toBeUndefined();
  });
  it('uses fallback without network in fallback mode and handles missing packs', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetch);
    const fallback = new AssetManager('fallback');
    await fallback.preloadBiome(0);
    expect(fetch).not.toHaveBeenCalled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new AssetManager('imported');
    await manager.preloadBiome(0);
    expect(manager.has('ruins_arch_a')).toBe(false);
    expect(manager.instantiate('ruins_arch_a')).toBeUndefined();
    expect(manager.missing.has('ruins')).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    manager.dispose();
    fallback.dispose();
  });
});
