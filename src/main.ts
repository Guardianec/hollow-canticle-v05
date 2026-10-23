import * as Phaser from 'phaser';
import { DungeonScene } from './game/scene';
import { World } from './game/world';
import { loadSave } from './game/save';
import { Interface } from './ui';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import './styles/main.css';

if (new URLSearchParams(location.search).has('benchmark')) {
  const { startBenchmark } = await import('./game/presentation/benchmark');
  await startBenchmark();
} else {
  const world = new World(loadSave());
  const ui = new Interface(world);
  const game = new Phaser.Game({
    type: Phaser.HEADLESS,
    width: 1,
    height: 1,
    input: { keyboard: false, mouse: false, touch: false },
    autoFocus: false,
    backgroundColor: '#0a1116',
    transparent: false,
    antialias: true,
    scene: [new DungeonScene(world)],
    banner: false,
    audio: { noAudio: true },
    fps: { target: 60 },
  });

  setInterval(() => ui.update(), 100);
  window.addEventListener('pagehide', () => world.audio.ambience(false, true));

  // Deliberate local QA surface; never enabled unless the URL requests it.
  if (world.debug) Object.assign(window, { canticle: { world, game, ui } });
}
