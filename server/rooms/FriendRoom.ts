import { Room, type Client } from 'colyseus';
import { randomInt, randomBytes } from 'node:crypto';
import { ArraySchema } from '@colyseus/schema';
import { CHARACTERS } from '../../src/game/characters';
import {
  Input,
  SessionState,
  PlayerState,
  EnemyState,
  StrikeState,
  ShotState,
  PickupState,
  BuffState,
  COLORS,
  displayName,
  PATCH_MS,
  RECONNECT_SECONDS,
  TICK_RATE,
  type OnlineMode,
} from '../../shared/protocol';
import { Session } from '../../shared/session';
import { normalizeSeed } from '../../src/game/random';

const codes = new Set<string>();
const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function reserveCode(): string {
  if (codes.size >= 64) throw new Error('The free server is at room capacity. Please try later.');
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('');
    if (!codes.has(code)) {
      codes.add(code);
      return code;
    }
  }
  throw new Error('Rooms are busy. Try again.');
}
const fields = [
  'x',
  'y',
  'facing',
  'hp',
  'posture',
  'focus',
  'state',
  'stateAt',
  'parryAt',
  'dodgeAt',
  'dodgeReady',
  'immunity',
  'counterUntil',
  'riposteUntil',
  'riposteTarget',
  'ripostePerfect',
  'attackHit',
  'dx',
  'dy',
  'combo',
  'counter',
  'attackStartup',
  'attackRecovery',
  'emptyParries',
  'parryLanded',
  'finisherTarget',
  'finisherVariant',
  'attackType',
  'comboUntil',
  'rangedCharges',
  'recharge',
] as const;
export function syncArray<T>(target: ArraySchema<T>, values: T[]): void {
  if (target.length !== values.length || values.some((value, i) => value !== target[i]))
    target.splice(0, target.length, ...values);
}
export abstract class FriendRoom extends Room<{ state: SessionState; input: Input }> {
  state = new SessionState();
  maxMessagesPerSecond = 90;
  patchRate = PATCH_MS;
  game?: Session;
  abstract readonly mode: OnlineMode;
  private probes = new Map<string, { token: string; at: number }>();
  private lastInput = new Map<string, number>();
  inputs = this.defineInput(Input, {
    bufferMaxSize: 8,
    seqField: 'sequence',
    sanitize: { moveX: [-1, 1], moveY: [-1, 1], aimX: [0, 1120], aimY: [0, 760], cycle: [-1, 1] },
  });
  commonMessages = {
    select: (client: Client, value: unknown) => {
      if (
        this.state.phase !== 'lobby' ||
        typeof value !== 'string' ||
        !CHARACTERS.some((c) => c.id === value)
      )
        return;
      const player = this.state.players.get(client.sessionId)!;
      player.weapon = value;
      player.ready = false;
    },
    ready: (client: Client, value: unknown) => {
      if (this.state.phase === 'lobby' && typeof value === 'boolean')
        this.state.players.get(client.sessionId)!.ready = value;
    },
    seed: (client: Client, value: unknown) => {
      if (
        this.state.phase === 'lobby' &&
        client.sessionId === this.state.host &&
        typeof value === 'string' &&
        /^[a-zA-Z0-9 _-]{1,40}$/.test(value)
      )
        this.state.seed = normalizeSeed(value);
    },
    start: (client: Client) => {
      if (client.sessionId !== this.state.host || this.state.phase !== 'lobby') return;
      const players = [...this.state.players.values()];
      if (players.length < 2 || players.some((p) => !p.connected || !p.ready)) return;
      this.lock();
      this.game = new Session(this.mode, this.state.seed);
      for (const [id, p] of this.state.players) this.game.add(id, p.name, p.weapon);
      this.game.start();
      this.begin();
      this.sync();
    },
    relic: (client: Client, value: unknown) => {
      if (this.mode === 'coop' && typeof value === 'string' && value.length < 60)
        this.game?.choose(client.sessionId, value);
    },
    pong: (client: Client, token: unknown) => {
      const probe = this.probes.get(client.sessionId);
      if (!probe || token !== probe.token) return;
      const ping = Math.min(2000, Math.round(performance.now() - probe.at));
      this.state.players.get(client.sessionId)!.ping = ping;
      const member = this.game?.members.get(client.sessionId);
      if (member) member.ping = ping;
      this.probes.delete(client.sessionId);
    },
  };
  messages = this.commonMessages;
  onCreate(): void {
    this.roomId = reserveCode();
    this.state.code = this.roomId;
    this.state.mode = this.mode;
    this.state.seed = `CANDLE-${randomBytes(4).toString('hex').toUpperCase()}`;
    this.setPrivate(true);
    this.setFixedTimestep((ctx) => {
      this.state.tick = ctx.tick;
      for (const client of this.clients) {
        const channel = this.inputs.get(client.sessionId),
          input = channel.next();
        if (input && this.game && this.acceptsInput()) {
          this.game.input(client.sessionId, input);
          this.lastInput.set(client.sessionId, performance.now());
        }
        const member = this.game?.members.get(client.sessionId);
        if (member && performance.now() - (this.lastInput.get(client.sessionId) ?? 0) > 200)
          member.world.movement = { x: 0, y: 0 };
      }
      this.advance(ctx.dt);
      this.sync();
    }, TICK_RATE);
    this.clock.setInterval(() => {
      for (const client of this.clients) {
        const token = randomBytes(6).toString('hex');
        this.probes.set(client.sessionId, { token, at: performance.now() });
        client.send('ping', token);
      }
    }, 2000);
  }
  onAuth(_client: Client, options: { name?: unknown }): { name: string } {
    if (this.state.phase !== 'lobby')
      throw new Error('The descent has begun. Reconnect to your reserved seat.');
    return { name: displayName(options?.name) };
  }
  onJoin(client: Client, _options: unknown, auth: { name: string }): void {
    const player = new PlayerState();
    player.name = auth.name;
    player.color = COLORS[this.state.players.size];
    this.state.players.set(client.sessionId, player);
    if (!this.state.host) this.state.host = client.sessionId;
  }
  onDrop(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.game?.setConnected(client.sessionId, false);
    this.transferHost();
    void this.allowReconnection(client, RECONNECT_SECONDS).catch(() => undefined);
  }
  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    this.game?.setConnected(client.sessionId, true);
    this.transferHost();
  }
  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.game?.remove(client.sessionId);
    this.probes.delete(client.sessionId);
    this.lastInput.delete(client.sessionId);
    this.transferHost();
  }
  private transferHost(): void {
    if (!this.state.players.get(this.state.host)?.connected)
      this.state.host = [...this.state.players].find(([, p]) => p.connected)?.[0] ?? '';
  }
  onDispose(): void {
    codes.delete(this.state.code);
    this.game = undefined;
    this.probes.clear();
    this.lastInput.clear();
  }
  abstract begin(): void;
  abstract advance(dt: number): void;
  abstract acceptsInput(): boolean;
  sync(): void {
    const game = this.game;
    if (!game?.members.size) return;
    const world = game.primary;
    this.state.time = game.time;
    this.state.floor = world.floor.depth;
    this.state.room = world.roomId;
    this.state.revision = game.revision;
    this.state.budget = game.budget;
    syncArray(
      this.state.cleared,
      world.floor.rooms.filter((r) => r.cleared).map((r) => r.id),
    );
    syncArray(
      this.state.visited,
      world.floor.rooms.filter((r) => r.visited).map((r) => r.id),
    );
    for (const [id, m] of game.members) {
      const p = this.state.players.get(id);
      if (!p) continue;
      for (const key of fields) (p[key] as unknown) = m.world.player[key];
      p.ack = m.ack;
      p.kills = m.world.stats.kills;
      p.perfects = m.world.stats.perfects;
      p.reflections = m.world.stats.reflections;
      p.deaths = m.deaths;
      p.rescues = m.rescues;
      p.score = m.score;
      syncArray(
        p.relics,
        m.world.relics.map((r) => r.id),
      );
      syncArray(
        p.rewards,
        m.world.rewards.map((r) => r.id),
      );
      syncArray(
        p.items,
        m.world.inventory.slots.flatMap((s) => Array<string>(s.count).fill(s.id)),
      );
      p.selected = m.world.inventory.selected;
      p.slot = m.index;
      const buffs = m.world.buffs.active;
      if (
        p.buffs.length !== buffs.length ||
        buffs.some(
          (buff, i) =>
            p.buffs[i].id !== buff.id || Math.abs(p.buffs[i].startedAt - buff.startedAt) > 0.001,
        )
      )
        p.buffs.splice(
          0,
          p.buffs.length,
          ...buffs.map((buff) => Object.assign(new BuffState(), buff)),
        );
      p.loot = m.world.toast?.text ?? '';
    }
    const pickups = new Set<string>();
    for (const m of game.members.values())
      for (const pickup of m.world.pickups) {
        const key = `${m.index}:${pickup.id}`;
        pickups.add(key);
        const target = this.state.pickups.get(key) ?? new PickupState();
        Object.assign(target, {
          owner: m.id,
          item: pickup.item,
          x: pickup.x,
          y: pickup.y,
          room: pickup.room,
          depth: pickup.depth,
        });
        if (!this.state.pickups.has(key)) this.state.pickups.set(key, target);
      }
    for (const key of this.state.pickups.keys())
      if (!pickups.has(key)) this.state.pickups.delete(key);
    const enemies = this.mode === 'coop' ? world.enemies : [];
    const enemyIds = new Set(enemies.map((e) => String(e.id)));
    for (const key of this.state.enemies.keys())
      if (!enemyIds.has(key)) this.state.enemies.delete(key);
    for (const e of enemies) {
      const id = String(e.id),
        target = this.state.enemies.get(id) ?? new EnemyState();
      Object.assign(target, {
        elite: e.elite ?? false,
        def: e.def.id,
        x: e.x,
        y: e.y,
        facing: e.facing,
        hp: e.hp,
        maxHp: e.maxHp,
        posture: e.posture,
        maxPosture: e.maxPosture,
        state: e.state,
        stateAt: e.stateAt,
        readyAt: e.readyAt,
        phase: e.phase,
        recoilAt: e.recoilAt,
        index: e.index,
        pattern: e.pattern,
      });
      target.strike ??= new StrikeState();
      Object.assign(target.strike, {
        kind: e.strike.kind,
        windup: e.strike.windup,
        recovery: e.strike.recovery,
        damage: e.strike.damage,
        reach: e.strike.reach,
        step: e.strike.step ?? 0,
        projectile: e.strike.projectile ?? '',
        projectileRadius: e.strike.projectileRadius ?? 0,
      });
      if (!this.state.enemies.has(id)) this.state.enemies.set(id, target);
    }
    const shotIds = new Set(game.projectiles.active.map((p) => String(p.id)));
    for (const key of this.state.shots.keys()) if (!shotIds.has(key)) this.state.shots.delete(key);
    for (const shot of game.projectiles.active) {
      const key = String(shot.id),
        target = this.state.shots.get(key) ?? new ShotState();
      Object.assign(target, {
        x: shot.x,
        y: shot.y,
        vx: shot.vx,
        vy: shot.vy,
        radius: shot.radius,
        owner: String(shot.owner),
        team: shot.team,
        kind: shot.kind,
        reflected: shot.reflected,
        lifetime: shot.lifetime,
      });
      if (!this.state.shots.has(key)) this.state.shots.set(key, target);
    }
    for (const event of game.events.splice(0)) this.broadcast('event', event);
  }
}
