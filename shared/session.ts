import {
  World,
  distance,
  angleDifference,
  type Enemy,
  type Player,
  type Effect,
} from '../src/game/world';
import { defaultSave } from '../src/game/save';
import { BALANCE, ENEMIES } from '../src/game/data';
import { doorPosition, makeFloor, type Room } from '../src/game/dungeon';
import { resolveDefense } from '../src/game/combat';
import { ThreatDirector } from '../src/game/threat';
import { Projectiles, type Projectile } from '../src/game/projectiles';
import { LootDirector } from '../src/game/loot';
import { ACTIONS, type Input, type OnlineMode } from './protocol';
import { encounter, eliteFor, scaling } from './scaling';
import { configureArena } from './arena';
import { nonlethalDamage } from '../src/game/riposte';

export interface Member {
  id: string;
  index: number;
  name: string;
  weapon: string;
  connected: boolean;
  world: World;
  ack: number;
  ping: number;
  deaths: number;
  rescues: number;
  score: number;
}
export interface GameEvent extends Partial<Omit<Effect, 'kind' | 'x' | 'y'>> {
  type: string;
  x: number;
  y: number;
  actor?: string;
  target?: number;
}
interface Contact {
  at: number;
  enemy: Enemy;
  damage: number;
  actor: string;
  resolved: boolean;
  shot?: Projectile;
  postureDelta: number;
  focusDelta: number;
}
interface History {
  at: number;
  players: Map<string, Pick<Player, 'x' | 'y' | 'state' | 'hp'>>;
}

/** One encounter, with an existing World holding each Pilgrim's individual combat state. */
export class Session {
  readonly members = new Map<string, Member>();
  readonly projectiles = new Projectiles();
  readonly threats = new ThreatDirector();
  events: GameEvent[] = [];
  ended = false;
  private elapsed = 0;
  revision = 0;
  budget = 1;
  private contacts: Contact[] = [];
  private history: History[] = [];
  private targets = new Map<number, { id: string; until: number }>();
  private aggro = new Map<string, { threat: number; at: number }>();
  private cross = new Map<number, { id: string; until: number }>();
  private rewarded = new Set<string>();
  private rewardDelay = new Map<string, number>();
  private fallen = new Set<string>();
  private duelStrikes: { attacker: Member; damage: number; pressure: number; riposte: boolean }[] =
    [];
  private pendingTransition?: { world: World; at: number };
  constructor(
    readonly mode: OnlineMode,
    readonly seed: string,
  ) {}
  get worlds(): World[] {
    return [...this.members.values()].map((p) => p.world);
  }
  get primary(): World {
    return this.members.values().next().value!.world;
  }
  get active(): Member[] {
    return [...this.members.values()].filter((p) => p.connected && p.world.player.hp > 0);
  }
  get time(): number {
    return this.elapsed;
  }

