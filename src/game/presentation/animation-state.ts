import { animateCharacter, JOINTS, type AnimationSample, type Pose } from './animation';
import { BODY_PROFILES } from './profiles';
import type { Enemy, Player } from '../world';
import { RIPOSTE, riposteTravel } from '../riposte';

export const LOCOMOTION_STATES = [
  'idle',
  'long-idle',
  'run-start',
  'run',
  'turn',
  'stop-run',
  'combat-idle',
  'combat-forward',
  'combat-backward',
  'combat-strafe',
] as const;
const clamp = (n: number, limit = 1) => Math.max(-limit, Math.min(limit, n));
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const blendPose = (a: Pose, b: Pose, weight: number): Pose => {
  for (const joint of JOINTS)
    for (let i = 0; i < 3; i++) b[joint][i] = a[joint][i] + (b[joint][i] - a[joint][i]) * weight;
  for (const key of ['lift', 'advance', 'lean'] as const)
    b[key] = a[key] + (b[key] - a[key]) * weight;
  return b;
};

/** Per-actor presentation state. No gameplay clocks, movement speed or bones are networked. */
export class AnimationStateMachine {
  locomotion = 'idle';
  action = 'idle';
  weights = { locomotion: 1, action: 0, transition: 1 };
  facing = 0;
  hips = 0;
  cloth = 0;
  private x = 0;
  private y = 0;
  private at = -1;
  private speed = 0;
  private phase = 0;
  private idle = 0;
  private movingAt = 0;
  private stoppedAt = 0;
  private turn = 0;
  private key = '';
  private transitionAt = 0;
  private from?: Pose;
  private previous?: Pose;
  sample(
    id: string,
    entity: Player | Enemy,
    time: number,
    weapon: string,
    combat: boolean,
    options?: {
      clip: string;
      time: number;
      variant?: number;
      velocity?: number;
      turnRate?: number;
      targetFacing?: number;
      reducedMotion?: boolean;
    },
  ): AnimationSample {
    const first = this.at < 0 || time < this.at;
    const dt = first ? 0 : Math.min(0.1, Math.max(0, time - this.at));
    const dx = first ? 0 : entity.x - this.x,
      dy = first ? 0 : entity.y - this.y;
    const preview = options?.clip && options.clip !== 'live';
    const locomotionPreview =
      preview && (LOCOMOTION_STATES as readonly string[]).includes(options.clip);
    const rawSpeed = preview
      ? (options.velocity ?? 0)
      : dt > 0 && Math.hypot(dx, dy) < 120
        ? Math.hypot(dx, dy) / dt
        : 0;
    const wasMoving = this.speed > 14;
    const previousSpeed = this.speed;
    this.speed += (Math.min(330, rawSpeed) - this.speed) * (first ? 1 : 1 - Math.exp(-dt * 14));
    if (preview) this.speed = Math.min(330, rawSpeed);
    const moving = this.speed > 14;
    if (moving && !wasMoving) this.movingAt = time;
    if (!moving && wasMoving) this.stoppedAt = time;
    const desiredFacing = entity.facing + (preview ? (options.turnRate ?? 0) * options.time : 0);
    if (first || preview) this.facing = desiredFacing;
    const turn = angle(desiredFacing - this.facing);
    this.facing += turn * (1 - Math.exp(-dt * 18));
    this.turn += (clamp(turn * 6, 3) - this.turn) * (1 - Math.exp(-dt * 10));
    if (preview) this.turn = options.turnRate ?? 0;
    const forward =
      rawSpeed > 0 && !preview
        ? (dx * Math.cos(entity.facing) + dy * Math.sin(entity.facing)) /
          Math.max(0.001, Math.hypot(dx, dy))
        : options?.clip === 'combat-backward'
          ? -1
          : options?.clip === 'combat-strafe'
            ? 0
            : 1;
    const sideways =
      rawSpeed > 0 && !preview
        ? (-dx * Math.sin(entity.facing) + dy * Math.cos(entity.facing)) /
          Math.max(0.001, Math.hypot(dx, dy))
        : options?.clip === 'combat-strafe'
          ? 1
          : 0;
    this.idle = moving || entity.state !== 'idle' || combat ? 0 : this.idle + dt;
    const identity = [...id].reduce((n, ch) => n + ch.charCodeAt(0), 0);
    const flourishTime = this.idle - (5 + (identity % 3));
    const flourish =
      flourishTime >= 0
        ? Math.max(0, Math.sin(Math.min(1, (flourishTime % 11) / 2.4) * Math.PI))
        : 0;
    this.locomotion = locomotionPreview
      ? options.clip
      : moving
        ? combat
          ? forward < -0.45
            ? 'combat-backward'
            : Math.abs(sideways) > 0.6
              ? 'combat-strafe'
              : 'combat-forward'
          : time - this.movingAt < 0.16
            ? 'run-start'
            : Math.abs(this.turn) > 0.85
              ? 'turn'
              : 'run'
        : time - this.stoppedAt < 0.2 && this.stoppedAt > 0
          ? 'stop-run'
          : combat
            ? 'combat-idle'
            : flourish > 0.01
              ? 'long-idle'
              : 'idle';
    const clock = preview ? options.time * 8 : time;
    const semanticPreview =
      preview && ['riposte', 'parry', 'dodge', 'ranged'].includes(options.clip);
    const visualEntity = semanticPreview
      ? ({
          ...entity,
          state:
            options.clip === 'riposte'
              ? ('attack' as const)
              : (options.clip as 'parry' | 'dodge' | 'ranged'),
          stateAt: clock - options.time * (options.clip === 'riposte' ? RIPOSTE.duration : 0.4),
        } as Player)
      : entity;
    const base = animateCharacter(
      id,
      visualEntity,
      clock,
      false,
      weapon,
      combat,
      preview && !locomotionPreview && !semanticPreview ? options : undefined,
    );
    const pose = base.pose,
      profile = BODY_PROFILES[id] ?? BODY_PROFILES.warden;
    const active = entity.state !== 'idle' || (preview && !locomotionPreview);
    this.action = semanticPreview
      ? options.clip
      : 'attackType' in entity && entity.attackType === 'riposte' && entity.state === 'attack'
        ? 'riposte'
        : active
          ? entity.state
          : 'idle';
    const locomotionWeight = active ? 0.2 : 1;
    this.weights.action = active ? 1 : 0;
    this.weights.locomotion = locomotionWeight;
    this.phase = preview
      ? options.time * Math.PI * 4
      : this.phase + (this.speed / 110) * Math.PI * 2 * dt;
    const transitionSpeed =
      locomotionPreview && options.clip === 'run-start'
        ? Math.min(1, options.time * 3)
        : locomotionPreview && options.clip === 'stop-run'
          ? 1 - options.time
          : 1;
    const stride = Math.sin(this.phase),
      amount = Math.min(1, this.speed / 180) * locomotionWeight * transitionSpeed;
    const guarded = combat ? 0.58 : 1;
    const direction = combat ? forward : 1;
    pose.rightLeg[0] += stride * 0.66 * amount * guarded * direction;
    pose.leftLeg[0] -= stride * 0.66 * amount * guarded * direction;
    pose.rightLeg[2] += sideways * stride * amount * 0.3;
    pose.leftLeg[2] -= sideways * stride * amount * 0.3;
    pose.rightShin[0] += Math.max(0, -stride) * amount * 0.9;
    pose.leftShin[0] += Math.max(0, stride) * amount * 0.9;
    const acceleration = dt ? clamp((this.speed - previousSpeed) / dt / 1000) : 0;
    pose.torso[0] +=
      (amount * (combat ? 0.09 : 0.22) + acceleration * 0.07) * (weapon === 'shinobi' ? 1.2 : 1);
    pose.torso[1] += -this.turn * 0.12 + stride * amount * 0.07;
    pose.torso[2] += -this.turn * amount * 0.055;
    pose.head[0] -= amount * 0.09;
    pose.head[1] +=
      clamp(angle((options?.targetFacing ?? entity.facing) - this.facing), 0.6) * 0.55;
    pose.lift += Math.abs(stride) * amount * 0.035;
    if (!combat && !active) {
      pose.rightArm[0] += -stride * amount * 0.17;
      pose.leftArm[0] += stride * amount * 0.28;
    }
    const breathing = Math.sin(
      clock * (id === 'brute' || weapon === 'great' ? 1.5 : 2.1) + identity,
    );
    pose.torso[0] += breathing * 0.012;
    pose.leftArm[2] += breathing * 0.018;
    pose.head[1] += Math.sin(clock * 0.6 + identity) * 0.025;
    if (Math.abs(this.turn) > 1.2 && moving) {
      pose.lift -= 0.05;
      pose[this.turn > 0 ? 'leftLeg' : 'rightLeg'][1] += clamp(this.turn * 0.2, 0.4);
    }
    if (weapon === 'great' || weapon === 'spear') pose.rightForearm[1] -= this.turn * 0.08;
    const long =
      locomotionPreview && options.clip === 'long-idle'
        ? Math.sin(options.time * Math.PI)
        : flourish;
    if (!active && long > 0) {
      const variant = Math.floor(Math.max(0, flourishTime) / 11) % 2;
      const family =
        weapon === 'shinobi'
          ? 4
          : weapon === 'twins' || id === 'duelist'
            ? 1
            : weapon === 'spear' || id === 'archer'
              ? 2
              : weapon === 'great' || id === 'brute'
                ? 3
                : id === 'monk' || id === 'hexer'
                  ? 5
                  : 0;
      pose.rightArm[0] -= long * [0.7, 0.35, 0.4, 1.5, 0.4, 0.9][family];
      pose.rightForearm[0] -= long * (variant ? 0.6 : 0.35);
      pose.rightArm[1] += long * (variant ? -0.3 : 0.3);
      pose.blade[1] += long * (family === 1 ? 1.3 : 0.15);
      pose.leftArm[0] -= long * (family === 4 ? 0.8 : family === 5 ? 0.9 : 0.15);
      pose.head[0] += long * 0.14;
      pose.torso[2] += long * (variant ? -0.04 : 0.04);
    }
    this.hips = clamp(this.turn * 0.13 + sideways * amount * 0.18, 0.35);
    this.cloth =
      (options?.reducedMotion ? 0.25 : 1) *
      clamp(this.turn * -0.18 + acceleration * 0.12 + amount * 0.2, 0.5);
    if (this.action === 'riposte') {
      const t = preview ? options.time : Math.max(0, (time - entity.stateAt) / RIPOSTE.duration);
      pose.torso = [0.25 + Math.sin(t * Math.PI) * 0.18, Math.sin(t * Math.PI * 2) * 0.65, 0];
      pose.rightArm = [-1.2, -0.9 + Math.min(1, t / 0.5) * 2, -0.3];
      pose.rightForearm = [-0.4, 0, 0];
      pose.leftArm = [-0.8, 0.4, 0.35];
      pose.lift -= Math.sin(t * Math.PI) * 0.12;
      pose.advance = preview ? riposteTravel(t * RIPOSTE.duration) * 1.8 : 0;
      base.name = 'shinobi/riposte';
      base.normalized = t;
    }
    if (this.action === 'parry') {
      const phase = preview ? options.time : Math.min(1, Math.max(0, time - entity.stateAt) / 0.43);
      const snap = Math.sin(Math.sqrt(phase) * Math.PI);
      pose.rightArm = [-0.8 - snap * 0.45, -0.35, -0.35 - snap * 0.3];
      pose.leftArm = [-0.6 - snap * 0.4, 0.45, 0.4];
      pose.rightForearm = [-0.5 - snap * 0.3, 0, 0];
      pose.torso[0] -= snap * 0.1;
    }
    if (this.action === 'dodge') {
      const phase = preview ? options.time : Math.min(1, Math.max(0, time - entity.stateAt) / 0.3);
      const load = Math.sin(phase * Math.PI);
      pose.torso[0] = 0.3 + load * 0.5;
      pose.lift = -0.12 - load * 0.2;
    }
    if ('parryAt' in entity && entity.parryLanded && time - entity.parryAt < 0.3) {
      const recoil = Math.max(0, 1 - (time - entity.parryAt) / 0.3);
      pose.torso[0] -= recoil * 0.12;
      pose.rightForearm[0] -= recoil * 0.25;
    }
    const key = `${this.locomotion}/${this.action}/${entity.stateAt}`;
    if (key !== this.key) {
      this.from = this.previous ? structuredClone(this.previous) : undefined;
      this.transitionAt = time;
      this.key = key;
    }
    this.weights.transition =
      preview || first ? 1 : Math.min(1, (time - this.transitionAt) / (active ? 0.065 : 0.12));
    if (this.from && this.weights.transition < 1)
      blendPose(this.from, pose, this.weights.transition);
    this.previous = structuredClone(pose);
    this.x = entity.x;
    this.y = entity.y;
    this.at = time;
    if (!active) {
      base.name = `${id}/${this.locomotion}`;
      base.normalized = (this.phase / (Math.PI * 2)) % 1;
    }
    // Profile-specific posture persists underneath actions and transitions.
    pose.head[0] -= profile.lean * 0.05;
    return base;
  }
}
