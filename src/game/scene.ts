import * as Phaser from 'phaser';
import { Renderer } from './renderer';
import { World } from './world';
import type { Action } from './combat';

export class DungeonScene extends Phaser.Scene {
  painter!: Renderer;
  private keys = new Set<string>();
  private cleanups: (() => void)[] = [];
  private closeControls = false;
  private mouseGesture = { x: 0, y: 0 };
  private switchedAt = 0;
  constructor(private world: World) {
    super('dungeon');
  }
  create(): void {
    this.painter = new Renderer(document.querySelector('#game')!, this.world);
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input,select,textarea,dialog')) return;
      const key = event.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key))
        event.preventDefault();
      this.keys.add(key);
      if (event.repeat) return;
      if (key === 'tab' && this.closeControls && this.world.mode === 'playing') {
        event.preventDefault();
        this.mouseGesture = { x: 0, y: 0 };
        this.world.cycleFocus(event.shiftKey ? -1 : 1);
        return;
      }
      const actions: Record<string, Action> = {
        j: 'attack',
        k: 'parry',
        ' ': 'dodge',
        e: 'interact',
        q: 'item',
        f: 'technique',
        r: 'ranged',
        l: 'heavy',
      };
      if (actions[key]) this.world.input(actions[key]);
      if (key === '1') this.world.inventory.cycle(-1);
      if (key === '2') this.world.inventory.cycle(1);
    };
    const up = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());
    const blur = () => {
      this.keys.clear();
      if (this.world.mode === 'playing') this.world.pause();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    this.cleanups.push(
      () => window.removeEventListener('keydown', down),
      () => window.removeEventListener('keyup', up),
      () => window.removeEventListener('blur', blur),
      () => document.removeEventListener('visibilitychange', visibility),
    );
    const pointerDown = (pointer: PointerEvent) => {
      if (this.world.mode !== 'playing') return;
      this.world.audio.unlock();
      this.capturePointer();
      this.world.input(
        pointer.button === 2
          ? 'parry'
          : pointer.button === 1
            ? 'ranged'
            : pointer.shiftKey
              ? 'heavy'
              : 'attack',
      );
    };
    const pointerMove = (pointer: PointerEvent) => {
      if (this.world.mode !== 'playing') return;
      if (this.closeControls) {
        this.mouseGesture.x += pointer.movementX;
        this.mouseGesture.y += pointer.movementY;
        if (
          Math.hypot(this.mouseGesture.x, this.mouseGesture.y) >= 70 &&
          performance.now() - this.switchedAt > 220
        ) {
          this.painter.focusByPointer(this.mouseGesture.x, this.mouseGesture.y);
          this.mouseGesture = { x: 0, y: 0 };
          this.switchedAt = performance.now();
        }
        return;
      }
      const rect = this.painter.canvas.getBoundingClientRect();
      if (this.world.mode === 'playing')
        this.world.mouseAim = this.painter.screenToWorld(
          pointer.clientX - rect.left,
          pointer.clientY - rect.top,
        );
    };
    const contextMenu = (event: Event) => event.preventDefault();
    this.painter.canvas.addEventListener('pointerdown', pointerDown);
    this.painter.canvas.addEventListener('pointermove', pointerMove);
    this.painter.canvas.addEventListener('contextmenu', contextMenu);
    const lockChanged = () => {
      if (!document.pointerLockElement && this.closeControls && this.world.mode === 'playing')
        this.world.pause();
    };
    document.addEventListener('pointerlockchange', lockChanged);
    this.cleanups.push(() => document.removeEventListener('pointerlockchange', lockChanged));
    this.cleanups.push(() => this.painter.destroy());
    this.events.once('shutdown', () => this.cleanups.forEach((fn) => fn()));
  }
  private capturePointer(): void {
    const canvas = this.painter.canvas;
    if (
      !this.closeControls ||
      this.world.mode !== 'playing' ||
      document.pointerLockElement ||
      !canvas.requestPointerLock
    )
      return;
    try {
      const lock = canvas.requestPointerLock();
      lock?.catch(() => undefined);
    } catch {
      /* Cursor hiding still works when capture is unavailable. */
    }
  }
  update(_time: number, delta: number): void {
    const held = (...keys: string[]) => keys.some((key) => this.keys.has(key));
    this.world.movement = this.painter.movement(
      Number(held('d', 'arrowright')) - Number(held('a', 'arrowleft')),
      Number(held('s', 'arrowdown')) - Number(held('w', 'arrowup')),
    );
    // Bounded steps keep timing consistent while avoiding catch-up damage after a suspended tab.
    let remaining =
      Math.min(delta / 1000, 0.1) *
      (this.world.debug
        ? this.world.timeScale
        : this.painter.director.entryRemaining > 0
          ? 0.55
          : 1);
    while (remaining > 0 && !this.painter.loading) {
      const step = Math.min(remaining, 1 / 120);
      this.world.update(step);
      remaining -= step;
    }
    this.painter.draw(Math.min(delta / 1000, 0.05));
    this.closeControls = this.painter.director.duel > 0.5;
    if (this.closeControls) this.world.focusEnemy(this.world.target?.id);
    else this.world.focusEnemy(undefined);
    const hidden = this.closeControls && this.world.mode === 'playing';
    this.painter.canvas.classList.toggle('close-combat-cursor', hidden);
    this.painter.canvas.dataset.focus = String(this.world.focusedEnemy ?? 'free');
    if (!hidden) {
      this.mouseGesture = { x: 0, y: 0 };
      if (document.pointerLockElement === this.painter.canvas) document.exitPointerLock();
    }
  }
}
