import { schema, t, type SchemaType } from '@colyseus/schema';

export const PROTOCOL_VERSION = 8;
export const BUILD_VERSION = '0.8.0-candidate';
export const TICK_RATE = 30;
export const PATCH_MS = 50;
export const RECONNECT_SECONDS = 30;
export const INTERPOLATION_MS = 100;
export const COLORS = ['#dec38a', '#91c6e3', '#b6d5ac', '#c4a5d4'];
export const Input = schema(
  {
    sequence: t.uint32(),
    moveX: t.float32(),
    moveY: t.float32(),
    aimX: t.float32(),
    aimY: t.float32(),
    attack: t.boolean(),
    heavy: t.boolean(),
    parry: t.boolean(),
    dodge: t.boolean(),
    ranged: t.boolean(),
    interact: t.boolean(),
    item: t.boolean(),
    technique: t.boolean(),
    cycle: t.int8(),
    time: t.float64(),
  },
  'CanticleInput',
);
export type Input = SchemaType<typeof Input>;
export const BuffState = schema(
  { id: t.string(), startedAt: t.float32(), duration: t.float32(), source: t.string() },
  'CanticleBuff',
);
export const PickupState = schema(
  {
    owner: t.string(),
    item: t.string(),
    x: t.float32(),
    y: t.float32(),
    room: t.uint16(),
    depth: t.uint16(),
  },
  'CanticlePickup',
);
export const PlayerState = schema(
  {
    name: t.string(),
    weapon: t.string().default('sword'),
    color: t.string(),
    connected: t.boolean().default(true),
    ready: t.boolean(),
    score: t.uint8(),
    ack: t.uint32(),
    ping: t.uint16(),
    x: t.float32(),
    y: t.float32(),
    facing: t.float32(),
    hp: t.float32().default(100),
    posture: t.float32(),
    focus: t.float32(),
    state: t.string().default('idle'),
    stateAt: t.float32(),
    parryAt: t.float32(),
    dodgeAt: t.float32(),
    dodgeReady: t.float32(),
    immunity: t.float32(),
    counterUntil: t.float32(),
    riposteUntil: t.float32(),
    riposteTarget: t.int32().default(-1),
    ripostePerfect: t.boolean(),
    attackHit: t.boolean(),
    dx: t.float32(),
    dy: t.float32(),
    combo: t.uint8(),
    counter: t.boolean(),
    attackStartup: t.float32(),
    attackRecovery: t.float32(),
    poisonUntil: t.float32(),
    frostUntil: t.float32(),
    emptyParries: t.uint8(),
    parryLanded: t.boolean(),
    finisherTarget: t.string(),
    finisherVariant: t.uint8(),
    attackType: t.string(),
    comboUntil: t.float32(),
    rangedCharges: t.uint8(),
    recharge: t.float32(),
    relics: t.array('string'),
    rewards: t.array('string'),
    items: t.array('string'),
    selected: t.uint8(),
    kills: t.uint16(),
    perfects: t.uint16(),
    reflections: t.uint16(),
    rescues: t.uint16(),
    deaths: t.uint16(),
    loot: t.string(),
    slot: t.uint8(),
    buffs: t.array(BuffState),
  },
  'CanticlePlayer',
);
export type PlayerState = SchemaType<typeof PlayerState>;
export const StrikeState = schema(
  {
    kind: t.string(),
    area: t.boolean(),
    windup: t.float32(),
    recovery: t.float32(),
    damage: t.float32(),
    reach: t.float32(),
    step: t.float32(),
    projectile: t.string(),
    projectileRadius: t.float32(),
  },
  'CanticleStrike',
);
export const EnemyState = schema(
  {
    elite: t.boolean(),
    def: t.string(),
    x: t.float32(),
    y: t.float32(),
    facing: t.float32(),
    hp: t.float32(),
    maxHp: t.float32(),
    posture: t.float32(),
    maxPosture: t.float32(),
    state: t.string(),
    stateAt: t.float32(),
    readyAt: t.float32(),
    phase: t.uint8(),
    recoilAt: t.float32(),
    index: t.uint8(),
    pattern: t.uint8(),
    strike: t.ref(StrikeState),
  },
  'CanticleEnemy',
);
export type EnemyState = SchemaType<typeof EnemyState>;
export const ShotState = schema(
  {
    x: t.float32(),
    y: t.float32(),
    vx: t.float32(),
    vy: t.float32(),
    radius: t.float32(),
    owner: t.string(),
    team: t.string(),
    kind: t.string(),
    reflected: t.boolean(),
    lifetime: t.float32(),
  },
  'CanticleShot',
);
export type ShotState = SchemaType<typeof ShotState>;
export const AreaState = schema(
  {
    id: t.uint32(),
    source: t.int32(),
    biome: t.uint8(),
    kind: t.string(),
    team: t.string(),
    x: t.float32(),
    y: t.float32(),
    fromX: t.float32(),
    fromY: t.float32(),
    radius: t.float32(),
    warningRadius: t.float32(),
    createdAt: t.float32(),
    armAt: t.float32(),
    expireAt: t.float32(),
    damage: t.float32(),
    postureDamage: t.float32(),
    tickRate: t.float32(),
    status: t.string(),
  },
  'CanticleArea',
);
export const SessionState = schema(
  {
    protocol: t.uint8().default(PROTOCOL_VERSION),
    build: t.string().default(BUILD_VERSION),
    areas: t.map(AreaState),
    code: t.string(),
    mode: t.string(),
    phase: t.string().default('lobby'),
    host: t.string(),
    seed: t.string(),
    floor: t.uint16().default(1),
    room: t.uint16(),
    revision: t.uint32(),
    tick: t.uint32(),
    time: t.float64(),
    countdown: t.float32(),
    winner: t.string(),
    players: t.map(PlayerState),
    enemies: t.map(EnemyState),
    shots: t.map(ShotState),
    pickups: t.map(PickupState),
    cleared: t.array('number'),
    visited: t.array('number'),
    budget: t.float32().default(1),
  },
  'CanticleSession',
);
export type SessionState = SchemaType<typeof SessionState>;
export type OnlineMode = 'coop' | 'duel';
export const ACTIONS = [
  'attack',
  'heavy',
  'parry',
  'dodge',
  'ranged',
  'interact',
  'item',
  'technique',
] as const;
export function displayName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Choose a name, 1–20 letters or numbers.');
  const name = value.normalize('NFKC').trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'’-]{0,19}$/u.test(name))
    throw new Error('Choose a name, 1–20 letters or numbers.');
  return name;
}
