import { BIOMES, ENEMIES, RELICS, WEAPONS } from './game/data';
import { makeFloor, obstaclesFor } from './game/dungeon';
import { persist, defaultSave, RUN_HISTORY_KEY } from './game/save';
import { World } from './game/world';
import { CHARACTERS, characterFor } from './game/characters';
import { GRAPHICS, GRAPHICS_LEVELS, graphicsLevel } from './game/graphics';
import { LOCOMOTION_STATES } from './game/presentation/animation-state';
import { CharacterGallery } from './game/presentation/gallery';
import { ITEMS } from './game/items';
import { BUFFS } from './game/buffs';
import { LOOT_WEIGHTS, LootDirector } from './game/loot';
import { Online } from './net/online';

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const icon = (name: string, size = 18): string => {
  const paths: Record<string, string> = {
    sound:
      '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    pause: '<path d="M8 5v14m8-14v14"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    book: '<path d="M12 5C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
    sword: '<path d="m15 3 6 0 0 6-10 10-6-6L15 3Zm-8 8 6 6M3 21l5-5M3 15l6 6"/>',
    gear: '<path d="m10 3-1 3-3 1-3 3 2 2-1 4 3 2 4 3 2-2 4 1 2-3 3-4-2-2 1-4-3-2-4-3-2 2Z"/><circle cx="12" cy="12" r="3"/>',
    seed: '<path d="M20 3C8 2 3 7 4 14c7 4 15-1 16-11ZM4 21c1-7 6-12 11-14"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
  };
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.sword}</svg>`;
};
const sigil = `<svg class="sigil" aria-hidden="true" viewBox="0 0 80 80"><circle cx="40" cy="40" r="31"/><circle cx="40" cy="40" r="26"/><path d="m40 5 7 26 22 9-22 9-7 26-7-26-22-9 22-9Zm0 18 4 17-4 17-4-17Z"/></svg>`;

export class Interface {
  private online: Online;
  private dialog: HTMLDialogElement;
  private menu: HTMLElement;
  private lastMode = '';
  private screen = '';
  private settingsBack = 'menu';
  private lastVolume = 0.65;
  private lastMute?: boolean;
  private lastStatus = '';
  private runWeapon = 'sword';
  private gallery?: CharacterGallery;
  private returnMode: 'menu' | 'paused' = 'menu';
  constructor(private world: World) {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <header class="topbar">
        <a class="brand" href="#" aria-label="Hollow Canticle main menu">${sigil}<span>HOLLOW CANTICLE</span><span class="version">v0.7.0</span></a>
        <span class="header-caption">A VOW IN THE DARK</span>
        <div class="utility"><button data-action="sound" aria-label="Mute audio" title="Toggle audio">${icon('sound')}</button><span></span><button data-action="fullscreen" aria-label="Fullscreen" title="Fullscreen">${icon('expand')}</button><button data-action="pause" aria-label="Pause or open settings" title="Pause · Esc">${icon('pause')}</button></div>
      </header>
      <main id="stage">
        <div id="game" role="img" aria-label="Hollow Canticle dungeon. Keyboard controls are listed below."></div>
        <section id="main-menu" class="main-menu" aria-label="Main menu">
          <div class="menu-kicker"><span></span> PRECISION. PATIENCE. DESCENT.</div>
          <h1>HOLLOW<br><span>CANTICLE</span></h1>
          <p class="menu-copy">The bells have fallen silent.<br>Let your blade be the last thing they hear.</p>
          <button class="begin-button" data-action="new"><span>Begin the descent</span>${icon('arrow', 21)}</button>
          <button class="online-menu-button" data-action="online"><span>Online</span><small>CO-OP DESCENT & DUELS</small>${icon('arrow', 18)}</button>
          <div class="secondary-actions"><button data-action="training">${icon('sword', 17)} Tutorial</button><button data-action="seeded">${icon('seed', 17)} Seeded run</button></div>
          <div class="menu-line"></div>
          <nav class="menu-links"><button data-action="archive">Chronicle <span>DISCOVERIES & OATHS</span></button><button data-action="settings">Settings ${icon('gear', 15)}</button><button data-action="credits">Credits</button></nav>
          <div class="menu-note"><span class="note-mark">✧</span><p>Read the blade. Break their guard.<br><b>Keep your oath.</b></p></div>
        </section>
        <div class="location-stamp"><span class="stamp-rule"></span><span id="location-label">01 / THE FORGOTTEN RUINS</span><small id="location-sub">WHERE THE BELLS FELL SILENT</small></div>
        <div class="mobile-notice">A keyboard and mouse are needed for the descent.<br>You can explore the menus on this device.</div>
        <div id="live-status" class="sr-only" role="status" aria-live="polite"></div>
        <dialog id="overlay" aria-labelledby="dialog-title"></dialog>
      </main>
      <footer class="bottombar"><div class="control-guide"><span><kbd>W A S D</kbd> Move</span><span><kbd>J</kbd> Strike</span><span><kbd>K</kbd> Deflect</span><span><kbd>SPACE</kbd> Evade</span><span><kbd>E</kbd> Interact</span><span><kbd>R</kbd> Ranged</span><span><kbd>Q</kbd> Item</span></div><button data-action="controls">Field guide ${icon('book', 14)}</button><span class="footer-end">DEATH IS A LESSON. <b>DESCEND AGAIN.</b></span></footer>`;
    this.dialog = document.querySelector('#overlay')!;
    this.menu = document.querySelector('#main-menu')!;
    this.online = new Online(world, {
      show: (screen, title, body, wide) => this.show(screen, title, body, wide),
      close: () => this.close(),
    });
    document.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (button) {
        this.world.audio.unlock();
        this.action(button.dataset.action!);
      }
      const brand = (event.target as HTMLElement).closest('.brand');
      if (brand) {
        event.preventDefault();
        if (this.world.mode === 'playing') this.pause();
        else if (this.world.mode === 'menu') this.close();
      }
    });
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.closeOrBack();
    });
    document.addEventListener('keydown', (event) => {
      if (
        this.screen === 'run' &&
        ['ArrowLeft', 'ArrowRight'].includes(event.key) &&
        !(event.target as HTMLElement).closest('input')
      ) {
        event.preventDefault();
        const index = CHARACTERS.findIndex((c) => c.id === this.runWeapon),
          direction = event.key === 'ArrowRight' ? 1 : -1;
        const next = CHARACTERS[(index + direction + CHARACTERS.length) % CHARACTERS.length];
        this.action(`weapon:${next.id}`);
        this.dialog.querySelector<HTMLButtonElement>(`[data-action="weapon:${next.id}"]`)?.focus();
      }
      if (event.key === 'Escape' && !this.dialog.open) {
        event.preventDefault();
        this.pause();
      }
      if (this.world.mode === 'reward' && ['1', '2', '3'].includes(event.key)) {
        const relic = this.world.rewards[Number(event.key) - 1];
        if (relic) this.action(`relic:${relic.id}`);
      }
    });
    document.addEventListener('input', (event) => this.setting(event));
    this.dialog.addEventListener('submit', (event) => {
      if ((event.target as HTMLFormElement).id !== 'run-form') return;
      event.preventDefault();
      if (
        !this.world.save.characters.includes(this.runWeapon) &&
        !this.world.save.unlocks.includes(this.runWeapon)
      )
        return;
      const seed = document.querySelector<HTMLInputElement>('#seed')!.value;
      this.close();
      this.world.start(seed, this.runWeapon);
      this.update();
    });
    if (this.world.debug) this.addDebug();
    this.update();
    if (!this.world.save.tutorialPrompted && !this.world.debug)
      this.show(
        'tutorial-prompt',
        'Enter the Practice of Steel?',
        '<p class="dialog-copy">Learn movement, deflection and combat at your own pace.</p><div class="stack-buttons"><button class="primary" data-action="training">Tutorial</button><button data-action="skip-training-prompt">Begin without training</button></div>',
      );
  }

  private randomSeed(): string {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return `CANDLE-${bytes[0].toString(36).toUpperCase().slice(0, 7)}`;
  }
  private action(action: string): void {
    const w = this.world;
    w.audio.play('ui');
    if (action === 'online') {
      void this.online.open();
      return;
    }
    if (action.startsWith('net:')) {
      void this.online.action(action);
      return;
    }
    if (action.startsWith('weapon:')) {
      this.runWeapon = action.split(':')[1];
      w.selection = this.runWeapon;
      this.dialog.querySelectorAll<HTMLElement>('.weapon-choice').forEach((b) => {
        b.classList.toggle('selected', b.dataset.action === action);
        b.setAttribute('aria-pressed', String(b.dataset.action === action));
      });
      this.updateCharacterDetails();
      return;
    }
    if (action.startsWith('relic:')) {
      w.chooseRelic(action.split(':')[1]);
      this.close();
      this.update();
      return;
    }
    if (action.startsWith('unlock:')) {
      const id = action.split(':')[1],
        price = id === 'twins' ? 4 : id === 'spear' ? 8 : id === 'shinobi' ? 16 : 12;
      if (w.save.embers >= price && !w.save.unlocks.includes(id)) {
        w.save.embers -= price;
        w.save.unlocks.push(id);
        if (!w.save.characters.includes(id)) w.save.characters.push(id);
        persist(w.save);
        this.archive();
      }
      return;
    }
    switch (action) {
      case 'new':
      case 'seeded':
        this.runSetup(action === 'seeded');
        break;
      case 'training':
        this.close();
        w.save.tutorialPrompted = true;
        persist(w.save);
        w.start('THE-PRACTICE', this.runWeapon, true);
        break;
      case 'skip-training-prompt':
        w.save.tutorialPrompted = true;
        persist(w.save);
        this.runSetup();
        break;
      case 'settings':
        this.settingsBack = this.screen || (w.mode === 'paused' ? 'pause' : 'menu');
        this.settings();
        break;
      case 'controls':
        this.returnMode = w.mode === 'menu' ? 'menu' : 'paused';
        if (w.mode === 'playing') w.pause();
        this.controls();
        break;
      case 'credits':
        this.credits();
        break;
      case 'archive':
        this.archive();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.close();
        if (w.mode === 'paused') w.pause();
        break;
      case 'interact':
        w.input('interact');
        break;
      case 'back':
        this.closeOrBack();
        break;
      case 'menu':
        w.settleRun();
        w.mode = 'menu';
        w.audio.ambience(false, false);
        this.close();
        this.update();
        break;
      case 'restart':
        this.close();
        w.start(w.seed, w.weapon.id, w.training);
        break;
      case 'random':
        this.close();
        w.start(this.randomSeed(), w.weapon.id);
        break;
      case 'reroll': {
        const input = document.querySelector<HTMLInputElement>('#seed');
        if (input) input.value = this.randomSeed();
        break;
      }
      case 'copy':
        void navigator.clipboard
          ?.writeText(w.seed)
          .then(() => this.notify('Seed copied.'))
          .catch(() => this.notify(`Seed: ${w.seed}`));
        break;
      case 'sound': {
        if (w.save.settings.master) {
          this.lastVolume = w.save.settings.master;
          w.save.settings.master = 0;
        } else w.save.settings.master = this.lastVolume || 0.65;
        persist(w.save);
        this.updateSound();
        w.audio.ambience(w.combat, w.mode !== 'playing' && w.mode !== 'menu');
        break;
      }
      case 'fullscreen':
        if (document.fullscreenElement)
          void document.exitFullscreen().catch(() => this.notify('Fullscreen is unavailable.'));
        else
          void document.documentElement
            .requestFullscreen()
            .catch(() => this.notify('Fullscreen is unavailable in this browser.'));
        break;
      case 'reset':
        this.show(
          'reset',
          'Forget the chronicle?',
          `<p class="dialog-copy">This erases discovered relics, weapon unlocks, embers, and settings on this device.</p><div class="dialog-actions"><button class="subtle" data-action="settings">Keep the chronicle</button><button class="danger" data-action="reset-confirm">Erase saved progress</button></div>`,
        );
        break;
      case 'reset-confirm': {
        Object.assign(w.save, defaultSave());
        persist(w.save);
        try {
          localStorage.removeItem(RUN_HISTORY_KEY);
        } catch {
          /* Continue with an in-memory reset. */
        }
        w.audio.settings = w.save.settings;
        w.mode = 'menu';
        this.close();
        this.update();
        this.notify('The chronicle has been erased.');
        break;
      }
    }
  }

  private show(screen: string, title: string, body: string, wide = false): void {
    this.gallery?.dispose();
    this.gallery = undefined;
    this.world.selection = undefined;
    this.screen = screen;
    this.dialog.className = wide ? 'wide-dialog' : '';
    this.dialog.innerHTML = `<div class="dialog-topline"><span>HOLLOW CANTICLE</span><button data-action="back" aria-label="Back or close">${icon('close')}</button></div><h2 id="dialog-title">${title}</h2>${body}`;
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.scrollTop = 0;
  }
  private close(): void {
    this.gallery?.dispose();
    this.gallery = undefined;
    this.world.selection = undefined;
    this.dialog.close();
    this.screen = '';
  }
  private closeOrBack(): void {
    if (this.online.visible) {
      this.online.back();
      return;
    }
    if (['reward', 'death', 'trained'].includes(this.screen)) return;
    if (this.screen === 'settings' && this.settingsBack === 'pause') {
      this.pauseMenu();
      return;
    }
    if (this.screen === 'reset') {
      this.settings();
      return;
    }
    if (this.world.mode === 'paused') {
      if (this.screen === 'pause') {
        this.close();
        this.world.pause();
      } else this.pauseMenu();
    } else this.close();
  }
  private pause(): void {
    if (this.online.active) {
      this.online.pause();
      return;
    }
    if (this.world.mode === 'menu') {
      this.settingsBack = 'menu';
      this.settings();
      return;
    }
    if (this.world.mode === 'playing') this.world.pause();
    if (this.world.mode === 'paused') this.pauseMenu();
  }
  private pauseMenu(): void {
    const w = this.world;
    this.show(
      'pause',
      'Between two breaths',
      `
      <p class="eyebrow">DEPTH ${String(w.floor.depth).padStart(2, '0')} · ${BIOMES[w.floor.biome].name.toUpperCase()}</p>
      <div class="run-info"><span>Seed</span><button class="seed-copy" data-action="copy">${escape(w.seed)} ${icon('seed', 13)}</button><span>Pilgrim</span><strong>${w.character.name}</strong><span>Relics</span><strong>${w.relics.length}</strong><span>Souls released</span><strong>${w.stats.kills}</strong></div>
      <section class="satchel-menu"><p class="eyebrow">SATCHEL</p>${
        w.inventory.slots
          .map((slot) => {
            const item = ITEMS.find((i) => i.id === slot.id)!;
            const buff = BUFFS.find((b) => b.id === item.buff);
            return `<div class="satchel-row"><span style="color:${item.color}">${item.glyph}</span><div><strong>${item.name} ×${slot.count}</strong><p>${item.description}</p><small>Use time: ${item.useTime}s${buff ? ` · Duration: ${buff.duration}s` : ''}</small></div></div>`;
          })
          .join('') ||
        '<p>SATCHEL EMPTY</p><p class="hint">Consumables can be found throughout the descent.</p>'
      }</section><p class="hint">${w.buffs.active.map((b) => `${BUFFS.find((d) => d.id === b.id)!.name}: ${Math.ceil(b.startedAt + b.duration - w.time)}s`).join(' · ')}</p><div class="stack-buttons"><button class="primary" data-action="resume">Resume the descent ${icon('arrow')}</button><button data-action="settings">Settings</button><button data-action="controls">Field guide</button><button data-action="restart">Replay this seed</button><button class="subtle" data-action="menu">End run & return to the threshold</button></div>`,
    );
  }

  private runSetup(seeded = false): void {
    this.runWeapon = this.world.weapon.id;
    const w = this.world;
    this.show(
      'run',
      'Who will keep the oath?',
      `
      <p class="dialog-copy">Five pilgrims. Five ways to answer the silence.</p>
      <form id="run-form"><div id="character-gallery" role="img" aria-label="Five Pilgrims with their weapons. The selected Pilgrim is outlined in silver."></div><div class="weapon-grid character-grid">${CHARACTERS.map(
        (character) => {
          return `<button type="button" class="weapon-choice ${this.runWeapon === character.id ? 'selected' : ''}" data-action="weapon:${character.id}" aria-pressed="${this.runWeapon === character.id}"><span class="eyebrow">${character.role}</span><strong>${character.name}</strong><span>${WEAPONS.find((w) => w.id === character.id)!.subtitle}</span><span class="selection-mark">${this.runWeapon === character.id ? 'OATH CHOSEN' : 'CHOOSE PILGRIM'}</span></button>`;
        },
      ).join(
        '',
      )}</div><div id="character-details" aria-live="polite"></div><label class="seed-label" for="seed">RUN SEED <span>The same seed, the same descent.</span></label><div class="seed-input"><input id="seed" name="seed" value="${escape(this.randomSeed())}" maxlength="40" pattern="[a-zA-Z0-9 _-]+" title="Use letters, numbers, spaces, underscores, or hyphens" required autocomplete="off" spellcheck="false"/><button type="button" data-action="reroll" title="Generate another seed" aria-label="Generate another seed">↻</button></div><p class="hint">${w.save.tutorial ? 'Each chamber is a choice. Keep room in your satchel for what the dark gives back.' : 'New to the descent? Learn the rhythm from the main menu. Training is safe.'}</p><button type="button" class="subtle full" data-action="training">Practice with this Pilgrim</button><button type="submit" class="primary full">Light the candle ${icon('arrow')}</button></form>`,
      true,
    );
    w.selection = this.runWeapon;
    this.updateCharacterDetails();
    this.gallery = new CharacterGallery(this.dialog.querySelector('#character-gallery')!, w);
    if (seeded) this.dialog.querySelector<HTMLInputElement>('#seed')?.select();
  }

  private updateCharacterDetails(): void {
    const c = characterFor(this.runWeapon),
      host = this.dialog.querySelector('#character-details');
    if (!host) return;
    host.innerHTML = `<div><p class="eyebrow">${c.difficulty} discipline</p><p>${c.description}</p><dl class="character-ratings">${['Speed', 'Reach', 'Pressure', 'Parry'].map((label, i) => `<div><dt>${label}</dt><dd>${c.ratings[i]}</dd></div>`).join('')}</dl></div><div><p class="eyebrow">RANGED OFFERING · R</p><strong>${c.ranged.name}</strong><p>${c.ranged.description}</p><small>${c.ranged.charges} charges · one returns every ${c.ranged.recharge}s</small><p class="passive-note">${c.passive}</p></div>`;
    const unlocked =
      this.world.save.characters.includes(c.id) || this.world.save.unlocks.includes(c.id);
    const submit = this.dialog.querySelector<HTMLButtonElement>('[type="submit"]')!;
    submit.disabled = !unlocked;
    submit.innerHTML = unlocked
      ? `Light the candle ${icon('arrow')}`
      : `Unlock ${c.name} in the Chronicle · ${c.id === 'twins' ? 4 : c.id === 'spear' ? 8 : c.id === 'shinobi' ? 16 : 12} embers`;
    this.dialog.querySelectorAll<HTMLElement>('.weapon-choice').forEach((b) => {
      b.querySelector('.selection-mark')!.textContent =
        b.dataset.action === `weapon:${c.id}` ? 'OATH CHOSEN' : 'CHOOSE PILGRIM';
    });
  }

  private settings(): void {
    const s = this.world.save.settings;
    const range = (key: 'master' | 'music' | 'sfx', label: string) =>
      `<label class="range-row" for="setting-${key}"><span>${label}</span><input id="setting-${key}" data-setting="${key}" type="range" min="0" max="100" value="${Math.round(s[key] * 100)}"/><output>${Math.round(s[key] * 100)}%</output></label>`;
    const toggle = (
      key: 'shake' | 'flashes' | 'assist' | 'reducedMotion' | 'quality' | 'strongOutline',
      label: string,
      help: string,
    ) =>
      key === 'quality'
        ? `<label class="toggle-row"><span>Visual quality<small>Texture detail, shadows and atmosphere.</small></span><select data-setting="detail" aria-label="Visual quality">${GRAPHICS_LEVELS.map((level) => `<option value="${level}" ${s.detail === level ? 'selected' : ''}>${GRAPHICS[level].label}</option>`).join('')}</select></label>`
        : `<label class="toggle-row"><span>${label}<small>${help}</small></span><input data-setting="${key}" type="checkbox" ${s[key] ? 'checked' : ''}/></label>`;
    this.show(
      'settings',
      'Tune the silence',
      `<p class="eyebrow">AUDIO</p>${range('master', 'Master volume')}${range('music', 'Ambience')}${range('sfx', 'Steel & effects')}<div class="section-rule"></div><p class="eyebrow">FEEL & ACCESSIBILITY</p>${toggle('shake', 'Camera shake', 'Small impulses on deflections and impacts.')}${toggle('flashes', 'Impact flashes', 'Brief warm flashes on perfect parries.')}${toggle('reducedMotion', 'Reduced motion', 'Calmer camera transitions and shorter hit stops.')}${toggle('assist', 'Parry assistance', 'More generous normal and perfect timing windows.')}${toggle('strongOutline', 'Stronger focus outline', 'Make the selected opponent clearer in dark encounters.')}${toggle('quality', 'Atmospheric quality', 'Enable bloom, shadows, fog, and floating particles.')}<div class="dialog-actions"><button class="subtle" data-action="reset">Reset saved progress</button><button class="primary" data-action="back">Done ${icon('chevron')}</button></div>`,
    );
  }
  private setting(event: Event): void {
    const input = event.target as HTMLInputElement;
    const key = input.dataset.setting;
    const s = this.world.save.settings;
    if (key === 'master' || key === 'music' || key === 'sfx') {
      s[key] = Math.max(0, Math.min(1, Number(input.value) / 100));
      input.parentElement!.querySelector('output')!.value = `${input.value}%`;
    } else if (key === 'detail' && GRAPHICS_LEVELS.includes(input.value as typeof s.detail)) {
      s.detail = graphicsLevel(input.value);
      s.quality = !['low', 'very-low'].includes(s.detail);
    } else if (
      key === 'shake' ||
      key === 'flashes' ||
      key === 'assist' ||
      key === 'reducedMotion' ||
      key === 'quality' ||
      key === 'strongOutline'
    )
      s[key] = input.checked;
    else return;
    if (!persist(this.world.save))
      this.notify('Browser storage is unavailable. Settings apply for this session.');
    this.updateSound();
    this.world.audio.ambience(
      this.world.combat,
      this.world.mode !== 'playing' && this.world.mode !== 'menu',
    );
  }

  private controls(): void {
    this.show(
      'controls',
      'The practice of steel',
      `<p class="dialog-copy">Your enemy’s guard is a second life. Deflect, apply pressure, then end the duel before it recovers.</p><div class="guide-grid"><div><p class="eyebrow">YOUR HANDS</p><dl class="controls-list"><dt>W A S D / Arrows</dt><dd>Move</dd><dt>Mouse</dt><dd>Exploration: aim. Cinematic combat: move to switch the focused opponent; the cursor is hidden.</dd><dt>Tab / Shift + Tab</dt><dd>Cycle combat focus</dd><dt>J / Left mouse</dt><dd>Strike / counter</dd><dt>K / Right mouse</dt><dd>Deflect</dd><dt>Space</dt><dd>Evade / dodge</dd><dt>E</dt><dd>Interact / finisher</dd><dt>R / Middle mouse</dt><dd>Ranged offering · charges return over time</dd><dt>L / Shift + click</dt><dd>Heavy strike</dd><dt>Q</dt><dd>Use selected consumable</dd><dt>1 / 2</dt><dd>Cycle satchel offerings</dd><dt>F</dt><dd>Resonance at 100 Focus</dd><dt>Esc</dt><dd>Pause</dd></dl></div><div><p class="eyebrow">READ THE BLADE</p><div class="guide-tip"><b>Meet steel with steel.</b><p>Deflect arrows and orbs just like steel. Perfect timing returns them to the shooter. Tap deflect as a normal strike lands. The final instant creates a perfect deflection: a silver note, golden sparks, and heavy guard damage.</p></div><div class="guide-tip"><b>Leave the red arc.</b><p>Sweeps, grabs, and heavy smashes require an evade. A greatblade can perfectly deflect a smash.</p></div><div class="guide-tip"><b>Answer every opening.</b><p>Strike immediately after a deflection to counter. Attacking keeps enemy guard from recovering. When it breaks, approach and press E.</p></div></div></div><p class="hint">Gold bar: enemy guard. Red bar: vitality. Your blue line is Focus. Each third depth holds a guardian with two phases.</p><div class="dialog-actions"><button class="subtle" data-action="back">Back</button>${this.returnMode === 'menu' ? '<button class="primary" data-action="training">Enter safe training</button>' : '<button class="primary" data-action="resume">Return to the descent</button>'}</div>`,
      true,
    );
  }

  private archive(): void {
    const w = this.world;
    this.show(
      'archive',
      'The chronicle',
      `<p class="dialog-copy">What survives the dark becomes part of your next oath.</p><div class="archive-stats"><span><b>${w.save.embers}</b> EMBERS</span><span><b>${w.save.bestDepth}</b> DEEPEST DESCENT</span><span><b>${w.save.runs}</b> OATHS TAKEN</span><span><b>${w.save.relics.length} / ${RELICS.length}</b> RELICS FOUND</span></div><p class="eyebrow">NEW STARTING POSSIBILITIES</p><div class="unlock-list">${WEAPONS.slice(
        1,
      )
        .map((weapon, i) => {
          const cost = [4, 8, 12, 16][i],
            unlocked = w.save.characters.includes(weapon.id) || w.save.unlocks.includes(weapon.id);
          return `<div><span>${icon('sword', 24)}</span><div><strong>${characterFor(weapon.id).name}</strong><p>${characterFor(weapon.id).role} · ${weapon.name}. ${weapon.description}</p></div><button data-action="unlock:${weapon.id}" ${unlocked || w.save.embers < cost ? 'disabled' : ''}>${unlocked ? 'UNLOCKED' : `${cost} EMBERS`}</button></div>`;
        })
        .join(
          '',
        )}</div><div class="section-rule"></div><p class="eyebrow">RELICS REMEMBERED</p><div class="relic-index">${RELICS.map(
        (r) => {
          const known = w.save.relics.includes(r.id);
          return `<div class="${known ? '' : 'undiscovered'}"><span>${known ? r.glyph : '◇'}</span><p><strong>${known ? r.name : 'Undiscovered'}</strong><small>${known ? r.description : 'An echo waiting in the dark.'}</small></p></div>`;
        },
      ).join(
        '',
      )}</div><div class="dialog-actions"><span class="hint">Embers are kept when a run ends.</span><button class="primary" data-action="back">Return</button></div>`,
      true,
    );
  }
  private credits(): void {
    this.show(
      'credits',
      'An original requiem',
      `<p class="dialog-copy">Hollow Canticle is a small game about the moment before two blades meet.</p><div class="credits-text"><p>Architecture, characters, particles, and audio are built by the game. The original stone texture was generated with imagegen. The supplied concepts are references; none is a gameplay backdrop.</p><p>Made with TypeScript, Phaser 4, Three.js WebGL, Vite, WebAudio, and Colyseus multiplayer. No accounts. No analytics.</p><p>Inspired by the craft of precision combat. An original world, with no affiliation to other games.</p><p class="eyebrow">VERSION 0.7.0 · CODE & ORIGINAL ASSETS: MIT</p></div><button class="primary full" data-action="back">Return to the threshold</button>`,
    );
  }

  private rewards(): void {
    const w = this.world;
    this.show(
      'reward',
      'An echo answers',
      `<p class="dialog-copy">Choose one relic. Its memory stays with this descent.</p><div class="reward-grid" style="--reward-count: ${w.rewards.length}">${w.rewards.map((r, i) => `<button class="relic-choice" data-action="relic:${r.id}"><span class="relic-key">0${i + 1}</span><span class="relic-art">${r.glyph}</span><span class="eyebrow rarity-${r.rarity.toLowerCase()}">${r.rarity.toUpperCase()} RELIC</span><strong>${r.name}</strong><span class="relic-description">${r.description}</span><span class="choose-label">TAKE THIS ECHO ${icon('arrow', 16)}</span></button>`).join('')}</div><p class="hint center">Use ${w.rewards.map((_, i) => i + 1).join(' / ')} to choose. Relics change the rules; combine their effects.</p>`,
      true,
    );
    this.dialog.querySelector('.dialog-topline button')?.remove();
  }
  private summary(): void {
    const w = this.world,
      s = w.stats;
    const duration = `${Math.floor(s.time / 60)}m ${Math.floor(s.time % 60)}s`;
    this.show(
      'death',
      'The candle goes out',
      `<p class="dialog-copy">The dark keeps your footsteps. Your next oath begins here.</p><div class="death-depth">${String(w.floor.depth).padStart(2, '0')}<span>DEPTH REACHED</span></div><div class="summary-grid">${[
        ['Souls released', s.kills],
        ['Chambers cleared', s.rooms],
        ['Deflections', s.parries],
        ['Perfect deflections', s.perfects],
        ['Best perfect streak', s.bestStreak],
        ['Final tolls', s.finishers],
        ['Damage taken', Math.round(s.damage)],
        ['Time below', duration],
      ]
        .map(([a, b]) => `<div><span>${a}</span><strong>${b}</strong></div>`)
        .join(
          '',
        )}</div><p class="hint">${w.weapon.name} · ${w.relics.length} relics · ${s.kills + s.rooms * 2 + s.bosses * 10} embers kept</p><p class="seed-summary">${escape(w.seed)} <button data-action="copy" aria-label="Copy run seed">${icon('seed', 13)}</button></p><div class="stack-buttons"><button class="primary" data-action="random">Take another oath ${icon('arrow')}</button><button data-action="restart">Replay this seed</button><button class="subtle" data-action="menu">Return to the threshold</button></div>`,
    );
    this.dialog.querySelector('.dialog-topline button')?.remove();
  }

  update(): void {
    const w = this.world;
    this.online.update();
    if (this.lastMode !== w.mode) {
      this.menu.hidden = w.mode !== 'menu';
      document.body.classList.toggle('in-game', w.mode !== 'menu');
      if (w.mode === 'paused' && !this.dialog.open) this.pauseMenu();
      this.lastMode = w.mode;
    }
    for (const event of w.events.splice(0)) {
      if (event.type === 'reward') this.rewards();
      if (event.type === 'death') this.summary();
      if (event.type === 'trained') {
        this.show(
          'trained',
          'The oath is yours',
          `<div class="training-sigil">${sigil}</div><p class="dialog-copy center">You have learned the rhythm.<br>The real descent offers no such mercy.</p><div class="stack-buttons"><button class="primary" data-action="new">Begin the descent ${icon('arrow')}</button><button class="subtle" data-action="menu">Return to the threshold</button></div>`,
        );
        this.dialog.querySelector('.dialog-topline button')?.remove();
      }
    }
    const biome = BIOMES[w.floor.biome];
    document.querySelector('#location-label')!.textContent =
      `${String(w.floor.depth).padStart(2, '0')} / ${biome.name.toUpperCase()}`;
    document.querySelector('#location-sub')!.textContent =
      w.floor.hybrid === null
        ? biome.label
        : `MUTATION · ${BIOMES[w.floor.hybrid].short.toUpperCase()}`;
    const status = w.toast && w.toast.until > w.time ? w.toast.text : '';
    if (status && status !== this.lastStatus) {
      this.notify(`${status}. ${w.toast!.sub}`);
      this.lastStatus = status;
    }
    this.updateSound();
    const debugState = document.querySelector('#debug-state');
    if (debugState) {
      const e = w.target;
      debugState.textContent = `Time ${w.time.toFixed(2)} · HP ${Math.round(w.player.hp)} · ${w.player.state}\nPlayer ${w.player.x.toFixed(0)},${w.player.y.toFixed(0)} · Target ${w.focusedEnemy ?? 'free'} · Room ${w.roomId} · ${w.room.kind}\nParries ${w.stats.parries} / Perfect ${w.stats.perfects} · Empty ${w.player.emptyParries}\n${e ? `${e.def.id}: ${e.state} ${Math.max(0, w.time - e.stateAt).toFixed(2)} / ${e.strike.windup.toFixed(2)} ${e.strike.kind}` : 'No opponent'}\n${w.lab.animationName} @ ${w.lab.normalized.toFixed(2)} · ${w.lab.locomotion} / ${w.lab.action} · ${w.lab.weights}\nActive ${w.lab.hitWindow} · root ${w.lab.rootMotion.toFixed(2)}\nParryable ${e && ['slash', 'thrust'].includes(e.strike.kind) ? 'yes' : 'no (greatblade can perfect smash)'}\nReservations ${w.threats.reservations.map((r) => `${r.enemy}@${r.at.toFixed(2)}`).join(', ')}\nArsenal ${w.player.rangedCharges}/${w.character.ranged.charges} · ${w.projectiles.active.length} projectiles\n${w.projectiles.active.map((p) => `${p.kind} ${p.x.toFixed(0)},${p.y.toFixed(0)} v${Math.hypot(p.vx, p.vy).toFixed(0)} owner:${p.owner} parry:${p.parryable} return:${p.reflected}`).join(' / ')}\nReflections ${w.stats.reflections} · Items ${w.stats.itemsUsed} · Ranged hits ${w.stats.rangedHits}\nCamera ${w.presentation.mode} · ${w.presentation.fps} FPS\n${w.presentation.drawCalls} calls · ${Math.round(w.presentation.triangles / 1000)}k triangles`;
    }
  }
  private updateSound(): void {
    const muted = this.world.save.settings.master === 0;
    if (this.lastMute === muted) return;
    this.lastMute = muted;
    const button = document.querySelector('[data-action="sound"]')!;
    button.innerHTML = icon(this.world.save.settings.master ? 'sound' : 'mute');
    button.setAttribute(
      'aria-label',
      this.world.save.settings.master ? 'Mute audio' : 'Unmute audio',
    );
  }
  private notify(message: string): void {
    document.querySelector('#live-status')!.textContent = message;
  }

  private addDebug(): void {
    const panel = document.createElement('details');
    panel.className = 'debug-panel';
    panel.innerHTML = `<summary>QA tools</summary><label>Invincible <input type="checkbox" id="debug-god"/></label><label>Enemy <select id="debug-enemy">${ENEMIES.map((e) => `<option value="${e.id}">${e.name}</option>`).join('')}</select></label><button id="debug-spawn">Spawn encounter</button><label>Weapon <select id="debug-weapon">${WEAPONS.map((w) => `<option value="${w.id}">${w.name}</option>`).join('')}</select></label><label>Depth <input id="debug-depth" type="number" min="1" max="10000" value="1"/></label><button id="debug-jump">Jump depth</button><button id="debug-heal">Restore vitality / Focus</button><button id="debug-loot">Open relic choice</button><button id="debug-break">Break nearest guard</button><label>Relic <select id="debug-relic">${RELICS.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label><button id="debug-add">Add relic</button>`;
    document.body.append(panel);
    panel.querySelector('summary')!.textContent = 'Combat laboratory';
    panel.insertAdjacentHTML(
      'beforeend',
      `<label>Enemy count <input id="lab-count" type="number" min="1" max="3" value="1"/></label>
      <label>Support <select id="lab-support"><option value="same">Same archetype</option>${ENEMIES.filter(
        (e) => e.id !== 'boss',
      )
        .map((e) => `<option value="${e.id}">${e.name}</option>`)
        .join('')}</select></label>
      <label>Elite <select id="lab-elite"><option value="none">None</option><option>Patient</option><option>Relentless</option><option>Armored</option></select></label>
      <label>Biome <select id="lab-biome">${BIOMES.map((b, i) => `<option value="${i}">${b.short}</option>`).join('')}</select></label>
      <label>Pattern <select id="lab-pattern"><option value="-1">Adaptive</option><option value="0">Sequence 1</option><option value="1">Sequence 2</option><option value="2">Sequence 3</option><option value="3">Sequence 4</option></select></label>
      <label>Camera <select id="lab-camera"><option value="auto">Automatic</option><option value="exploration">Exploration</option><option value="combat-wide">Combat wide</option><option value="duel">Duel</option><option value="boss">Boss</option></select></label>
      <label>Review actor <select id="lab-actor"><option value="player">Player</option><option value="enemy">Focused enemy</option></select></label><label>Velocity <input id="lab-velocity" type="range" min="0" max="300" value="0"/></label><label>Turn rate <input id="lab-turn" type="range" min="-3" max="3" step="0.1" value="0"/></label><label>Close combat <input id="lab-close" type="checkbox"/></label><label>Room collision overlay <input id="lab-geometry" type="checkbox"/></label><label>Clip <select id="lab-clip">${['live', ...LOCOMOTION_STATES, 'slash', 'thrust', 'sweep', 'smash', 'grab', 'feint', 'finisher', 'riposte', 'parry', 'dodge'].map((c) => `<option>${c}</option>`).join('')}</select></label>
      <label>Execution <select id="lab-execution"><option value="0">I</option><option value="1">II</option><option value="2">III</option></select></label>
      <label>Freeze / scrub <input id="lab-freeze" type="checkbox"/></label><label>Clip time <input id="lab-scrub" type="range" min="0" max="1" step="0.01" value="0"/></label>
      <label>Step amount <select id="lab-step-size"><option value="0.008333333333333333">One frame</option><option value="0.05">50 ms</option><option value="0.1">100 ms</option><option value="0.5">500 ms</option></select></label>
      <button id="lab-step">Advance simulation</button><button id="lab-phase">Reveal boss phase II</button>`,
    );
    panel.title = 'F2 toggles QA tools';
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        panel.hidden = !panel.hidden;
      }
    });
    const w = this.world;
    const value = (id: string) =>
      (panel.querySelector('#' + id) as HTMLInputElement | HTMLSelectElement).value;
    panel.insertAdjacentHTML(
      'beforeend',
      `<label>Projectile speed <input id="lab-projectile-speed" type="range" min="0.25" max="2" step="0.25" value="1"/></label><label>Projectile type <select id="lab-projectile-type"><option>auto</option><option>arrow</option><option>orb</option></select></label><label>Infinite charges <input id="lab-infinite" type="checkbox"/></label><button id="lab-zero">Empty charges</button><label>Recharge rate <input id="lab-recharge" type="range" min="0" max="4" step="0.25" value="1"/></label><label>Offering <select id="lab-item">${ITEMS.map((i) => `<option value="${i.id}">${i.name}</option>`).join('')}</select></label><button id="lab-give">Give offering</button><button id="lab-drop">Drop offering</button><button id="lab-buff">Activate its buff</button><label>Loot outcome <select id="lab-loot"><option>auto</option>${Object.keys(
        LOOT_WEIGHTS,
      )
        .map((k) => `<option>${k}</option>`)
        .join(
          '',
        )}</select></label><button id="lab-roll">Roll chamber loot</button><button id="lab-simulate">Simulate 10,000 rolls</button><label>Projectile paths / collision <input id="lab-hitboxes" type="checkbox"/></label><button id="lab-run-stats">Run statistics</button><pre id="lab-arsenal-stats"></pre>`,
    );
    panel
      .querySelector('#lab-projectile-speed')!
      .addEventListener(
        'input',
        () => (w.lab.projectileSpeed = Number(value('lab-projectile-speed'))),
      );
    panel
      .querySelector('#lab-projectile-type')!
      .addEventListener('change', () => (w.lab.projectileType = value('lab-projectile-type')));
    panel
      .querySelector('#lab-infinite')!
      .addEventListener(
        'change',
        (e) => (w.lab.infiniteCharges = (e.target as HTMLInputElement).checked),
      );
    panel.querySelector('#lab-zero')!.addEventListener('click', () => {
      w.player.rangedCharges = 0;
      w.player.recharge = 0;
    });
    panel
      .querySelector('#lab-recharge')!
      .addEventListener('input', () => (w.lab.rechargeRate = Number(value('lab-recharge'))));
    panel
      .querySelector('#lab-give')!
      .addEventListener('click', () => w.inventory.add(value('lab-item')));
    panel
      .querySelector('#lab-drop')!
      .addEventListener('click', () => w.dropItem(value('lab-item')));
    panel.querySelector('#lab-buff')!.addEventListener('click', () => {
      const item = ITEMS.find((i) => i.id === value('lab-item'))!;
      if (item.buff) w.buffs.add(item.buff, w.time, 'laboratory');
    });
    panel
      .querySelector('#lab-loot')!
      .addEventListener('change', () => (w.lab.forceLoot = value('lab-loot')));
    panel.querySelector('#lab-roll')!.addEventListener('click', () => w.resolveLoot());
    panel.querySelector('#lab-simulate')!.addEventListener('click', () => {
      const director = new LootDirector(w.seed),
        counts = Object.fromEntries(Object.keys(LOOT_WEIGHTS).map((k) => [k, 0]));
      for (let i = 0; i < 10000; i++) counts[director.roll('combat').kind]++;
      panel.querySelector('#lab-arsenal-stats')!.textContent = JSON.stringify(
        { weights: LOOT_WEIGHTS, counts },
        null,
        2,
      );
    });
    panel.querySelector('#lab-run-stats')!.addEventListener('click', () => {
      panel.querySelector('#lab-arsenal-stats')!.textContent = JSON.stringify(w.stats, null, 2);
    });
    panel
      .querySelector('#lab-hitboxes')!
      .addEventListener('change', (e) => (w.lab.hitboxes = (e.target as HTMLInputElement).checked));
    panel
      .querySelector('#lab-camera')!
      .addEventListener('change', () => (w.lab.camera = value('lab-camera')));
    panel
      .querySelector('#lab-actor')!
      .addEventListener('change', () => (w.lab.actor = value('lab-actor')));
    panel
      .querySelector('#lab-velocity')!
      .addEventListener('input', () => (w.lab.velocity = Number(value('lab-velocity'))));
    panel
      .querySelector('#lab-turn')!
      .addEventListener('input', () => (w.lab.turnRate = Number(value('lab-turn'))));
    panel
      .querySelector('#lab-close')!
      .addEventListener(
        'change',
        (e) => (w.lab.closeCombat = (e.target as HTMLInputElement).checked),
      );
    panel
      .querySelector('#lab-geometry')!
      .addEventListener('change', (e) => (w.lab.geometry = (e.target as HTMLInputElement).checked));
    panel
      .querySelector('#lab-clip')!
      .addEventListener('change', () => (w.lab.clip = value('lab-clip')));
    panel
      .querySelector('#lab-execution')!
      .addEventListener('change', () => (w.lab.executionVariant = Number(value('lab-execution'))));
    panel
      .querySelector('#lab-scrub')!
      .addEventListener('input', () => (w.lab.clipTime = Number(value('lab-scrub'))));
    panel.querySelector('#lab-freeze')!.addEventListener('change', (event) => {
      w.lab.freeze = (event.target as HTMLInputElement).checked;
      w.timeScale = w.lab.freeze ? 0 : Number(value('debug-speed'));
    });
    panel.querySelector('#lab-step')!.addEventListener('click', () => {
      const frames = Math.round(Number(value('lab-step-size')) * 120);
      for (let i = 0; i < frames; i++) w.update(1 / 120);
      this.update();
    });
    panel.querySelector('#lab-phase')!.addEventListener('click', () => {
      const boss = w.alive.find((e) => e.def.id === 'boss');
      if (boss) boss.hp = boss.maxHp * 0.47;
      w.update(1 / 120);
    });
    panel.insertAdjacentHTML(
      'beforeend',
      '<label>Area <input id="debug-room" type="number" min="0" max="30" value="0"/></label><button id="debug-enter-room">Enter area</button><button id="debug-graph">Generation graph</button><label>Seed <input id="debug-new-seed" value="V02-BASELINE"/></label><button id="debug-regenerate">Regenerate seed</button>',
    );
    panel.querySelector('#debug-enter-room')!.addEventListener('click', () => {
      const id = Number((panel.querySelector('#debug-room') as HTMLInputElement).value);
      if (w.floor.rooms[id]) w.enterRoom(id);
    });
    panel.querySelector('#debug-regenerate')!.addEventListener('click', () => {
      this.close();
      w.start((panel.querySelector('#debug-new-seed') as HTMLInputElement).value, w.weapon.id);
    });
    panel.querySelector('#debug-graph')!.addEventListener('click', () => {
      if (w.mode === 'playing') w.pause();
      const xs = w.floor.rooms.map((r) => r.x),
        ys = w.floor.rooms.map((r) => r.y),
        minX = Math.min(...xs) - 1,
        minY = Math.min(...ys) - 1,
        maxX = Math.max(...xs) + 1,
        maxY = Math.max(...ys) + 1;
      const svg = w.floor.rooms
        .map(
          (r) =>
            r.links
              .filter((id) => id > r.id)
              .map((id) => {
                const next = w.floor.rooms[id];
                return `<path d="M${r.x * 80} ${r.y * 70} L${next.x * 80} ${next.y * 70}"/>`;
              })
              .join('') +
            `<rect x="${r.x * 80 - 22}" y="${r.y * 70 - 14}" width="44" height="28"/><text x="${r.x * 80}" y="${r.y * 70 + 5}">${r.id}</text>`,
        )
        .join('');
      this.show(
        'generation',
        'The architecture of a descent',
        `<p class="dialog-copy">${escape(w.seed)} · Depth ${w.floor.depth} · ${BIOMES[w.floor.biome].name}</p><svg class="generation-graph" viewBox="${minX * 80} ${minY * 70} ${(maxX - minX) * 80} ${(maxY - minY) * 70}">${svg}</svg><div class="generation-list">${w.floor.rooms.map((r) => `<p><b>${r.id} · ${r.kind}</b> ${r.template} · budget ${r.budget} · ${r.modifier} · links ${r.links.join(', ')}</p>`).join('')}</div><button class="primary full" data-action="back">Return to the descent</button>`,
        true,
      );
    });
    panel.insertAdjacentHTML(
      'beforeend',
      `<label>Time scale <select id="debug-speed"><option value="1">Normal</option><option value="0.25">Quarter speed</option><option value="0.1">Tenth speed</option><option value="0">Frame pause</option></select></label><button id="debug-range">Stand in duel range</button><label>Chamber <select id="debug-modifier">${['Quiet', 'Darkness', 'Resonant', 'Blood pact', 'Unstable', 'Silence'].map((m) => `<option>${m}</option>`).join('')}</select></label><pre id="debug-state"></pre>`,
    );
    panel
      .querySelector('#debug-speed')!
      .addEventListener(
        'change',
        (e) => (w.timeScale = Number((e.target as HTMLSelectElement).value)),
      );
    panel.querySelector('#debug-range')!.addEventListener('click', () => {
      const e = w.target;
      if (e) {
        w.player.x = e.x - 85;
        w.player.y = e.y;
      }
    });
    panel
      .querySelector('#debug-modifier')!
      .addEventListener(
        'change',
        (e) => (w.room.modifier = (e.target as HTMLSelectElement).value as typeof w.room.modifier),
      );
    panel
      .querySelector('#debug-god')!
      .addEventListener('change', (e) => (w.invincible = (e.target as HTMLInputElement).checked));
    panel.querySelector('#debug-weapon')!.addEventListener('change', (e) => {
      w.weapon = WEAPONS.find((x) => x.id === (e.target as HTMLSelectElement).value)!;
      w.player.rangedCharges = w.character.ranged.charges;
      w.player.recharge = 0;
    });
    panel.querySelector('#debug-heal')!.addEventListener('click', () => {
      w.player.hp = 100;
      w.player.focus = 100;
    });
    panel.querySelector('#debug-spawn')!.addEventListener('click', () => {
      this.close();
      w.configureLab({
        enemy: value('debug-enemy'),
        support: value('lab-support'),
        count: Number(value('lab-count')),
        elite: value('lab-elite'),
        depth: Number(value('debug-depth')),
        biome: Number(value('lab-biome')),
        pattern: Number(value('lab-pattern')),
      });
    });
    panel.querySelector('#debug-jump')!.addEventListener('click', () => {
      const depth = Number((panel.querySelector('#debug-depth') as HTMLInputElement).value);
      if (Number.isFinite(depth) && depth >= 1) {
        w.floor = makeFloor(w.seed, Math.floor(Math.min(10000, depth)));
        w.enterRoom(0);
        w.obstacles = obstaclesFor(w.room, w.floor.biome);
      }
    });
    panel.querySelector('#debug-loot')!.addEventListener('click', () => w.openReward());
    panel.querySelector('#debug-break')!.addEventListener('click', () => {
      const target = w.target;
      if (target) w.pressure(target, 1000);
    });
    panel.querySelector('#debug-add')!.addEventListener('click', () => {
      const relic = RELICS.find(
        (r) => r.id === (panel.querySelector('#debug-relic') as HTMLSelectElement).value,
      )!;
      if (!w.relics.includes(relic)) w.relics.push(relic);
    });
  }
}
