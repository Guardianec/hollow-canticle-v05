import { WEAPONS, RELICS } from './data';
import type { RunStats } from './world';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  shake: boolean;
  flashes: boolean;
  assist: boolean;
  reducedMotion: boolean;
  quality: boolean;
  detail: 'high' | 'medium' | 'low';
  strongOutline: boolean;
}
export interface Save {
  version: 2;
  settings: Settings;
  tutorial: boolean;
  runs: number;
  bestDepth: number;
  kills: number;
  embers: number;
  weapons: string[];
  relics: string[];
  unlocks: string[];
  characters: string[];
  arsenalTutorial: boolean;
}
export const SAVE_KEY = 'hollow-canticle:v1';
export const RUN_HISTORY_KEY = 'hollow-canticle:local-runs:v1';
export function recordRun(
  seed: string,
  character: string,
  depth: number,
  stats: RunStats,
): boolean {
  try {
    const raw = localStorage.getItem(RUN_HISTORY_KEY);
    let history: unknown = [];
    try {
      history = raw && raw.length < 100000 ? JSON.parse(raw) : [];
    } catch {
      /* Recover a damaged local history. */
    }
    const recent = Array.isArray(history) ? history.slice(-9) : [];
    localStorage.setItem(
      RUN_HISTORY_KEY,
      JSON.stringify([...recent, { seed, character, depth, stats }]),
    );
    return true;
  } catch {
    return false;
  }
}
export const defaultSave = (): Save => ({
  version: 2,
  settings: {
    master: 0.65,
    music: 0.4,
    sfx: 0.8,
    shake: true,
    flashes: true,
    assist: false,
    reducedMotion:
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    quality: true,
    detail: 'high',
    strongOutline: false,
  },
  tutorial: false,
  runs: 0,
  bestDepth: 0,
  kills: 0,
  embers: 0,
  weapons: ['sword'],
  relics: [],
  unlocks: [],
  characters: ['sword'],
  arsenalTutorial: false,
});

export function parseSave(raw: string | null): Save {
  const fallback = defaultSave();
  try {
    const parsed: unknown = JSON.parse(raw || 'null');
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('version' in parsed) ||
      (parsed.version !== 1 && parsed.version !== 2)
    )
      return fallback;
    const source = parsed as Record<string, unknown>;
    const settings =
      source.settings && typeof source.settings === 'object'
        ? (source.settings as Record<string, unknown>)
        : {};
    for (const key of ['master', 'music', 'sfx'] as const) {
      const v = settings[key];
      if (typeof v === 'number' && Number.isFinite(v))
        fallback.settings[key] = Math.max(0, Math.min(1, v));
    }
    for (const key of [
      'shake',
      'flashes',
      'assist',
      'reducedMotion',
      'quality',
      'strongOutline',
    ] as const)
      if (typeof settings[key] === 'boolean') fallback.settings[key] = settings[key];
    fallback.settings.detail =
      settings.detail === 'high' || settings.detail === 'medium' || settings.detail === 'low'
        ? settings.detail
        : fallback.settings.quality
          ? 'high'
          : 'low';
    fallback.settings.quality = fallback.settings.detail !== 'low';
    for (const key of ['runs', 'bestDepth', 'kills', 'embers'] as const) {
      const v = source[key];
      if (typeof v === 'number' && Number.isFinite(v)) fallback[key] = Math.max(0, Math.floor(v));
    }
    fallback.tutorial = source.tutorial === true;
    fallback.weapons = [
      'sword',
      ...WEAPONS.filter(
        (w) => w.id !== 'sword' && Array.isArray(source.weapons) && source.weapons.includes(w.id),
      ).map((w) => w.id),
    ];
    fallback.relics = RELICS.filter(
      (r) => Array.isArray(source.relics) && source.relics.includes(r.id),
    ).map((r) => r.id);
    fallback.unlocks = ['twins', 'spear', 'great'].filter(
      (id) => Array.isArray(source.unlocks) && source.unlocks.includes(id),
    );
    fallback.characters = [
      'sword',
      ...['twins', 'spear', 'great'].filter(
        (id) =>
          fallback.unlocks.includes(id) ||
          fallback.weapons.includes(id) ||
          (Array.isArray(source.characters) && source.characters.includes(id)),
      ),
    ];
    fallback.arsenalTutorial = source.arsenalTutorial === true;
    return fallback;
  } catch {
    return fallback;
  }
}

export function loadSave(): Save {
  try {
    return parseSave(localStorage.getItem(SAVE_KEY));
  } catch {
    return defaultSave();
  }
}
export function persist(save: Save): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
