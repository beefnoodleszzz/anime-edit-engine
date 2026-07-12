import { AnimeEditEngine } from './core/Engine';
import { ProjectLoader } from './core/ProjectLoader';
import { HyperFramesAdapter } from './hyperframes/HyperFramesAdapter';
import { assertRenderParity, createRenderContext } from './core/RenderContext';
import type { ProjectManifest, RenderModeName, TimelineManifest } from './types';

// Wrapped in an async IIFE rather than using top-level await: `hyperframes validate` evaluates
// this bundle outside a real module-goal context, where top-level await is a syntax error.
void (async () => {
  // The active project is not baked into this bundle at build time — index.html's #root carries
  // data-project-id (written by tools/generate-composition.ts), and the manifests are fetched at
  // runtime from projects/<id>/. This lets one dist/main.js serve whichever project index.html
  // currently points at, instead of every project needing its own build. Resolved against the
  // <script> tag's own (already browser-resolved) src, not import.meta.url — Vite statically
  // rewrites `new URL(dynamic, import.meta.url)` into a bundled-asset glob import at build time,
  // which silently breaks runtime per-project selection. Reading the DOM src also means this
  // still finds dist/main.js correctly from render-master.ts's generated entry HTML, which lives
  // one directory deeper at compositions/.master.render.html and references it as "../dist/main.js".
  const mainScriptSrc = document.querySelector<HTMLScriptElement>('script[type="module"][src$="main.js"]')?.src;
  const scriptBaseUrl = new URL('.', mainScriptSrc ?? window.location.href);
  const projectId = document.querySelector<HTMLElement>('#root')?.dataset.projectId ?? '001-demo';
  const manifestUrl = (name: string): string => new URL(`../projects/${projectId}/${name}`, scriptBaseUrl).toString();
  const [project, timeline] = await Promise.all([
    fetch(manifestUrl('project.json')).then((response) => response.json() as Promise<ProjectManifest>),
    fetch(manifestUrl('timeline.json')).then((response) => response.json() as Promise<TimelineManifest>),
  ]);

  const mode = (new URLSearchParams(window.location.search).get('mode') ?? document.documentElement.dataset.renderMode ?? 'review') as RenderModeName;
  const config = ProjectLoader.validate({ project, timeline });
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
})();
