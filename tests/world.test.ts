import { beforeEach, describe, expect, it, vi } from 'vitest';
import { World, distance } from '../src/game/world';
import { defaultSave } from '../src/game/save';
import { ENEMIES, RELICS, WEAPONS } from '../src/game/data';
import { makeFloor, doorPosition } from '../src/game/dungeon';

beforeEach(() => {
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
const tick = (w: World, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) w.update(1 / 120);
};
function arena(enemy = 'warden'): World {
  const w = new World(defaultSave());
  w.start('TEST', 'sword');
  w.enterRoom(1);
  w.enemies = [w.spawnEnemy(enemy, 0)];
  w.player.x = 560;
  w.player.y = 400;
  w.enemies[0].x = 630;
  w.enemies[0].y = 400;
  w.player.immunity = 0;
  return w;
}
function hit(w: World, parryAge = 10, kind = w.enemies[0].strike.kind): void {
  const e = w.enemies[0];
  e.x = w.player.x + 70;
  e.y = w.player.y;
  e.state = 'tell';
  e.facing = Math.PI;
  e.strike = { ...ENEMIES[0].patterns[0][0], kind, windup: 0.7 };
  e.stateAt = w.time - 0.7;
  w.player.parryAt = w.time - parryAge;
  w.update(0.001);
}

describe('live simulation flows', () => {
  it('keeps ice momentum independent of camera-oriented movement axes', () => {
    const w = arena();
    w.enemies = [];
    w.room.cleared = true;
    w.floor.biome = 3;
    w.player.x = 520;
    w.player.y = 300;
    w.movement = { x: 1, y: 0.25 };
    tick(w, 0.2);
    w.movement = { x: 0, y: 0 };
    const x = w.player.x;
    tick(w, 0.1);
    expect(w.player.x).toBeGreaterThan(x);
  });
  it('moves, collides with masonry, and stays in the hall', () => {
    const w = arena();
    w.enemies = [];
    w.room.cleared = true;
    w.movement = { x: -1, y: 0 };
    tick(w, 10);
    expect(w.player.x).toBeGreaterThanOrEqual(72);
    const o = w.obstacles[0];
    w.player.x = o.x - o.radius - 20;
    w.player.y = o.y;
    w.movement = { x: 1, y: 0 };
    tick(w, 1);
    expect(distance(w.player, o)).toBeGreaterThanOrEqual(o.radius + 15);
  });
  it('separates silhouettes when a player walks into an enemy', () => {
    const w = arena();
    w.enemies[0].x = w.player.x;
    w.enemies[0].y = w.player.y;
    tick(w, 0.1);
    expect(distance(w.player, w.enemies[0])).toBeGreaterThan(40);
  });
  it('perfectly parries, builds Focus, and opens a counter window', () => {
    const w = arena();
    hit(w, 0.04);
    expect(w.stats.perfects).toBe(1);
    expect(w.stats.parries).toBe(1);
    expect(w.player.hp).toBe(100);
    expect(w.player.focus).toBeGreaterThan(0);
    expect(w.enemies[0].posture).toBeGreaterThan(30);
    expect(w.player.counterUntil).toBeGreaterThan(w.time);
  });
  it('normal parry has lower posture reward than a perfect parry', () => {
    const a = arena(),
      b = arena();
    hit(a, 0.18);
    hit(b, 0.04);
    expect(a.stats.parries).toBe(1);
    expect(a.stats.perfects).toBe(0);
    expect(a.enemies[0].posture).toBeLessThan(b.enemies[0].posture);
  });
  it('takes damage, loses momentum, and dies with a single persisted summary', () => {
    const w = arena();
    w.player.hp = 1;
    w.player.focus = 50;
    hit(w);
    expect(w.mode).toBe('dead');
    expect(w.stats.damage).toBeGreaterThan(0);
    expect(w.events.some((e) => e.type === 'death')).toBe(true);
    expect(w.save.runs).toBe(1);
    w.settleRun();
    expect(w.save.runs).toBe(1);
    w.start(w.seed, w.weapon.id);
    expect(w.mode).toBe('playing');
    expect(w.player.hp).toBe(100);
  });
  it('dodges a sweep during the immunity window', () => {
    const w = arena();
    w.player.dodgeAt = w.time - 0.1;
    w.player.state = 'dodge';
    hit(w, 10, 'sweep');
    expect(w.player.hp).toBe(100);
    expect(w.player.focus).toBeGreaterThan(0);
  });
  it('breaks a guard, executes a finisher, then can claim a relic offering', () => {
    const w = arena();
    const e = w.enemies[0];
    w.pressure(e, 1000);
    expect(e.state).toBe('broken');
    w.input('interact');
    tick(w, 0.15);
    expect(e.state).toBe('dead');
    expect(w.stats.finishers).toBe(1);
    tick(w, 2.5);
    w.openReward();
    expect(w.mode).toBe('reward');
    expect(w.rewards.length).toBeGreaterThanOrEqual(1);
    expect(w.rewards.length).toBeLessThanOrEqual(3);
    const relic = w.rewards[0];
    w.chooseRelic(relic.id);
    expect(w.relics).toContain(relic);
    expect(w.save.relics).toContain(relic.id);
    expect(w.mode).toBe('playing');
  });
  it('recovers from an expired break instead of softlocking', () => {
    const w = arena();
    const e = w.enemies[0];
    w.pressure(e, 1000);
    tick(w, 5.5);
    expect(e.state).not.toBe('broken');
    expect(e.hp).toBeGreaterThan(0);
  });
  it('has two guardian phases and requires a final execution', () => {
    const w = arena('boss');
    const e = w.enemies[0];
    w.invincible = true;
    for (let i = 0; i < 2; i++) {
      w.pressure(e, 1000);
      w.player.state = 'idle';
      w.input('interact');
      tick(w, 0.15);
      tick(w, 1.5);
    }
    expect(e.phase).toBe(2);
    expect(e.state).not.toBe('dead');
    for (let i = 0; i < 2; i++) {
      w.pressure(e, 1000);
      w.player.state = 'idle';
      w.input('interact');
      tick(w, 0.2);
      tick(w, 1.5);
    }
    expect(e.state).toBe('dead');
    expect(w.stats.bosses).toBe(1);
  });
  it('runs each enemy and each weapon without dead states or invalid values', () => {
    for (const def of ENEMIES)
      for (const weapon of WEAPONS) {
        const w = arena(def.id);
        w.weapon = weapon;
        w.invincible = true;
        for (let i = 0; i < 25; i++) {
          w.input(i % 3 === 0 ? 'dodge' : i % 2 === 0 ? 'parry' : 'attack');
          tick(w, 0.3);
        }
        expect(Number.isFinite(w.player.x + w.player.y + w.player.hp + w.enemies[0].posture)).toBe(
          true,
        );
        expect(w.mode).toBe('playing');
      }
  });
  it('uses attack pressure to prevent posture recovery', () => {
    const w = arena();
    const e = w.enemies[0];
    e.posture = 50;
    e.lastPressure = -99;
    e.readyAt = 99;
    tick(w, 0.4);
    expect(e.posture).toBeLessThan(50);
    w.pressure(e, 5);
    const posture = e.posture;
    tick(w, 0.4);
    expect(e.posture).toBe(posture);
  });
  it('overlaps preparations while spacing committed group impacts', () => {
    const w = arena();
    w.invincible = true;
    w.enemies.push(w.spawnEnemy('monk', 1));
    w.enemies[1].x = w.player.x - 85;
    w.enemies[1].y = w.player.y;
    let overlap = false;
    for (let i = 0; i < 1500; i++) {
      w.update(1 / 120);
      const preparing = w.alive.filter((e) => e.state === 'tell' || e.state === 'active');
      expect(preparing.length).toBeLessThanOrEqual(2);
      if (preparing.length === 2) overlap = true;
      const rs = w.threats.reservations;
      for (let a = 0; a < rs.length; a++)
        for (let b = a + 1; b < rs.length; b++)
          expect(Math.abs(rs[a].at - rs[b].at)).toBeGreaterThanOrEqual(
            rs[a].special || rs[b].special ? 0.72 : 0.48,
          );
    }
    expect(overlap).toBe(true);
  });
  it('pauses clocks and clears buffered inputs', () => {
    const w = arena();
    const time = w.time;
    w.input('attack');
    w.pause();
    tick(w, 1);
    expect(w.time).toBe(time);
    w.pause();
    tick(w, 0.01);
    expect(w.player.state).toBe('idle');
  });
  it('unlocks connected doors, permits backtracking, and descends to another biome', () => {
    const w = arena();
    w.enemies = [];
    w.room.cleared = true;
    const next = w.floor.rooms[0],
      door = doorPosition(w.room, next);
    Object.assign(w.player, door);
    w.input('interact');
    tick(w, 0.02);
    expect(w.roomId).toBe(0);
    w.floor.rooms.find((r) => r.kind === 'boss')!.cleared = true;
    w.enterRoom(w.floor.rooms.find((r) => r.kind === 'exit')!.id);
    w.player.x = 560;
    w.player.y = 365;
    w.input('interact');
    tick(w, 0.02);
    expect(w.floor.depth).toBe(2);
    expect(w.floor.biome).toBe(1);
    expect(w.roomId).toBe(0);
  });
  it('relic rules mutate counters, defense, and room rewards', () => {
    const w = arena();
    w.relics = RELICS.filter((r) =>
      ['blood', 'ash', 'glass', 'ember', 'pulse', 'cadence', 'hunger', 'suture'].includes(r.id),
    );
    w.player.hp = 40;
    hit(w, 0.04);
    expect(w.player.hp).toBe(45);
    expect(w.ward).toBe(4);
    expect(w.player.focus).toBeGreaterThan(20);
    w.hitStop = 0;
    w.player.immunity = 99;
    w.input('attack');
    tick(w, 0.2);
    expect(w.enemies[0].burns).toBeGreaterThan(w.time);
    expect(w.player.hp).toBeGreaterThanOrEqual(48);
  });
  it('shockwave relics pressure the dueling opponent and cannot recurse on a broken guard', () => {
    const w = arena();
    w.relics = RELICS.filter((r) => ['echo', 'bell', 'thorn'].includes(r.id));
    w.stats.perfects = 2;
    hit(w, 0.04);
    expect(w.enemies[0].posture).toBeGreaterThanOrEqual(56);
    w.hitStop = 0;
    w.player.immunity = 0;
    w.player.parryAt = -99;
    hit(w);
    expect(w.enemies[0].state).toBe('broken');
    expect(w.player.hp).toBeLessThan(100);
  });
  it('restores vitality in safe training and respawns the training partner', () => {
    const w = new World(defaultSave());
    w.start('TRAIN', 'sword', true);
    w.player.hp = 1;
    tick(w, 0.01);
    expect(w.player.hp).toBe(40);
    const e = w.enemies[0];
    w.player.x = e.x - 65;
    w.player.y = e.y;
    w.pressure(e, 1000);
    w.input('interact');
    tick(w, 3);
    expect(w.mode).toBe('playing');
    expect(w.alive).toHaveLength(1);
    expect(w.save.runs).toBe(0);
  });
  it('generates deep runs without scaling enemy health into sponges', () => {
    const w = arena();
    w.floor = makeFloor('DEEP', 10000);
    w.enterRoom(1);
    for (const e of w.alive) expect(e.maxHp).toBeLessThanOrEqual(108);
    expect(w.floor.hybrid).not.toBeNull();
  });
});
