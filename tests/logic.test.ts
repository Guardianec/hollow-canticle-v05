import { describe, expect, it } from 'vitest';
import { Random, normalizeSeed, recentWeight } from '../src/game/random';
import { makeFloor, reachable, obstaclesFor, doorPosition } from '../src/game/dungeon';
import { BALANCE, ENEMIES, RELICS, WEAPONS } from '../src/game/data';
import { InputBuffer, finisherStyle, posturePressure, resolveDefense } from '../src/game/combat';
import { defaultSave, parseSave } from '../src/game/save';

describe('seeded content', () => {
  it('replays a seed and separates different streams', () => {
    const a = new Random('ASH'),
      b = new Random('ASH'),
      c = new Random('MOTH');
    const seq = (r: Random) => Array.from({ length: 100 }, () => r.next());
    const values = seq(a);
    expect(values).toEqual(seq(b));
    expect(values).not.toEqual(seq(c));
    expect(values.every((n) => n >= 0 && n < 1)).toBe(true);
  });
  it('validates seeds and weights recent choices down', () => {
    expect(normalizeSeed(' <script>ASH</script> ')).toBe('scriptASHscript');
    expect(normalizeSeed('  ')).toBe('CANDLE-001');
    expect(normalizeSeed('a'.repeat(100)).length).toBe(40);
    expect(recentWeight('nave', ['nave'])).toBeLessThan(recentWeight('nave', []));
    expect(() => new Random('a').pick([])).toThrow();
  });
  it('shuffles without destroying the source and respects zero weights', () => {
    const original = [1, 2, 3, 4],
      random = new Random('shuffle');
    expect(random.shuffle(original).sort()).toEqual(original);
    for (let i = 0; i < 100; i++)
      expect(random.weighted(['a', 'b'], (x) => (x === 'a' ? 0 : 1))).toBe('b');
  });
  it('reproduces topology, encounters, decorations, and mutations', () => {
    for (const depth of [1, 3, 6, 100, 10000]) {
      expect(makeFloor('THE-CHOIR', depth)).toEqual(makeFloor('THE-CHOIR', depth));
    }
    expect(makeFloor('A', 1)).not.toEqual(makeFloor('B', 1));
    expect(makeFloor('A', 6).hybrid).not.toBeNull();
  });
  it('stress-tests 10,000 floors: connectivity, route fairness, budgets, biome rules, clear doors', () => {
    for (let i = 0; i < 10000; i++) {
      const floor = makeFloor(`STRESS-${i}`, 1 + (i % 10000));
      expect(reachable(floor).size).toBe(floor.rooms.length);
      expect(floor.rooms.length).toBeGreaterThanOrEqual(14);
      expect(floor.rooms.length).toBeLessThanOrEqual(19);
      expect(floor.rooms.reduce((n, r) => n + r.links.length, 0) / 2).toBeGreaterThanOrEqual(
        floor.rooms.length,
      );
      expect(floor.rooms.find((r) => r.kind === 'exit')!.id).toBeGreaterThan(
        floor.rooms.find((r) => r.kind === 'boss')!.id,
      );
      expect(floor.rooms[1].kind).toBe('combat');
      expect(floor.rooms.some((r) => r.kind === 'healing')).toBe(true);
      expect(floor.rooms.some((r) => r.kind === 'treasure')).toBe(true);
      expect(floor.rooms[0].enemies).toHaveLength(0);
      for (const room of floor.rooms) {
        expect(room.links.length).toBeGreaterThan(0);
        for (const id of room.links) {
          expect(floor.rooms[id].links).toContain(room.id);
          expect(Math.abs(room.x - floor.rooms[id].x) + Math.abs(room.y - floor.rooms[id].y)).toBe(
            1,
          );
          const door = doorPosition(room, floor.rooms[id]);
          for (const o of i < 250 ? obstaclesFor(room, floor.biome) : [])
            expect(Math.hypot(door.x - o.x, door.y - o.y)).toBeGreaterThan(o.radius + 50);
        }
        const enemies = room.enemies.map((id) => ENEMIES.find((e) => e.id === id)!);
        expect(enemies.length).toBeLessThanOrEqual(2);
        expect(enemies.reduce((sum, e) => sum + e.cost, 0)).toBeLessThanOrEqual(room.budget);
        for (const e of enemies) expect(e.affinity).toContain(floor.biome);
        if (enemies.length === 2) expect(enemies.some((e) => e.speed < 110)).toBe(true);
      }
    }
  }, 30000);
});

