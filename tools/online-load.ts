import { boot } from '@colyseus/testing';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from '../server/app';
import { CoopRoom } from '../server/rooms/CoopRoom';
import { Input } from '../shared/protocol';
import { makeFloor } from '../src/game/dungeon';

const seconds = Math.max(5, Math.min(120, Number(process.argv[2] ?? 20)));
const test = await boot(createServer(), 2569);
const rooms: CoopRoom[] = [];
const clients = [];
let incoming = 0,
  outgoing = 0;
try {
  for (let i = 0; i < 5; i++) {
    const room = await test.createRoom<CoopRoom>('coop');
    rooms.push(room);
    for (let j = 0; j < 4; j++) {
      const client = await test.connectTo(room, { name: `Load ${i} ${j}` });
      client.onMessage('event', () => undefined);
      client.onMessage('ping', (token) => client.send('pong', token));
      room.state.players.get(client.sessionId)!.weapon = ['shinobi', 'twins', 'spear', 'great'][j];
      room.state.players.get(client.sessionId)!.ready = true;
      clients.push(client);
      const send = client.connection.send.bind(client.connection);
      client.connection.send = (data) => {
        outgoing += data.byteLength;
        send(data);
      };
      const ws = (client.connection.transport as unknown as { ws: WebSocket }).ws;
      ws.addEventListener('message', (event: MessageEvent) => {
        incoming += event.data instanceof Blob ? event.data.size : (event.data.byteLength ?? 0);
      });
    }
    clients[i * 4].send('start');
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (room.game) {
          clearInterval(timer);
          resolve();
        }
      }, 10);
    });
    const game = room.game!;
    for (const w of game.worlds) w.floor = makeFloor(game.seed, 3);
    game.enter(game.primary.floor.rooms.find((r) => r.kind === 'boss')!.id);
    const first = game.primary;
    while (first.enemies.length < 8)
      first.enemies.push(first.spawnEnemy(first.enemies.length % 2 ? 'archer' : 'duelist'));
    for (const w of game.worlds) {
      w.enemies = first.enemies;
      w.invincible = true;
    }
  }
  const handles = clients.map((c) => c.input<Input>({ type: Input }));
  let sequence = 0;
  const timer = setInterval(() => {
    sequence++;
    for (const [i, handle] of handles.entries()) {
      Object.assign(handle.data, {
        sequence,
        moveX: Math.sin(sequence / 30 + i),
        moveY: Math.cos(sequence / 30 + i),
        aimX: 735,
        aimY: 380,
        attack: sequence % 20 === 0,
        parry: sequence % 22 === 0,
        ranged: sequence % 60 === 0,
        time: rooms[Math.floor(i / 4)].game?.time ?? 0,
      });
      handle.send();
    }
  }, 1000 / 30);
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const cpu = process.cpuUsage(),
    started = performance.now(),
    ticks = rooms.map((r) => r.state.tick ?? 0);
  incoming = 0;
  outgoing = 0;
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  clearInterval(timer);
  loop.disable();
  const elapsed = (performance.now() - started) / 1000,
    used = process.cpuUsage(cpu);
  const result = {
    scenario:
      '5 rooms × 4 players × 8 enemies including Saint, ranged enemies and player projectiles',
    seconds: elapsed,
    tickRates: rooms.map((r, i) => (r.state.tick - ticks[i]) / elapsed),
    cpuOneCorePercent: ((used.user + used.system) / (elapsed * 1000000)) * 100,
    rssMiB: process.memoryUsage().rss / 1048576,
    heapMiB: process.memoryUsage().heapUsed / 1048576,
    eventLoopP95Ms: loop.percentile(95) / 1000000,
    eventLoopMaxMs: loop.max / 1000000,
    downstreamBytesPerClientSecond: incoming / clients.length / elapsed,
    upstreamBytesPerClientSecond: outgoing / clients.length / elapsed,
    notes:
      'Combined server and 20 SDK clients in one Node process. WebSocket payload bytes; excludes framing/TLS. Invincible clients keep workload active. Local hardware, not Render measurement.',
  };
  await mkdir('docs/metrics', { recursive: true });
  await writeFile('docs/metrics/v07-load.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await test.cleanup();
  await test.shutdown();
}
