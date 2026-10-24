import { OnlineConnection } from './connection';
import { CHARACTERS, characterFor } from '../game/characters';
import { RELICS } from '../game/data';
import { displayName, type OnlineMode } from '../../shared/protocol';
import type { World } from '../game/world';

interface Surface {
  show: (screen: string, title: string, body: string, wide?: boolean) => void;
  close: () => void;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const button = (action: string, text: string, primary = false) =>
  `<button data-action="net:${action}"${primary ? ' class="primary"' : ''}>${text}</button>`;
export class Online {
  connection?: OnlineConnection;
  private abort?: AbortController;
  private screen = '';
  private server: 'waking' | 'awake' | 'unavailable' = 'waking';
  private error = '';
  private mode: OnlineMode = 'coop';
  private key = '';
  private busy = false;
  private name = 'Pilgrim';
  private hud: HTMLElement;
  constructor(
    private world: World,
    private surface: Surface,
  ) {
    try {
      this.name = localStorage.getItem('hollow-canticle:display-name') ?? 'Pilgrim';
    } catch {
      /* Local name is optional. */
    }
    this.hud = document.createElement('aside');
    this.hud.className = 'online-hud';
    this.hud.hidden = true;
    this.hud.setAttribute('aria-label', 'Online party');
    document.querySelector('#stage')!.append(this.hud);
    document.addEventListener('keydown', (event) => {
      if (
        !this.connection?.active ||
        (event.target as HTMLElement).closest('input,select,textarea')
      )
        return;
      if (
        this.connection.own?.hp === 0 &&
        ['a', 'd', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      ) {
        this.connection.spectating += ['a', 'ArrowLeft'].includes(event.key) ? -1 : 1;
      }
    });
  }
  get visible(): boolean {
    return Boolean(this.screen);
  }
  get active(): boolean {
    return Boolean(this.connection?.active);
  }
  private endpoint(): string {
    const configured = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined;
    const value = configured || (import.meta.env.DEV ? 'ws://localhost:2567' : '');
    if (!value)
      throw new Error(
        'The multiplayer service has not been deployed yet. Single-player remains available.',
      );
    const url = new URL(value);
    if (!['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol))
      throw new Error('Invalid multiplayer service address.');
    if (location.protocol === 'https:' && !['https:', 'wss:'].includes(url.protocol))
      throw new Error('The multiplayer service needs a secure WSS address.');
    return value.replace(/\/$/, '');
  }
  async open(): Promise<void> {
    this.abort?.abort();
    this.abort = new AbortController();
    this.screen = 'home';
    this.server = 'waking';
    this.error = '';
    this.render();
    let endpoint: string;
    try {
      endpoint = this.endpoint();
    } catch (error) {
      this.server = 'unavailable';
      this.error = (error as Error).message;
      this.render();
      return;
    }
    const signal = this.abort.signal;
    const health = endpoint.replace(/^ws/, 'http') + '/healthz';
    const started = performance.now();
    while (!signal.aborted && performance.now() - started < 120000) {
      try {
        const response = await fetch(health, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          cache: 'no-store',
        });
        if (response.ok && (await response.json()).ok === true) {
          this.server = 'awake';
          this.render();
          return;
        }
      } catch {
        if (signal.aborted) return;
      }
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', finish);
          resolve();
        };
        const timer = setTimeout(finish, 2500);
        signal.addEventListener('abort', finish, { once: true });
      });
    }
    if (!signal.aborted) {
      this.server = 'unavailable';
      this.render();
    }
  }
  private render(): void {
    if (!this.screen) return;
    const c = this.connection,
      state = c?.state;
    const error = this.error
      ? `<p class="online-error" role="alert">${escape(this.error)}</p>`
      : '';
    if (this.screen === 'home') {
      this.surface.show(
        'online',
        'A vow, shared',
        `
        <p class="eyebrow">ONLINE · FRIEND ROOMS · NO ACCOUNT</p>
        <p class="dialog-copy">Bring a candle into another’s dark.</p>
        <div class="online-modes">
          <button data-action="net:mode:coop" ${this.server !== 'awake' ? 'disabled' : ''}><span class="online-mark">✧</span><strong>CO-OP DESCENT</strong><small>Two to four Pilgrims. One dangerous descent.</small></button>
          <button data-action="net:mode:duel" ${this.server !== 'awake' ? 'disabled' : ''}><span class="online-mark">⚔</span><strong>DUEL</strong><small>One opposing oath. First to three.</small></button>
        </div>
        <div class="server-status ${this.server}" role="status"><span>${this.server === 'awake' ? '● Awake' : this.server === 'waking' ? '◌ WAKING THE CANTICLE…' : '○ Unavailable'}</span><small>${this.server === 'waking' ? 'The free multiplayer server is waking. We’ll retry automatically.' : this.server === 'awake' ? 'Free hosting may take a moment to wake after inactivity.' : 'Single-player remains available.'}</small></div>
        ${error}<div class="stack-buttons">${this.server === 'unavailable' ? button('retry', 'Try again') : ''}${this.server === 'awake' && sessionStorage.getItem('hollow-canticle:reconnect') ? button('reconnect', 'Reconnect to reserved seat') : ''}${button('leave', 'Return to the threshold')}</div>`,
      );
    } else if (this.screen === 'friends') {
      this.surface.show(
        'online',
        this.mode === 'coop' ? 'The descent' : 'The opposing oath',
        `
        <p class="eyebrow">${this.mode === 'coop' ? '2–4 PILGRIMS · PERSONAL LOOT · SHARED FATE' : '1v1 · ALL PILGRIMS · FIRST TO THREE'}</p>
        <label class="online-label" for="online-name">YOUR NAME</label><input id="online-name" maxlength="20" autocomplete="nickname" value="${escape(this.name)}">
        <div class="stack-buttons">${button('create', this.busy ? 'Opening the chamber…' : 'Create room', true)}</div>
        <div class="online-divider">OR JOIN A FRIEND</div>
        <label class="online-label" for="online-code">ROOM CODE</label><div class="online-join"><input id="online-code" maxlength="5" placeholder="H7KMP" autocapitalize="characters" autocomplete="off">${button('join', 'Join room')}</div>
        ${error}<p class="hint">No accounts. Rooms last until everyone leaves or the free server restarts.</p>`,
      );
    } else if (this.screen === 'lobby' && state?.players && c?.room) {
      const host = state.host === c.room.sessionId;
      const players = [...state.players];
      const ready = players.length >= 2 && players.every(([, p]) => p.ready && p.connected);
      this.surface.show(
        'online',
        state.mode === 'coop' ? 'The descent' : 'The opposing oath',
        `
        <div class="room-code"><span>ROOM</span><button data-action="net:copy" title="Copy room code">${escape(state.code)}</button><small>Share this code with your companions</small></div>
        <div class="party-lobby">${Array.from({ length: state.mode === 'coop' ? 4 : 2 }, (_, i) => {
          const entry = players[i];
          if (!entry)
            return '<div class="party-slot vacant"><span>✧</span> Waiting for a Pilgrim…</div>';
          const [id, p] = entry,
            character = characterFor(p.weapon);
          return `<div class="party-slot" style="--pilgrim:${p.color}"><span class="party-number">${i + 1}</span><div><strong>${escape(p.name)} ${id === state.host ? '<small>HOST</small>' : ''}</strong><span>${character.name} · ${character.ranged.name}</span></div><b>${!p.connected ? 'FADING…' : p.ready ? 'READY' : 'CHOOSING'}</b></div>`;
        }).join('')}</div>
        <p class="online-label">YOUR PILGRIM</p><div class="online-characters">${CHARACTERS.map((character) => `<button data-action="net:character:${character.id}" class="${c.own?.weapon === character.id ? 'selected' : ''}">${character.name}</button>`).join('')}</div>
        <div class="online-seed"><span>SEED</span>${host ? `<input id="online-seed" maxlength="40" value="${escape(state.seed)}" aria-label="Dungeon seed">${button('seed', 'Set')}${button('random', 'Random')}` : `<strong>${escape(state.seed)}</strong>`}</div>
        ${error}<div class="online-lobby-actions">${button('ready', c.own?.ready ? 'Unready' : 'Ready', true)}${host ? `<button data-action="net:start" ${ready ? '' : 'disabled'}>${state.mode === 'coop' ? 'Begin descent' : 'Begin duel'}</button>` : '<span class="hint">The host begins when everyone is ready.</span>'}</div>`,
        true,
      );
    } else if (this.screen === 'pause') {
      this.surface.show(
        'online',
        'Keep your oath',
        `<p class="online-warning">ONLINE GAME CONTINUES WHILE MENU IS OPEN</p>${this.party()}<div class="stack-buttons">${button('resume', 'Return to the fight', true)}${button('leave', 'Leave room & return to the threshold')}</div>`,
      );
    } else if (this.screen === 'lost') {
      this.surface.show(
        'online',
        'The connection was lost',
        `<p class="dialog-copy">${c?.lost ? 'The free multiplayer server may have restarted. If the room was lost, this online run cannot be recovered.' : 'Your candle is fading. Reconnecting to your reserved seat…'}</p><p class="hint">Your single-player Chronicle remains intact.</p>${error}<div class="stack-buttons">${c?.lost ? button('reconnect', 'Reconnect', true) : ''}${button('leave', 'Return to the threshold')}</div>`,
      );
    } else if (this.screen === 'reward' && c?.own) {
      this.surface.show(
        'online',
        'An oath in the silence',
        `<p class="eyebrow">YOUR PERSONAL OFFERING</p><div class="stack-buttons">${c.own.rewards
          .map((id) => {
            const relic = RELICS.find((r) => r.id === id)!;
            return button(
              `relic:${id}`,
              `<strong>${relic.name}</strong><br><small>${relic.description}</small>`,
            );
          })
          .join(
            '',
          )}</div><p class="hint">Choose an offering before the party takes the next passage.</p>`,
      );
    } else if (this.screen === 'summary' && state) {
      const winner = state.players.get(state.winner);
      this.surface.show(
        'online',
        state.mode === 'coop'
          ? 'The descent ends'
          : winner
            ? `${escape(winner.name)} keeps the oath`
            : 'Both candles fall',
        `
        <p class="eyebrow">${state.mode === 'coop' ? `DEPTH ${state.floor} · ROOM ${state.room}` : 'FIRST TO THREE · MATCH COMPLETE'}</p>${this.party(true)}
        <p class="hint">${state.mode === 'coop' ? 'The whole party has fallen. No candle rekindles without a surviving companion.' : 'Duels grant no Embers, unlocks or permanent advantages.'}</p>
        <div class="stack-buttons">${state.mode === 'duel' ? button('rematch', 'Rematch · both players must accept', true) : ''}${button('return-online', 'Return to online')}</div>`,
        true,
      );
    }
  }
  private party(stats = false): string {
    const players = [...(this.connection?.state?.players?.values() ?? [])];
    const total = (key: 'kills' | 'perfects' | 'reflections' | 'rescues' | 'deaths') =>
      players.reduce((sum, player) => sum + player[key], 0);
    const totals =
      stats && this.connection?.state?.mode === 'coop'
        ? `<p class="hint">PARTY TOTALS · ${total('kills')} kills · ${total('perfects')} perfect parries · ${total('reflections')} reflections · ${total('rescues')} rescues · ${total('deaths')} deaths</p>`
        : '';
    return `<div class="party-list">${players.map((p) => `<div class="party-line" style="--pilgrim:${p.color}"><strong>${escape(p.name)}</strong><span>${characterFor(p.weapon).name}</span><span>${p.connected ? (p.hp <= 0 ? 'FALLEN' : `${Math.ceil(p.hp)} HP`) : 'FADING…'}</span><small>${p.ping} ms</small>${stats ? `<p>${this.connection?.state?.mode === 'duel' ? `${p.score} rounds` : `${p.kills} kills · ${p.perfects} perfect parries · ${p.reflections} reflections · ${p.rescues} rescues · ${p.deaths} deaths`}</p>` : ''}</div>`).join('')}</div>${totals}`;
  }
  async action(action: string): Promise<void> {
    action = action.replace(/^net:/, '');
    if (this.busy) return;
    this.error = '';
    const c = this.connection;
    if (action === 'return-online') {
      await this.leave();
      await this.open();
      return;
    }
    if (action === 'leave') {
      await this.leave();
      return;
    }
    if (action === 'retry') {
      await this.open();
      return;
    }
    if (action.startsWith('mode:')) {
      this.mode = action.endsWith('duel') ? 'duel' : 'coop';
      this.screen = 'friends';
      this.render();
      return;
    }
    if (action.startsWith('character:')) {
      c?.send('select', action.split(':')[1]);
      return;
    }
    if (action === 'ready') {
      c?.send('ready', !c.own?.ready);
      return;
    }
    if (action === 'start') {
      c?.send('start');
      return;
    }
    if (action === 'rematch') {
      c?.send('rematch');
      this.error = 'Waiting for the other Pilgrim to accept.';
      this.render();
      return;
    }
    if (action === 'seed' || action === 'random') {
      c?.send(
        'seed',
        action === 'random'
          ? `CANDLE-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`
          : document.querySelector<HTMLInputElement>('#online-seed')?.value.trim(),
      );
      return;
    }
    if (action === 'copy') {
      await navigator.clipboard?.writeText(c?.state?.code ?? '').catch(() => undefined);
      return;
    }
    if (action.startsWith('relic:')) {
      c?.send('relic', action.split(':')[1]);
      return;
    }
    if (action === 'resume') {
      if (c) c.paused = false;
      this.screen = '';
      this.surface.close();
      return;
    }
    try {
      this.busy = true;
      if (action === 'create' || action === 'join') {
        this.name = displayName(document.querySelector<HTMLInputElement>('#online-name')!.value);
        const code = document.querySelector<HTMLInputElement>('#online-code')?.value ?? '';
        if (action === 'join' && !/^[2-9A-HJKMNP-Z]{5}$/i.test(code))
          throw new Error('Enter the five-character room code.');
        try {
          localStorage.setItem('hollow-canticle:display-name', this.name);
        } catch {
          /* Name stays in memory. */
        }
        this.connection = new OnlineConnection(this.world, this.endpoint());
        this.connection.changed = () => this.update();
        if (action === 'create') await this.connection.create(this.mode, this.name);
        else await this.connection.join(code, this.name);
        this.screen = 'lobby';
      } else if (action === 'reconnect') {
        if (!this.connection) {
          this.connection = new OnlineConnection(this.world, this.endpoint());
          this.connection.changed = () => this.update();
        }
        await this.connection.reconnect();
      }
    } catch (error) {
      this.error =
        action === 'join'
          ? `Could not join. Check the code; the room may be full or already playing. ${(error as Error).message}`
          : (error as Error).message;
    } finally {
      this.busy = false;
      this.render();
    }
  }
  pause(): void {
    if (!this.active || !this.connection) return;
    this.connection.paused = !this.connection.paused;
    this.screen = this.connection.paused ? 'pause' : '';
    if (this.screen) this.render();
    else this.surface.close();
  }
  back(): void {
    if (this.active && ['pause', 'reward'].includes(this.screen)) {
      if (this.screen === 'pause') this.pause();
      return;
    }
    if (this.screen === 'friends') {
      this.screen = 'home';
      this.render();
      return;
    }
    if (this.screen === 'lobby' || this.screen === 'lost' || this.screen === 'summary') {
      void this.leave();
      return;
    }
    this.abort?.abort();
    this.screen = '';
    this.surface.close();
  }
  update(): void {
    const c = this.connection,
      state = c?.state;
    if (!c || !state?.players) return;
    if (!c.connected) {
      if (this.screen !== 'lost') {
        this.screen = 'lost';
        this.render();
      }
      return;
    }
    this.world.onlinePause = () => {
      if (!this.connection?.paused) this.pause();
    };
    if (state.phase === 'lobby') {
      this.screen = 'lobby';
      const key = JSON.stringify({
        seed: state.seed,
        host: state.host,
        players: [...state.players].map(([id, p]) => [id, p.name, p.weapon, p.ready, p.connected]),
      });
      if (key !== this.key) {
        this.key = key;
        this.render();
      }
      return;
    }
    if (state.phase === 'summary' || state.phase === 'matchEnd') {
      if (this.screen !== 'summary') {
        this.screen = 'summary';
        this.render();
      }
    } else if (c.own?.rewards.length) {
      if (this.screen !== 'reward') {
        this.screen = 'reward';
        this.render();
      }
    } else if (this.screen && this.screen !== 'pause') {
      this.screen = '';
      this.surface.close();
    }
    this.hud.hidden = !c.active;
    if (c.active) {
      const dead = c.own?.hp === 0 && state.mode === 'coop';
      const players = [...state.players.values()];
      this.hud.innerHTML = `<div class="online-hud-top">${escape(state.code)} <span class="${c.ping > 180 ? 'poor' : ''}">${c.ping} ms${c.ping > 180 ? ' · Unstable connection' : ''}</span></div>${state.mode === 'duel' ? `<div class="duel-score">${players.map((p) => `${escape(p.name)} <b>${p.score}</b>`).join('<span>—</span>')}</div>` : this.party()}
        ${state.phase === 'countdown' ? `<div class="duel-countdown">${Math.ceil(state.countdown) || 'DUEL'}</div>` : ''}
        ${state.phase === 'roundEnd' ? '<div class="online-caption">THE ROUND FALLS SILENT</div>' : ''}
        ${dead ? `<div class="fallen-caption"><strong>FALLEN</strong><span>The Canticle continues with your companions.</span><small>Following ${escape(c.spectated)}</small><small>A / D to follow a living Pilgrim · Rekindle on room clear with 20 HP</small></div>` : ''}
        ${this.world.debug ? `<pre class="online-debug">server ${state.tick} · client ${c.clientTick}\nping ${c.ping} ms · correction ${c.predictionError.toFixed(1)}\nack ${c.own?.ack} · interpolation 100 ms\nroom ${c.room?.roomId} · ${state.code}\nclients ${players.filter((p) => p.connected).length} · entities ${state.enemies.size + state.shots.size + players.length}\n${c.bandwidth}</pre>` : ''}`;
    }
  }
  private async leave(): Promise<void> {
    this.abort?.abort();
    this.screen = '';
    this.hud.hidden = true;
    const c = this.connection;
    this.connection = undefined;
    await c?.leave();
    this.world.mode = 'menu';
    this.surface.close();
    this.key = '';
  }
}
