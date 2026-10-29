import { moveBody } from '../../shared/movement';
import {
  BALANCE,
  BIOMES,
  ENEMIES,
  WEAPONS,
  type EnemyDef,
  type Relic,
  type RelicEvent,
  type Strike,
  type Weapon,
} from './data';
import {
  doorPosition,
  makeFloor,
  obstaclesFor,
  type Floor,
  type Obstacle,
  type Room,
} from './dungeon';
import { finisherStyle, InputBuffer, posturePressure, resolveDefense, type Action } from './combat';
import { normalizeSeed, Random } from './random';
import { persist, recordRun, type Save } from './save';
import { Audio } from './audio';
import { canStand, pathBetween } from './geometry';
import { ThreatDirector } from './threat';
import { Arsenal } from './arsenal';
import { characterFor, meleeMove, type MeleeMove } from './characters';
import { Projectiles } from './projectiles';
import { Buffs } from './buffs';
import { Inventory, ITEMS, type ItemDef } from './items';
import { LootDirector, type LootKind } from './loot';
import { EXECUTIONS, EXECUTION_CONTACT, EXECUTION_DURATION, executionVariant } from './executions';
import type { Projectile } from './projectiles';
import { lineOfSight } from './projectiles';
import { RIPOSTE, nonlethalDamage, riposteTravel } from './riposte';
import { GRAPHICS } from './graphics';
import { trainingFloor, trainingStages } from './training';
import { AreaEffects, AREA_KINDS, AREA_RULES, areaContains, type AreaEffect } from './areas';
import { PARTICLE_BUDGETS } from './atmosphere';
import { guardianFor, depthScaling } from './realms';

export type Mode = 'menu' | 'playing' | 'paused' | 'reward' | 'dead' | 'trained';
export type PlayerState =
  | 'idle'
  | 'attack'
  | 'ranged'
  | 'item'
  | 'parry'
  | 'dodge'
  | 'hurt'
  | 'stagger'
  | 'finisher'
  | 'dead';
export interface Player {
  x: number;
  y: number;
  facing: number;
  hp: number;
  posture: number;
  focus: number;
  state: PlayerState;
  stateAt: number;
  parryAt: number;
  dodgeAt: number;
  dodgeReady: number;
  immunity: number;
  counterUntil: number;
  riposteUntil: number;
  riposteTarget: number;
  ripostePerfect: boolean;
  attackHit: boolean;
  dx: number;
  dy: number;
  combo: number;
  counter: boolean;
  attackStartup: number;
  attackRecovery: number;
  poisonUntil: number;
  frostUntil: number;
  emptyParries: number;
  parryLanded: boolean;
  finisherTarget: string;
  finisherVariant: number;
  move: MeleeMove;
  attackType: string;
  comboUntil: number;
  rangedCharges: number;
  recharge: number;
}
export interface Enemy {
  phaseStartedAt?: number;
  areaReady?: number;
  punishReady?: number;
  elite?: boolean;
  path?: { x: number; y: number }[];
  pathAt?: number;
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  posture: number;
  maxPosture: number;
  state: 'idle' | 'tell' | 'active' | 'recover' | 'broken' | 'dead';
  stateAt: number;
  readyAt: number;
  lastPressure: number;
  pattern: number;
  index: number;
  strike: Strike;
  phase: number;
  burns: number;
  blocks: number;
  variant: number;
  recoilAt: number;
  counterQueued: boolean;
  chainExtended: boolean;
  recentPatterns: number[];
}
export interface Particle {
  ground?: boolean;
  contact?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}
