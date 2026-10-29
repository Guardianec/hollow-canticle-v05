import { beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from '../src/game/world';
import { defaultSave, parseSave } from '../src/game/save';
import { CHARACTERS, meleeMove } from '../src/game/characters';
import { Buffs } from '../src/game/buffs';
import { Inventory, ITEMS } from '../src/game/items';
import { LootDirector, LOOT_WEIGHTS } from '../src/game/loot';
import { Projectiles, lineOfSight, segmentContact, wallContact } from '../src/game/projectiles';
import { ENEMIES, RELICS, WEAPONS } from '../src/game/data';
import { encounter, makeFloor } from '../src/game/dungeon';
import { Random } from '../src/game/random';
import { animateCharacter } from '../src/game/presentation/animation';
import { directionalFocus } from '../src/game/combat';

beforeEach(() => {
  vi.stubGlobal('location', { search: '?debug' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
const tick = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * 120; i++) w.update(1 / 120);
};
function arena(character = 'sword', enemy = 'archer') {
  const w = new World(defaultSave());
  w.start('ARSENAL', character);
  w.configureLab({
    enemy,
    support: 'same',
    count: 1,
    elite: 'none',
    depth: 2,
    biome: 0,
    pattern: -1,
  });
  w.obstacles = [];
  Object.assign(w.player, { x: 500, y: 380, immunity: 0 });
  Object.assign(w.enemies[0], { x: 750, y: 380, readyAt: 999 });
  return w;
}
function arrow(w: World, kind: 'arrow' | 'orb' = 'arrow', y = w.player.y) {
  return w.projectiles.spawn({
    x: w.player.x + 60,
    y,
    vx: -350,
    vy: 0,
    radius: kind === 'orb' ? 13 : 5,
    owner: 0,
    team: 'enemy',
    damage: 12,
    postureDamage: 30,
    lifetime: 3,
    parryable: true,
    reflectable: true,
    kind,
    pierce: 0,
  })!;
}

describe('projectile contacts and reflection', () => {
  it('sweeps fast arrows instead of tunnelling and resolves architecture first', () => {
    expect(segmentContact({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 0 }, 10)).toBeCloseTo(
      0.49,
    );
    expect(
      segmentContact({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 20 }, 10),
    ).toBeUndefined();
    const w = arena();
    expect(
      wallContact(
        w.room,
        [{ x: 550, y: 380, radius: 20, type: 'pillar' }],
        { x: 500, y: 380 },
        { x: 700, y: 380 },
        5,
      ),
    ).toBeCloseTo(0.125);
    expect(
      lineOfSight(w.room, [{ x: 600, y: 380, radius: 25, type: 'pillar' }], w.player, w.enemies[0]),
    ).toBe(false);
  });
  it('hits and misses the player using actual projectile position', () => {
    const hit = arena(),
      miss = arena();
    arrow(hit);
    arrow(miss, 'arrow', 450);
    tick(hit, 0.3);
    tick(miss, 0.3);
    expect(hit.player.hp).toBe(88);
    expect(miss.player.hp).toBe(100);
  });
  it.each(['arrow', 'orb'] as const)(
    'normal parry dissipates a %s, perfect timing reflects it to its shooter',
    (kind) => {
      const normal = arena(),
        perfect = arena();
      const a = arrow(normal, kind),
        b = arrow(perfect, kind);
      a.x = normal.player.x + 23;
      b.x = perfect.player.x + 23;
      normal.player.parryAt = -0.15;
      perfect.player.parryAt = -0.01;
      tick(normal, 0.01);
      tick(perfect, 0.01);
      expect(normal.stats.projectileParries).toBe(1);
      expect(normal.projectiles.active).toHaveLength(0);
      expect(perfect.stats.reflections).toBe(1);
      expect(b.team).toBe('player');
      expect(b.vx).toBeGreaterThan(0);
      const hp = perfect.enemies[0].hp;
      tick(perfect, 0.8);
      expect(perfect.enemies[0].hp).toBeLessThan(hp);
      expect(perfect.player.hp).toBe(100);
      expect(perfect.enemies[0].posture).toBeGreaterThan(40);
    },
  );
  it('allows a reflected arrow to break its archer at the contact point', () => {
    const w = arena();
    const shot = arrow(w);
    shot.x = 522;
    w.player.parryAt = 0;
    tick(w, 0.8);
    expect(w.enemies[0].state).toBe('broken');
    expect(w.effects.some((e) => e.x > 650)).toBe(true);
  });
  it('does not damage allies before reflection and can hit a different hostile after reflection', () => {
    const w = arena();
    const second = w.spawnEnemy('warden', 1);
    Object.assign(second, { x: 600, y: 380, readyAt: 999 });
    w.enemies.push(second);
    const shot = arrow(w);
    shot.x = 700;
    tick(w, 0.25);
    expect(second.hp).toBe(second.maxHp);
    shot.team = 'player';
    shot.reflected = true;
    shot.x = 550;
    shot.vx = 350;
    tick(w, 0.25);
    expect(second.hp).toBeLessThan(second.maxHp);
  });
  it('dodge and finisher safety survive an incoming projectile', () => {
    const w = arena();
    w.player.dodgeAt = 0;
    arrow(w).x = 522;
    tick(w, 0.01);
    expect(w.player.hp).toBe(100);
    w.hitStop = 0;
    w.player.state = 'finisher';
    w.player.stateAt = w.time;
    arrow(w).x = 522;
    tick(w, 0.02);
    expect(w.player.hp).toBe(100);
  });
  it('freezes during hit stop, survives camera changes, expires and clears on room transition', () => {
    const w = arena();
    const p = arrow(w);
    w.hitStop = 0.1;
    w.presentation.mode = 'duel';
    tick(w, 0.05);
    expect(p.x).toBe(560);
    expect(p.lifetime).toBe(3);
    w.presentation.mode = 'combat-wide';
    w.hitStop = 0;
    p.vx = 0;
    p.lifetime = 0.1;
    tick(w, 0.2);
    expect(w.projectiles.active).toHaveLength(0);
    arrow(w);
    w.enterRoom(0);
    expect(w.projectiles.active).toHaveLength(0);
  });
  it('walls stop a projectile before it reaches the player', () => {
    const w = arena();
    w.obstacles = [{ x: 540, y: 380, radius: 8, type: 'pillar' }];
    arrow(w);
    tick(w, 0.3);
    expect(w.player.hp).toBe(100);
    expect(w.projectiles.active).toHaveLength(0);
  });
  it('bounds the simulation pool', () => {
    const w = arena();
    for (let i = 0; i < 100; i++) arrow(w);
    expect(w.projectiles.active).toHaveLength(48);
    expect(new Projectiles().active).toEqual([]);
  });
});

describe('four disciplines and rechargeable offerings', () => {
  it('keeps a focused enemy selected for melee and ranged attacks until it dies', () => {
    const w = arena();
    const second = w.spawnEnemy('warden', 1);
    Object.assign(second, { x: 700, y: 430, readyAt: 999 });
    w.enemies.push(second);
    w.mouseAim = { x: 0, y: 0 };
    w.focusEnemy(second.id);
    expect(w.mouseAim).toBeUndefined();
    expect(w.target).toBe(second);
    w.input('attack');
    tick(w, 0.01);
    expect(w.player.facing).toBeCloseTo(Math.atan2(second.y - w.player.y, second.x - w.player.x));
    w.player.state = 'idle';
    w.input('ranged');
    tick(w, 0.01);
    expect(w.player.facing).toBeCloseTo(Math.atan2(second.y - w.player.y, second.x - w.player.x));
    second.state = 'dead';
    expect(w.target?.id).toBe(0);
    w.enterRoom(0);
    expect(w.focusedEnemy).toBeUndefined();
  });
  it('switches screen-space focus with mouse gestures and wraps keyboard focus predictably', () => {
    const points = [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: -0.6, y: 0.1 },
      { id: 2, x: 0.8, y: -0.2 },
    ];
    expect(directionalFocus(points, 0, 80, 0)).toBe(2);
    expect(directionalFocus(points, 0, -80, 0)).toBe(1);
    expect(directionalFocus(points, 0, 0, 0)).toBeUndefined();
    const w = arena();
    w.enemies.push(w.spawnEnemy('warden', 1));
    w.focusEnemy(0);
    w.cycleFocus(1);
    expect(w.target?.id).toBe(1);
    w.cycleFocus(1);
    expect(w.target?.id).toBe(0);
    w.cycleFocus(-1);
    expect(w.target?.id).toBe(1);
  });
  it.each(CHARACTERS)(
    '$name has distinct capacity, timings and a committed ranged animation',
    (c) => {
      const w = arena(c.id);
      expect(w.player.rangedCharges).toBe(c.ranged.charges);
      w.input('ranged');
      tick(w, 0.02);
      expect(w.player.rangedCharges).toBe(c.ranged.charges - 1);
      expect(w.projectiles.active).toHaveLength(0);
      expect(
        animateCharacter(`player-${c.id}`, w.player, w.time, false, c.id, true).name,
      ).toContain('ranged');
      tick(w, c.ranged.startup + 0.02);
      expect(w.projectiles.active[0]?.kind).toBe(c.ranged.kind);
      w.player.rangedCharges = 0;
      w.player.recharge = 0;
      w.rechargeRanged(c.ranged.recharge - 0.01);
      expect(w.player.rangedCharges).toBe(0);
      w.rechargeRanged(0.01);
      expect(w.player.rangedCharges).toBe(1);
      expect(w.player.recharge).toBeCloseTo(0);
      w.rechargeRanged(c.ranged.recharge * 20);
      expect(w.player.rangedCharges).toBe(c.ranged.charges);
      expect(w.player.recharge).toBe(0);
    },
  );
  it('cannot fire at zero charges, and restart resets run resources', () => {
    const w = arena();
    w.player.rangedCharges = 0;
    w.input('ranged');
    tick(w, 0.4);
    expect(w.stats.rangedSpent).toBe(0);
    w.buffs.add('ash', w.time);
    w.inventory.add('glass');
    w.start('RESET', 'spear');
    expect(w.player.rangedCharges).toBe(2);
    expect(w.buffs.active).toEqual([]);
    expect(w.inventory.slots).toEqual([{ id: 'crimson', count: 1 }]);
  });
  it('Ash Cordial accelerates one-at-a-time recharge without room-clear refills', () => {
    const a = arena(),
      b = arena();
    a.player.rangedCharges = b.player.rangedCharges = 0;
    b.buffs.add('ash', 0);
    tick(a, 5.1);
    tick(b, 5.1);
    expect(a.player.rangedCharges).toBe(0);
    expect(b.player.rangedCharges).toBe(1);
    const charges = a.player.rangedCharges;
    a.enterRoom(0);
    expect(a.player.rangedCharges).toBe(charges);
  });
  it('uses four-step chains and dedicated counter/heavy/dodge/running moves', () => {
    for (const c of CHARACTERS) {
      expect(new Set(c.chain.map((m) => m.name)).size).toBe(4);
      expect(meleeMove(c, 0, 'heavy').pressure).toBeGreaterThan(c.chain[0].pressure);
      expect(meleeMove(c, 0, 'counter').kind).toBe('thrust');
      expect(meleeMove(c, 0, 'dodge').name).not.toBe(c.chain[0].name);
    }
    const w = arena();
    w.input('attack');
    tick(w, 0.25);
    w.input('attack');
    tick(w, 0.3);
    expect(w.player.combo).toBe(1);
    tick(w, 1.5);
    w.input('attack');
    tick(w, 0.01);
    expect(w.player.combo).toBe(0);
  });
  it('uses authoritative move startup and lets parry cancel a ranged recovery', () => {
    const w = arena('great', 'warden');
    Object.assign(w.enemies[0], { x: 590, y: 380 });
    w.input('heavy');
    tick(w, WEAPONS[3].startup + 0.05);
    expect(w.enemies[0].hp).toBe(w.enemies[0].maxHp);
    tick(w, 0.5);
    expect(w.enemies[0].posture).toBeGreaterThan(20);
    const ranged = arena('great');
    ranged.input('ranged');
    tick(ranged, 0.51);
    ranged.input('parry');
    tick(ranged, 0.01);
    expect(ranged.player.state).toBe('parry');
  });
  it('keeps a moving Lancer in its basic chain instead of replacing every hit with a running thrust', () => {
    const w = arena('spear');
    w.movement = { x: 1, y: 0 };
    w.player.comboUntil = w.time + 1;
    w.player.stateAt = w.time - 1;
    w.input('attack');
    tick(w, 0.01);
    expect(w.player.attackType).toBe('chain');
    expect(w.player.combo).toBe(1);
  });
});

describe('offerings and timed effects', () => {
  it('limits inventory to five items, two copies, and cycles safely when consuming', () => {
    const inv = new Inventory();
    expect(inv.add('invalid')).toBe(false);
    expect(inv.add('crimson')).toBe(true);
    expect(inv.add('crimson')).toBe(true);
    expect(inv.add('crimson')).toBe(false);
    for (const id of ['ash', 'glass', 'ward']) expect(inv.add(id)).toBe(true);
    expect(inv.add('oil')).toBe(false);
    inv.cycle(-1);
    expect(inv.take()?.id).toBe('ward');
    inv.clear();
    inv.cycle(1);
    expect(inv.take()).toBeUndefined();
  });
  it('refreshes equal buffs, expires precisely, combines distinct modifiers and consumes wards once', () => {
    const buffs = new Buffs();
    buffs.add('glass', 0);
    buffs.add('glass', 3);
    buffs.add('oil', 3);
    expect(buffs.active).toHaveLength(2);
    expect(buffs.modifier('damage')).toBe(1.35);
    expect(buffs.modifier('pressure')).toBe(1.2);
    buffs.expire(14.99);
    expect(buffs.active).toHaveLength(2);
    buffs.expire(15);
    expect(buffs.active).toHaveLength(0);
    buffs.add('ward', 20);
    expect(buffs.consume('ward')).toBe(true);
    expect(buffs.consume('ward')).toBe(false);
  });
  it('commits healing at the end of use, tracks actual healing, and cancels it when hurt', () => {
    const w = arena();
    w.player.hp = 30;
    w.input('item');
    tick(w, 0.4);
    expect(w.player.hp).toBe(30);
    tick(w, 0.3);
    expect(w.player.hp).toBe(30);
    tick(w, 0.12);
    expect(w.player.hp).toBe(60);
    expect(w.stats.healing).toBeCloseTo(30);
    w.inventory.add('crimson');
    w.input('item');
    tick(w, 0.1);
    arrow(w).x = w.player.x + 23;
    tick(w, 0.1);
    tick(w, 0.7);
    expect(w.player.hp).toBe(48);
  });
  it('applies gradual healing, speed, posture resistance and ward effects in simulation', () => {
    const w = arena();
    w.player.hp = 50;
    w.buffs.add('water', 0);
    tick(w, 4);
    expect(w.player.hp).toBeCloseTo(62.5, 0);
    w.buffs.add('ward', w.time);
    arrow(w).x = w.player.x + 23;
    tick(w, 0.01);
    expect(w.player.hp).toBeGreaterThan(62);
    expect(w.buffs.active.some((b) => b.id === 'ward')).toBe(false);
    w.buffs.add('moth', w.time);
    w.player.state = 'idle';
    w.input('attack');
    tick(w, 0.01);
    expect(w.player.attackStartup).toBeLessThan(w.weapon.startup);
  });
  it('keeps unexpired buffs across rooms and floors and clears them on death', () => {
    const w = arena();
    w.buffs.add('oil', w.time);
    w.floor = makeFloor(w.seed, 3);
    w.enterRoom(0);
    expect(w.buffs.active).toHaveLength(1);
    w.player.hp = 0;
    w.training = false;
    tick(w, 0.01);
    expect(w.mode).toBe('dead');
    expect(w.buffs.active).toEqual([]);
  });
  it('acquires physical pickups through interaction and retains a full-satchel pickup', () => {
    const w = arena();
    w.pickups.push({
      id: 0,
      room: w.roomId,
      depth: w.floor.depth,
      x: w.player.x,
      y: w.player.y,
      item: 'ash',
    });
    w.input('interact');
    tick(w, 0.01);
    expect(w.inventory.slots.some((i) => i.id === 'ash')).toBe(true);
    expect(w.pickups).toHaveLength(0);
    expect(ITEMS).toHaveLength(10);
  });
});

describe('seeded rewards, encounters and migration', () => {
  it('replays every loot category and keeps ordinary relic density below 40% across 10,000 rolls', () => {
    const a = new LootDirector('DENSITY'),
      b = new LootDirector('DENSITY');
    const counts = Object.fromEntries(Object.keys(LOOT_WEIGHTS).map((k) => [k, 0]));
    for (let i = 0; i < 10000; i++) {
      const roll = a.roll('combat');
      expect(roll).toEqual(b.roll('combat'));
      counts[roll.kind]++;
    }
    expect(Object.values(counts).every((n) => n > 0)).toBe(true);
    expect(counts.relic / 10000).toBeGreaterThan(0.2);
    expect(counts.relic / 10000).toBeLessThan(0.4);
    expect(counts.nothing).toBeGreaterThan(1000);
  });
  it('increases meaningful rewards after droughts, guarantees bosses and limits run pools', () => {
    let protectedCount = 0,
      baseline = 0;
    for (let i = 0; i < 1000; i++) {
      const a = new LootDirector(`PITY-${i}`),
        b = new LootDirector(`PITY-${i}`);
      for (let j = 0; j < 6; j++) a.roll('combat', 'nothing');
      protectedCount += Number(a.roll('combat').kind === 'relic');
      baseline += Number(b.roll('combat').kind === 'relic');
      expect(a.roll('boss').kind).toBe('relic');
      expect(a.pool.length).toBeLessThan(RELICS.length);
      expect(a.choices([], 'boss').every((r) => r.rarity !== 'Faded')).toBe(true);
    }
    expect(protectedCount).toBeGreaterThan(baseline);
  });
  it('does not show the whole relic pool and rolls Sacred offerings less frequently', () => {
    const counts = { Faded: 0, Rare: 0, Sacred: 0 };
    for (let i = 0; i < 1000; i++)
      for (const r of new LootDirector(`RARITY-${i}`).choices([], 'combat')) counts[r.rarity]++;
    expect(counts.Sacred).toBeLessThan(counts.Rare / 3);
  });
  it('generates ranged support in some eligible rooms, with one melee front, valid costs and affinity', () => {
    let ranged = 0,
      pure = 0;
    for (let i = 0; i < 10000; i++) {
      const biome = i % 5,
        depth = 1 + (i % 10);
      const ids = encounter(new Random(`RANGED-${i}`), 'combat', 8, biome, depth);
      const defs = ids.map((id) => ENEMIES.find((e) => e.id === id)!);
      const count = ids.filter((id) => ['archer', 'hexer'].includes(id)).length;
      if (depth === 1) expect(count).toBe(0);
      if (count) {
        ranged++;
        expect(count).toBe(1);
        expect(ids.length).toBeGreaterThan(1);
      } else pure++;
      expect(defs.reduce((n, e) => n + e.cost, 0)).toBeLessThanOrEqual(8);
      expect(defs.every((e) => e.affinity.includes(biome))).toBe(true);
    }
    expect(ranged).toBeGreaterThan(2000);
    expect(pure).toBeGreaterThan(ranged);
  });
  it('ranged enemies retreat at point blank and refuse to shoot through an ally', () => {
    const w = arena();
    const e = w.enemies[0];
    e.x = 620;
    e.readyAt = 0;
    const x = e.x;
    tick(w, 0.2);
    expect(e.x).toBeGreaterThan(x);
    e.x = 750;
    const ally = w.spawnEnemy('warden', 1);
    Object.assign(ally, { x: 625, y: 380, readyAt: 999 });
    w.enemies.push(ally);
    tick(w, 0.2);
    expect(e.state).toBe('idle');
    expect(w.projectiles.active).toHaveLength(0);
  });
  it('resumes shooting after retreating instead of getting stuck between spacing thresholds', () => {
    const w = arena();
    w.enemies[0].x = 620;
    w.enemies[0].readyAt = 0;
    tick(w, 5);
    expect(w.player.hp).toBeLessThan(100);
  });
  it('can fire from a corner when retreat is blocked but a safe firing distance remains', () => {
    const w = arena();
    w.player.x = 820;
    w.enemies[0].x = 1048;
    w.enemies[0].readyAt = 0;
    tick(w, 6);
    expect(w.player.hp).toBeLessThan(100);
  });
  it('migrates accepted v0.3 unlocks and sanitizes corrupted values without persisting run items', () => {
    const save = parseSave(
      JSON.stringify({
        version: 1,
        unlocks: ['twins', 'spear', 'evil'],
        weapons: ['great'],
        settings: { strongOutline: 'true' },
        runs: 4,
      }),
    );
    expect(save.version).toBe(2);
    expect(save.characters).toEqual(['sword', 'twins', 'spear', 'great']);
    expect(save.runs).toBe(4);
    expect(save.settings.strongOutline).toBe(false);
    expect(save.arsenalTutorial).toBe(false);
    expect(parseSave(JSON.stringify(save))).toEqual(save);
    expect(parseSave('{"version":99}')).toEqual(defaultSave());
  });
});
