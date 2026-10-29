import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AreaEffects,
  AREA_KINDS,
  AREA_RULES,
  areaContains,
  areaPhase,
  areaCap,
} from '../src/game/areas';
import { ENEMIES, WEAPONS } from '../src/game/data';
import { makeFloor, reachable } from '../src/game/dungeon';
import { GUARDIANS, guardianFor, depthScaling } from '../src/game/realms';
import { GRAPHICS_LEVELS } from '../src/game/graphics';
import { WEATHER_QUALITY, weatherBudget, weatherIntensity } from '../src/game/atmosphere';
import { defaultSave, parseSave } from '../src/game/save';
import { World } from '../src/game/world';
import { Session } from '../shared/session';
import { scaling } from '../shared/scaling';
import { ThreatDirector } from '../src/game/threat';
import { AreaArt } from '../src/game/presentation/areas';
import { RegionalAtmosphere } from '../src/game/presentation/regional-atmosphere';

beforeEach(() => {
  vi.stubGlobal('location', { search: '?debug' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
function lab(biome = 0, enemy = 'boss', weapon = 'sword') {
  const w = new World(defaultSave());
  w.start('FIVE-REALMS', weapon);
  w.configureLab({ enemy, support: 'same', count: 1, elite: 'none', depth: 1, biome, pattern: -1 });
  w.player.immunity = 0;
  w.time = 4;
  w.player.parryAt = w.player.dodgeAt = -99;
  return w;
}

describe('Trials of the Five Realms', () => {
  it('reuses hazard/weather resources, changes region and quality, and clears visuals on transitions', () => {
    const w = lab(0),
      art = new AreaArt(),
      weather = new RegionalAtmosphere();
    const objects = [...art.root.children, ...weather.root.children];
    for (let biome = 0; biome < 5; biome++) {
      w.floor = { ...w.floor, biome };
      w.areas.clear();
      w.spawnArea();
      art.update(w);
      weather.update(w);
      expect(art.root.children.some((o) => o.visible)).toBe(true);
      for (const detail of GRAPHICS_LEVELS) {
        w.save.settings.detail = detail;
        weather.update(w);
        expect(weather.particleCount).toBeGreaterThan(0);
      }
    }
    expect([...art.root.children, ...weather.root.children]).toEqual(objects);
    w.areas.clear();
    art.update(w);
    expect(art.root.children.every((o) => !o.visible)).toBe(true);
    art.dispose();
    weather.dispose();
    expect(art.root.children).toHaveLength(0);
    expect(weather.root.children).toHaveLength(0);
  });
  it('gives the full roster and all guardians more vitality than guard', () => {
    for (const e of [...ENEMIES, ...GUARDIANS]) expect(e.hp, e.name).toBeGreaterThan(e.posture);
    for (let biome = 0; biome < 5; biome++)
      for (const count of [1, 2, 3, 4]) {
        const w = lab(biome);
        const e = w.enemies[0],
          scale = scaling(count);
        expect(e.maxHp * scale.bossHp).toBeGreaterThan(e.maxPosture * scale.bossPosture);
      }
    expect(depthScaling(10000)).toBeLessThanOrEqual(1.32);
    expect(WEAPONS.find((w) => w.id === 'shinobi')!.damage).toBe(9);
  });
  it('puts one reachable realm guardian before a sealed descent on 10,000 floors', () => {
    for (let i = 0; i < 10000; i++) {
      const floor = makeFloor('REALM-' + i, 1 + (i % 300)),
        boss = floor.rooms.filter((r) => r.kind === 'boss'),
        exit = floor.rooms.find((r) => r.kind === 'exit')!;
      expect(boss).toHaveLength(1);
      expect(boss[0].id).not.toBe(0);
      expect(boss[0].enemies).toEqual(['boss']);
      expect(reachable(floor).size).toBe(floor.rooms.length);
      expect(guardianFor(floor.biome).key).toBe(GUARDIANS[floor.biome].key);
      const visited = new Set([0]),
        queue = [0];
      for (let j = 0; j < queue.length; j++)
        for (const link of floor.rooms[queue[j]].links)
          if (link !== boss[0].id && !visited.has(link)) {
            visited.add(link);
            queue.push(link);
          }
      expect(visited.has(exit.id)).toBe(false);
    }
  }, 60000);
  it('prevents descent even if a debug/invalid route reaches an uncleared exit', () => {
    const w = lab();
    w.floor = makeFloor(w.seed, 1);
    w.enterRoom(w.floor.rooms.find((r) => r.kind === 'exit')!.id);
    w.player.x = 560;
    w.player.y = 365;
    w.input('interact');
    w.update(0.01);
    expect(w.floor.depth).toBe(1);
    w.floor.rooms.find((r) => r.kind === 'boss')!.cleared = true;
    w.player.state = 'idle';
    w.input('interact');
    w.update(0.01);
    expect(w.floor.depth).toBe(2);
  });
  it('maps five identities to different attacks, silhouettes and phase mechanics', () => {
    expect(new Set(GUARDIANS.map((g) => g.key)).size).toBe(5);
    expect(new Set(GUARDIANS.map((g) => JSON.stringify(g.patterns))).size).toBe(5);
    for (const g of GUARDIANS) {
      expect(g.phaseTwo).not.toEqual(g.patterns);
      expect(g.patterns.flat().some((s) => s.area)).toBe(true);
      for (const s of [...g.patterns.flat(), ...g.phaseTwo.flat()])
        expect(s.windup).toBeGreaterThanOrEqual(0.5);
    }
  });
  it.each(AREA_KINDS)('%s has a warning, authoritative ticks, fading and expiry', (kind) => {
    const areas = new AreaEffects(),
      biome = AREA_KINDS.indexOf(kind),
      rule = AREA_RULES[kind];
    const a = areas.spawn(biome, 1, 100, 100, 0)!;
    let hits = 0;
    const targets = [{ id: 0, x: 100, y: 100, team: 'player', alive: true, hit: () => hits++ }];
    expect(areaPhase(a, 0)).toBe('telegraph');
    areas.update(a.armAt - 0.01, targets);
    expect(hits).toBe(0);
    areas.update(a.armAt, targets);
    expect(hits).toBe(1);
    areas.update(a.armAt, targets);
    expect(hits).toBe(1);
    targets[0].x = 1000;
    areas.update(a.armAt + rule.tick, targets);
    expect(hits).toBe(1);
    targets[0].x = 100;
    areas.update(a.armAt, targets);
    expect(hits).toBe(1);
    expect(areaPhase(a, a.expireAt)).toBe('fading');
    areas.update(a.expireAt, targets);
    expect(hits).toBe(1);
    areas.update(a.expireAt + 0.66, targets);
    expect(areas.active).toHaveLength(0);
  });
  it('makes resonance an expanding annulus rather than a recolored damage pool', () => {
    const a = new AreaEffects().spawn(1, 1, 0, 0, 0)!;
    const at = a.armAt + (a.expireAt - a.armAt) * 0.75;
    expect(areaContains(a, 0, 0, at)).toBe(false);
    expect(areaContains(a, a.radius * 0.75, 0, at)).toBe(true);
  });
  it('limits zones independently at each party size and reduces threats inside a zone', () => {
    for (const count of [1, 2, 3, 4]) {
      const areas = new AreaEffects();
      for (let i = 0; i < 20; i++) areas.spawn(0, i, 0, 0, 0, count);
      expect(areas.active).toHaveLength(areaCap(count));
    }
    const director = new ThreatDirector();
    director.zoneTargets.add(0);
    const s = { kind: 'slash' as const, damage: 10, windup: 1, recovery: 0.5, reach: 100 };
    expect(director.reserve(1, 0, s, 1, 0, 0)).toBe(true);
    expect(director.reserve(2, 0, { ...s, windup: 2 }, 1, 0, 0)).toBe(false);
  });
  it.each([2, 3, 4])(
    'ticks %i co-op players once and revives fallen allies at exactly 20 HP on boss clear',
    (count) => {
      const s = new Session('coop', 'REALMS-COOP');
      for (let i = 0; i < count; i++) s.add('p' + i, 'Pilgrim ' + i, 'shinobi');
      s.start();
      s.enter(s.primary.floor.rooms.find((r) => r.kind === 'boss')!.id);
      const w = s.primary;
      for (const member of s.members.values()) {
        member.world.player.x = 560;
        member.world.player.y = 400;
        member.world.player.immunity = 0;
        member.world.player.dodgeAt = -99;
      }
      const a = w.areas.spawn(0, 0, 560, 400, s.time, count)!;
      for (const member of s.members.values()) member.world.time = a.armAt;
      w.stepAreas();
      const hp = s.worlds.map((w) => w.player.hp);
      expect(hp.every((h) => h === 94)).toBe(true);
      w.stepAreas();
      expect(s.worlds.map((w) => w.player.hp)).toEqual(hp);
      s.worlds[1].player.x = 900;
      s.worlds[1].player.immunity = 0;
      for (const world of s.worlds) world.time = a.armAt + a.tickRate;
      w.stepAreas();
      expect(s.worlds[1].player.hp).toBe(94);
      s.worlds[1].player.hp = 0;
      for (const e of w.enemies) e.state = 'dead';
      s.step(1 / 30);
      expect(s.worlds[1].player.hp).toBe(20);
      expect(w.room.cleared).toBe(true);
      expect(w.areas.active).toHaveLength(0);
    },
  );
  it('leaves a wiped boss uncleared and keeps Duel free of gameplay areas', () => {
    const s = new Session('coop', 'WIPE');
    s.add('1', 'One', 'sword');
    s.add('2', 'Two', 'sword');
    s.start();
    s.enter(s.primary.floor.rooms.find((r) => r.kind === 'boss')!.id);
    for (const w of s.worlds) w.player.hp = 0;
    s.step(0.03);
    expect(s.ended).toBe(true);
    expect(s.primary.room.cleared).toBe(false);
    const duel = new Session('duel', 'DUEL');
    duel.add('1', 'One', 'sword');
    duel.add('2', 'Two', 'shinobi');
    duel.start();
    expect(duel.primary.spawnArea()).toBeUndefined();
  });
  it('expires poison/frost and preserves dodge immunity', () => {
    const w = lab(2),
      a = w.areas.spawn(2, 0, w.player.x, w.player.y, w.time)!;
    w.time = a.armAt;
    w.stepAreas();
    expect(w.player.poisonUntil).toBeGreaterThan(w.time);
    const hp = w.player.hp;
    w.time = a.expireAt + 2;
    w.stepAreas();
    expect(w.player.poisonUntil).toBeLessThan(w.time);
    expect(w.player.hp).toBe(hp);
    const frost = w.areas.spawn(3, 0, w.player.x, w.player.y, w.time)!;
    w.time = frost.armAt;
    w.player.immunity = 0;
    w.stepAreas();
    expect(w.player.frostUntil).toBeGreaterThan(w.time);
    w.time += frost.tickRate;
    w.player.dodgeAt = w.time;
    w.player.immunity = 0;
    const before = w.player.hp;
    w.stepAreas();
    expect(w.player.hp).toBe(before);
  });
  it('applies hazard posture once, breaks full guard and respects ward protection', () => {
    const w = lab(1);
    const a = w.spawnArea()!;
    w.time = a.armAt;
    w.player.posture = 20;
    w.stepAreas();
    expect(w.player.posture).toBe(44);
    expect(w.player.state).toBe('hurt');
    w.player.immunity = 0;
    w.player.posture = 85;
    w.time += a.tickRate;
    w.player.x = a.x + (a.radius * (w.time - a.armAt)) / (a.expireAt - a.armAt);
    w.stepAreas();
    expect(w.player.state).toBe('stagger');
    expect(w.player.posture).toBe(0);
    w.player.immunity = 0;
    w.player.posture = 20;
    w.buffs.add('ward', w.time, 'test');
    w.time += a.tickRate;
    w.player.x = a.x + (a.radius * (w.time - a.armAt)) / (a.expireAt - a.armAt);
    const hp = w.player.hp;
    w.stepAreas();
    expect(w.player.hp).toBe(hp);
    expect(w.player.posture).toBe(20);
  });
  it('physically commits a heal punish with a readable windup', () => {
    const w = lab(0, 'duelist'),
      e = w.enemies[0];
    w.player.x = 560;
    w.player.y = 400;
    e.x = 730;
    e.y = 400;
    e.readyAt = 0;
    w.player.state = 'item';
    w.player.stateAt = w.time;
    e.areaReady = 99;
    w.updateEnemy(e, 0.03);
    expect(e.state).toBe('tell');
    expect(e.strike.kind).toBe('thrust');
    expect(e.strike.windup).toBeGreaterThanOrEqual(0.6);
    expect(e.x).toBe(730);
    w.time += e.strike.windup;
    w.updateEnemy(e, 0.03);
    expect(e.x).toBeLessThan(730);
  });
  it('retains regional weather/shafts at every preset, and drops weather first under combat pressure', () => {
    for (const level of GRAPHICS_LEVELS) {
      expect(WEATHER_QUALITY[level].particles).toBeGreaterThan(0);
      expect(WEATHER_QUALITY[level].shafts).toBeGreaterThan(0);
      expect(weatherBudget(level, 1, 4)).toBeLessThan(weatherBudget(level, 1, 0));
    }
    expect(
      WEATHER_QUALITY.extreme.particles / WEATHER_QUALITY['very-low'].particles,
    ).toBeGreaterThan(50);
    expect(Math.abs(weatherIntensity(100, 3) - weatherIntensity(100.1, 3))).toBeLessThan(0.02);
  });
  it('loads v0.7 saves without resetting Chronicle, Shinobi, tutorials or quality', () => {
    const save = defaultSave();
    save.embers = 37;
    save.characters.push('shinobi');
    save.tutorial = true;
    save.arsenalTutorial = true;
    save.settings.detail = 'extreme';
    save.bestDepth = 16;
    save.runs = 20;
    save.unlocks.push('shinobi');
    const loaded = parseSave(JSON.stringify(save));
    expect(loaded).toEqual(save);
  });
});