  add(id: string, name: string, weapon: string): Member {
    const index = [...this.members.values()].reduce((max, m) => Math.max(max, m.index + 1), 0);
    const world = new World(defaultSave());
    world.start(this.seed, weapon);
    const member: Member = {
      id,
      index,
      name,
      weapon,
      connected: true,
      world,
      ack: 0,
      ping: 0,
      deaths: 0,
      rescues: 0,
      score: 0,
    };
    world.network = {
      id: index,
      team: this.mode === 'coop' ? 'player' : id,
      active: () => this.active.map((m) => m.world),
      owner: (owner) => [...this.members.values()].find((m) => `p:${m.index}` === owner)?.world,
      transition: (w) => {
        this.pendingTransition = { world: w, at: this.time };
      },
      contact: (e, damage, before) => {
        if (damage > 0)
          this.contacts.push({
            at: world.time,
            enemy: { ...e, strike: { ...e.strike } },
            damage,
            actor: id,
            resolved: false,
            postureDelta: world.player.posture - before.posture,
            focusDelta: before.focus - world.player.focus,
          });
      },
      projectileContact: (shot, damage, before) => {
        if (!damage || !shot.parryable) return;
        const shooter = world.enemies.find((e) => e.id === shot.owner) ?? world.enemies[0];
        if (!shooter) return;
        const enemy = {
          ...shooter,
          x: shot.x,
          y: shot.y,
          facing: Math.atan2(shot.vy, shot.vx),
          strike: {
            kind: 'thrust' as const,
            windup: 0,
            recovery: 0,
            damage: shot.damage,
            reach: 100,
          },
        };
        this.contacts.push({
          at: this.time,
          enemy,
          damage,
          actor: id,
          resolved: false,
          shot: { ...shot, hit: [...shot.hit] },
          postureDelta: world.player.posture - before.posture,
          focusDelta: before.focus - world.player.focus,
        });
      },
      perfect: (e) => {
        if (this.targets.get(e.id)?.id !== id) member.rescues++;
        this.cross.set(e.id, { id, until: this.time + 0.8 });
        this.events.push({
          type: 'perfectParry',
          x: world.player.x,
          y: world.player.y,
          actor: id,
          target: e.id,
        });
      },
      hit: (e, damage, pressure) => {
        const key = `${e.id}:${id}`,
          previous = this.aggro.get(key);
        const remaining = previous ? previous.threat * Math.exp(-(this.time - previous.at) / 3) : 0;
        this.aggro.set(key, { threat: remaining + damage + pressure * 0.4, at: this.time });
        const cross = this.cross.get(e.id);
        if (cross && cross.id !== id && this.time <= cross.until) {
          world.pressure(e, pressure * 0.12);
          this.cross.delete(e.id);
          this.events.push({ type: 'crossCounter', x: e.x, y: e.y, actor: id, target: e.id });
        }
      },
      ...(this.mode === 'duel'
        ? {
            strike: (_e: Enemy, damage: number, pressure: number) => {
              this.duelStrikes.push({
                attacker: member,
                damage,
                pressure,
                riposte: world.player.attackType === 'riposte',
              });
              return true;
            },
            pressure: (_e: Enemy, pressure: number) => {
              const opponent = this.opponent(member);
              if (opponent) this.duelPressure(opponent.world, pressure);
              return true;
            },
            finish: () => {
              const opponent = this.opponent(member);
              if (opponent) opponent.world.player.hp = 0;
            },
          }
        : {}),
    };
    // Rendering, audio, saves and DOM are never initialized by the authority.
    world.laboratory = true;
    Object.assign(world, {
      threats: this.threats,
      projectiles: this.projectiles,
      areas: this.members.size ? this.primary.areas : world.areas,
    });
    world.loot = new LootDirector(`${this.seed}:personal:${index}`);
    if (this.mode === 'duel') world.inventory.clear();
    this.members.set(id, member);
    return member;
  }
  start(): void {
    this.ended = false;
    if (this.mode === 'coop') this.enter(0);
    else this.resetDuel();
  }
  remove(id: string): void {
    this.members.delete(id);
  }
  setConnected(id: string, connected: boolean): void {
    const member = this.members.get(id);
    if (!member) return;
    member.connected = connected;
    member.world.movement = { x: 0, y: 0 };
    member.world.buffer.clear();
    for (const [enemy, target] of this.targets) if (target.id === id) this.targets.delete(enemy);
  }
  input(id: string, input: Input): void {
    const member = this.members.get(id);
    if (!member || !member.connected || input.sequence <= member.ack || this.ended) return;
    member.ack = input.sequence;
    const w = member.world;
    if (w.mode === 'reward' || (w.player.hp <= 0 && !input.parry)) return;
    w.movement = { x: finiteAxis(input.moveX), y: finiteAxis(input.moveY) };
    if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY))
      w.mouseAim = {
        x: Math.max(0, Math.min(1120, input.aimX)),
        y: Math.max(0, Math.min(760, input.aimY)),
      };
    const limit = Math.min(0.25, member.ping / 2000 + 0.1 + 2 / 30);
    const at = Math.max(
      this.time - limit,
      Math.min(this.time, Number.isFinite(input.time) ? input.time : this.time),
    );
    if (input.parry && this.compensate(member, at)) return;
    if (input.parry && w.network) w.network.parryTime = at;
    if (w.player.hp <= 0) return;
    for (const action of ACTIONS) {
      if (this.mode === 'duel' && ['item', 'technique'].includes(action)) continue;
      if (input[action]) w.input(action);
    }
    if (input.cycle) w.cycleItem(Math.sign(input.cycle));
  }
  // shortcut: validates recorded contacts; upgrade to rollback after multi-hit fairness review.
  private compensate(member: Member, at: number): boolean {
    const w = member.world;
    const history = [...this.history]
      .reverse()
      .find((h) => h.at <= at + 1 / 30)
      ?.players.get(member.id);
    if (!history || history.hp <= 0 || !['idle', 'parry'].includes(history.state)) return false;
    const contact = this.contacts.find(
      (c) =>
        c.actor === member.id &&
        !c.resolved &&
        c.at >= at &&
        c.at - at <= w.weapon.parry &&
        this.time - c.at <= 0.25,
    );
    if (!contact) return false;
    const defense = resolveDefense({
      strike: contact.enemy.strike,
      distance: distance(history, contact.enemy),
      parryAge: contact.at - at,
      dodgeAge: 99,
      weapon: w.weapon,
      assist: false,
      bonusWindow: 0,
    });
    if (defense !== 'parry' && defense !== 'perfect') return false;
    contact.resolved = true;
    if (this.fallen.delete(member.id)) member.deaths = Math.max(0, member.deaths - 1);
    w.player.hp = Math.min(BALANCE.playerHp, w.player.hp + contact.damage);
    w.player.posture = Math.max(0, Math.min(100, w.player.posture - contact.postureDelta));
    w.player.focus = Math.min(100, w.player.focus + contact.focusDelta);
    w.stats.damage = Math.max(0, w.stats.damage - contact.damage);
    w.roomDamage = Math.max(0, w.roomDamage - contact.damage);
    const now = w.time,
      position = { x: w.player.x, y: w.player.y },
      immunity = w.player.immunity;
    w.time = contact.at;
    Object.assign(w.player, {
      x: history.x,
      y: history.y,
      parryAt: at,
      state: 'parry',
      immunity: 0,
    });
    const real = w.enemies.find((e) => e.id === contact.enemy.id);
    const before = contact.enemy.posture;
    if (contact.shot) {
      const shot = contact.shot;
      w.arsenal.parryProjectile(shot, defense === 'perfect');
      if (
        shot.lifetime > 0 &&
        this.projectiles.active.length < 48 &&
        !this.projectiles.active.some((p) => p.id === shot.id)
      )
        this.projectiles.active.push(shot);
    } else {
      w.enemyHit(contact.enemy, true);
      if (this.mode === 'coop' && real && real.state !== 'dead')
        w.pressure(real, Math.max(0, contact.enemy.posture - before));
    }
    w.time = now;
    Object.assign(w.player, { ...position, immunity });
    this.events.push({ type: 'parryConfirmed', x: position.x, y: position.y, actor: member.id });
    return true;
  }
  step(dt: number): void {
    if (this.ended || !this.members.size) return;
    const w = this.primary;
    this.elapsed += dt;
    this.history.push({
      at: this.time,
      players: new Map([...this.members.values()].map((m) => [m.id, { ...m.world.player }])),
    });
    this.history = this.history.filter((h) => this.time - h.at < 0.5);
    this.contacts = this.contacts.filter((c) => this.time - c.at < 0.3);
    for (const m of this.members.values()) {
      m.world.time = this.elapsed - dt;
      if (m.connected) m.world.update(dt);
      else {
        m.world.time += dt;
        m.world.visualTime += dt;
      }
      m.world.time = this.elapsed;
    }
    this.updateDeaths();
    if (this.mode === 'duel') {
      for (const hit of this.duelStrikes.splice(0))
        this.duelStrike(hit.attacker, hit.damage, hit.pressure, hit.riposte);
      this.syncDuelTargets();
      this.primary.arsenal.update(dt);
      this.updateDeaths();
      return;
    }
    const living = this.active;
    // A simultaneous kill/wipe is a wipe. Never revive a fully fallen party.
    if (!this.worlds.some((world) => world.player.hp > 0)) {
      this.ended = true;
      return;
    }
    if (!living.length) return;
    w.updateAreaPressure();
    for (const e of w.enemies) {
      const target = this.target(e, living);
      if (target) target.world.updateEnemy(e, dt);
    }
    living[0].world.arsenal.update(dt);
    w.stepAreas();
    this.updateDeaths();
    for (const m of this.members.values()) {
      if (m.world.player.hp <= 0) m.world.player.state = 'dead';
      for (const effect of m.world.effects.splice(0))
        this.events.push({ ...effect, type: effect.kind, actor: m.id });
    }
    if (!this.worlds.some((world) => world.player.hp > 0)) {
      this.ended = true;
      return;
    }
    if (!w.room.cleared && !w.alive.length) this.clear();
    for (const [id, at] of this.rewardDelay)
      if (this.time >= at) {
        this.rewardDelay.delete(id);
        const member = this.members.get(id);
        if (member) this.reward(member);
      }
    this.travel();
  }
  private updateDeaths(): void {
    for (const m of this.members.values())
      if (m.world.player.hp <= 0) {
        m.world.player.hp = 0;
        m.world.player.state = 'dead';
        m.world.buffer.clear();
        if (this.fallen.has(m.id)) continue;
        this.fallen.add(m.id);
        m.deaths++;
        m.world.telemetry.deaths = m.deaths;
        this.events.push({ type: 'death', x: m.world.player.x, y: m.world.player.y, actor: m.id });
      }
  }
  private target(e: Enemy, living: Member[]): Member | undefined {
    const committed = this.targets.get(e.id);
    const existing = living.find((p) => p.id === committed?.id);
    if (existing && (e.state === 'tell' || e.state === 'active' || this.time < committed!.until))
      return existing;
    const score = (m: Member) => {
      const assigned = [...this.targets.values()].filter((t) => t.id === m.id).length;
      const recent = this.aggro.get(`${e.id}:${m.id}`);
      const threat = recent ? recent.threat * Math.exp(-(this.time - recent.at) / 3) : 0;
      return (
        distance(e, m.world.player) +
        assigned * 110 -
        Math.min(200, threat * 2) -
        (m.world.player.state === 'item' ? 45 : m.world.player.state === 'ranged' ? 20 : 0) +
        (m === existing ? (e.def.id === 'boss' && living.length >= 3 ? 160 : -65) : 0)
      );
    };
    const next = [...living].sort((a, b) => score(a) - score(b))[0];
    if (next)
      this.targets.set(e.id, { id: next.id, until: this.time + (e.def.id === 'boss' ? 1.2 : 1.8) });
    return next;
  }
  enter(id: number, previous?: Room): void {
    const first = this.primary,
      room = first.floor.rooms[id];
    const size = Math.max(1, [...this.members.values()].filter((m) => m.connected).length),
      scale = scaling(size);
    this.budget = scale.budget;
    const ids = encounter(room, size, this.seed, first.floor.biome);
    for (const world of this.worlds) {
      world.floor = first.floor;
      world.enterRoom(id, previous);
    }
    first.enemies = room.cleared ? [] : ids.map((enemy, i) => first.spawnEnemy(enemy, i));
    const elite = eliteFor(room, size, this.seed, ids);
    for (const [index, e] of first.enemies.entries()) {
      const boss = e.def.id === 'boss';
      if (boss) e.readyAt = first.time + 3;
      e.hp = e.maxHp *= boss ? scale.bossHp : scale.hp;
      e.maxPosture *= boss ? scale.bossPosture : scale.posture;
      if (index === elite) {
        e.elite = true;
        e.hp = e.maxHp *= 1.12;
        e.maxPosture *= 1.1;
      }
    }
    for (const [i, world] of this.worlds.entries()) {
      world.enemies = first.enemies;
      world.player.x += i * 24; // Players never hard-collide with each other.
      world.time = first.time;
      world.mode = 'playing';
      if (world.player.hp <= 0) world.player.state = 'dead';
    }
    this.threats.capacity = size >= 3 ? 3 : 2;
    this.targets.clear();
    this.aggro.clear();
    this.cross.clear();
    this.contacts = [];
    this.history = [];
    this.pendingTransition = undefined;
    this.revision++;
  }
  private clear(): void {
    const w = this.primary;
    this.projectiles.clear();
    w.areas.clear();
    this.threats.clear();
    this.contacts = [];
    w.room.cleared = true;
    // Revival precedes personal rewards, and only a cleared combat encounter calls here.
    for (const m of this.members.values()) {
      const world = m.world,
        p = world.player;
      world.echoes = [];
      world.stats.rooms++;
      if (p.hp <= 0) {
        const charges = p.rangedCharges,
          recharge = p.recharge;
        const survivor = this.active[0]?.world.player ?? { x: 455, y: 430 };
        Object.assign(p, {
          hp: Math.min(20, BALANCE.playerHp),
          posture: 0,
          focus: 0,
          state: 'idle',
          stateAt: this.time,
          x: survivor.x,
          y: survivor.y,
          immunity: this.time + 1.5,
          parryAt: -99,
          dodgeAt: -99,
          counterUntil: 0,
          attackHit: false,
          comboUntil: 0,
          rangedCharges: charges,
          recharge,
        });
        world.buffer.clear();
        world.buffs.clear();
        this.fallen.delete(m.id);
        this.events.push({ type: 'revival', x: p.x, y: p.y, actor: m.id });
      }
      this.rewardDelay.set(m.id, this.time + 0.5);
    }
    this.events.push({ type: 'roomClear', x: 560, y: 380 });
  }
  private reward(m: Member): void {
    const key = `${m.id}:${this.primary.floor.depth}:${this.primary.roomId}`;
    if (this.rewarded.has(key)) return;
    this.rewarded.add(key);
    m.world.resolveLoot();
  }
  choose(id: string, relic: string): void {
    this.members.get(id)?.world.chooseRelic(relic);
  }
  private travel(): void {
    const w = this.primary,
      active = this.active;
    if ([...this.members.values()].some((member) => !member.connected)) return;
    if (
      w.combat ||
      this.rewardDelay.size ||
      !active.length ||
      active.some((m) => m.world.mode === 'reward')
    )
      return;
    const request = this.pendingTransition;
    if (!request || this.time - request.at > 3) return;
    for (const id of w.room.links) {
      const door = doorPosition(w.room, w.floor.rooms[id]);
      if (
        distance(request.world.player, door) < 115 &&
        active.every((m) => distance(m.world.player, door) < 125)
      ) {
        this.enter(id, w.room);
        return;
      }
    }
    if (active.every((m) => distance(m.world.player, { x: 560, y: 365 }) < 120)) {
      if (w.room.kind === 'exit') {
        if (!w.floor.rooms.some((r) => r.kind === 'boss' && r.cleared)) return;
        const floor = makeFloor(this.seed, w.floor.depth + 1);
        for (const world of this.worlds) world.floor = floor;
        this.enter(0);
      } else if (!w.room.claimed) {
        w.room.claimed = true;
        if (w.room.kind === 'healing')
          for (const m of active) m.world.player.hp = Math.min(100, m.world.player.hp + 40);
        if (['treasure', 'shrine', 'secret'].includes(w.room.kind))
          for (const m of this.members.values()) this.reward(m);
      }
      this.pendingTransition = undefined;
    }
  }
  private opponent(m: Member): Member | undefined {
    return [...this.members.values()].find((p) => p !== m);
  }
  private duelPressure(w: World, amount: number): void {
    if (w.player.hp <= 0 || w.player.state === 'stagger') return;
    w.player.posture += amount;
    if (w.player.posture >= 100) {
      w.player.posture = 100;
      w.player.state = 'stagger';
      w.player.stateAt = w.time;
      this.events.push({ type: 'postureBreak', x: w.player.x, y: w.player.y });
    }
  }
  private duelStrike(attacker: Member, damage: number, pressure: number, riposte = false): void {
    const defender = this.opponent(attacker);
    if (!defender?.connected || defender.world.player.hp <= 0) return;
    const a = attacker.world,
      d = defender.world,
      p = d.player;
    d.time = this.time;
    if (
      distance(a.player, p) > a.weapon.reach * a.player.move.reach + 22 ||
      Math.abs(angleDifference(Math.atan2(p.y - a.player.y, p.x - a.player.x), a.player.facing)) >
        1.15
    )
      return;
    if (d.time < p.immunity || p.state === 'finisher') return;
    const strike = {
      kind: a.player.move.kind,
      windup: a.player.attackStartup,
      recovery: a.player.attackRecovery,
      damage,
      reach: a.weapon.reach * a.player.move.reach,
    };
    const defense = resolveDefense({
      strike,
      distance: distance(a.player, p),
      parryAge: d.time - p.parryAt,
      dodgeAge: d.time - p.dodgeAt,
      weapon: d.weapon,
      assist: false,
      bonusWindow: 0,
    });
    if (defense === 'perfect' || defense === 'parry') {
      const perfect = defense === 'perfect';
      d.stats.parries++;
      p.parryLanded = true;
      p.emptyParries = 0;
      p.counterUntil = d.time + 0.8;
      p.focus = Math.min(100, p.focus + (perfect ? 18 : 9));
      p.posture = Math.max(0, p.posture - (perfect ? 20 : 8));
      p.state = 'idle';
      d.offerRiposte(d.enemies[0], perfect);
      this.duelPressure(
        a,
        (perfect ? BALANCE.perfectPressure : BALANCE.parryPressure) *
          (d.weapon.id === 'shinobi' ? (perfect ? 1.4 : 1.2) : 1),
      );
      if (perfect) {
        d.stats.perfects++;
        if (d.weapon.id === 'sword') d.rechargeRanged(1);
      }
      this.events.push({
        type: perfect ? 'perfectParry' : 'parry',
        x: p.x,
        y: p.y,
        actor: defender.id,
      });
    } else if (defense === 'hit') {
      const before = { ...p };
      d.hurt(riposte ? nonlethalDamage(p.hp, damage) : damage, 'THE OPPOSING OATH');
      this.duelPressure(d, pressure);
      this.contacts.push({
        at: d.time,
        enemy: { ...a.enemies[0], x: a.player.x, y: a.player.y, facing: a.player.facing, strike },
        damage,
        actor: defender.id,
        resolved: false,
        postureDelta: p.posture - before.posture,
        focusDelta: before.focus - p.focus,
      });
    }
  }
  resetDuel(): void {
    this.projectiles.clear();
    this.contacts = [];
    this.history = [];
    this.ended = false;
    this.fallen.clear();
    this.duelStrikes = [];
    for (const [i, m] of [...this.members.values()].entries()) {
      const w = m.world,
        time = w.time;
      w.start(this.seed, m.weapon);
      w.laboratory = true;
      w.time = time;
      w.inventory.clear();
      w.relics = [];
      w.buffs.clear();
      // Symmetrical collision geometry, existing biome art and zero hazards.
      configureArena(w, this.seed);
      Object.assign(w.player, { x: i ? 760 : 360, y: 380, facing: i ? Math.PI : 0 });
    }
    this.syncDuelTargets();
    this.revision++;
  }
  private syncDuelTargets(): void {
    for (const m of this.members.values()) {
      const opponent = this.opponent(m);
      if (!opponent) continue;
      const w = m.world,
        p = opponent.world.player;
      const proxy = w.enemies[0] ?? w.spawnEnemy('duelist', 0);
      Object.assign(proxy, {
        id: 0,
        def: ENEMIES.find((e) => e.id === 'duelist')!,
        x: p.x,
        y: p.y,
        facing: p.facing,
        hp: p.hp,
        maxHp: 100,
        posture: p.posture,
        maxPosture: 100,
        state: p.hp <= 0 ? 'dead' : p.state === 'stagger' ? 'broken' : 'idle',
      });
      w.enemies = [proxy];
    }
  }
}
export const finiteAxis = (n: number): number =>
  Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
