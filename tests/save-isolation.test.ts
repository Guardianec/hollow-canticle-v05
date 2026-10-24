import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultSave,
  loadSave,
  persist,
  recordRun,
  SAVE_KEY,
  RUN_HISTORY_KEY,
} from '../src/game/save';
import { World } from '../src/game/world';

afterEach(() => vi.unstubAllGlobals());

describe('separate alpha and v0.5 saves on the same Pages origin', () => {
  function storage() {
    const alpha = JSON.stringify({ ...defaultSave(), runs: 12, embers: 90, unlocks: ['spear'] });
    const alphaRuns = '[{"seed":"ALPHA"}]';
    const values = new Map([
      ['hollow-canticle:v1', alpha],
      ['hollow-canticle:local-runs:v1', alphaRuns],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('location', { search: '' });
    return { values, alpha, alphaRuns };
  }
  it('copies existing progress once and keeps subsequent progress independent', () => {
    const { values, alpha, alphaRuns } = storage();
    const save = loadSave();
    expect(save.runs).toBe(12);
    expect(save.characters).toContain('spear');
    expect(values.has(SAVE_KEY)).toBe(true);
    values.set('hollow-canticle:v1', JSON.stringify({ ...defaultSave(), runs: 99 }));
    expect(loadSave().runs).toBe(12);
    values.set('hollow-canticle:v1', alpha);
    save.runs = 13;
    persist(save);
    recordRun('V05', 'sword', 2, new World(save).stats);
    expect(loadSave().runs).toBe(13);
    expect(JSON.parse(values.get(RUN_HISTORY_KEY)!)).toHaveLength(1);
    expect(values.get('hollow-canticle:v1')).toBe(alpha);
    expect(values.get('hollow-canticle:local-runs:v1')).toBe(alphaRuns);
  });
  it('keeps a v0.5 reset after reload without reimporting the alpha', () => {
    const { values, alpha, alphaRuns } = storage();
    loadSave();
    persist(defaultSave());
    localStorage.removeItem(RUN_HISTORY_KEY);
    expect(loadSave().runs).toBe(0);
    expect(values.get('hollow-canticle:v1')).toBe(alpha);
    expect(values.get('hollow-canticle:local-runs:v1')).toBe(alphaRuns);
  });
  it('continues in memory if browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw Error('Storage disabled');
      },
      setItem: () => {
        throw Error('Storage disabled');
      },
    });
    expect(loadSave()).toEqual(defaultSave());
    expect(persist(defaultSave())).toBe(false);
  });
});
