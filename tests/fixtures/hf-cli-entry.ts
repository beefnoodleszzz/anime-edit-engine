import { AnimeEditEngine } from '../../engine/core/Engine';
import { HyperFramesAdapter } from '../../engine/hyperframes/HyperFramesAdapter';
import { ProjectLoader } from '../../engine/core/ProjectLoader';
import type { ProjectManifest, TimelineManifest } from '../../engine/types';

declare global { interface Window { __hfThreeTime?: number; __hfCliEntryError?: string; } }

/**
 * Real HyperFrames CLI entry point (bundled and referenced from a generated index.html exactly
 * like engine/main.ts is for the real project). This module intentionally never renders except
 * through the real hf-seek listener installed by HyperFramesAdapter — there is no test-only
 * escape hatch here (see tests/fixtures/first-frame-harness.ts for the harness that exposes one
 * for the non-CLI browser test). Every frame this module ever draws is driven by the actual
 * HyperFrames CLI's own deterministic seek dispatch.
 */
const project: ProjectManifest = {
  id: 'hf-cli-fixture', name: 'HyperFrames CLI Fixture', duration: 1, seed: 1,
  renderModes: {
    draft: { width: 64, height: 64, fps: 4, blurSamples: 1, postFX: 'reduced' },
    review: { width: 64, height: 64, fps: 4, blurSamples: 1, postFX: 'reduced' },
    master: { width: 64, height: 64, fps: 4, blurSamples: 1, postFX: 'reduced' },
  },
  sources: [{ id: 'FIXTURE', type: 'HERO_IDLE', file: 'fixture.mp4', width: 64, height: 64, fps: 4, duration: 1, heroRanges: [{ start: 0, end: 1, score: 100, tags: [] }], tags: [] }],
};
const timeline: TimelineManifest = { bpm: 100, beats: [0], shots: [{ id: 's01', source: 'FIXTURE', start: 0, end: 1, rangeIndex: 0, camera: 'FACE_CROSS_LEFT', timeWarp: 'steady' }] };

try {
  const mode = (document.documentElement.dataset.renderMode ?? 'master') as 'draft' | 'review' | 'master';
  const config = ProjectLoader.validate({ project, timeline });
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const video = document.querySelector<HTMLVideoElement>('[data-prepared-shot="s01"]');
  if (!canvas || !video) throw new Error('HyperFrames CLI fixture DOM is missing #stage or the prepared source video.');
  const engine = new AnimeEditEngine(config, mode, canvas, new Map([['s01', video]]));
  const adapter = new HyperFramesAdapter(engine);
  adapter.install();
  adapter.renderGated(window.__hfThreeTime ?? 0);
} catch (error) {
  window.__hfCliEntryError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
}
