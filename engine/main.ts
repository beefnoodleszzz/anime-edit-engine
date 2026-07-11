import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { AnimeEditEngine } from './core/Engine';
import { ProjectLoader } from './core/ProjectLoader';
import { HyperFramesAdapter } from './hyperframes/HyperFramesAdapter';
import type { ProjectManifest, RenderModeName, TimelineManifest } from './types';

const mode = (new URLSearchParams(window.location.search).get('mode') ?? 'review') as RenderModeName;
const config = ProjectLoader.validate({ project: project as ProjectManifest, timeline: timeline as TimelineManifest });
const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const sourceVideo = document.querySelector<HTMLVideoElement>('#source-video');
if (!canvas || !sourceVideo) throw new Error('Anime Edit Engine root elements are missing.');
if (!(mode in config.project.renderModes)) throw new Error(`Unknown render mode: ${mode}`);
const engine = new AnimeEditEngine(config, mode, canvas, sourceVideo);
new HyperFramesAdapter(engine).install();
const initialTime = window.__hfThreeTime ?? 0;
window.__animeEngineReady = engine.renderFrame(initialTime);
