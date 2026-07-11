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
const adapter = new HyperFramesAdapter(engine);
// Install before issuing any render: HyperFrames' own bootstrap can dispatch the first
// `hf-seek` before this module would otherwise react, and every render — including the very
// first — must go through the same window.__renderReady-gated path (see HyperFramesAdapter).
adapter.install();
// Cold-start paint. Harmless if HyperFrames' bootstrap already dispatched hf-seek(0) first
// (renderFrame is a pure function of time, so re-rendering the same time is a no-op repaint);
// necessary if this module runs before that bootstrap fires.
adapter.renderGated(window.__hfThreeTime ?? 0);
