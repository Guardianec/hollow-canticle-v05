import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const candidates = [
  process.env.BLENDER,
  'blender',
  '.cache/tools/blender-4.5.15-windows-x64/blender.exe',
];
const blender = candidates.find(
  (p) => p && (existsSync(p) || spawnSync(p, ['--version']).status === 0),
);
if (!blender)
  throw new Error('Blender is required. Put blender on PATH or set BLENDER to its executable.');
const result = spawnSync(
  blender,
  [
    '--background',
    '--factory-startup',
    '--python',
    resolve('tools/blender/build.py'),
    '--',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const optimization = spawnSync(
  process.execPath,
  ['tools/optimize-assets.mjs', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
  },
);
if (optimization.status !== 0) process.exit(optimization.status ?? 1);
const validation = spawnSync(process.execPath, ['tools/validate-assets.mjs'], { stdio: 'inherit' });
process.exit(validation.status ?? 1);
