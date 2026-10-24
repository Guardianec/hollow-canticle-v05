import { describe, expect, it } from 'vitest';
import { Session } from '../../shared/session';
import { Input, displayName } from '../../shared/protocol';
import { encounter, eliteFor, ELITE_CHANCE, scaling } from '../../shared/scaling';
import { BALANCE } from '../../src/game/data';
import { makeFloor, doorPosition } from '../../src/game/dungeon';
import type { World } from '../../src/game/world';

function party(count = 2, mode: 'coop' | 'duel' = 'coop') {
  const session = new Session(mode, 'ONLINE-TEST');
  const weapons = ['sword', 'twins', 'spear', 'great'];
  for (let i = 0; i < count; i++) session.add(String(i), `Pilgrim ${i}`, weapons[i]);
  session.start();
  if (mode === 'coop')
    session.enter(session.primary.floor.rooms.find((r) => r.kind === 'combat')!.id);
  return session;
}
const advance = (s: Session, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) s.step(1 / 30);
};
const clear = (s: Session) => {
  for (const enemy of s.primary.enemies) enemy.state = 'dead';
  s.step(1 / 30);
};
function hit(w: World, parryAge: number): void {
  const e = w.enemies[0];
  Object.assign(e, {
    x: w.player.x + 70,
    y: w.player.y,
    facing: Math.PI,
    strike: { kind: 'slash', windup: 0.7, recovery: 1, damage: 12, reach: 110 },
  });
  w.player.immunity = 0;
  w.player.parryAt = w.time - parryAge;
  w.enemyHit(e);
}
describe('authoritative multiplayer rules', () => {
  it('validates names, rejecting controls, markup, combining abuse and empty names', () => {
    expect(displayName(' Артем ')).toBe('Артем');
    for (const name of [
      '',
      '  ',
      'a\nadmin',
      '<script>',
      'a'.repeat(21),
      'a\u202eb',
      'a\u0301\u0301\u0301',
    ])
      expect(() => displayName(name)).toThrow();
  });
  it.each([2, 3, 4])(
    'scales %i-player encounters deterministically with bounded enemy counts',
    (count) => {
      const room = makeFloor('DEEP', 6).rooms.find((r) => r.kind === 'combat')!;
      const ids = encounter(room, count, 'DEEP');
      expect(ids).toEqual(encounter(room, count, 'DEEP'));
      expect(ids.length).toBeLessThanOrEqual(scaling(count).cap);
      expect(ids.some((id) => ['archer', 'hexer'].includes(id))).toBe(true);
      expect(scaling(count).hp).toBeLessThanOrEqual(1.2);
      expect(scaling(count).budget).toBeGreaterThan(scaling(count - 1).budget);
    },
  );
  it('adds bounded deterministic elite pressure with increasing party size', () => {
    const room = makeFloor('ELITE', 6).rooms.find((r) => r.kind === 'combat')!;
    const counts = [2, 3, 4].map((size) =>
      Array.from({ length: 400 }, (_, i) => {
        const seed = `ELITE-${i}`,
          ids = encounter(room, size, seed),
          elite = eliteFor(room, size, seed, ids);
        expect(elite).toBe(eliteFor(room, size, seed, ids));
        if (elite !== undefined) expect(['boss', 'archer', 'hexer']).not.toContain(ids[elite]);
        return elite === undefined ? 0 : 1;
      }).reduce<number>((sum, n) => sum + n, 0),
    );
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(ELITE_CHANCE).toEqual([0, 0.06, 0.12, 0.18]);
  });
  it.each([2, 3, 4])(
    'revives %i-player fallen companions only on clear, at exactly 20 HP',
    (count) => {
      const s = party(count),
        worlds = s.worlds;
      for (const w of worlds.slice(1)) {
        w.player.hp = 0;
        w.player.focus = 80;
        w.player.posture = 50;
        w.inventory.add('oil');
      }
      advance(s, 0.5);
      for (const w of worlds.slice(1)) expect(w.player.hp).toBe(0);
      const charges = worlds[1].player.rangedCharges;
      clear(s);
      for (const w of worlds.slice(1)) {
        expect(w.player.hp).toBe(20);
        expect(w.player.state).toBe('idle');
        expect(w.player.focus).toBe(0);
        expect(w.player.posture).toBe(0);
        expect(w.player.immunity).toBeCloseTo(s.time + 1.5);
        expect(w.inventory.slots.some((i) => i.id === 'oil')).toBe(true);
      }
      expect(worlds[1].player.rangedCharges).toBe(charges);
    },
  );
  it('scales one Saint and revives after its final clear', () => {
    const s = party(4),
      w = s.primary;
    for (const world of s.worlds) world.floor = makeFloor(s.seed, 3);
    s.enter(w.floor.rooms.find((r) => r.kind === 'boss')!.id);
    const boss = w.enemies.find((e) => e.def.id === 'boss')!;
    expect(w.enemies.filter((e) => e.def.id === 'boss')).toHaveLength(1);
    expect(boss.maxHp / boss.def.hp).toBeCloseTo(2.75);
    s.worlds[2].player.hp = 0;
    clear(s);
    expect(s.worlds[2].player.hp).toBe(20);
  });
  it('ends a four-player wipe before clear with no revival, including simultaneous last kills', () => {
    const s = party(4);
    for (const w of s.worlds) w.player.hp = 0;
    clear(s);
    expect(s.ended).toBe(true);
    expect(s.worlds.every((w) => w.player.hp === 0)).toBe(true);
  });
  it('does not revive a hazard death in a peaceful room or on a timer', () => {
    const s = party();
    s.enter(0);
    s.worlds[1].player.hp = 0;
    advance(s, 8);
    expect(s.worlds[1].player.hp).toBe(0);
    expect(s.ended).toBe(false);
  });
  it('keeps disconnected players spectral and encounter scaling fixed until a future room', () => {
    const s = party(4),
      before = s.primary.enemies.map((e) => e.maxHp);
    s.setConnected('0', false);
    advance(s, 1);
    expect(s.active.map((m) => m.id)).not.toContain('0');
    expect(s.worlds[0].player.hp).toBe(100);
    expect(s.primary.enemies.map((e) => e.maxHp)).toEqual(before);
    s.remove('0');
    s.enter(
      s.primary.floor.rooms.find((r) => r.kind === 'combat' && r.id !== s.primary.roomId)!.id,
    );
    expect(s.budget).toBe(2.05);
    s.setConnected('1', false);
    s.setConnected('1', true);
    expect(s.members.get('1')!.connected).toBe(true);
  });
  it('rejects stale sequence numbers and never consumes client damage or HP outcomes', () => {
    const s = party(),
      w = s.primary;
    const input = Object.assign(new Input(), { sequence: 1, moveX: 127, moveY: Number.NaN });
    s.input('0', input);
    expect(w.movement).toEqual({ x: 1, y: 0 });
    s.input('0', Object.assign(new Input(), { sequence: 1, moveX: -1 }));
    expect(w.movement.x).toBe(1);
    expect(w.player.hp).toBe(100);
  });
  it('uses existing normal/perfect parry rules, and grants a physical rescue parry', () => {
    const s = party(),
      a = s.primary,
      b = s.worlds[1];
    b.player.x = a.player.x;
    b.player.y = a.player.y;
    b.player.immunity = 0;
    b.player.parryAt = b.time - 0.04;
    hit(a, 99);
    expect(a.player.hp).toBe(100);
    expect(b.player.hp).toBe(100);
    expect(b.stats.perfects).toBe(1);
    expect(s.members.get('1')!.rescues).toBe(1);
    b.player.parryAt = -99;
    hit(a, BALANCE.perfect + 0.025);
    expect(a.stats.parries).toBe(1);
    expect(a.stats.perfects).toBe(0);
  });
  it('allows any player to intercept and reflect an enemy projectile without friendly fire', () => {
    const s = party(),
      a = s.primary,
      b = s.worlds[1];
    Object.assign(a.player, { x: 420, y: 380 });
    Object.assign(b.player, { x: 520, y: 380, parryAt: 0, immunity: 0 });
    s.projectiles.spawn({
      x: 560,
      y: 380,
      vx: -600,
      vy: 0,
      owner: 0,
      team: 'enemy',
      radius: 5,
      damage: 12,
      postureDamage: 20,
      lifetime: 4,
      kind: 'arrow',
      parryable: true,
      reflectable: true,
      pierce: 0,
    });
    a.arsenal.update(0.05);
    expect(b.stats.reflections).toBe(1);
    expect(a.stats.reflections).toBe(0);
    expect(s.projectiles.active[0].owner).toBe('p:1');
    expect(s.projectiles.active[0].team).toBe('player');
    expect(a.player.hp).toBe(100);
  });
  it('keeps relic choices and inventory personal and validates reward ownership', () => {
    const s = party(),
      a = s.primary,
      b = s.worlds[1];
    a.openReward();
    b.openReward();
    const id = a.rewards[0].id;
    s.choose('0', 'client-invented-relic');
    expect(a.relics).toHaveLength(0);
    s.choose('0', id);
    expect(a.relics.map((r) => r.id)).toContain(id);
    expect(b.relics).toHaveLength(0);
    expect(a.inventory).not.toBe(b.inventory);
    a.enemies = [];
    a.pickupOwner = '0';
    a.pickups = [
      {
        id: 0,
        owner: '1',
        item: 'oil',
        room: a.roomId,
        depth: a.floor.depth,
        x: a.player.x,
        y: a.player.y,
      },
    ];
    expect(a.prompt?.text ?? '').not.toMatch(/^Take /);
    a.pickups[0].owner = '0';
    expect(a.prompt?.text).toMatch(/^Take /);
  });
  it('normalizes duel state, resolves opposing melee/parry and resets all round resources', () => {
    const s = party(2, 'duel'),
      a = s.primary,
      b = s.worlds[1];
    expect(a.inventory.count).toBe(0);
    expect(b.inventory.count).toBe(0);
    expect(a.relics).toHaveLength(0);
    expect(b.relics).toHaveLength(0);
    Object.assign(a.player, { x: 500, y: 380, facing: 0 });
    Object.assign(b.player, { x: 575, y: 380, immunity: 0 });
    s.input('0', Object.assign(new Input(), { sequence: 1, attack: true, aimX: 575, aimY: 380 }));
    advance(s, 0.6);
    expect(b.player.hp).toBeLessThan(100);
    s.resetDuel();
    expect(b.player.hp).toBe(100);
    expect(b.player.posture).toBe(0);
    expect(b.player.rangedCharges).toBe(b.character.ranged.charges);
    expect(b.player.focus).toBe(0);
  });
  it.each([0, 50, 100, 150, 200])(
    'validates a delayed parry at %i ms RTT against historical contact',
    (latency) => {
      const s = party(),
        w = s.primary,
        other = s.worlds[1];
      for (const e of w.enemies) e.readyAt = 999;
      other.player.x = 850;
      other.player.y = 380;
      Object.assign(w.player, { x: 500, y: 380, immunity: 0 });
      s.step(1 / 30);
      const inputAt = s.time;
      s.step(1 / 30);
      hit(w, 99);
      expect(w.player.hp).toBeLessThan(100);
      advance(s, latency / 2000);
      s.members.get('0')!.ping = latency;
      s.input('0', Object.assign(new Input(), { sequence: 1, parry: true, time: inputAt }));
      expect(w.player.hp).toBe(100);
      expect(w.stats.perfects).toBe(1);
      s.input('0', Object.assign(new Input(), { sequence: 2, parry: true, time: inputAt }));
      expect(w.stats.perfects).toBe(1);
    },
  );
  it('rejects old defensive timestamps and keeps normal parries distinct from perfect', () => {
    const s = party(),
      w = s.primary;
    s.worlds[1].player.x = 850;
    for (const e of w.enemies) e.readyAt = 999;
    Object.assign(w.player, { x: 500, y: 380, immunity: 0 });
    advance(s, 0.2);
    const at = s.time;
    advance(s, BALANCE.perfect + 0.04);
    hit(w, 99);
    const damaged = w.player.hp;
    s.members.get('0')!.ping = 200;
    s.input('0', Object.assign(new Input(), { sequence: 1, parry: true, time: -100 }));
    expect(w.player.hp).toBe(damaged);
    s.input('0', Object.assign(new Input(), { sequence: 2, parry: true, time: at }));
    expect(w.player.hp).toBe(100);
    expect(w.stats.perfects).toBe(0);
    expect(w.stats.parries).toBe(1);
  });
  it('compensates a late perfect projectile parry and awards the reflection to its defender', () => {
    const s = party(),
      w = s.primary;
    s.worlds[1].player.x = 850;
    for (const e of w.enemies) e.readyAt = 999;
    Object.assign(w.player, { x: 500, y: 380, immunity: 0, focus: 50, posture: 40 });
    s.step(1 / 30);
    const at = s.time;
    s.step(1 / 30);
    s.projectiles.spawn({
      x: 535,
      y: 380,
      vx: -600,
      vy: 0,
      owner: 0,
      team: 'enemy',
      radius: 5,
      damage: 12,
      postureDamage: 20,
      lifetime: 4,
      kind: 'arrow',
      parryable: true,
      reflectable: true,
      pierce: 0,
    });
    w.arsenal.update(0.05);
    expect(w.player.hp).toBe(88);
    s.members.get('0')!.ping = 150;
    s.input('0', Object.assign(new Input(), { sequence: 1, parry: true, time: at }));
    expect(w.player.hp).toBe(100);
    expect(w.stats.reflections).toBe(1);
    expect(w.player.focus).toBe(68);
    expect(w.player.posture).toBeLessThan(40);
    expect(s.projectiles.active[0].owner).toBe('p:0');
    expect(s.projectiles.active[0].reflected).toBe(true);
  });
  it('requires all living connected players at the same chosen exit before travelling', () => {
    const s = party(),
      w = s.primary;
    clear(s);
    advance(s, 0.6);
    for (const world of s.worlds) {
      world.mode = 'playing';
      world.rewards = [];
    }
    const from = w.roomId,
      next = w.floor.rooms[w.room.links[0]];
    const door = doorPosition(w.room, next);
    Object.assign(w.player, door);
    w.player.state = 'idle';
    w.input('interact');
    s.step(1 / 30);
    expect(w.roomId).toBe(from);
    Object.assign(s.worlds[1].player, door);
    w.input('interact');
    s.step(1 / 30);
    expect(w.roomId).toBe(next.id);
    expect(s.worlds[1].roomId).toBe(next.id);
  });
  it('waits for a reserved disconnected seat before allowing traversal', () => {
    const s = party(),
      w = s.primary;
    clear(s);
    advance(s, 0.6);
    for (const world of s.worlds) {
      world.mode = 'playing';
      world.rewards = [];
    }
    const from = w.roomId,
      next = w.floor.rooms[w.room.links[0]],
      door = doorPosition(w.room, next);
    Object.assign(w.player, door);
    s.setConnected('1', false);
    w.input('interact');
    s.step(1 / 30);
    expect(w.roomId).toBe(from);
    s.remove('1');
    w.input('interact');
    s.step(1 / 30);
    expect(w.roomId).toBe(next.id);
  });
  it.each(['perfect', 'normal', 'dodge', 'hit'])('resolves duel melee defense: %s', (defense) => {
    const s = party(2, 'duel'),
      a = s.primary,
      b = s.worlds[1];
    Object.assign(a.player, { x: 500, y: 380, facing: 0 });
    Object.assign(b.player, { x: 575, y: 380, immunity: 0, parryAt: -99, dodgeAt: -99 });
    if (defense === 'normal')
      s.input('1', Object.assign(new Input(), { sequence: 1, parry: true, time: 0 }));
    if (defense === 'dodge') b.player.dodgeAt = 0;
    s.input('0', Object.assign(new Input(), { sequence: 1, attack: true, aimX: 575, aimY: 380 }));
    advance(s, 0.1);
    if (defense === 'perfect')
      s.input('1', Object.assign(new Input(), { sequence: 1, parry: true, time: s.time }));
    advance(s, 0.1);
    if (defense === 'hit') expect(b.player.hp).toBeLessThan(100);
    else expect(b.player.hp).toBe(100);
    if (defense === 'perfect') expect(b.stats.perfects).toBe(1);
    if (defense === 'normal') {
      expect(b.stats.parries).toBe(1);
      expect(b.stats.perfects).toBe(0);
      expect(a.player.posture).toBeGreaterThan(0);
    }
  });
  it('allows a duel projectile reflection, posture break and one authoritative execution', () => {
    const s = party(2, 'duel'),
      a = s.primary,
      b = s.worlds[1];
    Object.assign(a.player, { x: 500, y: 380, facing: 0 });
    Object.assign(b.player, { x: 575, y: 380, immunity: 0, parryAt: 0 });
    s.projectiles.spawn({
      x: 540,
      y: 380,
      vx: 700,
      vy: 0,
      owner: 'p:0',
      team: '0',
      radius: 5,
      damage: 10,
      postureDamage: 20,
      lifetime: 4,
      kind: 'needle',
      parryable: true,
      reflectable: true,
      pierce: 0,
    });
    a.arsenal.update(0.05);
    expect(b.stats.reflections).toBe(1);
    expect(s.projectiles.active[0].team).toBe('1');
    b.player.posture = 90;
    a.pressure(a.enemies[0], 20);
    expect(b.player.state).toBe('stagger');
    s.step(1 / 30);
    s.input('0', Object.assign(new Input(), { sequence: 1, interact: true }));
    s.step(1 / 30);
    expect(b.player.hp).toBe(0);
    expect(a.stats.finishers).toBe(1);
    s.input('0', Object.assign(new Input(), { sequence: 2, interact: true }));
    s.step(1 / 30);
    expect(a.stats.finishers).toBe(1);
  });
});