export interface Effect {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  kind: 'slash' | 'ring' | 'perfect' | 'finish' | 'hurt' | 'break';
  color: string;
  scale: number;
  weapon?: string;
  attackKind?: Strike['kind'];
  projectileKind?: 'arrow' | 'orb';
  contact?: boolean;
}
export interface Toast {
  text: string;
  sub: string;
  until: number;
  color: string;
}
export interface RunStats {
  kills: number;
  parries: number;
  perfects: number;
  streak: number;
  bestStreak: number;
  finishers: number;
  damage: number;
  rooms: number;
  time: number;
  dodges: number;
  attacks: number;
  bosses: number;
  rangedSpent: number;
  rangedHits: number;
  projectileParries: number;
  reflections: number;
  itemsUsed: number;
  healing: number;
  buffUptime: number;
  rangedEnemies: number;
  relicsByFloor: Record<number, number>;
  loot: Record<LootKind, number>;
}
export interface WorldEvent {
  type: 'reward' | 'death' | 'trained' | 'floor';
}
/** Optional authority hooks. Offline play uses the same rules without a session. */
export interface NetworkRules {
  team: string;
  id: number;
  active: () => World[];
  owner: (id: number | string) => World | undefined;
  strike?: (enemy: Enemy, damage: number, pressure: number) => boolean;
  finish?: (enemy: Enemy) => void;
  pressure?: (enemy: Enemy, amount: number) => boolean;
  transition: (world: World) => void;
  contact?: (enemy: Enemy, damage: number, before: Player) => void;
  perfect?: (enemy: Enemy) => void;
  hit?: (enemy: Enemy, damage: number, pressure: number) => void;
  parryTime?: number;
  projectileContact?: (shot: Projectile, damage: number, before: Player) => void;
}
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const angleDifference = (a: number, b: number): number =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class World {
  network?: NetworkRules;
  remotePlayers: {
    id: string;
    name: string;
    weapon: string;
    color: string;
    connected: boolean;
    player: Player;
  }[] = [];
  onlineInput?: (action: Action) => void;
  onlineFrame?: (dt: number) => void;
  onlinePause?: () => void;
  onlineCycle?: (direction: number) => void;
  onlinePractice?: (biome: number) => void;
  onlineMode?: 'coop' | 'duel';
  mode: Mode = 'menu';
  seed = 'THE-FIRST-CANDLE';
  floor: Floor = makeFloor(this.seed, 1);
  roomId = 0;
  player!: Player;
  enemies: Enemy[] = [];
  obstacles: Obstacle[] = [];
  weapon: Weapon = WEAPONS[0];
  relics: Relic[] = [];
  rewards: Relic[] = [];
  time = 0;
  visualTime = 0;
  training = false;
  laboratory = false;
  trainingDone = new Set<string>();
  stats!: RunStats;
  buffer = new InputBuffer();
  movement = { x: 0, y: 0 };
  mouseAim?: { x: number; y: number };
  focusedEnemy?: number;
  particles: Particle[] = [];
  effects: Effect[] = [];
  toast?: Toast;
  events: WorldEvent[] = [];
  shake = 0;
  flash = 0;
  hitStop = 0;
  roomRevision = 0;
  clearAt = 0;
  ward = 0;
  hunger = 0;
  bonusWindow = 0;
  lastPerfect = false;
  lastMoved = 0;
  roomDamage = 0;
  roomPerfects = 0;
  debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
  invincible = false;
  timeScale = 1;
  presentation = {
    mode: 'exploration',
    duel: 0,
    fps: 0,
    drawCalls: 0,
    triangles: 0,
    weatherParticles: 0,
    geometries: 0,
    textures: 0,
    gpu: '',
  };
  audio: Audio;
  private rng = new Random('effects');
  private rewardRng = new Random('rewards');
  private settled = false;
  readonly threats = new ThreatDirector();
  readonly projectiles = new Projectiles();
  readonly areas = new AreaEffects();
  readonly telemetry = {
    areaHits: 0,
    guardBreaks: 0,
    deaths: 0,
    phaseAt: 0,
    phaseDurations: [] as number[],
  };
  weather = { intensity: -1, wind: 1, density: 1, shafts: true };
  private dodgeHistory: number[] = [];
  private whiffUntil = 0;
  readonly arsenal = new Arsenal(this, {
    move: (body, dx, dy) => this.move(body, dx, dy),
    hurt: (amount, reason) => this.hurt(amount, reason),
    beginTell: (enemy) => this.beginTell(enemy),
    breakEnemy: (enemy) => this.breakEnemy(enemy),
  });
  readonly buffs = new Buffs();
  readonly inventory = new Inventory();
  loot = new LootDirector(this.seed);
  pickupOwner?: string;
  pickups: {
    id: number;
    room: number;
    depth: number;
    x: number;
    y: number;
    item: string;
    owner?: string;
  }[] = [];
  selection?: string;
  private pendingItem?: ItemDef;
  get character() {
    return characterFor(this.weapon.id);
  }
  lab = {
    actor: 'player',
    velocity: 0,
    turnRate: 0,
    closeCombat: false,
    geometry: false,
    locomotion: '',
    action: '',
    weights: '',
    pattern: -1,
    camera: 'auto',
    clip: 'live',
    clipTime: 0,
    executionVariant: 0,
    freeze: false,
    animationName: '',
    normalized: 0,
    hitWindow: '',
    rootMotion: 0,
    projectileSpeed: 1,
    projectileType: 'auto',
    infiniteCharges: false,
    rechargeRate: 1,
    forceLoot: 'auto',
    hitboxes: false,
  };
  private iceDrift = { x: 0, y: 0 };
  echoes: { enemy: number; x: number; y: number; at: number; radius: number }[] = [];
  private execution?: { at: number; x: number; y: number; force: number };
  private ripostePath?: { x: number; y: number; dx: number; dy: number };

  constructor(public save: Save) {
    this.audio = new Audio(save.settings);
    this.resetPlayer();
    this.enterRoom(0);
  }
  get room(): Room {
    return this.floor.rooms[this.roomId];
  }
  get alive(): Enemy[] {
    return this.enemies.filter((e) => e.state !== 'dead');
  }
  get target(): Enemy | undefined {
    const alive = this.alive;
    return (
      alive.find((e) => e.id === this.focusedEnemy) ??
      alive.sort((a, b) => distance(a, this.player) - distance(b, this.player))[0]
    );
  }
  focusEnemy(id: number | undefined): void {
    this.focusedEnemy = this.alive.some((e) => e.id === id) ? id : undefined;
    if (this.focusedEnemy !== undefined) this.mouseAim = undefined;
  }
  cycleFocus(direction: number): void {
    if (this.training) this.trainingDone.add('camera');
    const enemies = this.alive.sort((a, b) => a.id - b.id);
    if (!enemies.length) {
      this.focusedEnemy = undefined;
      return;
    }
    const index = enemies.findIndex((e) => e === this.target);
    this.focusEnemy(enemies[(index + direction + enemies.length) % enemies.length].id);
  }
  get combat(): boolean {
    return this.alive.length > 0;
  }
  get prompt(): { text: string; sub: string; x: number; y: number; passage?: boolean } | undefined {
    if (this.mode !== 'playing') return;
    const p = this.player;
    const broken = this.alive.find(
      (e) => e.state === 'broken' && distance(e, p) < BALANCE.finisherRange,
    );
    if (broken) return { text: 'Deliver the final toll', sub: 'E  /  J', x: broken.x, y: broken.y };
    const pickup = this.pickups.find(
      (i) =>
        (!i.owner || i.owner === this.pickupOwner) &&
        i.room === this.roomId &&
        i.depth === this.floor.depth &&
        distance(i, p) < 75,
    );
    if (pickup)
      return {
        text: `Take ${ITEMS.find((i) => i.id === pickup.item)!.name}`,
        sub: 'E  TAKE',
        x: pickup.x,
        y: pickup.y,
      };
    if (this.combat) return;
    if (
      !this.room.claimed &&
      distance(p, { x: 560, y: 365 }) < 110 &&
      ['treasure', 'shrine', 'healing', 'secret', 'exit'].includes(this.room.kind)
    ) {
      const text =
        this.room.kind === 'exit'
          ? 'Descend · next depth'
          : this.room.kind === 'healing'
            ? 'Drink from the quiet well'
            : this.room.kind === 'shrine'
              ? 'Make an offering'
              : 'Claim the forgotten relic';
      return { text, sub: 'E  INTERACT', x: 560, y: 365 };
    }
    for (const id of this.room.links) {
      const next = this.floor.rooms[id];
      const pos = doorPosition(this.room, next);
      if (distance(p, pos) < 115)
        return {
          text:
            next.kind === 'secret' && !next.visited
              ? 'A crack in the prayer'
              : next.visited
                ? next.name
                : {
                    combat: 'An armed presence',
                    elite: 'A formidable presence',
                    boss: 'A bell without a voice',
                    treasure: 'A glint in the darkness',
                    healing: 'The sound of water',
                    shrine: 'A distant candle',
                    hazard: 'An uneasy passage',
                    exit: 'A stairway downward',
                    secret: 'A faint whisper',
                    start: 'The threshold',
                  }[next.kind],
          sub: 'Walk through · E or click to enter',
          passage: true,
          ...pos,
        };
    }
  }

  private resetPlayer(): void {
    this.player = {
      x: 460,
      y: 420,
      facing: -0.3,
      hp: BALANCE.playerHp,
      posture: 0,
      focus: 0,
      state: 'idle',
      stateAt: 0,
      parryAt: -99,
      dodgeAt: -99,
      dodgeReady: 0,
      immunity: 0,
      counterUntil: 0,
      riposteUntil: 0,
      riposteTarget: -1,
      ripostePerfect: false,
      attackHit: false,
      dx: 1,
      dy: 0,
      combo: 0,
      counter: false,
      attackStartup: this.weapon.startup,
      attackRecovery: this.weapon.recovery,
      poisonUntil: 0,
      frostUntil: 0,
      emptyParries: 0,
      parryLanded: true,
      finisherTarget: '',
      finisherVariant: 0,
      move: this.character.chain[0],
      attackType: 'chain',
      comboUntil: -1,
      rangedCharges: this.character.ranged.charges,
      recharge: 0,
    };
    this.stats = {
      kills: 0,
      parries: 0,
      perfects: 0,
      streak: 0,
      bestStreak: 0,
      finishers: 0,
      damage: 0,
      rooms: 0,
      time: 0,
      dodges: 0,
      attacks: 0,
      bosses: 0,
      rangedSpent: 0,
      rangedHits: 0,
      projectileParries: 0,
      reflections: 0,
      itemsUsed: 0,
      healing: 0,
      buffUptime: 0,
      rangedEnemies: 0,
      relicsByFloor: {},
      loot: { nothing: 0, embers: 0, item: 0, healing: 0, blessing: 0, relic: 0 },
    };
  }
  start(seed: string, weaponId: string, training = false): void {
    this.laboratory = false;
    this.seed = normalizeSeed(seed);
    this.weapon = WEAPONS.find((w) => w.id === weaponId) || WEAPONS[0];
    this.floor = training ? trainingFloor(this.seed) : makeFloor(this.seed, 1);
    this.time = 0;
    this.relics = [];
    this.ward = 0;
    this.hunger = 0;
    this.bonusWindow = 0;
    this.training = training;
    this.trainingDone.clear();
    this.settled = false;
    this.events = [];
    this.toast = undefined;
    this.lastPerfect = false;
    this.rewardRng = new Random(`${this.seed}:attacks`);
    this.loot = new LootDirector(this.seed);
    this.buffs.clear();
    this.inventory.clear();
    this.inventory.add('crimson');
    if (training) {
      this.inventory.add('oil');
      this.inventory.add('oil');
    }
    this.pickups = [];
    this.pendingItem = undefined;
    this.resetPlayer();
    this.buffer.clear();
    this.mouseAim = undefined;
    this.mode = 'playing';
    if (training) {
      this.floor.rooms[0].enemies = ['warden'];
      this.floor.rooms[0].kind = 'combat';
      this.floor.rooms[0].cleared = false;
      this.floor.rooms[0].name = 'The Practice of Steel';
    }
    this.enterRoom(0);
    this.audio.unlock();
    this.announce(
      training ? 'THE PRACTICE OF STEEL' : 'A NEW CANDLE IS LIT',
      training
        ? 'Your vitality cannot fall here. Learn at your own pace.'
        : 'Find the stairway. Keep your oath.',
      '#dcc89c',
      4,
    );
  }

  enterRoom(id: number, previous?: Room): void {
    this.focusedEnemy = undefined;
    this.roomId = id;
    this.room.visited = true;
    this.roomRevision++;
    this.effects = [];
    this.projectiles.clear();
    this.pendingItem = undefined;
    this.particles = [];
    this.threats.clear();
    this.echoes = [];
    this.areas.clear();
    this.dodgeHistory = [];
    this.player.poisonUntil = this.player.frostUntil = 0;
    this.execution = undefined;
    this.ripostePath = undefined;
    this.player.riposteUntil = 0;
    this.player.riposteTarget = -1;
    this.iceDrift = { x: 0, y: 0 };
    this.buffer.clear();
    this.clearAt = 0;
    this.roomDamage = 0;
    this.roomPerfects = 0;
    this.player.state = 'idle';
    this.player.parryAt = -99;
    this.player.dodgeAt = -99;
    this.player.immunity = this.time + 0.8;
    if (previous) {
      const pos = doorPosition(this.room, previous);
      this.player.x = pos.x === 80 ? 160 : pos.x === 1040 ? 960 : 560;
      this.player.y = pos.y === 86 ? 170 : pos.y === 674 ? 600 : 380;
    } else {
      this.player.x = 455;
      this.player.y = 430;
    }
    this.obstacles = obstaclesFor(this.room, this.floor.biome);
    this.enemies = this.room.cleared
      ? []
      : this.room.enemies.map((id, index) => this.spawnEnemy(id, index));
    this.stats.rangedEnemies += this.enemies.filter((e) =>
      ['archer', 'hexer'].includes(e.def.id),
    ).length;
    if (this.room.kind === 'boss' && !this.room.cleared) {
      const guardian = guardianFor(this.floor.biome);
      this.telemetry.phaseAt = this.time;
      this.announce(
        guardian.name.toUpperCase(),
        guardian.title ?? 'Keeper of the Descent',
        guardian.color,
        3,
      );
      for (const e of this.enemies) e.readyAt = this.time + 3;
    }
    this.emit('enter');
    this.audio.setBiome(this.floor.biome);
    this.audio.ambience(this.combat, this.mode !== 'playing');
    if (previous)
      this.announce(
        this.room.name.toUpperCase(),
        this.room.modifier === 'Quiet'
          ? BIOMES[this.floor.biome].label
          : `${this.room.modifier.toUpperCase()} CHAMBER`,
        '#dac69d',
        2.4,
      );
  }

  spawnEnemy(id: string, index = this.enemies.length): Enemy {
    const def =
      id === 'boss'
        ? guardianFor(this.floor.biome, this.floor.depth)
        : ENEMIES.find((e) => e.id === id) || ENEMIES[0];
    const elite = this.room.kind === 'elite';
    const hp = def.hp * (elite ? 1.2 : 1) * depthScaling(this.floor.depth);
    const desired = {
      x: ['archer', 'hexer'].includes(id) ? 800 : index === 0 ? 735 : 650,
      y: ['archer', 'hexer'].includes(id) ? 320 : index === 0 ? 380 : 470,
    };
    const candidates = [];
    for (let y = 120; y <= 640; y += 20)
      for (let x = 120; x <= 1000; x += 20)
        if (
          canStand(this.room, x, y, 24) &&
          this.obstacles.every((o) => Math.hypot(x - o.x, y - o.y) > o.radius + 28)
        )
          candidates.push({ x, y });
    const position = candidates.sort((a, b) => distance(a, desired) - distance(b, desired))[0] ?? {
      x: 560,
      y: 380,
    };
    return {
      id: index,
      def,
      ...position,
      facing: Math.PI,
      hp,
      maxHp: hp,
      posture: 0,
      maxPosture: def.posture * (elite && this.room.elite === 'Armored' ? 1.3 : elite ? 1.12 : 1),
      state: 'idle',
      stateAt: this.time,
      readyAt: this.time + (this.training ? 2.2 : 1.5) + index * 0.6,
      lastPressure: this.time,
      pattern: 0,
      index: 0,
      strike: def.patterns[0][0],
      phase: 1,
      phaseStartedAt: this.time,
      burns: 0,
      blocks: 0,
      variant: 0,
      recoilAt: -99,
      counterQueued: false,
      chainExtended: false,
      recentPatterns: [],
    };
  }

  configureLab(options: {
    enemy: string;
    support: string;
    count: number;
    elite: string;
    depth: number;
    biome: number;
    pattern: number;
  }): void {
    if (!this.debug) return;
    const depth = Number.isFinite(options.depth)
      ? Math.max(1, Math.min(10000, Math.floor(options.depth)))
      : 1;
    const base = makeFloor(this.seed, depth);
    const biome = Math.max(0, Math.min(4, Math.floor(options.biome) || 0));
    const room = {
      ...base.rooms[0],
      template: 'bell-bastion',
      name: 'The Rehearsal Belfry',
      kind:
        options.enemy === 'boss'
          ? ('boss' as const)
          : options.elite === 'none'
            ? ('combat' as const)
            : ('elite' as const),
      elite: (['Patient', 'Relentless', 'Armored'].includes(options.elite)
        ? options.elite
        : 'Patient') as Room['elite'],
      cleared: false,
      enemies: Array.from(
        {
          length:
            options.enemy === 'boss' ? 1 : Math.max(1, Math.min(8, Math.floor(options.count) || 1)),
        },
        (_, i) => (i === 0 || options.support === 'same' ? options.enemy : options.support),
      ),
    };
    this.floor = { ...base, biome, hybrid: null, rooms: [room, ...base.rooms.slice(1)] };
    this.training = false;
    this.laboratory = true;
    this.toast = undefined;
    this.trainingDone.clear();
    this.resetPlayer();
    this.hitStop = 0;
    this.events = [];
    this.mode = 'playing';
    this.lab.pattern = options.pattern;
    this.enterRoom(0);
    this.player.x = 535;
    this.player.y = 400;
    this.enemies.forEach((e, i) => {
      e.x = i === 0 ? 620 : i === 1 ? 510 : 680;
      e.y = i === 0 ? 400 : i === 1 ? 500 : 480;
    });
  }

  input(action: Action): void {
    if (this.onlineInput) {
      this.onlineInput(action);
      return;
    }
    if (this.mode === 'playing') this.buffer.push(action, this.time);
  }
  pause(): void {
    if (this.onlinePause) {
      this.onlinePause();
      return;
    }
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.buffer.clear();
      this.movement = { x: 0, y: 0 };
    } else if (this.mode === 'paused') this.mode = 'playing';
    this.audio.ambience(this.combat, this.mode !== 'playing');
  }

  update(realDt: number): void {
    this.visualTime += realDt;
    for (const particle of this.particles) {
      particle.life -= realDt;
      particle.x += particle.vx * realDt;
      particle.y += particle.vy * realDt;
      particle.vy += 90 * realDt;
      particle.vx *= Math.exp(-realDt * 2);
    }
    this.particles = this.particles
      .filter((p) => p.life > 0)
      .slice(
        -(
          PARTICLE_BUDGETS[this.save.settings.detail].decorative +
          (this.alive.some((e) => e.def.id === 'boss')
            ? PARTICLE_BUDGETS[this.save.settings.detail].boss
            : 0)
        ),
      );
    for (const effect of this.effects) effect.life -= realDt;
    this.effects = this.effects.filter((e) => e.life > 0);
    this.shake = Math.max(0, this.shake - realDt * 25);
    this.flash = Math.max(0, this.flash - realDt * 3);
    if (this.mode !== 'playing') return;
    if (this.hitStop > 0 && !this.network) {
      this.hitStop -= realDt;
      return;
    }
    const dt = Math.min(realDt, 0.034);
    this.time += dt;
    this.stats.time += dt;
    this.updatePlayer(dt);
    if (this.execution && this.time >= this.execution.at) {
      const hit = this.execution;
      this.execution = undefined;
      this.impact(hit.x, hit.y, '#f9da9f', 65, 'perfect', hit.force, true, this.player.facing);
      this.environmentImpact(hit.x, hit.y, hit.force);
      this.audio.play('finisher', this.weapon.id);
      this.hitStop = this.save.settings.reducedMotion ? 0.025 : 0.09;
    }
    this.threats.prune(this.time);
    if (!this.network) {
      this.updateAreaPressure();
      for (const enemy of this.enemies) this.updateEnemy(enemy, dt);
      this.stepAreas();
      this.arsenal.update(dt);
    }
    this.separateEnemies();
    this.updateHazards();
    for (const echo of this.echoes) {
      if (this.time < echo.at) continue;
      this.environmentImpact(echo.x, echo.y, 1.8);
      this.effect(echo.x, echo.y, 'ring', '#b8dfea', 0.35, 2.8);
      if (
        distance(this.player, echo) < echo.radius &&
        this.time - this.player.dodgeAt > BALANCE.dodgeInvulnerable
      )
        this.hurt(16, 'THE BELL RETURNS — LEAVE THE ECHO');
    }
    this.echoes = this.echoes.filter((e) => e.at > this.time);
    if (!this.network && !this.combat && !this.room.cleared) this.clearRoom();
    if (this.clearAt && this.time > this.clearAt) {
      this.clearAt = 0;
      if (this.training) {
        this.enemies = [
          this.spawnEnemy(this.trainingDone.has('projectile-training') ? 'archer' : 'warden', 0),
        ];
        this.room.cleared = false;
      } else this.resolveLoot();
    }
    this.player.focus = Math.max(0, Math.min(100, this.player.focus));
    this.player.hp = Math.max(0, Math.min(BALANCE.playerHp, this.player.hp));
    if (!this.network) this.autoPassage();
    if (this.training) {
      if (this.trainingDone.has('dodge') && !this.trainingDone.has('area')) {
        let zone: AreaEffect | undefined = this.areas.active[0];
        if (!zone) {
          zone = this.spawnArea();
          this.announce(
            'AREA ATTACKS',
            'Leave marked ground before it becomes dangerous.',
            '#efba78',
            4,
          );
        }
        if (zone && distance(this.player, zone) > zone.warningRadius + 10)
          this.trainingDone.add('area');
      }
      this.player.hp = Math.max(40, this.player.hp);
      if (
        ['move', 'attack', 'parry', 'perfect', 'dodge', 'finisher'].every((id) =>
          this.trainingDone.has(id),
        ) &&
        !this.trainingDone.has('projectile-training')
      ) {
        this.trainingDone.add('projectile-training');
        this.enemies = [this.spawnEnemy('archer', 0)];
        this.room.cleared = false;
        this.clearAt = 0;
        this.announce(
          'DEFLECT THE ARROW',
          'K to deflect. Meet the final instant to return it.',
          '#dce6ce',
          5,
        );
      }
      if (trainingStages(this.weapon.id === 'shinobi').every(([id]) => this.trainingDone.has(id))) {
        this.mode = 'trained';
        this.save.tutorial = true;
        this.save.arsenalTutorial = true;
        persist(this.save);
        this.events.push({ type: 'trained' });
      }
    } else if (this.player.hp <= 0 && this.mode === 'playing') {
      if (this.network) {
        this.player.hp = 0;
        this.player.state = 'dead';
        this.buffer.clear();
        this.pendingItem = undefined;
        this.buffs.clear();
      } else this.die();
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    if (this.training && this.mouseAim) this.trainingDone.add('camera');
    if (p.state === 'dead' || p.hp <= 0) return;
    const age = this.time - p.stateAt;
    this.buffs.expire(this.time);
    if (this.buffs.active.length) this.stats.buffUptime += dt;
    this.heal(this.buffs.healing * dt);
    this.rechargeRanged(
      (dt *
        this.buffs.modifier('recharge') *
        (this.debug ? this.lab.rechargeRate : 1) *
        (this.hasRelic('quiver') && this.time - this.lastMoved > 1 ? 1.25 : 1)) /
        (this.hasRelic('glass-arrow') ? 1.35 : 1),
    );
    if (p.state === 'attack' && !p.attackHit && age >= p.attackStartup) {
      p.attackHit = true;
      if (p.attackType === 'riposte') this.riposteHit();
      else this.attack();
    }
    if (p.state === 'attack' && p.attackType === 'riposte' && this.ripostePath) {
      const path = this.ripostePath,
        travel = riposteTravel(age);
      const dx = path.x + path.dx * travel - p.x,
        dy = path.y + path.dy * travel - p.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
      for (let i = 0; i < steps; i++) this.move(p, dx / steps, dy / steps);
    }
    if (p.state === 'ranged' && !p.attackHit && age >= this.character.ranged.startup) {
      p.attackHit = true;
      this.arsenal.firePlayer();
    }
    if (p.state === 'item' && this.pendingItem && age >= this.pendingItem.useTime) {
      const item = this.pendingItem;
      this.pendingItem = undefined;
      if (item.heal) this.heal(item.heal);
      if (item.buff) this.buffs.add(item.buff, this.time);
      if (item.charges)
        p.rangedCharges = Math.min(this.character.ranged.charges, p.rangedCharges + item.charges);
      this.stats.itemsUsed++;
      this.trainingDone.add('item');
      this.audio.play('clear');
    }
    const durations: Record<PlayerState, number> = {
      idle: Infinity,
      attack: p.attackStartup + p.attackRecovery,
      ranged: this.character.ranged.startup + this.character.ranged.recovery,
      item: this.pendingItem?.useTime ?? 0,
      parry: this.weapon.parry + 0.23,
      dodge: BALANCE.dodgeTime + (this.time < p.frostUntil ? 0.06 : 0),
      hurt: 0.22,
      stagger: 0.7,
      finisher: EXECUTION_DURATION,
      dead: Infinity,
    };
    if (age >= durations[p.state]) {
      if (p.state === 'parry' && !p.parryLanded) {
        p.emptyParries = Math.min(3, p.emptyParries + 1);
        p.posture = Math.min(90, p.posture + 4);
      }
      p.state = 'idle';
    }
    if (p.state === 'idle' && this.time - p.parryAt > 1.8) p.emptyParries = 0;
    const action = this.buffer.consume(this.time, (a) => {
      if (a === 'interact') return p.state === 'idle' || p.state === 'parry';
      if (a === 'dodge')
        return (
          this.time >= p.dodgeReady &&
          (p.state === 'idle' ||
            p.state === 'parry' ||
            (['attack', 'ranged'].includes(p.state) && p.attackHit))
        );
      if (a === 'parry')
        return (
          p.state === 'idle' ||
          (['attack', 'ranged'].includes(p.state) &&
            p.attackHit &&
            age >=
              (p.state === 'attack'
                ? p.attackStartup + p.attackRecovery * 0.45
                : this.character.ranged.startup))
        );
      return p.state === 'idle';
    });
    if (action === 'dodge')
      this.dodgeHistory = [...this.dodgeHistory.filter((t) => this.time - t < 5), this.time];
    if (action) this.perform(action);
    if (p.state === 'dodge') this.move(p, p.dx * 610 * dt, p.dy * 610 * dt);
    else if (
      ['idle', 'parry', 'attack'].includes(p.state) &&
      !(p.state === 'attack' && p.attackType === 'riposte')
    ) {
      let { x, y } = this.movement;
      const len = Math.hypot(x, y);
      if (len) {
        x /= len;
        y /= len;
        this.lastMoved = this.time;
        let speed =
          BALANCE.speed *
          this.character.speed *
          (p.state === 'attack' ? 0.34 : p.state === 'parry' ? 0.55 : 1);
        if (this.time < p.frostUntil) speed *= 0.88;
        if ((this.floor.biome === 1 || this.floor.hybrid === 1) && this.inZone(p, 'water'))
          speed *= 0.65;
        this.move(p, x * speed * dt, y * speed * dt);
        if (p.state === 'idle') p.facing = Math.atan2(y, x);
        this.trainingDone.add('move');
      }
      if (this.mouseAim && p.state === 'idle')
        p.facing = Math.atan2(this.mouseAim.y - p.y, this.mouseAim.x - p.x);
      if (this.focusedEnemy !== undefined && this.target && p.state === 'idle')
        p.facing = Math.atan2(this.target.y - p.y, this.target.x - p.x);
    }
    const onIce =
      !this.network?.strike &&
      (this.floor.biome === 3 || this.floor.hybrid === 3) &&
      this.inZone(p, 'ice');
    const slide = 1 - Math.exp(-dt * (onIce ? 3 : 12));
    this.iceDrift.x += ((onIce ? this.movement.x * 75 : 0) - this.iceDrift.x) * slide;
    this.iceDrift.y += ((onIce ? this.movement.y * 75 : 0) - this.iceDrift.y) * slide;
    if (p.state === 'idle' && Math.hypot(this.iceDrift.x, this.iceDrift.y) > 0.1)
      this.move(p, this.iceDrift.x * dt, this.iceDrift.y * dt);
    if (p.posture > 0 && p.state === 'idle')
      p.posture = Math.max(
        0,
        p.posture - BALANCE.postureRecovery * dt * (this.time < p.poisonUntil ? 0.6 : 1),
      );
    if (p.focus >= 68 && p.state === 'idle' && this.target && distance(p, this.target) < 165)
      p.counterUntil = Math.max(p.counterUntil, this.time + 0.08);
  }

  private perform(action: Action): void {
    const p = this.player;
    if (action === 'attack' && this.beginRiposte()) return;
    if (action === 'ranged') {
      if (p.rangedCharges <= 0 && !(this.debug && this.lab.infiniteCharges)) return;
      if (!(this.debug && this.lab.infiniteCharges)) p.rangedCharges--;
      p.state = 'ranged';
      p.stateAt = this.time;
      p.attackHit = false;
      const aim = this.mouseAim ?? this.target;
      if (aim) p.facing = Math.atan2(aim.y - p.y, aim.x - p.x);
      this.stats.rangedSpent++;
      this.trainingDone.add('ranged');
      return;
    }
    if (action === 'item') {
      const item = this.inventory.item;
      if (
        !item ||
        (item.heal && p.hp >= 100) ||
        (item.charges && p.rangedCharges >= this.character.ranged.charges)
      )
        return;
      this.pendingItem = this.inventory.take();
      p.state = 'item';
      p.stateAt = this.time;
      return;
    }
    if (action === 'interact') {
      this.interact();
      return;
    }
    if (action === 'technique') {
      if (p.focus < 100) {
        this.announce(
          'THE CANTICLE IS QUIET',
          'Build 100 Focus to release a resonant strike.',
          '#b9c4c3',
          1.8,
        );
        return;
      }
      p.focus = 0;
      p.immunity = this.time + 0.5;
      for (const e of this.alive) if (distance(p, e) < 250) this.pressure(e, 65);
      this.impact(p.x, p.y, '#b8e8ef', 55, 'perfect', 2);
      this.audio.play('break');
      this.announce('RESONANCE', 'The oath answers.', '#c0ebeb', 1.2);
      return;
    }
    if (
      action === 'attack' &&
      this.alive.some((e) => e.state === 'broken' && distance(p, e) < BALANCE.finisherRange)
    ) {
      this.finish(
        this.alive.find((e) => e.state === 'broken' && distance(p, e) < BALANCE.finisherRange)!,
      );
      return;
    }
    const previousAge = this.time - p.stateAt;
    p.state = action === 'heavy' ? 'attack' : action;
    p.stateAt = this.time;
    if (action === 'attack' || action === 'heavy') {
      p.combo = this.time < p.comboUntil ? (p.combo + 1) % this.character.chain.length : 0;
      p.counter = this.time < p.counterUntil;
      p.attackType = p.counter
        ? 'counter'
        : action === 'heavy'
          ? 'heavy'
          : this.time - p.dodgeAt < 0.65
            ? 'dodge'
            : this.time >= p.comboUntil &&
                previousAge > 0.5 &&
                Math.hypot(this.movement.x, this.movement.y) > 0.8
              ? 'running'
              : 'chain';
      p.move = meleeMove(this.character, p.combo, p.attackType);
      p.attackStartup = (this.weapon.startup * p.move.startup) / this.buffs.modifier('speed');
      p.attackRecovery = (this.weapon.recovery * p.move.recovery) / this.buffs.modifier('speed');
      p.comboUntil = this.time + p.attackStartup + p.attackRecovery + 0.65;
      p.attackHit = false;
      const target = this.chooseTarget();
      if (target) p.facing = Math.atan2(target.y - p.y, target.x - p.x);
      this.audio.play('attack');
      this.stats.attacks++;
      this.trainingDone.add('attack');
    }
    if (action === 'parry') {
      p.parryAt = this.network?.parryTime ?? this.time;
      if (this.network) this.network.parryTime = undefined;
      p.parryLanded = false;
      this.effect(p.x, p.y, 'ring', '#b9e1de', 0.32, 0.55);
    }
    if (action === 'dodge') {
      p.dodgeAt = this.time;
      p.dodgeReady = this.time + BALANCE.dodgeCooldown;
      const length = Math.hypot(this.movement.x, this.movement.y);
      p.dx = length ? this.movement.x / length : -Math.cos(p.facing);
      p.dy = length ? this.movement.y / length : -Math.sin(p.facing);
      this.stats.dodges++;
      this.trainingDone.add('dodge');
      this.audio.play('attack');
    }
  }

  offerRiposte(target: Enemy, perfect = false): void {
    const p = this.player;
    if (
      this.weapon.id !== 'shinobi' ||
      target.hp <= 0 ||
      ['broken', 'dead'].includes(target.state) ||
      distance(p, target) > RIPOSTE.range
    )
      return;
    p.riposteTarget = target.id;
    p.ripostePerfect = perfect;
    p.riposteUntil = this.time + (perfect ? RIPOSTE.perfectWindow : RIPOSTE.window);
    this.announce('RIPOSTE READY', 'Strike to dash in, cut and return.', '#edb38a', 0.7);
  }
  private beginRiposte(): boolean {
    const p = this.player,
      target = this.alive.find((e) => e.id === p.riposteTarget);
    if (
      this.weapon.id !== 'shinobi' ||
      this.time >= p.riposteUntil ||
      !target ||
      target.state === 'broken' ||
      distance(p, target) > RIPOSTE.range ||
      !lineOfSight(this.room, this.obstacles, p, target)
    )
      return false;
    p.riposteUntil = 0;
    p.counterUntil = 0;
    p.counter = false;
    p.attackType = 'riposte';
    p.state = 'attack';
    p.stateAt = this.time;
    p.attackStartup = RIPOSTE.contact;
    p.attackRecovery = RIPOSTE.duration - RIPOSTE.contact;
    p.attackHit = false;
    p.move = {
      name: 'Cinder return',
      kind: 'slash',
      startup: 1,
      recovery: 1,
      damage: 1,
      pressure: 1,
      reach: 1,
      step: 0,
    };
    p.facing = Math.atan2(target.y - p.y, target.x - p.x);
    const travel = Math.max(0, distance(p, target) - 68);
    this.ripostePath = {
      x: p.x,
      y: p.y,
      dx: Math.cos(p.facing) * travel,
      dy: Math.sin(p.facing) * travel,
    };
    this.environmentImpact(p.x, p.y, 0.6);
    this.stats.attacks++;
    return true;
  }
  private riposteHit(): void {
    const p = this.player,
      target = this.alive.find((e) => e.id === p.riposteTarget);
    if (!target || target.state === 'broken' || distance(p, target) > this.weapon.reach + 22)
      return;
    const damage = p.ripostePerfect ? RIPOSTE.perfectDamage : RIPOSTE.damage;
    const pressure =
      (p.ripostePerfect ? RIPOSTE.perfectPressure : RIPOSTE.pressure) *
      this.buffs.modifier('pressure');
    if (this.network?.strike) this.network.strike(target, damage, pressure);
    else {
      const dealt = nonlethalDamage(target.hp, damage);
      target.hp -= dealt;
      this.pressure(target, pressure);
      target.recoilAt = this.time;
      this.network?.hit?.(target, dealt, pressure);
    }
    this.trainingDone.add('riposte');
    this.impact(target.x, target.y, '#ffe5c2', 32, 'perfect', 1.2, true, p.facing);
    this.effect(p.x, p.y, 'slash', '#fff4df', 0.28, 1.4, p.facing);
    Object.assign(this.effects[this.effects.length - 1], {
      weapon: 'shinobi',
      attackKind: 'slash',
    });
    this.environmentImpact(target.x, target.y, 0.8);
    this.audio.play('perfect');
    this.hitStop = this.save.settings.reducedMotion ? 0.015 : 0.045;
  }
  private chooseTarget(): Enemy | undefined {
    const p = this.player;
    if (this.focusedEnemy !== undefined) return this.target;
    return this.alive
      .filter((e) => distance(p, e) < this.weapon.reach + 80)
      .sort((a, b) => {
        const score = (e: Enemy) =>
          distance(p, e) +
          Math.abs(angleDifference(Math.atan2(e.y - p.y, e.x - p.x), p.facing)) *
            (this.mouseAim ? 90 : 20);
        return score(a) - score(b);
      })[0];
  }
  private attack(): void {
    const p = this.player;
    const counter = p.counter;
    this.whiffUntil = this.time + p.attackRecovery;
    this.effect(
      p.x,
      p.y,
      'slash',
      counter ? '#f6d7a2' : '#bcd5dc',
      0.28,
      this.weapon.reach / 90,
      p.facing,
    );
    const step = p.move.step;
    this.move(p, Math.cos(p.facing) * step, Math.sin(p.facing) * step);
    Object.assign(this.effects[this.effects.length - 1], {
      weapon: this.weapon.id,
      attackKind: p.move.kind,
    });
    for (const enemy of this.alive) {
      if (this.network?.strike && enemy.state !== 'broken') {
        this.network.strike(
          enemy,
          this.weapon.damage * p.move.damage * this.buffs.modifier('damage') * (counter ? 1.4 : 1),
          posturePressure(this.weapon.pressure, p.focus, counter, this.weapon.id === 'spear') *
            p.move.pressure,
        );
        continue;
      }
      if (
        enemy.state === 'broken' ||
        distance(p, enemy) > this.weapon.reach * p.move.reach + 22 ||
        Math.abs(angleDifference(Math.atan2(enemy.y - p.y, enemy.x - p.x), p.facing)) > 1.15
      )
        continue;
      this.whiffUntil = 0;
      const block = enemy.def.reaction === 'block' && enemy.state === 'idle' && !counter;
      const previousHp = enemy.hp,
        previousPosture = enemy.posture;
      enemy.hp -=
        (this.weapon.damage + this.hunger) *
        p.move.damage *
        this.buffs.modifier('damage') *
        (block ? 0.18 : counter ? 1.4 : 1);
      this.pressure(
        enemy,
        posturePressure(this.weapon.pressure, p.focus, counter, this.weapon.id === 'spear') *
          p.move.pressure *
          this.buffs.modifier('pressure') *
          (counter ? this.buffs.modifier('counter') : 1) *
          (this.room.kind === 'elite' && this.room.elite === 'Armored' && !counter ? 0.65 : 1),
      );
      this.impact(
        enemy.x,
        enemy.y - 16,
        block ? '#e8bc79' : '#c5d6d7',
        11,
        'ring',
        0.45,
        true,
        p.facing,
      );
      this.hitStop = Math.max(
        this.hitStop,
        this.save.settings.reducedMotion
          ? 0.005
          : this.weapon.id === 'great'
            ? 0.045
            : this.weapon.id === 'spear'
              ? 0.022
              : this.weapon.id === 'sword'
                ? 0.016
                : 0.008,
      );
      this.audio.play(block ? 'parry' : 'hit');
      if (block) {
        enemy.blocks++;
        if (enemy.blocks >= 3) {
          enemy.index = 0;
          enemy.strike = { kind: 'grab', windup: 0.8, recovery: 0.9, damage: 15, reach: 95 };
          this.beginTell(enemy);
          enemy.blocks = 0;
        }
      } else if (enemy.state === 'idle' || enemy.state === 'recover') {
        if (enemy.def.reaction === 'retreat')
          this.move(enemy, Math.cos(p.facing) * 45, Math.sin(p.facing) * 45);
        enemy.readyAt = this.time + (enemy.def.reaction === 'counter' ? 0.12 : 0.4);
        enemy.counterQueued = enemy.def.reaction === 'counter';
      }
      if (this.weapon.id === 'twins') {
        p.focus += 3;
        if (p.combo === 3) this.rechargeRanged(0.8);
      }
      if (counter) {
        this.emit('counter', enemy);
        p.counterUntil = 0;
      }
      this.emit('attack', enemy);
      if (enemy.hp <= 0) this.breakEnemy(enemy);
      this.network?.hit?.(
        enemy,
        Math.max(0, previousHp - enemy.hp),
        Math.max(0, enemy.posture - previousPosture),
      );
    }
  }

  cycleItem(direction: number): void {
    const previous = this.inventory.item?.id;
    this.inventory.cycle(direction);
    if (previous !== this.inventory.item?.id) this.trainingDone.add('switch');
  }
  hasRelic(id: string): boolean {
    return this.relics.some((r) => r.id === id);
  }
  dropItem(item: string): void {
    if (!ITEMS.some((i) => i.id === item)) return;
    const p = this.player;
    const point =
      [
        [52, 0],
        [-52, 0],
        [0, 52],
        [0, -52],
      ]
        .map(([x, y]) => ({ x: p.x + x, y: p.y + y }))
        .find(
          (v) =>
            canStand(this.room, v.x, v.y, 12) &&
            this.obstacles.every((o) => distance(v, o) > o.radius + 18),
        ) ?? p;
    this.pickups.push({
      id: this.pickups.length,
      room: this.roomId,
      depth: this.floor.depth,
      x: point.x,
      y: point.y,
      item,
    });
  }

  private heal(amount: number): void {
    const gained = Math.max(0, Math.min(amount, 100 - this.player.hp));
    this.player.hp += gained;
    this.stats.healing += gained;
  }

  rechargeRanged(seconds: number): void {
    const p = this.player,
      ranged = this.character.ranged;
    if (p.rangedCharges >= ranged.charges) {
      p.recharge = 0;
      return;
    }
    p.recharge += seconds;
    while (p.recharge + 1e-8 >= ranged.recharge && p.rangedCharges < ranged.charges) {
      p.recharge -= ranged.recharge;
      p.rangedCharges++;
      this.audio.play('charge', this.weapon.id);
    }
    if (p.rangedCharges >= ranged.charges) p.recharge = 0;
  }

  resolveLoot(forced?: LootKind): void {
    const loot = this.loot.roll(
      this.room.kind,
      forced ??
        (this.debug && this.lab.forceLoot !== 'auto'
          ? (this.lab.forceLoot as LootKind)
          : undefined),
    );
    this.stats.loot[loot.kind]++;
    if (loot.kind === 'relic') this.openReward();
    if (loot.kind === 'embers') {
      if (!this.training && !this.laboratory) {
        this.save.embers += loot.amount!;
        persist(this.save);
      }
      this.announce('EMBERS REMAIN', `${loot.amount} embers kept in the chronicle.`, '#d3ba8e', 2);
    }
    if (loot.kind === 'healing') this.heal(loot.amount!);
    if (loot.kind === 'blessing') {
      this.buffs.add('iron', this.time, 'chamber');
      this.announce(
        'A FLEETING BENEDICTION',
        'Iron Incense · 15 seconds of guard resistance.',
        '#bad5cd',
        2,
      );
    }
    if (loot.kind === 'item') this.dropItem(loot.item!);
  }

  updateEnemy(e: Enemy, dt: number): void {
    if (e.state === 'dead') return;
    const p = this.player;
    const age = this.time - e.stateAt;
    const dist = distance(e, p);
    const isBoss = e.def.id === 'boss';
    if (isBoss && e.phase === 1 && e.hp < e.maxHp * 0.48 && e.state !== 'broken') {
      this.phaseBoss(e);
      return;
    }
    if (e.burns > this.time) this.pressure(e, 5 * dt);
    if (e.state === 'broken') {
      if (age > 5) {
        e.state = 'recover';
        e.stateAt = this.time;
        e.posture = e.maxPosture * 0.4;
        e.hp = Math.max(e.hp, e.maxHp * 0.2);
        e.readyAt = this.time + 1;
      }
      return;
    }
    if (e.state === 'tell') {
      if (age < e.strike.windup - 0.2) {
        const lead =
          e.strike.projectile && this.floor.depth >= 4
            ? Math.min(0.2, this.floor.depth * 0.018)
            : 0;
        e.facing = Math.atan2(
          p.y + this.movement.y * BALANCE.speed * lead - e.y,
          p.x + this.movement.x * BALANCE.speed * lead - e.x,
        );
      }
      if (e.strike.kind === 'feint' && age >= e.strike.windup) {
        e.state = 'recover';
        e.stateAt = this.time;
        e.readyAt = this.time + 0.15;
        // The aborted tell keeps its spacing reservation, then flows into the next beat.
        return;
      }
      if (age >= e.strike.windup) {
        e.state = 'active';
        e.stateAt = this.time;
        if (e.strike.area) return;
        if (e.strike.projectile) {
          this.arsenal.fireEnemy(e);
          return;
        }
        if (dist < e.strike.reach + Math.max(60, e.strike.step ?? 0))
          this.move(
            e,
            Math.cos(e.facing) * (e.strike.step ?? 18),
            Math.sin(e.facing) * (e.strike.step ?? 18),
          );
        if (e.strike.kind !== 'grab')
          this.effect(
            e.x,
            e.y,
            'slash',
            ['sweep', 'grab', 'smash'].includes(e.strike.kind) ? '#e48b79' : '#e6b679',
            0.28,
            e.strike.reach / 90,
            e.facing,
          );
        if (e.strike.kind !== 'grab')
          Object.assign(this.effects[this.effects.length - 1], {
            weapon:
              e.def.id === 'spear'
                ? 'spear'
                : ['brute', 'boss'].includes(e.def.id)
                  ? 'great'
                  : e.def.id === 'assassin'
                    ? 'twins'
                    : 'sword',
            attackKind: e.strike.kind,
          });
        if (e.strike.kind === 'smash') {
          this.environmentImpact(e.x + Math.cos(e.facing) * 55, e.y + Math.sin(e.facing) * 55, 1.5);
          this.hitStop = this.save.settings.reducedMotion ? 0.015 : 0.035;
        }
        if (e.strike.echo) {
          const x = e.x + Math.cos(e.facing) * 65,
            y = e.y + Math.sin(e.facing) * 65;
          this.echoes.push({ enemy: e.id, x, y, at: this.time + 0.9, radius: 95 });
          this.effect(x, y, 'ring', '#e6a074', 0.9, 2.4);
        }
        this.enemyHit(e);
      }
      return;
    }
    if (e.state === 'active') {
      if (age > 0.14) {
        e.state = 'recover';
        e.stateAt = this.time;
        e.readyAt = this.time + e.strike.recovery;
      }
      return;
    }
    if (e.state === 'recover') {
      if (this.time >= e.readyAt) {
        e.state = 'idle';
        e.stateAt = this.time;
      }
      return;
    }
    if (this.time - e.lastPressure > (dist < 180 ? 1.8 : 1.1))
      e.posture = Math.max(0, e.posture - dt * (dist < 180 ? 4.5 : 9) * (0.35 + e.hp / e.maxHp));
    e.facing = Math.atan2(p.y - e.y, p.x - e.x);
    if (this.tryContextAttack(e, dist)) return;
    if (['archer', 'hexer'].includes(e.def.id)) {
      this.arsenal.updateEnemy(e, dt);
      return;
    }
    const primary = this.target === e;
    const preferred =
      e.def.id === 'spear'
        ? 140
        : e.def.id === 'shield'
          ? 70
          : e.def.id === 'duelist'
            ? 105
            : isBoss
              ? 110
              : 78;
    const speed =
      e.def.speed * (this.room.modifier === 'Resonant' ? 1.12 : 1) * (e.phase === 2 ? 1.15 : 1);
    if (dist > preferred + (!primary && this.presentation.duel > 0.4 ? 95 : 0)) {
      const orbit =
        !primary && this.threats.reservations.some((r) => r.enemy !== e.id && r.at > this.time);
      let angle = e.facing + (orbit ? (e.id % 2 ? -0.7 : 0.7) : 0);
      const blocked =
        !canStand(this.room, e.x + Math.cos(angle) * 32, e.y + Math.sin(angle) * 32) ||
        this.obstacles.some(
          (o) =>
            Math.hypot(e.x + Math.cos(angle) * 32 - o.x, e.y + Math.sin(angle) * 32 - o.y) <
            o.radius + 18,
        );
      if (blocked || e.path?.length) {
        if (!e.pathAt || this.time - e.pathAt > 0.6) {
          e.path = pathBetween(this.room, e, p);
          e.pathAt = this.time;
        }
        while (e.path?.length && distance(e, e.path[0]) < 24) e.path.shift();
        if (e.path?.[0]) angle = Math.atan2(e.path[0].y - e.y, e.path[0].x - e.x);
      }
      this.move(e, Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt);
    } else if (!primary && this.alive.length > 1 && !this.training) {
      const angle = e.facing + (e.id % 2 ? -Math.PI / 2 : Math.PI / 2);
      this.move(e, Math.cos(angle) * speed * dt * 0.3, Math.sin(angle) * speed * dt * 0.3);
    }
    if (dist < e.strike.reach + 25 && this.time >= e.readyAt && p.state !== 'finisher') {
      const patterns = e.phase === 2 && e.def.phaseTwo ? e.def.phaseTwo : e.def.patterns;
      if (e.index === 0 && this.lab.pattern < 0) {
        if (e.variant > 0)
          e.pattern = this.rewardRng.weighted(
            patterns.map((_, i) => i),
            (i) =>
              e.recentPatterns.includes(i)
                ? 0.2
                : dist > 125 && patterns[i][0].kind === 'thrust'
                  ? 2
                  : 1,
          );
        if (e.counterQueued && e.def.id === 'duelist') e.pattern = 3;
        else if (p.emptyParries >= 2 && ['assassin', 'duelist'].includes(e.def.id)) e.pattern = 2;
        else if (e.def.id === 'spear' && dist > 120) e.pattern = 1;
      }
      if (this.debug && this.lab.pattern >= 0) e.pattern = this.lab.pattern;
      const pattern = patterns[e.pattern % patterns.length];
      const next = this.training
        ? { kind: 'slash' as const, windup: 0.95, recovery: 1.2, damage: 8, reach: 110 }
        : pattern[e.index % pattern.length];
      const haste = Math.max(0.82, 1 - (this.floor.depth - 1) * 0.012) * (e.phase === 2 ? 0.82 : 1);
      const patience = this.room.kind === 'elite' && this.room.elite === 'Patient' ? 1.22 : 1;
      const strike = {
        ...next,
        windup: next.area
          ? AREA_RULES[AREA_KINDS[this.floor.biome]].warning
          : next.windup * haste * patience,
        recovery:
          next.recovery *
          (this.room.kind === 'elite' && this.room.elite === 'Relentless' ? 0.65 : 1),
      };
      if (
        this.room.kind === 'elite' &&
        this.room.elite === 'Patient' &&
        e.variant % 4 === 2 &&
        ['slash', 'thrust'].includes(strike.kind)
      ) {
        strike.kind = 'feint';
        strike.recovery = 0.18;
      }
      if (
        this.enemies.some(
          (other) =>
            other !== e &&
            other.state !== 'dead' &&
            distance(other, e) < dist &&
            distance(other, p) < dist &&
            Math.abs(angleDifference(Math.atan2(other.y - e.y, other.x - e.x), e.facing)) < 0.25,
        )
      )
        return;
      if (
        !this.threats.reserve(
          e.id,
          this.time,
          strike,
          this.floor.depth,
          strike.projectile ? this.arsenal.travel(strike, dist) : 0,
          this.network?.id,
        )
      )
        return;
      e.strike = strike;
      if (e.index === 0) e.recentPatterns = [...e.recentPatterns.slice(-1), e.pattern];
      e.variant++;
      e.counterQueued = false;
      e.index++;
      if (e.index >= pattern.length) {
        if (this.room.kind === 'elite' && this.room.elite === 'Relentless' && !e.chainExtended) {
          e.index = pattern.length - 1;
          e.chainExtended = true;
        } else {
          if (e.chainExtended) e.strike.recovery += 0.5;
          e.chainExtended = false;
          e.index = 0;
          e.pattern =
            (e.pattern + 1) %
            Math.min(patterns.length, this.floor.depth >= 3 || e.phase === 2 ? patterns.length : 2);
        }
      }
      this.beginTell(e);
    }
  }

  updateAreaPressure(): void {
    const worlds = this.network?.active() ?? [this];
    this.threats.zoneTargets.clear();
    for (const w of worlds)
      if (this.areas.active.some((a) => areaContains(a, w.player.x, w.player.y, this.time)))
        this.threats.zoneTargets.add(w.network?.id ?? 0);
  }
  stepAreas(): void {
    if (this.onlineMode === 'duel' || this.network?.strike) return;
    const worlds = this.network?.active() ?? [this];
    this.areas.update(
      this.time,
      worlds.map((w) => ({
        id: w.network?.id ?? 0,
        x: w.player.x,
        y: w.player.y,
        team: 'player',
        alive: w.player.hp > 0,
        hit: (a) => w.areaHit(a),
      })),
    );
  }
  private areaHit(a: AreaEffect): void {
    const p = this.player;
    if (this.time - p.dodgeAt < BALANCE.dodgeInvulnerable || p.state === 'finisher') return;
    if (this.invincible || this.time < p.immunity || p.hp <= 0) return;
    const before = p.hp;
    this.hurt(
      a.damage,
      AREA_RULES[a.kind].status === 'poison' ? 'LEAVE THE SPORE CLOUD' : 'THE GROUND AWAKENS',
      undefined,
      a.postureDamage,
    );
    if (p.hp >= before) return;
    this.telemetry.areaHits++;
    if (a.status === 'poison') p.poisonUntil = this.time + 1.3;
    if (a.status === 'frost') p.frostUntil = this.time + 0.9;
  }
  spawnArea(e?: Enemy): AreaEffect | undefined {
    if (this.onlineMode === 'duel' || this.network?.strike) return;
    const p = this.player,
      count = this.network?.active().length ?? 1;
    if (!canStand(this.room, p.x, p.y, 8)) return;
    const zone = this.areas.spawn(
      this.floor.biome,
      e?.id ?? -1,
      p.x,
      p.y,
      this.time,
      count,
      e ?? p,
    );
    if (zone && e) {
      e.areaReady = this.time + (e.def.id === 'boss' && e.phase === 2 ? 5.5 : 9);
      if (e.def.id === 'boss' && e.phase === 2) {
        const others = this.network?.active().filter((w) => w !== this) ?? [];
        const second = others[e.variant % Math.max(1, others.length)]?.player;
        const offset = [135, -120, 100, -135, 125][this.floor.biome];
        const x = second?.x ?? p.x + offset,
          y = second?.y ?? p.y + (this.floor.biome === 2 ? 70 : 0);
        if (canStand(this.room, x, y, 12)) {
          const lane = this.areas.spawn(this.floor.biome, e.id, x, y, this.time, count, e);
          if (lane) {
            lane.armAt += 0.5;
            lane.expireAt += 0.5;
          }
        }
      }
    }
    return zone;
  }
  private tryContextAttack(e: Enemy, dist: number): boolean {
    if (
      this.training ||
      this.network?.strike ||
      this.time < e.readyAt ||
      this.time < (e.punishReady ?? 0)
    )
      return false;
    const p = this.player,
      age = this.time - p.stateAt,
      boss = e.def.id === 'boss';
    const caster = ['warden', 'monk', 'hexer', 'brute'].includes(e.def.id);
    let strike: Strike | undefined;
    if (
      (boss || caster) &&
      this.time >= (e.areaReady ?? 3) &&
      dist < 530 &&
      (boss ||
        p.state === 'item' ||
        dist > 230 ||
        this.dodgeHistory.filter((t) => this.time - t < 5).length >= 3 ||
        e.variant % 3 === 2)
    )
      strike = {
        kind: ['thrust', 'sweep', 'grab', 'smash', 'smash'][this.floor.biome] as Strike['kind'],
        windup: 1.3,
        recovery: 1.3,
        damage: 0,
        reach: 530,
        area: true,
      };
    else if (
      ['duelist', 'assassin', 'spear'].includes(e.def.id) &&
      dist < 235 &&
      (p.state === 'item' ||
        (p.state === 'attack' && age > p.attackStartup && this.time < this.whiffUntil))
    )
      strike = { kind: 'thrust', windup: 0.62, recovery: 1, damage: 19, reach: 160, step: 65 };
    else if (
      (p.emptyParries >= 2 || this.dodgeHistory.filter((t) => this.time - t < 5).length >= 3) &&
      dist < 165 &&
      e.variant % 2 === 1
    )
      strike = { kind: 'sweep', windup: 1.22, recovery: 1.15, damage: 21, reach: 175, step: 20 };
    if (!strike) return false;
    if (strike.area) strike.windup = AREA_RULES[AREA_KINDS[this.floor.biome]].warning;
    if (strike.area && this.time < (e.areaReady ?? 0)) return false;
    if (!lineOfSight(this.room, this.obstacles, e, p)) return false;
    if (!this.threats.reserve(e.id, this.time, strike, this.floor.depth, 0, this.network?.id ?? 0))
      return false;
    e.strike = strike;
    e.punishReady = this.time + 4.5;
    e.variant++;
    this.beginTell(e);
    return true;
  }

  private beginTell(e: Enemy): void {
    if (
      !this.threats.reservations.some((r) => r.enemy === e.id) &&
      !this.threats.reserve(e.id, this.time, e.strike, this.floor.depth, 0, this.network?.id)
    )
      return;
    if (e.strike.area) {
      if (this.time < (e.areaReady ?? 0)) {
        this.threats.release(e.id);
        e.readyAt = this.time + 0.6;
        return;
      }
      const zone = this.spawnArea(e);
      if (!zone) {
        this.threats.release(e.id);
        e.readyAt = this.time + 1;
        return;
      }
      e.strike = { ...e.strike, windup: zone.armAt - this.time };
    }
    e.state = 'tell';
    e.stateAt = this.time;
    if (this.room.modifier !== 'Silence') this.audio.play('tell', e.def.id);
  }
  enemyHit(e: Enemy, intercepted = false): void {
    if (this.network && !intercepted) {
      const candidates = this.network
        .active()
        .filter(
          (w) =>
            w.player.hp > 0 &&
            w.player.state !== 'dead' &&
            distance(e, w.player) <= e.strike.reach + 24 &&
            Math.abs(angleDifference(Math.atan2(w.player.y - e.y, w.player.x - e.x), e.facing)) <=
              (e.strike.kind === 'sweep' ? 2.6 : 1.2),
        );
      const defender = candidates.find((w) => {
        const defense = resolveDefense({
          strike: e.strike,
          distance: distance(e, w.player),
          parryAge: w.time - w.player.parryAt,
          dodgeAge: w.time - w.player.dodgeAt,
          weapon: w.weapon,
          assist: false,
          bonusWindow: w.bonusWindow,
        });
        return defense === 'perfect' || defense === 'parry';
      });
      if (defender) {
        defender.enemyHit(e, true);
        return;
      }
      for (const w of candidates) w.enemyHit(e, true);
      return;
    }
    const p = this.player;
    if (this.time < p.immunity || p.state === 'finisher') return;
    const facing = Math.atan2(p.y - e.y, p.x - e.x);
    if (Math.abs(angleDifference(facing, e.facing)) > (e.strike.kind === 'sweep' ? 2.6 : 1.2))
      return;
    const dist = distance(e, p);
    if (
      this.alive.some(
        (other) =>
          other.id !== e.id &&
          other.state !== 'broken' &&
          distance(e, other) < dist &&
          distance(p, other) < dist &&
          Math.abs(angleDifference(Math.atan2(other.y - e.y, other.x - e.x), facing)) < 0.25,
      )
    )
      return;
    const defense = resolveDefense({
      strike: e.strike,
      distance: distance(e, p),
      parryAge: this.time - p.parryAt,
      dodgeAge: this.time - p.dodgeAt,
      weapon: this.weapon,
      assist: this.save.settings.assist || this.training,
      bonusWindow: this.bonusWindow - Math.min(0.075, p.emptyParries * 0.025),
    });
    if (defense === 'miss') return;
    if (defense === 'dodge') {
      this.emit('dodge', e);
      p.focus += 9;
      this.announce('GHOST STEP', 'A breath between the blades.', '#abc9d1', 0.8);
      return;
    }
    if (defense === 'parry' || defense === 'perfect') {
      const perfect = defense === 'perfect';
      p.parryLanded = true;
      p.emptyParries = 0;
      e.recoilAt = this.time;
      this.bonusWindow = 0;
      this.lastPerfect = perfect;
      this.stats.parries++;
      p.focus += perfect ? 18 : 9;
      p.posture = Math.max(0, p.posture - (perfect ? 20 : 8));
      p.counterUntil = this.time + 0.8;
      p.state = 'idle';
      this.offerRiposte(e, perfect);
      if (perfect) {
        this.network?.perfect?.(e);
        if (this.weapon.id === 'sword') this.rechargeRanged(1);
        this.stats.perfects++;
        this.stats.streak++;
        this.roomPerfects++;
        this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
        this.trainingDone.add('perfect');
      } else this.stats.streak = 0;
      this.trainingDone.add('parry');
      this.impact(
        (p.x + e.x) / 2,
        (p.y + e.y) / 2 - 18,
        perfect ? '#fff1c4' : '#badfe5',
        perfect ? 44 : 20,
        perfect ? 'perfect' : 'ring',
        perfect ? 1.3 : 0.7,
        true,
        p.facing + Math.PI / 2,
      );
      this.environmentImpact((p.x + e.x) / 2, (p.y + e.y) / 2, perfect ? 0.75 : 0.3);
      this.hitStop = this.save.settings.reducedMotion ? 0.025 : perfect ? 0.065 : 0.032;
      this.audio.play(perfect ? 'perfect' : 'parry', e.def.id);
      this.announce(
        perfect ? 'PERFECT DEFLECTION' : 'DEFLECTED',
        perfect ? 'Their guard fractures. Press the advantage.' : 'Strike now to counter.',
        perfect ? '#f2d7a1' : '#b9d8df',
        0.85,
      );
      this.pressure(
        e,
        posturePressure(perfect ? BALANCE.perfectPressure : BALANCE.parryPressure, p.focus, false) *
          (this.weapon.id === 'shinobi' ? (perfect ? 1.4 : 1.2) : 1) *
          (perfect && this.room.kind === 'elite' && this.room.elite === 'Armored' ? 1.2 : 1),
      );
      this.emit('parry', e);
      if (perfect) this.emit('perfect', e);
    } else {
      const before = { ...p };
      this.hurt(
        e.strike.damage,
        e.strike.kind === 'sweep'
          ? 'SWEEP — EVADE WITH SPACE'
          : e.strike.kind === 'grab'
            ? 'GRAB — DODGE AWAY'
            : e.strike.kind === 'smash'
              ? 'HEAVY SMASH — DODGE THE IMPACT'
              : 'A LATE GUARD',
        e,
      );
      this.network?.contact?.(e, before.hp - p.hp, before);
    }
  }

  hurt(amount: number, reason: string, enemy?: Enemy, postureDamage = amount * 1.7): void {
    const p = this.player;
    if (p.hp <= 0) return;
    if (this.invincible || this.time < p.immunity) return;
    if (this.buffs.consume('ward')) {
      this.effect(p.x, p.y, 'ring', '#d5efcd', 0.4, 1.4);
      p.immunity = this.time + 0.3;
      return;
    }
    const damage = Math.max(0, amount * this.buffs.modifier('incoming') - this.ward);
    this.ward = 0;
    p.hp -= damage;
    this.stats.damage += damage;
    this.roomDamage += damage;
    p.posture += postureDamage * this.buffs.modifier('incomingPosture');
    this.pendingItem = undefined;
    p.focus = this.relics.some((r) => r.id === 'glass') ? 0 : Math.max(0, p.focus - 28);
    this.hunger = 0;
    this.stats.streak = 0;
    p.state = p.posture >= 100 ? 'stagger' : 'hurt';
    p.stateAt = this.time;
    if (p.posture >= 100) p.posture = 0;
    p.parryAt = -99;
    p.immunity = this.time + 0.48;
    if (enemy) this.move(p, Math.cos(enemy.facing) * 24, Math.sin(enemy.facing) * 24);
    this.impact(p.x, p.y - 18, '#df8e7a', 15, 'hurt', 0.8);
    this.audio.play('hurt');
    this.announce(
      reason,
      enemy
        ? `${enemy.def.name} · ${Math.round(damage)} vitality lost`
        : 'Watch the ground before it awakens.',
      '#e1a28b',
      1.6,
    );
    this.emit('hurt', enemy);
  }

  pressure(e: Enemy, amount: number): void {
    if (this.network?.pressure?.(e, amount)) return;
    if (e.state === 'dead' || e.state === 'broken') return;
    e.posture += amount;
    e.lastPressure = this.time;
    if (e.posture >= e.maxPosture) this.breakEnemy(e);
  }
  private breakEnemy(e: Enemy): void {
    if (e.state === 'broken' || e.state === 'dead') return;
    this.telemetry.guardBreaks++;
    e.posture = e.maxPosture;
    e.state = 'broken';
    e.stateAt = this.time;
    this.threats.release(e.id);
    this.impact(e.x, e.y - 20, '#ff856c', 35, 'break', 1.6, true, this.player.facing);
    this.environmentImpact(e.x, e.y, 1.2);
    this.trainingDone.add('guard');
    this.audio.play('break');
    this.hitStop = this.save.settings.reducedMotion ? 0.025 : 0.08;
    this.announce(
      'GUARD BROKEN',
      'Close the distance. E to deliver the final toll.',
      '#f0cf93',
      2.5,
    );
    this.emit('break', e);
    if (this.weapon.id === 'great') this.rechargeRanged(2);
  }
  private finish(e: Enemy): void {
    if (e.state !== 'broken') return;
    const p = this.player;
    p.state = 'finisher';
    p.finisherTarget = e.def.id;
    p.finisherVariant = executionVariant(this.seed, this.weapon.id, this.stats.finishers);
    const execution = EXECUTIONS[this.weapon.id][p.finisherVariant];
    p.stateAt = this.time;
    p.immunity = this.time + 1.1;
    p.facing = Math.atan2(e.y - p.y, e.x - p.x);
    const offset = this.weapon.id === 'spear' ? 75 : 42;
    p.x = e.x - Math.cos(p.facing) * offset;
    p.y = e.y - Math.sin(p.facing) * offset;
    this.move(p, 0, 0);
    const style = ['boss', 'shield'].includes(e.def.id)
      ? finisherStyle(this.weapon.id, e.def.id, this.lastPerfect)
      : execution.name.toUpperCase();
    this.effect(
      e.x,
      e.y - 16,
      'finish',
      '#f8d39a',
      0.8,
      this.weapon.id === 'great' ? 2 : 1.5,
      p.facing,
    );
    Object.assign(this.effects[this.effects.length - 1], {
      weapon: this.weapon.id,
      attackKind: execution.kind,
    });
    this.execution = {
      at: this.time + EXECUTION_DURATION * EXECUTION_CONTACT,
      x: e.x,
      y: e.y - 16,
      force: this.weapon.id === 'great' ? 2.3 : 1.7,
    };
    this.stats.finishers++;
    this.trainingDone.add('finisher');
    this.emit('finisher', e);
    if (e.def.id === 'boss') {
      e.hp = Math.max(0, e.hp - e.maxHp * 0.32);
      if (e.hp > 0) {
        if (e.phase === 1 && e.hp <= e.maxHp * 0.5) this.phaseBoss(e);
        else {
          e.state = 'recover';
          e.stateAt = this.time;
          e.readyAt = this.time + 1.65;
          e.posture = 0;
        }
        this.announce(
          'THE GUARDIAN FALTERS',
          'A third of its vitality severed. The oath endures.',
          '#e3b889',
          2.5,
        );
        this.threats.release(e.id);
        return;
      }
    }
    {
      e.state = 'dead';
      e.stateAt = this.time + 0.35;
      this.stats.kills++;
      p.focus += 8;
      if (e.def.id === 'boss') {
        this.stats.bosses++;
        this.telemetry.phaseDurations.push(
          this.time - (e.phaseStartedAt ?? this.telemetry.phaseAt),
        );
      }
      this.announce(
        style,
        e.def.id === 'boss'
          ? 'At last, the bell remembers its voice.'
          : 'An oath kept. A soul released.',
        '#ebd3a2',
        1.7,
      );
      for (const other of this.alive)
        other.readyAt = Math.min(
          other.readyAt,
          this.time + (this.room.modifier === 'Blood pact' ? 0.7 : 1),
        );
    }
    this.threats.release(e.id);
    this.echoes = this.echoes.filter((echo) => echo.enemy !== e.id);
    this.network?.finish?.(e);
  }
  private phaseBoss(e: Enemy): void {
    this.telemetry.phaseDurations.push(this.time - (e.phaseStartedAt ?? this.telemetry.phaseAt));
    this.telemetry.phaseAt = this.time;
    e.phaseStartedAt = this.time;
    e.phase = 2;
    e.state = 'recover';
    e.stateAt = this.time;
    e.readyAt = this.time + 1.4;
    e.posture = 0;
    this.threats.release(e.id);
    this.echoes = this.echoes.filter((echo) => echo.enemy !== e.id);
    e.pattern = 0;
    e.index = 0;
    this.environmentImpact(e.x, e.y, 2);
    this.impact(e.x, e.y, e.def.color, 45, 'ring', 2);
    this.announce(
      'THE SECOND TOLL',
      [
        'The shield oath breaks. The blade remains.',
        'The drowned bells answer in crossing waves.',
        'The shell parts. The living heart leaps.',
        'The ice cracks. The white wind rises.',
        'The furnace heart is laid bare.',
      ][this.floor.biome],
      e.def.color,
      2.3,
    );
  }

  private emit(event: RelicEvent, target?: Enemy): void {
    for (const relic of this.relics) {
      if (relic.event !== event) continue;
      switch (relic.effect) {
        case 'heal':
          if (relic.id !== 'blood' || this.player.hp < 50)
            this.player.hp = Math.min(100, this.player.hp + relic.amount);
          break;
        case 'focus':
          if (relic.id !== 'still' || this.time - this.lastMoved > 0.4)
            this.player.focus += relic.amount;
          break;
        case 'ward':
          this.ward = Math.max(this.ward, relic.amount);
          break;
        case 'window':
          this.bonusWindow = relic.amount;
          break;
        case 'hunger':
          this.hunger += relic.amount;
          break;
        case 'burn':
          if (target) target.burns = this.time + 3;
          break;
        case 'mirror':
          if (target && this.stats.parries % 3 === 0 && target.def.id !== 'boss') {
            this.player.x = target.x + Math.cos(target.facing) * -55;
            this.player.y = target.y + Math.sin(target.facing) * -55;
            this.move(this.player, 0, 0);
            this.player.counterUntil = this.time + 1;
          }
          break;
        case 'chain':
          for (const e of this.alive)
            if (e !== target) {
              e.hp -= relic.amount;
              this.pressure(e, relic.amount);
              if (e.hp <= 0) this.breakEnemy(e);
            }
          break;
        case 'echo':
          if (this.stats.perfects % 3 !== 0) break;
          this.relicPulse(relic.amount);
          break;
        case 'pressure':
          this.relicPulse(relic.amount);
          break;
      }
    }
    if (this.room.modifier === 'Unstable' && event === 'perfect') this.relicPulse(9);
  }
  private relicPulse(amount: number): void {
    this.effect(this.player.x, this.player.y, 'ring', '#b9d6cf', 0.5, 2);
    for (const e of this.alive) if (distance(e, this.player) < 260) this.pressure(e, amount);
  }

  private autoPassage(): void {
    if (
      this.mode !== 'playing' ||
      this.combat ||
      this.clearAt ||
      this.training ||
      this.player.state !== 'idle'
    )
      return;
    for (const id of this.room.links) {
      const next = this.floor.rooms[id];
      const direction = { x: Math.sign(next.x - this.room.x), y: Math.sign(next.y - this.room.y) };
      if (
        distance(this.player, doorPosition(this.room, next)) < 52 &&
        this.movement.x * direction.x + this.movement.y * direction.y > 0.3
      ) {
        this.enterRoom(id, this.room);
        return;
      }
    }
  }
  private interact(): void {
    const p = this.player;
    const broken = this.alive.find(
      (e) => e.state === 'broken' && distance(e, p) < BALANCE.finisherRange,
    );
    if (broken) {
      this.finish(broken);
      return;
    }
    const pickup = this.pickups.find(
      (i) =>
        (!i.owner || i.owner === this.pickupOwner) &&
        i.room === this.roomId &&
        i.depth === this.floor.depth &&
        distance(i, p) < 75,
    );
    if (pickup) {
      if (this.inventory.add(pickup.item)) {
        this.pickups = this.pickups.filter((i) => i !== pickup);
        this.announce(
          ITEMS.find((i) => i.id === pickup.item)!.name.toUpperCase(),
          'Consumable · Q to use · 1 / 2 to cycle.',
          '#c5dcca',
          2,
        );
      } else
        this.announce(
          'SATCHEL FULL',
          'Carry five offerings, at most two of each. Use one before taking this.',
          '#d0bd9c',
          2,
        );
      return;
    }
    if (this.combat) return;
    if (this.network) {
      this.network.transition(this);
      return;
    }
    if (!this.room.claimed && distance(p, { x: 560, y: 365 }) < 110) {
      if (this.room.kind === 'exit') {
        if (!this.floor.rooms.some((r) => r.kind === 'boss' && r.cleared)) {
          this.announce(
            'THE DESCENT IS SEALED',
            'The guardian still keeps its oath.',
            '#e3b889',
            2,
          );
          return;
        }
        const hp = p.hp,
          focus = p.focus;
        this.floor = makeFloor(this.seed, this.floor.depth + 1);
        this.enterRoom(0);
        p.hp = Math.min(100, hp + 18);
        p.focus = focus;
        if (!this.laboratory) {
          this.save.bestDepth = Math.max(this.save.bestDepth, this.floor.depth);
          persist(this.save);
        }
        this.announce(
          BIOMES[this.floor.biome].name.toUpperCase(),
          `DEPTH ${String(this.floor.depth).padStart(2, '0')} · ${this.floor.hybrid === null ? BIOMES[this.floor.biome].label : `MUTATION: ${BIOMES[this.floor.hybrid].short.toUpperCase()}`}`,
          '#dfc99f',
          3,
        );
        this.events.push({ type: 'floor' });
        return;
      }
      if (this.room.kind === 'healing') {
        p.hp = Math.min(100, p.hp + 40);
        this.room.claimed = true;
        this.impact(560, 365, '#abcfc0', 24, 'ring', 1.5);
        this.audio.play('clear');
        this.announce('A MOMENT OF MERCY', '40 vitality restored.', '#b8d8c8', 2);
        return;
      }
      if (['treasure', 'shrine', 'secret'].includes(this.room.kind)) {
        this.room.claimed = true;
        this.resolveLoot();
        return;
      }
    }
    for (const id of this.room.links)
      if (distance(p, doorPosition(this.room, this.floor.rooms[id])) < 115) {
        const old = this.room;
        this.enterRoom(id, old);
        return;
      }
  }

  private clearRoom(): void {
    this.room.cleared = true;
    this.areas.clear();
    this.stats.rooms++;
    const grade =
      this.roomDamage === 0 && this.roomPerfects > 1
        ? 'S'
        : this.roomDamage < 15
          ? 'A'
          : this.roomDamage < 35
            ? 'B'
            : 'C';
    this.announce(
      'THE CHAMBER FALLS SILENT',
      `RANK ${grade} · ${this.roomPerfects} PERFECT DEFLECTIONS`,
      '#dbc89e',
      2.3,
    );
    this.audio.play('clear');
    this.audio.ambience(false, false);
    this.emit('clear');
    this.clearAt = this.time + 1.8;
  }
  openReward(): void {
    this.rewards = this.loot.choices(this.relics, this.room.kind);
    if (!this.rewards.length) {
      this.dropItem('silver');
      this.announce(
        'SILVER IN THE SILENCE',
        'This oath holds no new relic. A rare offering remains.',
        '#d4e6dd',
        2,
      );
      return;
    }
    this.mode = 'reward';
    this.events.push({ type: 'reward' });
    this.audio.ambience(false, true);
    this.buffer.clear();
  }
  chooseRelic(id: string): void {
    const relic = this.rewards.find((r) => r.id === id);
    if (!relic || this.mode !== 'reward') return;
    this.relics.push(relic);
    this.stats.relicsByFloor[this.floor.depth] =
      (this.stats.relicsByFloor[this.floor.depth] ?? 0) + 1;
    if (!this.laboratory) {
      if (!this.save.relics.includes(id)) this.save.relics.push(id);
      persist(this.save);
    }
    this.mode = 'playing';
    this.rewards = [];
    this.announce(relic.name.toUpperCase(), relic.description, '#d5c69d', 3);
    this.audio.play('clear');
    this.audio.ambience(this.combat, false);
  }

  private die(): void {
    this.telemetry.deaths++;
    this.buffs.clear();
    this.inventory.clear();
    this.pendingItem = undefined;
    this.projectiles.clear();
    this.mode = 'dead';
    this.player.state = 'dead';
    this.audio.play('death');
    this.audio.ambience(false, true);
    this.settleRun();
    this.events.push({ type: 'death' });
  }
  settleRun(): void {
    if (this.network) return;
    if (this.settled || this.training || this.laboratory) return;
    this.settled = true;
    recordRun(this.seed, this.character.id, this.floor.depth, this.stats);
    this.save.runs++;
    this.save.kills += this.stats.kills;
    this.save.embers += this.stats.kills + this.stats.rooms * 2 + this.stats.bosses * 10;
    this.save.bestDepth = Math.max(this.save.bestDepth, this.floor.depth);
    if (!this.save.weapons.includes(this.weapon.id)) this.save.weapons.push(this.weapon.id);
    persist(this.save);
  }

  private move(body: { x: number; y: number }, dx: number, dy: number): void {
    moveBody(body, dx, dy, this.room, this.obstacles);
  }
  private separateEnemies(): void {
    const living = this.alive;
    if (!['dodge', 'finisher'].includes(this.player.state))
      for (const e of living) {
        const d = distance(e, this.player);
        if (d < 46 && e.state !== 'broken') {
          const angle = Math.atan2(e.y - this.player.y, e.x - this.player.x);
          this.move(e, Math.cos(angle) * (46 - d) * 0.65, Math.sin(angle) * (46 - d) * 0.65);
          this.move(
            this.player,
            -Math.cos(angle) * (46 - d) * 0.35,
            -Math.sin(angle) * (46 - d) * 0.35,
          );
        }
      }
    for (let i = 0; i < living.length; i++)
      for (let j = i + 1; j < living.length; j++) {
        const a = living[i],
          b = living[j],
          d = distance(a, b);
        if (d < 48) {
          const angle = Math.atan2(a.y - b.y, a.x - b.x);
          this.move(a, Math.cos(angle) * 1.8, Math.sin(angle) * 1.8);
          this.move(b, -Math.cos(angle) * 1.8, -Math.sin(angle) * 1.8);
        }
      }
  }
  inZone(body: { x: number; y: number }, kind: string): boolean {
    if (kind === 'water') return body.y > 480 && body.x > 380 && body.x < 740;
    return Math.hypot(body.x - 560, body.y - 250) < (kind === 'fungal' ? 100 : 65);
  }
  private updateHazards(): void {
    if (this.network?.strike) return;
    if (
      this.time < this.player.immunity ||
      this.player.state === 'dodge' ||
      this.player.state === 'finisher'
    )
      return;
    const active = this.time % 5 > 3.4;
    const biomes = [this.floor.biome, this.floor.hybrid];
    if (active && biomes.includes(4) && this.inZone(this.player, 'lava'))
      this.hurt(10, 'THE FURNACE EXHALES');
    if (active && biomes.includes(2) && this.inZone(this.player, 'fungal'))
      this.hurt(6, 'SPORES IN YOUR LUNGS');
    if (
      this.room.kind === 'hazard' &&
      active &&
      Math.abs(this.player.x - 560) < 110 &&
      Math.abs(this.player.y - 380) < 180
    )
      this.hurt(9, 'THE PASSAGE AWAKENS');
  }

  announce(text: string, sub = '', color = '#d8c49a', duration = 2): void {
    this.toast = { text, sub, color, until: this.time + duration };
  }
  effect(
    x: number,
    y: number,
    kind: Effect['kind'],
    color: string,
    life: number,
    scale: number,
    angle = 0,
  ): void {
    this.effects.push({ x, y, kind, color, life, maxLife: life, scale, angle });
  }
  impact(
    x: number,
    y: number,
    color: string,
    count: number,
    kind: Effect['kind'],
    scale: number,
    contact = false,
    angle = 0,
  ): void {
    this.effect(x, y, kind, color, 0.45, scale, angle);
    this.effects[this.effects.length - 1].contact = contact;
    count = Math.ceil(count * GRAPHICS[this.save.settings.detail].particles);
    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2,
        speed = this.rng.int(70, 360) * scale;
      const life = this.rng.int(15, 60) / 100;
      this.particles.push({
        x,
        y,
        contact,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.65,
        life,
        maxLife: life,
        size: this.rng.int(1, 3),
        color,
      });
    }
    this.shake = Math.max(this.shake, kind === 'perfect' ? 5 * scale : 2);
    if (this.save.settings.flashes && kind === 'perfect') this.flash = 0.12 * scale;
  }

  environmentImpact(x: number, y: number, force: number): void {
    const biome = this.floor.biome;
    const color = ['#a99d84', '#9bdbec', '#c6a2ef', '#d6edf7', '#ffb15f'][biome];
    const count = Math.ceil(12 * force * GRAPHICS[this.save.settings.detail].particles);
    for (let i = 0; i < count; i++) {
      const a = i * 2.399963,
        life = 0.3 + this.rng.next() * 0.4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * 90 * force,
        vy: Math.sin(a) * 60 * force,
        life,
        maxLife: life,
        color,
        size: 2,
        ground: true,
      });
    }
    if (biome === 1 || force > 1) this.effect(x, y, 'ring', color, 0.5, force * 1.3);
  }
}