describe('combat rules', () => {
  const base = {
    strike: ENEMIES[0].patterns[0][0],
    distance: 75,
    parryAge: 9,
    dodgeAge: 9,
    weapon: WEAPONS[0],
    assist: false,
    bonusWindow: 0,
  };
  it('distinguishes perfect, normal, early, late and missed defense', () => {
    expect(resolveDefense({ ...base, parryAge: 0.05 })).toBe('perfect');
    expect(resolveDefense({ ...base, parryAge: 0.18 })).toBe('parry');
    expect(resolveDefense({ ...base, parryAge: -0.01 })).toBe('hit');
    expect(resolveDefense({ ...base, parryAge: 0.4 })).toBe('hit');
    expect(resolveDefense({ ...base, distance: 200 })).toBe('miss');
  });
  it('rejects parries for grabs, sweeps and ordinary heavy smash defenses', () => {
    for (const kind of ['grab', 'sweep', 'smash'] as const) {
      expect(resolveDefense({ ...base, strike: { ...base.strike, kind }, parryAge: 0.01 })).toBe(
        'hit',
      );
      expect(resolveDefense({ ...base, strike: { ...base.strike, kind }, dodgeAge: 0.1 })).toBe(
        'dodge',
      );
    }
    expect(
      resolveDefense({
        ...base,
        strike: { ...base.strike, kind: 'smash' },
        weapon: WEAPONS[3],
        parryAge: 0.04,
      }),
    ).toBe('perfect');
  });
  it('caps dodge immunity and respects accessibility and weapon identities', () => {
    expect(resolveDefense({ ...base, dodgeAge: BALANCE.dodgeInvulnerable + 0.01 })).toBe('hit');
    expect(resolveDefense({ ...base, parryAge: 0.3, assist: true })).toBe('parry');
    expect(resolveDefense({ ...base, parryAge: 0.3, bonusWindow: 0.12 })).toBe('parry');
    expect(resolveDefense({ ...base, parryAge: 0.21, weapon: WEAPONS[1] })).toBe('hit');
    expect(posturePressure(10, 70, true, true)).toBeGreaterThan(posturePressure(10, 70, true));
  });
  it('buffers near-recovery inputs and discards old inputs', () => {
    const buffer = new InputBuffer();
    buffer.push('attack', 1);
    expect(buffer.consume(1.05, () => false)).toBeUndefined();
    expect(buffer.consume(1.1, () => true)).toBe('attack');
    buffer.push('parry', 2);
    expect(buffer.consume(2.2, () => true)).toBeUndefined();
    buffer.push('dodge', 3);
    buffer.clear();
    expect(buffer.consume(3, () => true)).toBeUndefined();
  });
  it('chooses distinct finishers', () => {
    expect(finisherStyle('great', 'warden', false)).not.toBe(
      finisherStyle('twins', 'warden', false),
    );
    expect(finisherStyle('sword', 'shield', false)).toBe('AEGIS SHATTERED');
    expect(finisherStyle('sword', 'boss', true)).toBe('THE LAST TOLL');
  });
});

describe('persistence and content validation', () => {
  it('handles malformed, obsolete, and partially corrupted saves', () => {
    expect(parseSave('not json')).toEqual(defaultSave());
    expect(parseSave('{"version":2}')).toEqual(defaultSave());
    expect(
      parseSave(
        '{"version":1,"settings":{"master":8,"assist":"true"},"embers":-10,"unlocks":["spear","injected"],"weapons":["great"]}',
      ),
    ).toMatchObject({
      version: 2,
      embers: 0,
      settings: { master: 1, assist: false },
      unlocks: ['spear'],
      weapons: ['sword', 'great'],
    });
  });
  it('round-trips a valid save', () => {
    const save = defaultSave();
    save.relics = ['echo', 'ghost'];
    save.embers = 8;
    save.tutorial = true;
    expect(parseSave(JSON.stringify(save))).toEqual(save);
  });
  it('has unique content IDs, five distinct weapons, and twenty-two relic hooks', () => {
    expect(new Set(ENEMIES.map((e) => e.id)).size).toBe(11);
    expect(new Set(RELICS.map((e) => e.id)).size).toBe(22);
    expect(new Set(WEAPONS.map((e) => e.reach)).size).toBe(5);
    for (const e of ENEMIES) {
      expect(e.patterns.length).toBeGreaterThan(0);
      for (const pattern of e.patterns)
        for (const strike of pattern) expect(strike.windup).toBeGreaterThanOrEqual(0.4);
    }
  });
});
