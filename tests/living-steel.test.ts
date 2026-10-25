import { beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { defaultSave, parseSave } from '../src/game/save';
import { GRAPHICS, GRAPHICS_LEVELS, graphicsLevel } from '../src/game/graphics';
import { CHARACTERS } from '../src/game/characters';
import { makeFloor, doorPosition } from '../src/game/dungeon';
import { canStand, geometryFor, inDoorway, pathBetween } from '../src/game/geometry';
import { moveBody } from '../shared/movement';
import { RIPOSTE, riposteTravel } from '../src/game/riposte';
import { trainingStages } from '../src/game/training';
import { AnimationStateMachine } from '../src/game/presentation/animation-state';
import { Session } from '../shared/session';
import { Input, PlayerState } from '../shared/protocol';

beforeEach(() => {
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
function tick(w: World, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) {
    w.hitStop = 0;
    w.update(1 / 120);
  }
}
function encounter(character = 'shinobi') {
  const w = new World(defaultSave());
  w.start('LIVING-STEEL', character, true);
  w.training = false;
  w.laboratory = true;
  w.time = 3;
  w.player.immunity = 0;
  w.player.x = 460;
  w.player.y = 380;
  const e = w.enemies[0];
  Object.assign(e, {
    x: 650,
    y: 380,
    hp: 7,
    maxHp: 100,
    maxPosture: 500,
    readyAt: Infinity,
    facing: Math.PI,
  });
  return w;
}
describe('Living Steel graphics and migration', () => {
  it.each(GRAPHICS_LEVELS)('round-trips %s and preserves the Chronicle', (level) => {
    const save = defaultSave();
    save.settings.detail = level;
    save.characters.push('shinobi');
    save.unlocks.push('shinobi');
    save.embers = 83;
    save.bestDepth = 12;
    save.tutorialPrompted = true;
    const migrated = parseSave(JSON.stringify(save));
    expect(migrated.characters).toContain('shinobi');
    expect(migrated.settings.detail).toBe(level);
    expect(migrated.embers).toBe(83);
    expect(migrated.bestDepth).toBe(12);
    expect(migrated.tutorialPrompted).toBe(true);
  });
  it('rejects unknown profiles and has materially different Very Low and Extreme budgets', () => {
    expect(graphicsLevel('__proto__')).toBe('high');
    expect(graphicsLevel(null, false)).toBe('low');
    expect(GRAPHICS['very-low'].shadowSize).toBe(0);
    expect(GRAPHICS['very-low'].background).toBe(false);
    expect(GRAPHICS.extreme.shadowSize).toBeGreaterThan(GRAPHICS.high.shadowSize);
    expect(GRAPHICS.extreme.particles).toBeGreaterThan(GRAPHICS.high.particles);
    expect(GRAPHICS.extreme.lod[0]).toBeGreaterThan(GRAPHICS.high.lod[0]);
    expect(
      parseSave(
        JSON.stringify({
          version: 2,
          tutorial: true,
          settings: { detail: 'medium' },
          characters: ['twins'],
          runs: 4,
        }),
      ).tutorialPrompted,
    ).toBe(true);
  });
});
describe('Shinobi opportunities and nonlethal return', () => {
  it.each([false, true])(
    'ripostes after an opportunity (perfect: %s), leaves 1 HP and returns',
    (perfect) => {
      const w = encounter(),
        origin = { x: w.player.x, y: w.player.y },
        enemy = w.enemies[0];
      w.offerRiposte(enemy, perfect);
      expect(w.player.riposteUntil - w.time).toBeCloseTo(
        perfect ? RIPOSTE.perfectWindow : RIPOSTE.window,
      );
      w.input('attack');
      tick(w, 0.4);
      expect(w.player.x).toBeGreaterThan(origin.x + 70);
      expect(enemy.hp).toBe(1);
      expect(enemy.posture).toBe(perfect ? RIPOSTE.perfectPressure : RIPOSTE.pressure);
      tick(w, 0.5);
      expect(w.player.x).toBeCloseTo(origin.x, 1);
      expect(w.player.state).toBe('idle');
      expect(w.player.riposteUntil).toBe(0);
      expect(riposteTravel(0)).toBe(0);
      expect(riposteTravel(RIPOSTE.contact)).toBe(1);
      expect(riposteTravel(RIPOSTE.duration)).toBe(0);
    },
  );
  it('grants melee deflection eligibility, with stronger perfect guard pressure', () => {
    const w = encounter(),
      e = w.enemies[0];
    e.x = w.player.x + 70;
    e.hp = 100;
    e.strike = { kind: 'slash', windup: 0.8, recovery: 1, damage: 8, reach: 110 };
    w.player.parryAt = w.time - 0.03;
    w.enemyHit(e);
    expect(w.player.riposteTarget).toBe(e.id);
    expect(w.player.ripostePerfect).toBe(true);
    expect(e.posture).toBeGreaterThan(35);
  });
  it('rejects expired, distant, dead and other-character opportunities', () => {
    for (const id of ['sword', 'twins', 'spear', 'great']) {
      const w = encounter(id);
      w.offerRiposte(w.enemies[0]);
      expect(w.player.riposteUntil).toBe(0);
    }
    const w = encounter();
    w.enemies[0].x = w.player.x + RIPOSTE.range + 1;
    w.offerRiposte(w.enemies[0]);
    expect(w.player.riposteUntil).toBe(0);
    w.enemies[0].x = w.player.x + 70;
    w.offerRiposte(w.enemies[0]);
    w.time += 1;
    w.input('attack');
    tick(w, 0.01);
    expect(w.player.attackType).not.toBe('riposte');
  });
  it('opens a ranged opportunity only for a hit within extended range', () => {
    for (const range of [190, 350]) {
      const w = encounter(),
        e = w.enemies[0];
      e.x = w.player.x + range;
      e.hp = 100;
      w.arsenal.hitProjectile(
        {
          id: 1,
          x: e.x,
          y: e.y,
          vx: 600,
          vy: 0,
          radius: 5,
          owner: 'player',
          team: 'player',
          damage: 3,
          postureDamage: 10,
          lifetime: 1,
          parryable: false,
          reflectable: false,
          kind: 'needle',
          visualType: 'needle',
          pierce: 0,
          hit: [],
          reflected: false,
        },
        { id: e.id, x: e.x, y: e.y, team: 'enemy', radius: 20 },
      );
      expect(w.player.riposteUntil > w.time).toBe(range < RIPOSTE.range);
    }
  });
});
describe('authoritative online riposte', () => {
  it.each([50, 100, 150, 200])(
    'grants one melee opportunity after a validated delayed deflection at %s ms RTT',
    (latency) => {
      const s = new Session('coop', 'DELAYED-CINDER'),
        a = s.add('a', 'Ash', 'shinobi'),
        b = s.add('b', 'Oath', 'sword');
      s.start();
      s.enter(s.primary.floor.rooms.find((r) => r.kind === 'combat')!.id);
      const w = a.world,
        e = w.enemies[0];
      for (const enemy of w.enemies) enemy.readyAt = Infinity;
      Object.assign(w.player, { x: 500, y: 380, immunity: 0 });
      Object.assign(b.world.player, { x: 850, y: 380 });
      Object.assign(e, {
        x: 570,
        y: 380,
        facing: Math.PI,
        strike: { kind: 'slash', windup: 0.7, recovery: 1, damage: 12, reach: 110 },
      });
      s.step(1 / 30);
      const at = s.time;
      s.step(1 / 30);
      w.player.parryAt = -99;
      w.enemyHit(e);
      expect(w.player.hp).toBeLessThan(100);
      for (let i = 0; i < Math.ceil((latency / 2000) * 30); i++) s.step(1 / 30);
      a.ping = latency;
      s.input('a', Object.assign(new Input(), { sequence: 1, parry: true, time: at }));
      expect(w.player.hp).toBe(100);
      expect(w.player.ripostePerfect).toBe(true);
      expect(w.player.riposteUntil).toBeGreaterThan(s.time);
    },
  );
  it.each(CHARACTERS.map((c) => c.id))('runs %s in duels with semantic schema state', (id) => {
    const s = new Session('duel', 'FIVE-PILGRIMS');
    s.add('a', 'Ash', id);
    s.add('b', 'Oath', 'sword');
    s.start();
    s.step(1 / 30);
    expect(s.primary.weapon.id).toBe(id);
    expect(() => new PlayerState()).not.toThrow();
  });
  it('validates eligibility on authority, preserves 1 HP, and grants ranged PvP opportunities', () => {
    const s = new Session('duel', 'RIPOSTE-AUTHORITY'),
      a = s.add('a', 'Ash', 'shinobi'),
      b = s.add('b', 'Oath', 'sword');
    s.start();
    for (let i = 0; i < 40; i++) s.step(1 / 30);
    Object.assign(a.world.player, { x: 460, y: 380, facing: 0 });
    Object.assign(b.world.player, { x: 640, y: 380, hp: 100, immunity: 0 });
    s.step(1 / 30);
    const input = new Input();
    Object.assign(input, { sequence: 1, ranged: true, aimX: 640, aimY: 380 });
    s.input('a', input);
    for (let i = 0; i < 14; i++) s.step(1 / 30);
    expect(a.world.player.riposteUntil).toBeGreaterThan(s.time);
    b.world.player.hp = 4;
    b.world.player.immunity = 0;
    Object.assign(input, { sequence: 2, ranged: false, attack: true });
    s.input('a', input);
    for (let i = 0; i < 13; i++) s.step(1 / 30);
    expect(b.world.player.hp).toBe(1);
    expect(b.world.player.posture).toBeGreaterThan(50);
  });
});
describe('layered animation and optional training', () => {
  it('scrubs locomotion at a frozen clock and samples semantic actions without invalid clips', () => {
    const w = encounter(),
      machine = new AnimationStateMachine();
    const first = machine.sample('player-shinobi', w.player, 3, 'shinobi', false, {
      clip: 'run',
      time: 0,
      velocity: 200,
    });
    const step = machine.sample('player-shinobi', w.player, 3, 'shinobi', false, {
      clip: 'run',
      time: 0.125,
      velocity: 200,
    });
    expect(step.pose.rightLeg[0]).not.toBeCloseTo(first.pose.rightLeg[0]);
    for (const clip of ['parry', 'dodge', 'riposte', 'ranged'])
      for (const time of [0, 0.5, 1]) {
        const frame = machine.sample('player-shinobi', w.player, 3, 'shinobi', true, {
          clip,
          time,
        });
        expect(Object.values(frame.pose).flat().every(Number.isFinite)).toBe(true);
        if (clip === 'riposte') expect(frame.pose.advance).toBe(time === 0.5 ? 1.8 : 0);
      }
  });
  it('starts, strafes, backsteps, stops and blends without changing simulation', () => {
    const w = encounter(),
      p = w.player,
      controller = new AnimationStateMachine();
    controller.sample('player-shinobi', p, 0, 'shinobi', false);
    p.x += 3;
    controller.sample('player-shinobi', p, 0.02, 'shinobi', false);
    expect(controller.locomotion).toBe('run-start');
    for (let i = 2; i < 20; i++) {
      p.y += 4;
      controller.sample('player-shinobi', p, i * 0.02, 'shinobi', true);
    }
    expect(controller.locomotion).toBe('combat-strafe');
    for (let i = 20; i < 40; i++) {
      p.x -= 4;
      controller.sample('player-shinobi', p, i * 0.02, 'shinobi', true);
    }
    expect(controller.locomotion).toBe('combat-backward');
    const pos = { x: p.x, y: p.y };
    for (let i = 40; i < 100; i++)
      controller.sample('player-shinobi', p, i * 0.02, 'shinobi', false);
    expect(controller.locomotion).toBe('idle');
    expect({ x: p.x, y: p.y }).toEqual(pos);
  });
  it('keeps the tutorial a single deterministic room and persists completion', () => {
    const w = new World(defaultSave());
    w.start('PRACTICE', 'shinobi', true);
    expect(w.floor.rooms).toHaveLength(1);
    expect(w.floor.rooms[0].links).toEqual([]);
    w.cycleItem(1);
    expect(w.trainingDone.has('switch')).toBe(true);
    for (const [stage] of trainingStages(true)) w.trainingDone.add(stage);
    tick(w, 0.02);
    expect(w.mode).toBe('trained');
    expect(w.save.tutorial).toBe(true);
    expect(parseSave(JSON.stringify(w.save)).tutorial).toBe(true);
  });
});
describe('unified room geometry', () => {
  it('keeps combat gates solid until the same cleared state opens them', () => {
    const room = makeFloor('GATES', 1).rooms[1];
    room.cleared = false;
    room.enemies = ['warden'];
    const body = { x: 1000, y: 380 };
    moveBody(body, 40, 0, room, []);
    expect(body.x).toBe(1000);
    room.cleared = true;
    moveBody(body, 40, 0, room, []);
    expect(body.x).toBe(1040);
  });
  it('validates 2,000 generated floors: every socket has a collision path and no wall or decoration', () => {
    let rooms = 0,
      connections = 0;
    for (let i = 0; i < 2000; i++)
      for (const room of makeFloor(`LIVING-STEEL-${i}`, 1 + (i % 30)).rooms) {
        rooms++;
        const g = geometryFor(room);
        for (const s of g.sockets) {
          connections++;
          expect(canStand(room, s.x, s.y), room.template).toBe(true);
          expect(g.walls.some((w) => inDoorway([s], w.x, w.y))).toBe(false);
          expect(g.decorations.some((d) => inDoorway([s], d.x, d.y, 24))).toBe(false);
          // The reserved axial route is continuous, with no obstacle overlap.
          for (let t = 0; t <= 1; t += 0.04) {
            const x = 560 + (s.x - 560) * t,
              y = 380 + (s.y - 380) * t;
            expect(canStand(room, x, y)).toBe(true);
            expect(g.obstacles.every((o) => Math.hypot(o.x - x, o.y - y) > o.radius + 16)).toBe(
              true,
            );
          }
        }
      }
    expect(rooms).toBeGreaterThan(15000);
    expect(connections).toBeGreaterThan(60000);
  }, 120000);
  it('routes each actual linked doorway through the shared walkable representation', () => {
    const floor = makeFloor('CONNECTIONS', 7);
    for (const room of floor.rooms)
      for (const link of room.links) {
        const door = doorPosition(room, floor.rooms[link]);
        expect(pathBetween(room, { x: 560, y: 380 }, door).length).toBeGreaterThan(0);
      }
  });
});
