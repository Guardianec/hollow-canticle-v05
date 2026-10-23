import { readFileSync, statSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const root = new URL('../public/assets/v05/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
let triangles = 0;
for (const [pack, info] of Object.entries(manifest.packs)) {
  const buffer = readFileSync(new URL(info.file, root));
  assert.equal(buffer.toString('utf8', 0, 4), 'glTF', pack);
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  assert.equal(info.bytes, buffer.length, `${pack}: stale manifest byte count`);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)).trim());
  const names = new Set(json.nodes.map((n) => n.name));
  for (const [id, asset] of Object.entries(manifest.assets).filter(([, a]) => a.pack === pack)) {
    assert.equal(asset.lods.length, 3, id);
    for (const lod of asset.lods) {
      assert(names.has(lod.node), lod.node);
      assert(lod.triangles > 0 && lod.triangles < 40000, id);
    }
    if (asset.kind === 'character') assert(json.skins?.length, `${id}: missing skin`);
    triangles += asset.lods[0].triangles;
  }
  for (const material of json.materials) assert(manifest.materials[material.name], material.name);
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives) {
      assert(primitive.attributes.TEXCOORD_0 !== undefined, `${pack}: missing UVs`);
      assert(primitive.attributes.COLOR_0 !== undefined, `${pack}: missing baked occlusion`);
    }
  for (const accessor of json.accessors) {
    if (accessor.min) assert(accessor.min.every(Number.isFinite));
    if (accessor.max) assert(accessor.max.every(Number.isFinite));
  }
}
for (const material of Object.values(manifest.materials))
  for (const key of ['baseColor', 'normal', 'roughness', 'ao']) {
    const path = new URL(material[key], root);
    assert(existsSync(path));
    assert(statSync(path).size > 100);
    const metadata = await sharp(fileURLToPath(path)).metadata();
    assert.equal(metadata.width, material.resolution);
    assert.equal(metadata.height, material.resolution);
    if (key === 'baseColor' && material === manifest.materials.worn_iron) {
      const stats = await sharp(fileURLToPath(path)).stats();
      assert(stats.channels[0].mean > 60, 'Metal albedo was attenuated by diffuse baking');
    }
    const low = new URL(material.low[key], root);
    assert.equal((await sharp(fileURLToPath(low)).metadata()).width, 512);
  }
console.log(
  `Validated ${Object.keys(manifest.assets).length} assets, ${Object.keys(manifest.materials).length} PBR families, ${triangles} LOD0 triangles.`,
);
