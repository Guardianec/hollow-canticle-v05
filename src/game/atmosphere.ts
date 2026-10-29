import type { GraphicsLevel } from './graphics';
export const ATMOSPHERES = [
  {
    name: 'Ash through unseen fractures',
    color: '#c9c3ac',
    shaft: '#b6d7ef',
    fall: 0.23,
    wind: 0.8,
    size: 2.1,
    fog: 0.06,
    audio: 'dust',
  },
  {
    name: 'Rain beneath the drowned vault',
    color: '#9bd6dc',
    shaft: '#b5f0ef',
    fall: 3.8,
    wind: 0.25,
    size: 2.7,
    fog: 0.12,
    audio: 'leaks',
  },
  {
    name: 'The living sporefall',
    color: '#92cdb0',
    shaft: '#a693c5',
    fall: 0.12,
    wind: 0.35,
    size: 3.1,
    fog: 0.15,
    audio: 'spores',
  },
  {
    name: 'Breath of the white cloister',
    color: '#d9efff',
    shaft: '#e0f2ff',
    fall: 0.7,
    wind: 1.55,
    size: 3.1,
    fog: 0.11,
    audio: 'ice',
  },
  {
    name: 'The furnace exhales',
    color: '#f39b55',
    shaft: '#edbb83',
    fall: -0.65,
    wind: 0.65,
    size: 2.3,
    fog: 0.14,
    audio: 'furnace',
  },
] as const;
export const WEATHER_QUALITY: Record<
  GraphicsLevel,
  { particles: number; layers: number; distance: number; shafts: number }
> = {
  'very-low': { particles: 18, layers: 1, distance: 13, shafts: 1 },
  low: { particles: 64, layers: 1, distance: 17, shafts: 1 },
  medium: { particles: 180, layers: 2, distance: 23, shafts: 2 },
  high: { particles: 520, layers: 3, distance: 30, shafts: 3 },
  extreme: { particles: 1380, layers: 5, distance: 45, shafts: 5 },
};
export const PARTICLE_BUDGETS = {
  'very-low': { critical: 64, decorative: 64, weather: 18, ambient: 8, boss: 32 },
  low: { critical: 64, decorative: 110, weather: 64, ambient: 16, boss: 48 },
  medium: { critical: 64, decorative: 180, weather: 180, ambient: 28, boss: 72 },
  high: { critical: 64, decorative: 300, weather: 520, ambient: 48, boss: 100 },
  extreme: { critical: 64, decorative: 480, weather: 1380, ambient: 96, boss: 160 },
} as const;
export function weatherIntensity(time: number, biome: number): number {
  const swell = Math.pow(Math.max(0, Math.sin(time * 0.031 + biome * 1.9)), 12);
  return 0.5 + 0.18 * Math.sin(time * 0.017 + biome) + swell * 0.65;
}
export function weatherBudget(
  level: GraphicsLevel,
  intensity: number,
  critical: number,
  duel = false,
): number {
  return Math.max(
    4,
    Math.round(
      WEATHER_QUALITY[level].particles *
        Math.min(1.25, Math.max(0, intensity)) *
        Math.max(0.18, 1 - critical * 0.16) *
        (duel ? 0.3 : 1),
    ),
  );
}
