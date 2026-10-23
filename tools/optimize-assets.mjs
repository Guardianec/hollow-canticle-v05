import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const output = resolve('public/assets/v05');
const source = resolve('.cache/bakes/v05');
const manifest = JSON.parse(readFileSync(resolve(output, 'manifest.json'), 'utf8'));
for (const family of Object.values(manifest.materials)) {
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
