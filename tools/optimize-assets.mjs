import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
const output = resolve('public/assets/v05');
const source = resolve('.cache/bakes/v05');
const manifest = JSON.parse(readFileSync(resolve(output, 'manifest.json'), 'utf8'));
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const charactersOnly = process.argv.includes('--characters-only');
for (const pack of charactersOnly ? [manifest.packs.pilgrims] : Object.values(manifest.packs)) {
  const file = resolve(output, pack.file);
  const document = await io.read(file);
  await document.transform(
    dedup(),
    prune({ keepAttributes: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const temporary = file + '.optimized.tmp';
  writeFileSync(temporary, await io.writeBinary(document));
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(temporary, file);
      break;
    } catch (error) {
      if (attempt === 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  pack.bytes = statSync(file).size;
}
const characterMaterials = new Set(manifest.packs.pilgrims.materials);
for (const [, family] of Object.entries(manifest.materials).filter(
  ([name, family]) => !charactersOnly || !family.low || characterMaterials.has(name),
)) {
  family.low = {};
  for (const kind of ['baseColor', 'normal', 'roughness', 'ao']) {
    const file = family[kind].replace(/\.webp$/, '.png');
    for (const size of [1024, 512]) {
      const name = file.replace('.png', size === 1024 ? '.webp' : '_512.webp');
      await sharp(resolve(source, file))
        .resize(size, size)
        .webp({ quality: kind === 'normal' ? 98 : kind === 'baseColor' ? 85 : 94 })
        .toFile(resolve(output, name));
      if (size === 1024) family[kind] = name;
      else family.low[kind] = name;
    }
  }
}
manifest.downloadBytes =
  Object.values(manifest.packs).reduce((n, p) => n + p.bytes, 0) +
  Object.values(manifest.materials).reduce(
    (n, m) =>
      n +
      ['baseColor', 'normal', 'roughness', 'ao'].reduce(
        (sum, key) => sum + statSync(resolve(output, m[key])).size,
        0,
      ),
    0,
  );
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Runtime GLBs + 1024 PBR maps: ${(manifest.downloadBytes / 1024 / 1024).toFixed(2)} MiB.`,
);
