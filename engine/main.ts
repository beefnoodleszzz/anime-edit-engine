import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { AnimeEditEngine } from './core/Engine';
import { ProjectLoader } from './core/ProjectLoader';
import { HyperFramesAdapter } from './hyperframes/HyperFramesAdapter';
import { assertRenderParity, createRenderContext } from './core/RenderContext';
import type { ProjectManifest, RenderModeName, TimelineManifest } from './types';

const mode = (new URLSearchParams(window.location.search).get('mode') ?? document.documentElement.dataset.renderMode ?? 'review') as RenderModeName;
const config = ProjectLoader.validate({ project: project as ProjectManifest, timeline: timeline as TimelineManifest });
const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const preparedVideos = new Map(Array.from(document.querySelectorAll<HTMLVideoElement>('[data-prepared-shot]')).map((video) => [video.dataset.preparedShot ?? '', video]));
if (!canvas || preparedVideos.size !== config.timeline.shots.length) throw new Error('Anime Edit Engine prepared sources are missing.');
if (!(mode in config.project.renderModes)) throw new Error(`Unknown render mode: ${mode}`);
assertRenderParity(createRenderContext(config.project, mode), document.querySelector<HTMLElement>('#root') ?? document.body);
const engine = new AnimeEditEngine(config, mode, canvas, preparedVideos);
const initialTime = window.__hfThreeTime ?? 0;
engine.renderFrame(initialTime);
window.__animeEngineReady = Promise.resolve();
new HyperFramesAdapter(engine).install();
// The runtime can publish its initial media frame in the same task that loads this module.
// A microtask observes that completed injection without relying on an arbitrary delay.
queueMicrotask(() => engine.renderFrame(window.__hfThreeTime ?? initialTime));
