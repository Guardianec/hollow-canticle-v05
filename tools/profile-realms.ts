import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { Session } from '../shared/session';
import { makeFloor } from '../src/game/dungeon';

const scenarios = [
  { name: 'Ruins ordinary', biome: 0, players: 1, boss: false, zones: 0 },
  { name: 'Fungal mixed room', biome: 2, players: 1, boss: false, zones: 2 },
  { name: 'Frozen blizzard (simulation unaffected)', biome: 3, players: 1, boss: false, zones: 2 },
  { name: 'Foundry pressure', biome: 4, players: 2, boss: false, zones: 3 },
  { name: 'Solo guardian', biome: 0, players: 1, boss: true, zones: 2 },
  { name: 'Four-player guardian', biome: 4, players: 4, boss: true, zones: 5 },
  { name: 'Four-player multiple areas', biome: 2, players: 4, boss: false, zones: 5 },
  {
    name: 'Extreme guardian (cosmetics remain client-local)',
    biome: 3,
    players: 4,
    boss: true,
    zones: 5,
  },
];
const percentile = (a: number[], p: number) =>
  [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const result = [];
for (const scenario of scenarios) {
  const session = new Session('coop', 'PROFILE-' + scenario.name);
  for (let i = 0; i < scenario.players; i++)
    session.add(String(i), 'Profile ' + i, ['sword', 'twins', 'spear', 'shinobi'][i]);
  session.start();
  for (const w of session.worlds) w.floor = makeFloor(session.seed, scenario.biome + 1);
  session.enter(
    session.primary.floor.rooms.find((r) => r.kind === (scenario.boss ? 'boss' : 'combat'))!.id,
  );
  for (const w of session.worlds) {
    w.invincible = true;
    w.save.settings.detail = 'extreme';
  }
  const primary = session.primary;
  let aiMs = 0,
    areasMs = 0,
    updates = 0;
  for (const w of session.worlds) {
    const update = w.updateEnemy.bind(w);
    w.updateEnemy = (e, dt) => {
      const at = performance.now();
      update(e, dt);
      aiMs += performance.now() - at;
      updates++;
    };
  }
  const areaStep = primary.areas.update.bind(primary.areas);
  primary.areas.update = (t, targets) => {
    const at = performance.now();
    areaStep(t, targets);
    areasMs += performance.now() - at;
  };
  const times: number[] = [];
  const before = process.memoryUsage();
  for (let i = 0; i < 1800; i++) {
    if (i % 150 === 0)
      for (let a = 0; a < scenario.zones; a++)
        primary.areas.spawn(scenario.biome, -a, 480 + a * 35, 380, session.time, scenario.players);
    if (i === 120 && scenario.boss) primary.enemies[0].hp = primary.enemies[0].maxHp * 0.47;
    const at = performance.now();
    session.step(1 / 30);
    times.push(performance.now() - at);
    // Offline authorities never retain per-particle presentation logs between server patches.
    session.events.length = 0;
    for (const w of session.worlds) {
      w.effects.length = 0;
      w.particles.length = 0;
    }
  }
  const after = process.memoryUsage();
  result.push({
    ...scenario,
    ticks: times.length,
    simulatedSeconds: 60,
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
    p50Ms: percentile(times, 0.5),
    p95Ms: percentile(times, 0.95),
    maxMs: Math.max(...times),
    aiTotalMs: aiMs,
    aiUpdates: updates,
    areasTotalMs: areasMs,
    heapBeforeMiB: before.heapUsed / 1048576,
    heapAfterMiB: after.heapUsed / 1048576,
    rssMiB: after.rss / 1048576,
  });
}
const report = {
  date: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  notes:
    'Synthetic authority simulation, 30 Hz, 60 seconds per scenario. No renderer; these are CPU tick timings, not FPS. All players invincible to keep pressure active.',
  scenarios: result,
};
writeFileSync('docs/metrics/v08-simulation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
