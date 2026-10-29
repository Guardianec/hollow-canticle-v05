import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreatDirector } from '../src/game/threat';
import { ENEMIES, WEAPONS } from '../src/game/data';
import {
  attackClip,
  animateCharacter,
  JOINTS,
  sampleClip,
} from '../src/game/presentation/animation';
import { BODY_PROFILES } from '../src/game/presentation/profiles';
import { World } from '../src/game/world';
import { defaultSave } from '../src/game/save';
import { encounter } from '../src/game/dungeon';
import { Random } from '../src/game/random';
import * as T from 'three';
import { Actor } from '../src/game/presentation/actors';
import type { Materials } from '../src/game/presentation/materials';

beforeEach(() => {
  vi.stubGlobal('location', { search: '?debug' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
const tick = (w: World, t: number) => {
  for (let i = 0; i < t * 120; i++) w.update(1 / 120);
};
const arena = (enemy = 'warden') => {
  const w = new World(defaultSave());
  w.configureLab({
    enemy,
    support: 'same',
    count: 1,
    elite: 'none',
    depth: 1,
    biome: 0,
    pattern: -1,
  });
  return w;
};

describe('threat reservations', () => {
  it('allows concurrent tells but rejects impacts inside the defense recovery interval', () => {
    const d = new ThreatDirector(),
      slash = ENEMIES[0].patterns[0][0];
    expect(d.reserve(0, 0, slash, 1)).toBe(true);
    expect(d.reserve(1, 0.01, slash, 1)).toBe(false);
    expect(d.reserve(1, 0, { ...slash, windup: 1.3 }, 1)).toBe(true);
    expect(d.reserve(2, 0, { ...slash, windup: 2 }, 1)).toBe(false);
  });
  it('leaves an evade cooldown around specials in either order and retains past impact protection', () => {
    const d = new ThreatDirector(),
      slash = ENEMIES[0].patterns[0][0];
    d.reserve(0, 0, { ...slash, kind: 'sweep' }, 10);
    expect(d.reserve(1, 0, { ...slash, windup: 1.2 }, 10)).toBe(false);
    expect(d.reserve(1, 0, { ...slash, windup: 1.5 }, 10)).toBe(true);
    d.prune(0.8);
    expect(d.reserve(2, 0.8, { ...slash, windup: 0.1 }, 10)).toBe(false);
    d.clear();
    expect(d.reservations).toHaveLength(0);
  });
  it('bounds windup concurrency and impact spacing over varied depths and attack kinds', () => {
    for (const depth of [1, 5, 10000]) {
      const d = new ThreatDirector(),
        rng = new Random(`RESERVE-${depth}`);
      const strikes = ENEMIES.flatMap((e) => e.patterns.flat());
      for (let step = 0; step < 1200; step++) {
        const time = step / 60;
        d.reserve(step % 3, time, rng.pick(strikes), depth);
        for (let i = 0; i < d.reservations.length; i++)
          for (const b of d.reservations.slice(i + 1)) {
            const a = d.reservations[i];
            expect(Math.abs(a.at - b.at)).toBeGreaterThanOrEqual(
              a.special || b.special ? 0.72 : depth >= 5 ? 0.4 : 0.48,
            );
          }
      }
    }
  });
});

describe('animation sampling', () => {
  it('keeps the spear axis on target through the complete articulated hierarchy', () => {
    const shape = new T.BoxGeometry(1, 1, 1);
    const items = Object.fromEntries(
      ['bronze', 'iron', 'wood', 'trim', 'moss'].map((name) => [
        name,
        new T.MeshStandardMaterial(),
      ]),
    );
    const materials = {
      weave: new T.Texture(),
      glow: new T.Texture(),
      items,
      sphere: shape,
      box: shape,
      rounded: shape,
      cylinder: shape,
      cone: shape,
      mushroom: shape,
    } as unknown as Materials;
    const w = arena('spear'),
      actor = new Actor(materials, 'spear', false);
    for (const facing of [0, Math.PI / 2, Math.PI]) {
      w.enemies[0].facing = facing;
      actor.animate(w.enemies[0], w.time, w.visualTime, false, 1, 'spear', {
        clip: 'thrust',
        clipTime: 0.58,
        freeze: true,
      });
      actor.root.updateMatrixWorld(true);
      const axis = new T.Vector3(0, 1, 0).transformDirection(actor.blade.matrixWorld);
      expect(
        axis.dot(new T.Vector3(Math.cos(facing), 0.03, Math.sin(facing)).normalize()),
      ).toBeCloseTo(1, 5);
    }
    actor.dispose();
    shape.dispose();
    Object.values(items).forEach((m) => m.dispose());
  });
  it('samples finite, deterministic joint tracks across every archetype and semantic attack', () => {
    for (const def of ENEMIES)
      for (const kind of ['slash', 'thrust', 'sweep', 'smash', 'grab', 'feint'] as const) {
        const clip = attackClip(def.id, kind, 0);
        for (const t of [0, 0.2, 0.52, 0.58, 0.8, 1]) {
          const pose = sampleClip(clip, t);
          expect(pose).toEqual(sampleClip(clip, t));
          expect(JOINTS.flatMap((j) => pose[j]).every(Number.isFinite)).toBe(true);
        }
        expect(clip.hitWindow?.[0]).toBe(kind === 'feint' ? undefined : 0.58);
      }
  });
  it('distinguishes thrust, slash, returning cut, and boss phase two motion', () => {
    const sample = (id: string, kind: 'slash' | 'thrust', variant = 0, phase = 1) =>
      sampleClip(attackClip(id, kind, variant, phase), 0.58);
    expect(sample('spear', 'thrust')).not.toEqual(sample('spear', 'slash'));
    expect(sample('warden', 'slash', 0)).not.toEqual(sample('warden', 'slash', 1));
    expect(sample('boss', 'slash', 0, 1)).not.toEqual(sample('boss', 'slash', 0, 2));
    const bodies = new Set(
      Object.values(BODY_PROFILES).map((p) => JSON.stringify([p.chest, p.arms, p.legs, p.lean])),
    );
    expect(bodies.size).toBe(Object.keys(BODY_PROFILES).length);
  });
  it('aligns enemy contact with simulation activation and player contact with weapon startup', () => {
    const w = arena('spear'),
      e = w.enemies[0];
    e.state = 'tell';
    e.stateAt = 1;
    const endTell = animateCharacter('spear', e, 1 + e.strike.windup, false, 'spear', true);
    e.state = 'active';
    e.stateAt = 1 + e.strike.windup;
    const startActive = animateCharacter('spear', e, e.stateAt, false, 'spear', true);
    expect(endTell.pose).toEqual(startActive.pose);
    for (const weapon of WEAPONS) {
      Object.assign(w.player, {
        state: 'attack',
        stateAt: 1,
        attackStartup: weapon.startup,
        attackRecovery: weapon.recovery,
      });
      const frame = animateCharacter(
        'player',
        w.player,
        1 + weapon.startup,
        false,
        weapon.id,
        true,
      );
      expect(frame.normalized).toBeCloseTo(0.58);
    }
  });
});

describe('combat behavior', () => {
  it('penalizes empty parries, then restores the guard window after discipline', () => {
    const w = arena();
    w.enemies[0].readyAt = 999;
    for (let i = 0; i < 3; i++) {
      w.input('parry');
      tick(w, 0.5);
    }
    expect(w.player.emptyParries).toBe(3);
    expect(w.player.posture).toBeGreaterThan(0);
    tick(w, 2);
    expect(w.player.emptyParries).toBe(0);
    expect(w.weapon.parry).toBe(0.22);
  });
  it('uses a warned realm hazard in boss phase two without changing phase-one health', () => {
    const w = arena('boss'),
      e = w.enemies[0];
    e.hp = e.maxHp * 0.47;
    tick(w, 0.02);
    expect(e.phase).toBe(2);
    expect(e.def.phaseTwo?.flat().some((s) => s.area)).toBe(true);
    w.invincible = true;
    tick(w, 5);
    expect(w.areas.active.length).toBeGreaterThan(0);
    expect(w.areas.active[0].armAt).toBeGreaterThan(w.areas.active[0].createdAt);
    w.invincible = false;
    w.player.immunity = 0;
    const hp = w.player.hp;
    w.player.x = 350;
    w.player.y = 400;
    tick(w, 1.2);
    expect(w.player.hp).toBe(hp);
    expect(w.echoes).toHaveLength(0);
    const hit = arena('boss');
    hit.invincible = true;
    hit.enemies[0].hp = hit.enemies[0].maxHp * 0.47;
    tick(hit, 5);
    expect(hit.areas.active.length).toBeGreaterThan(0);
    const area = hit.areas.active[0];
    Object.assign(hit.player, { x: area.x, y: area.y, immunity: 0 });
    hit.invincible = false;
    hit.enemies[0].state = 'idle';
    hit.enemies[0].readyAt = 999;
    hit.time = area.armAt;
    hit.stepAreas();
    expect(hit.stats.damage).toBe(area.damage);
  });
  it('selects delayed mixups between actions and keeps a committed strike immutable', () => {
    const w = arena('duelist'),
      e = w.enemies[0];
    w.player.emptyParries = 2;
    w.player.parryAt = w.time;
    e.readyAt = 0;
    tick(w, 0.02);
    expect(e.strike.windup).toBe(1.45);
    const committed = { ...e.strike };
    w.player.emptyParries = 0;
    tick(w, 0.1);
    expect(e.strike).toEqual(committed);
  });
  it('resets lab reservations and creates authored pairs without changing saved progression', () => {
    const w = arena();
    const save = structuredClone(w.save);
    w.threats.reserve(20, w.time, w.enemies[0].strike, 1);
    w.configureLab({
      enemy: 'shield',
      support: 'spear',
      count: 2,
      elite: 'Patient',
      depth: 8,
      biome: 3,
      pattern: 2,
    });
    expect(w.threats.reservations).toHaveLength(0);
    expect(w.enemies.map((e) => e.def.id)).toEqual(['shield', 'spear']);
    expect(w.save).toEqual(save);
    w.stats.kills = 10;
    w.settleRun();
    expect(w.save).toEqual(save);
    const compositions = new Set(
      Array.from({ length: 100 }, (_, i) =>
        encounter(new Random(`PAIR-${i}`), 'combat', 9, 4, 5).join('+'),
      ),
    );
    expect(compositions.has('brute+assassin')).toBe(true);
  });
});
