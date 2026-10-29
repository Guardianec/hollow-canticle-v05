import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { createServer } from '../../server/app';
import { CoopRoom } from '../../server/rooms/CoopRoom';
import { DuelRoom } from '../../server/rooms/DuelRoom';
import type { Room as SDKRoom } from '@colyseus/sdk';
import type { SessionState } from '../../shared/protocol';
import { OnlineConnection } from '../../src/net/connection';
import { World } from '../../src/game/world';
import { defaultSave } from '../../src/game/save';
import { makeFloor } from '../../src/game/dungeon';

let server: ColyseusTestServer;
const waitFor = async (predicate: () => boolean, ms = 3000) => {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > ms) throw new Error('Timed out waiting for network state');
    await new Promise((r) => setTimeout(r, 20));
  }
};
beforeAll(async () => {
  server = await boot(createServer(), 2568);
}, 15000);
afterEach(async () => {
  await server.cleanup();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await server.shutdown();
});
describe('Colyseus friend rooms over WebSocket', () => {
  it('rejects a pre-v0.8 client before it can join or mutate a room', async () => {
    const room = await server.createRoom<CoopRoom>('coop');
    await expect(server.connectTo(room, { name: 'Old pilgrim' })).rejects.toThrow(
      'MULTIPLAYER CLIENT UPDATE REQUIRED',
    );
    expect(room.state.players.size).toBe(0);
  });
  it('replicates semantic spore areas and statuses to both clients with server-owned hits', async () => {
    const room = await server.createRoom<CoopRoom>('coop');
    const clients = await Promise.all([
      server.connectTo(room, { protocol: 8, name: 'One' }),
      server.connectTo(room, { protocol: 8, name: 'Two' }),
    ]);
    for (const client of clients) {
      client.onMessage('event', () => undefined);
      client.onMessage('ping', (token) => client.send('pong', token));
      client.send('ready', true);
    }
    await waitFor(() => [...room.state.players.values()].every((p) => p.ready));
    clients[0].send('start');
    await waitFor(() => Boolean(room.game));
    const game = room.game!;
    for (const world of game.worlds) world.floor = makeFloor(game.seed, 3);
    game.enter(game.primary.floor.rooms.find((r) => r.kind === 'boss')!.id);
    for (const enemy of game.primary.enemies) enemy.readyAt = 999;
    for (const world of game.worlds)
      Object.assign(world.player, { x: 535, y: 400, hp: 100, immunity: 0, dodgeAt: -99 });
    const area = game.primary.areas.spawn(2, 0, 535, 400, game.time, 2)!;
    await waitFor(() => clients.every((c) => c.state.areas?.has(String(area.id))));
    for (const client of clients) {
      const replica = client.state.areas.get(String(area.id))!;
      expect(replica.kind).toBe('spores');
      expect(replica.x).toBeCloseTo(535);
      expect(replica.armAt).toBeCloseTo(area.armAt);
    }
    await waitFor(
      () =>
        clients.every((c) => [...c.state.players.values()].every((p) => p.poisonUntil > game.time)),
      5000,
    );
    expect(game.worlds.map((w) => w.player.hp)).toEqual([96, 96]);
    game.worlds[1].player.x = 900;
    area.expireAt = game.time + 0.05;
    await waitFor(() => clients.every((c) => c.state.areas.size === 0), 3000);
    expect(game.worlds.map((w) => w.player.hp)).toEqual([96, 96]);
  }, 15000);
  it('finishes intentional departure when the leave acknowledgement stalls, without reserving a seat', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const online = new OnlineConnection(new World(defaultSave()), 'ws://127.0.0.1:2568');
    await online.create('coop', 'Departing');
    const departing = online.room!;
    const observer = await online.client.joinById(departing.roomId, {
      protocol: 8,
      name: 'Remaining',
    });
    observer.onMessage('ping', (token) => observer.send('pong', token));
    await waitFor(() => observer.state.players?.size === 2);
    vi.spyOn(departing, 'leave').mockImplementation(() => new Promise(() => undefined));
    await online.leave();
    await waitFor(() => observer.state.players.size === 1);
    expect(departing.reconnection.enabled).toBe(false);
    expect(online.room).toBeUndefined();
    expect(online.lost).toBe(false);
    expect(online.world.mode).toBe('menu');
    expect(storage.has('hollow-canticle:reconnect')).toBe(false);
  });
  it('serves health, rejects foreign HTTP origins, and disposes abandoned rooms', async () => {
    const response = await fetch('http://127.0.0.1:2568/healthz');
    expect(await response.json()).toMatchObject({ ok: true, protocol: 8 });
    expect(
      (
        await fetch('http://127.0.0.1:2568/healthz', {
          headers: { Origin: 'https://untrusted.invalid' },
        })
      ).status,
    ).toBe(403);
    const room = await server.createRoom<CoopRoom>('coop');
    const client = await server.connectTo(room, { protocol: 8, name: 'Artem' });
    let disposed = false;
    const original = room.onDispose.bind(room);
    room.onDispose = () => {
      disposed = true;
      original();
    };
    await client.leave();
    await waitFor(() => disposed);
  });
  it('supports four clients, duplicate classes, host-ready start, patches, no late joins', async () => {
    const room = await server.createRoom<CoopRoom>('coop');
    expect(room.roomId).toMatch(/^[2-9A-HJKMNP-Z]{5}$/);
    const clients: SDKRoom<SessionState, SessionState>[] = [];
    for (let i = 0; i < 4; i++) {
      const client = await server.connectTo(room, { protocol: 8, name: `Pilgrim ${i}` });
      client.onMessage('ping', (token) => client.send('pong', token));
      client.onMessage('event', () => undefined);
      clients.push(client);
    }
    await expect(server.connectTo(room, { protocol: 8, name: 'Fifth' })).rejects.toThrow();
    const originalSeed = room.state.seed;
    clients[1].send('seed', 'OTHER-PLAYER');
    await new Promise((r) => setTimeout(r, 60));
    expect(room.state.seed).toBe(originalSeed);
    clients[0].send('seed', '  mixed seed  ');
    await waitFor(() => room.state.seed === 'mixed seed');
    clients[0].send('seed', '種');
    await new Promise((r) => setTimeout(r, 60));
    expect(room.state.seed).toBe('mixed seed');
    clients[0].send('start');
    await new Promise((r) => setTimeout(r, 60));
    expect(room.state.phase).toBe('lobby');
    for (const client of clients) client.send('ready', true);
    await waitFor(() => [...room.state.players.values()].every((p) => p.ready));
    clients[0].send('start');
    await waitFor(() => room.state.phase === 'playing');
    await waitFor(() => clients[1].state.phase === 'playing');
    expect(clients[1].state.code).toBe(room.roomId);
    expect(room.game?.members.size).toBe(4);
    expect(room.game?.primary.seed).toBe(room.state.seed);
    clients[0].send('select', 'great');
    await new Promise((r) => setTimeout(r, 60));
    expect(room.state.players.get(clients[0].sessionId)!.weapon).toBe('sword');
    await clients[3].leave();
    await waitFor(() => room.state.players.size === 3);
    await expect(server.connectTo(room, { protocol: 8, name: 'Late' })).rejects.toThrow();
  });
  it('reserves a dropped seat and automatically reconnects the same session', async () => {
    const room = await server.createRoom<CoopRoom>('coop');
    const client = await server.connectTo(room, { protocol: 8, name: 'Oleh' });
    client.reconnection.minUptime = 0;
    client.onMessage('ping', (token) => client.send('pong', token));
    let returned = false;
    client.onReconnect(() => {
      returned = true;
    });
    client.connection.close();
    await waitFor(() => returned, 12000);
    expect(room.state.players.get(client.sessionId)?.connected).toBe(true);
    expect(room.state.players.size).toBe(1);
  }, 15000);
  it('runs normalized two-player countdown, first-to-three, reset and mutual rematch', async () => {
    const room = await server.createRoom<DuelRoom>('duel');
    const a = await server.connectTo(room, { protocol: 8, name: 'Artem' }),
      b = await server.connectTo(room, { protocol: 8, name: 'Oleh' });
    for (const c of [a, b]) {
      c.onMessage('event', () => undefined);
      c.onMessage('ping', (token) => c.send('pong', token));
    }
    await expect(server.connectTo(room, { protocol: 8, name: 'Third' })).rejects.toThrow();
    a.send('select', 'spear');
    b.send('select', 'great');
    await waitFor(() => room.state.players.get(a.sessionId)?.weapon === 'spear');
    a.send('ready', true);
    b.send('ready', true);
    await waitFor(() => [...room.state.players.values()].every((p) => p.ready));
    a.send('start');
    await waitFor(() => room.state.phase === 'countdown');
    expect(room.acceptsInput()).toBe(false);
    for (let round = 0; round < 3; round++) {
      room.state.countdown = 0;
      room.advance(1 / 30);
      expect(room.state.phase).toBe('round');
      const loser = room.game!.members.get(b.sessionId)!;
      loser.world.player.hp = 0;
      for (let i = 0; i < 10; i++) room.advance(1 / 30);
      expect(room.game!.members.get(a.sessionId)!.score).toBe(round + 1);
      if (round < 2) {
        room.state.countdown = 0;
        room.advance(1 / 30);
        expect(loser.world.player.hp).toBe(100);
      }
    }
    expect(room.state.phase).toBe('matchEnd');
    expect(room.state.winner).toBe(a.sessionId);
    a.send('rematch');
    await new Promise((r) => setTimeout(r, 60));
    expect(room.state.phase).toBe('matchEnd');
    b.send('rematch');
    await waitFor(() => room.state.phase === 'lobby');
  });
  it('expires a reserved seat, transfers host and continues the run with the survivor', async () => {
    const room = await server.createRoom<CoopRoom>('coop');
    const a = await server.connectTo(room, { protocol: 8, name: 'Leaving' }),
      b = await server.connectTo(room, { protocol: 8, name: 'Staying' });
    for (const c of [a, b]) {
      c.onMessage('event', () => undefined);
      c.onMessage('ping', (token) => c.send('pong', token));
      c.send('ready', true);
    }
    await waitFor(() => [...room.state.players.values()].every((p) => p.ready));
    a.send('start');
    await waitFor(() => room.state.phase === 'playing');
    const reserve = room.allowReconnection.bind(room);
    vi.spyOn(room, 'allowReconnection').mockImplementation((client) => reserve(client, 0.1));
    a.reconnection.enabled = false;
    a.connection.close();
    await waitFor(() => room.state.players.size === 1);
    expect(room.state.host).toBe(b.sessionId);
    expect(room.state.phase).toBe('playing');
    expect(room.game!.members.size).toBe(1);
  });
  it.each([0, 50, 100, 150, 200])(
    'sequences authoritative inputs and state patches at %i ms simulated RTT',
    async (latency) => {
      server.server.simulateLatency(latency);
      try {
        const room = await server.createRoom<CoopRoom>('coop');
        const a = await server.connectTo(room, { protocol: 8, name: 'Latency A' }),
          b = await server.connectTo(room, { protocol: 8, name: 'Latency B' });
        for (const c of [a, b]) {
          c.onMessage('event', () => undefined);
          c.onMessage('ping', (token) => c.send('pong', token));
          c.send('ready', true);
        }
        await waitFor(() => [...room.state.players.values()].every((p) => p.ready));
        a.send('start');
        await waitFor(() => room.state.phase === 'playing');
        const { Input } = await import('../../shared/protocol');
        const handle = a.input<InstanceType<typeof Input>>({ type: Input });
        Object.assign(handle.data, {
          sequence: 1,
          moveX: 1,
          aimX: 800,
          aimY: 430,
          time: room.game!.time,
        });
        const start = room.game!.members.get(a.sessionId)!.world.player.x;
        handle.send();
        await waitFor(() => room.state.players.get(a.sessionId)!.ack === 1);
        await waitFor(() => a.state.players.get(a.sessionId)?.ack === 1);
        expect(room.game!.members.get(a.sessionId)!.world.player.x).toBeGreaterThan(start);
      } finally {
        server.server.simulateLatency(0);
      }
    },
  );
  it('selects Shinobi and replicates authoritative riposte eligibility to four clients', async () => {
    const room = await server.createRoom<CoopRoom>('coop');
    const clients: SDKRoom<SessionState>[] = [];
    for (let i = 0; i < 4; i++) {
      const client = await server.connectTo(room, { protocol: 8, name: `Living ${i}` });
      client.onMessage('ping', (token) => client.send('pong', token));
      client.onMessage('event', () => undefined);
      clients.push(client);
    }
    clients[0].send('select', 'shinobi');
    await waitFor(() => room.state.players.get(clients[0].sessionId)?.weapon === 'shinobi');
    for (const client of clients) client.send('ready', true);
    await waitFor(() => [...room.state.players.values()].every((player) => player.ready));
    clients[0].send('start');
    await waitFor(() => Boolean(room.game));
    const game = room.game!;
    game.enter(game.primary.floor.rooms.find((room) => room.kind === 'combat')!.id);
    const member = game.members.get(clients[0].sessionId)!,
      world = member.world,
      enemy = world.enemies[0];
    Object.assign(enemy, {
      x: world.player.x + 80,
      y: world.player.y,
      hp: 100,
      maxPosture: 1000,
      readyAt: Infinity,
    });
    world.offerRiposte(enemy, true);
    await waitFor(() =>
      clients.every(
        (client) => client.state.players.get(clients[0].sessionId)?.ripostePerfect === true,
      ),
    );
    for (const client of clients) {
      const player = client.state.players.get(clients[0].sessionId)!;
      expect(player.riposteTarget).toBe(enemy.id);
      expect(player.riposteUntil).toBeGreaterThan(0);
      expect(player.weapon).toBe('shinobi');
    }
  }, 12000);
});
