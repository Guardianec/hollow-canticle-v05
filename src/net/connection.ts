import { Client, type Room as ClientRoom, type InputHandle } from '@colyseus/sdk';
import {
  ACTIONS,
  Input,
  TICK_RATE,
  INTERPOLATION_MS,
  type SessionState,
  type PlayerState,
} from '../../shared/protocol';
import { World, type Player, type Enemy } from '../game/world';
import { BALANCE, ENEMIES, RELICS, WEAPONS, type Strike } from '../game/data';
import { makeFloor } from '../game/dungeon';
import { characterFor, meleeMove } from '../game/characters';
import { moveBody } from '../../shared/movement';
import type { Action } from '../game/combat';
import type { GameEvent } from '../../shared/session';
import type { ActiveBuff } from '../game/buffs';
import { configureArena } from '../../shared/arena';

type Room = ClientRoom<SessionState, SessionState>;
type Pending = { sequence: number; x: number; y: number; dt: number };
type Snapshot = {
  at: number;
  players: Map<string, Player>;
  enemies: Map<number, { x: number; y: number }>;
};
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
export class OnlineConnection {
  readonly client: Client;
  room?: Room;
  connected = false;
  lost = false;
  paused = false;
  predictionError = 0;
  clientTick = 0;
  spectating = 0;
  spectated = '';
  changed?: () => void;
  ping = 0;
  receivedBytes = 0;
  sentBytes = 0;
  private connectedAt = performance.now();
  get bandwidth(): string {
    const seconds = Math.max(1, (performance.now() - this.connectedAt) / 1000);
    return `${(this.receivedBytes / seconds / 1024).toFixed(1)} KiB/s ↓ ${(this.sentBytes / seconds / 1024).toFixed(1)} KiB/s ↑`;
  }
  private input?: InputHandle<Input>;
  private pending: Pending[] = [];
  private actions = new Set<Action>();
  private snapshots: Snapshot[] = [];
  private sequence = 0;
  private accumulator = 0;
  private revision = -1;
  private started = false;
  private receivedAt = 0;
  private self?: Player;
  private rendered?: Player;
  private cycle = 0;
  constructor(
    readonly world: World,
    readonly endpoint: string,
  ) {
    this.client = new Client(endpoint);
  }
  async create(mode: 'coop' | 'duel', name: string): Promise<void> {
    await this.attach(await this.client.create(mode, { name }));
  }
  async join(code: string, name: string): Promise<void> {
    await this.attach(await this.client.joinById(code.trim().toUpperCase(), { name }));
  }
  async reconnect(): Promise<void> {
    const token = sessionStorage.getItem('hollow-canticle:reconnect');
    if (!token) throw new Error('This room is no longer reserved. Create a new room.');
    await this.attach(await this.client.reconnect(token));
  }
  private async attach(room: Room): Promise<void> {
    this.room = room;
    this.connected = true;
    this.lost = false;
    room.reconnection.minUptime = 0;
    const send = room.connection.send.bind(room.connection);
    room.connection.send = (bytes) => {
      this.sentBytes += bytes.byteLength;
      send(bytes);
    };
    const ws = (room.connection.transport as unknown as { ws?: WebSocket }).ws;
    ws?.addEventListener('message', (event: MessageEvent) => {
      this.receivedBytes +=
        event.data instanceof Blob ? event.data.size : (event.data.byteLength ?? 0);
    });
    this.input = room.input<Input>({ type: Input, renderDelay: INTERPOLATION_MS });
    sessionStorage.setItem('hollow-canticle:reconnect', room.reconnectionToken);
    room.onStateChange(() => this.snapshot());
    room.onMessage('ping', (token: string) => room.send('pong', token));
    room.onMessage('event', (event: GameEvent) => {
      if (!this.started) return;
      const perfect = ['perfectParry', 'revival', 'postureBreak', 'perfect'].includes(event.type);
      this.world.impact(
        event.x,
        event.y,
        event.type === 'revival' ? '#f2d291' : perfect ? '#fff1c4' : '#b8d9df',
        perfect ? 30 : 10,
        perfect ? 'perfect' : event.type === 'slash' ? 'slash' : 'ring',
        perfect ? 1.5 : 0.7,
      );
      if (event.type === 'revival') this.world.audio.play('clear');
      else if (event.type === 'perfectParry') this.world.audio.play('perfect');
      else if (event.type === 'parry') this.world.audio.play('parry');
      else if (event.type === 'roomClear') this.world.audio.play('clear');
    });
    room.onDrop(() => {
      this.connected = false;
      this.actions.clear();
      this.pending = [];
      this.changed?.();
    });
    room.onReconnect(() => {
      this.connected = true;
      this.lost = false;
      this.pending = [];
      this.actions.clear();
      this.changed?.();
    });
    room.onLeave(() => {
      this.connected = false;
      this.lost = true;
      this.changed?.();
    });
    room.onError(() => {
      this.connected = false;
      this.lost = true;
      this.changed?.();
    });
    if (!room.state?.players)
      await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));
    this.changed?.();
  }
  get active(): boolean {
    return this.started;
  }
  get state(): SessionState | undefined {
    return this.room?.state;
  }
  get own(): PlayerState | undefined {
    return this.room?.state?.players?.get(this.room.sessionId);
  }
  send(type: string, value?: unknown): void {
    if (this.connected) this.room?.send(type, value);
  }
  private player(p: PlayerState): Player {
    const base = { ...this.world.player };
    for (const field of fields) (base[field] as unknown) = p[field];
    base.move = meleeMove(characterFor(p.weapon), p.combo, p.attackType);
    return base;
  }
  private snapshot(): void {
    const state = this.state,
      own = this.own,
      w = this.world;
    if (!state || !own) return;
    if (state.phase === 'lobby') {
      this.changed?.();
      return;
    }
    if (!this.started) {
      w.start(state.seed, own.weapon);
      this.started = true;
      if (state.mode === 'duel')
        w.announce('THE OPPOSING OATH', 'First to three rounds.', '#dec38a', 3);
      w.onlineMode = state.mode === 'duel' ? 'duel' : 'coop';
      w.onlineFrame = (dt) => this.frame(dt);
      w.onlineInput = (action) => {
        if (this.paused || this.self?.hp === 0) return;
        this.actions.add(action);
        if (action === 'parry') w.effect(w.player.x, w.player.y, 'ring', '#b9e1de', 0.18, 0.45);
      };
      w.onlineCycle = (direction) => {
        this.cycle = Math.sign(direction);
      };
    }
    if (state.revision !== this.revision) {
      this.pending = [];
      this.snapshots = [];
      w.floor = makeFloor(state.seed, state.floor);
      w.enterRoom(state.room);
      if (state.mode === 'duel') {
        configureArena(w, state.seed);
      }
      this.revision = state.revision;
      this.sequence = Math.max(this.sequence, own.ack);
    }
    for (const room of w.floor.rooms) {
      room.cleared = state.cleared.includes(room.id);
      room.visited = state.visited.includes(room.id);
    }
    this.receivedAt = performance.now();
    w.time = state.time;
    w.mode = 'playing';
    this.self = this.player(own);
    this.pending = this.pending.filter((p) => p.sequence > own.ack);
    const corrected = { ...this.self };
    for (const pending of this.pending) this.predict(corrected, pending);
    if (this.rendered)
      this.predictionError = Math.hypot(
        corrected.x - this.rendered.x,
        corrected.y - this.rendered.y,
      );
    if (!this.rendered || this.predictionError > 100) this.rendered = { ...corrected };
    Object.assign(this.rendered, { ...corrected, x: this.rendered.x, y: this.rendered.y });
    const enemies = new Map(w.enemies.map((e) => [e.id, e]));
    w.enemies = [...state.enemies].map(([id, e]) => {
      const enemy = enemies.get(Number(id)) ?? w.spawnEnemy(e.def, Number(id));
      Object.assign(enemy, {
        ...e.toJSON(),
        id: Number(id),
        def: e.elite
          ? {
              ...ENEMIES.find((def) => def.id === e.def)!,
              name: `${ENEMIES.find((def) => def.id === e.def)!.name} · Elite`,
            }
          : ENEMIES.find((def) => def.id === e.def)!,
        strike: { ...e.strike.toJSON(), projectile: e.strike.projectile || undefined } as Strike,
      });
      return enemy;
    });
    this.snapshots.push({
      at: this.receivedAt,
      players: new Map([...state.players].map(([id, p]) => [id, this.player(p)])),
      enemies: new Map(w.enemies.map((e) => [e.id, { x: e.x, y: e.y }])),
    });
    this.snapshots = this.snapshots.filter((s) => this.receivedAt - s.at < 500).slice(-12);
    w.projectiles.active = [...state.shots].map(([id, p]) => ({
      id: Number(id),
      ...p.toJSON(),
      kind: p.kind,
      visualType: p.kind,
      damage: 0,
      postureDamage: 0,
      parryable: true,
      reflectable: true,
      pierce: 0,
      hit: [],
    })) as typeof w.projectiles.active;
    w.relics = own.relics.map((id) => RELICS.find((r) => r.id === id)!).filter(Boolean);
    w.rewards = own.rewards.map((id) => RELICS.find((r) => r.id === id)!).filter(Boolean);
    w.inventory.clear();
    for (const id of own.items) w.inventory.add(id);
    w.inventory.selected = own.selected;
    w.buffs.active = own.buffs.map((b) => ({ ...b.toJSON(), stacks: 1 })) as ActiveBuff[];
    w.pickupOwner = this.room?.sessionId;
    w.pickups = [...state.pickups].map(([id, p]) => ({
      ...p.toJSON(),
      id: Number(id.split(':')[1]),
    })) as typeof w.pickups;
    this.ping = own.ping;
    this.changed?.();
  }
  // shortcut: enemy separation and ice drift reconcile from authority; share full actor replay if distracting.
  private predict(p: Player, cmd: Pending): void {
    if (p.hp <= 0) return;
    const w = this.world;
    if (p.state === 'dodge') {
      moveBody(p, p.dx * 610 * cmd.dt, p.dy * 610 * cmd.dt, w.room, w.obstacles);
      return;
    }
    if (!['idle', 'parry', 'attack'].includes(p.state)) return;
    const length = Math.hypot(cmd.x, cmd.y);
    if (!length) return;
    let speed =
      BALANCE.speed *
      characterFor(this.own?.weapon ?? w.weapon.id).speed *
      (p.state === 'attack' ? 0.34 : p.state === 'parry' ? 0.55 : 1);
    if ((w.floor.biome === 1 || w.floor.hybrid === 1) && w.inZone(p, 'water')) speed *= 0.65;
    moveBody(
      p,
      (cmd.x / length) * speed * cmd.dt,
      (cmd.y / length) * speed * cmd.dt,
      w.room,
      w.obstacles,
    );
    if (p.state === 'idle') p.facing = Math.atan2(cmd.y, cmd.x);
  }
  private frame(dt: number): void {
    const w = this.world,
      room = this.room,
      state = this.state,
      own = this.own;
    if (!room || !state || !own || !this.self || !this.rendered || !this.input) return;
    w.visualTime += dt;
    for (const effect of w.effects) effect.life -= dt;
    w.effects = w.effects.filter((e) => e.life > 0);
    for (const p of w.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    w.particles = w.particles.filter((p) => p.life > 0);
    w.shake = Math.max(0, w.shake - dt * 25);
    w.flash = Math.max(0, w.flash - dt * 3);
    this.accumulator = Math.min(0.1, this.accumulator + dt);
    const fixed = this.input.stepSeconds ?? 1 / TICK_RATE;
    while (this.accumulator >= fixed) {
      this.accumulator -= fixed;
      if (!this.connected || !['playing', 'round'].includes(state.phase)) continue;
      const movement = !this.paused && own.hp > 0 ? w.movement : { x: 0, y: 0 };
      const data = this.input.data;
      data.sequence = ++this.sequence;
      data.moveX = movement.x;
      data.moveY = movement.y;
      const target = w.mouseAim ??
        w.target ?? {
          x: w.player.x + Math.cos(w.player.facing) * 100,
          y: w.player.y + Math.sin(w.player.facing) * 100,
        };
      data.aimX = target.x;
      data.aimY = target.y;
      data.time =
        state.time +
        Math.min(0.1, (performance.now() - this.receivedAt) / 1000) -
        INTERPOLATION_MS / 1000;
      for (const action of ACTIONS) data[action] = !this.paused && this.actions.has(action);
      data.cycle = this.cycle;
      this.cycle = 0;
      this.input.send();
      this.actions.clear();
      this.clientTick++;
      const cmd = { sequence: this.sequence, x: movement.x, y: movement.y, dt: fixed };
      this.pending.push(cmd);
      this.pending = this.pending.slice(-90);
      this.predict(this.rendered, cmd);
    }
    const corrected = { ...this.self };
    for (const pending of this.pending) this.predict(corrected, pending);
    const blend = this.predictionError > 35 ? 1 - Math.exp(-dt * 25) : 1 - Math.exp(-dt * 12);
    this.rendered.x += (corrected.x - this.rendered.x) * blend;
    this.rendered.y += (corrected.y - this.rendered.y) * blend;
    const renderAt = performance.now() - INTERPOLATION_MS;
    const before = [...this.snapshots].reverse().find((s) => s.at <= renderAt) ?? this.snapshots[0];
    const after = this.snapshots.find((s) => s.at >= renderAt) ?? this.snapshots.at(-1);
    const alpha =
      before && after && after.at !== before.at
        ? Math.max(0, Math.min(1, (renderAt - before.at) / (after.at - before.at)))
        : 1;
    const players = [...state.players].map(([id, p]) => {
      const a = before?.players.get(id),
        b = after?.players.get(id);
      const player =
        a && b
          ? { ...b, x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha }
          : this.player(p);
      return { id, name: p.name, weapon: p.weapon, color: p.color, connected: p.connected, player };
    });
    let viewpoint = room.sessionId;
    if (own.hp <= 0 && state.mode === 'coop') {
      const living = players.filter((p) => p.player.hp > 0 && p.connected);
      const index =
        ((this.spectating % Math.max(1, living.length)) + living.length) %
        Math.max(1, living.length);
      viewpoint = living[index]?.id ?? room.sessionId;
      const following = living[index];
      this.spectated = following
        ? `${following.name} · ${characterFor(following.weapon).name} · ${Math.ceil(following.player.hp)} HP`
        : '';
    }
    w.player =
      viewpoint === room.sessionId
        ? this.rendered
        : players.find((p) => p.id === viewpoint)!.player;
    w.weapon =
      WEAPONS.find((weapon) => weapon.id === players.find((p) => p.id === viewpoint)?.weapon) ??
      WEAPONS[0];
    w.remotePlayers = players.filter((p) => p.id !== viewpoint);
    for (const e of w.enemies) {
      const a = before?.enemies.get(e.id),
        b = after?.enemies.get(e.id);
      if (a && b) {
        e.x = a.x + (b.x - a.x) * alpha;
        e.y = a.y + (b.y - a.y) * alpha;
      }
    }
    if (state.mode === 'duel') {
      const opponent = players.find((p) => p.id !== room.sessionId);
      if (opponent) {
        const proxy: Enemy = w.enemies[0] ?? w.spawnEnemy('duelist', 0);
        Object.assign(proxy, {
          x: opponent.player.x,
          y: opponent.player.y,
          hp: opponent.player.hp,
          posture: opponent.player.posture,
          maxHp: 100,
          maxPosture: 100,
          state:
            opponent.player.hp <= 0
              ? 'dead'
              : opponent.player.state === 'stagger'
                ? 'broken'
                : 'idle',
          def: {
            ...ENEMIES.find((e) => e.id === 'duelist')!,
            name: opponent.name,
            role: characterFor(opponent.weapon).name,
          },
        });
        // This target drives focus/camera only; the remote Pilgrim is rendered separately.
        w.enemies = [proxy];
      }
    }
  }
  async leave(): Promise<void> {
    const room = this.room;
    this.room = undefined;
    this.started = false;
    this.connected = false;
    this.lost = false;
    this.world.onlineInput = undefined;
    this.world.onlineFrame = undefined;
    this.world.onlinePause = undefined;
    this.world.onlineCycle = undefined;
    this.world.onlineMode = undefined;
    this.world.pickupOwner = undefined;
    this.world.remotePlayers = [];
    this.world.mode = 'menu';
    this.pending = [];
    this.snapshots = [];
    this.actions.clear();
    sessionStorage.removeItem('hollow-canticle:reconnect');
    await room?.leave().catch(() => undefined);
  }
}
