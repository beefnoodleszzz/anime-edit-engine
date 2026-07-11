import { AnimeEditEngine } from '../../engine/core/Engine';
import { HyperFramesAdapter } from '../../engine/hyperframes/HyperFramesAdapter';
import { ProjectLoader } from '../../engine/core/ProjectLoader';
import type { ProjectManifest, TimelineManifest } from '../../engine/types';

declare global {
  interface Window {
    __harnessReady?: boolean;
    __harnessError?: string;
    __harnessRenderGated?: (time: number) => void;
  }
}

// A minimal synthetic project: one shot, one source, a long shot duration so the camera's
// finite-difference velocity at progress=0 is effectively zero (true zero-blur, single exact
// transform sample — see tests/first-frame.test.ts for why this makes the expected sample UV
// solvable by hand). FACE_CROSS_LEFT's first keyframe is exact at progress=0: scale=1.14,
// x=-0.13, y=0, rotation=-2.4, pivot=(0.5,0.5).
const project: ProjectManifest = {
  id: 'first-frame-fixture', name: 'First Frame Fixture', duration: 40, seed: 1,
  renderModes: {
    draft: { width: 64, height: 64, fps: 4, blurSamples: 1, postFX: 'reduced' },
    review: { width: 64, height: 64, fps: 4, blurSamples: 1, postFX: 'reduced' },
    master: { width: 64, height: 64, fps: 4, blurSamples: 1, postFX: 'reduced' },
  },
  sources: [{ id: 'FIXTURE', type: 'HERO_IDLE', file: 'fixture.mp4', width: 64, height: 64, fps: 4, duration: 1, heroRanges: [{ start: 0, end: 1, score: 100, tags: [] }], tags: [] }],
};
const timeline: TimelineManifest = { bpm: 100, beats: [0], shots: [{ id: 's01', source: 'FIXTURE', start: 0, end: 40, rangeIndex: 0, camera: 'FACE_CROSS_LEFT', timeWarp: 'steady' }] };

function main(): void {
  try {
    const config = ProjectLoader.validate({ project, timeline });
    const canvas = document.querySelector<HTMLCanvasElement>('#stage');
    const video = document.querySelector<HTMLVideoElement>('#source-s01');
    if (!canvas || !video) throw new Error('Harness DOM is missing #stage or #source-s01.');
    const engine = new AnimeEditEngine(config, 'draft', canvas, new Map([['s01', video]]));
    const adapter = new HyperFramesAdapter(engine);
    adapter.install();
    window.__harnessRenderGated = (time: number) => adapter.renderGated(time);
    window.__harnessReady = true;
  } catch (error) {
    window.__harnessError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  }
}

main();
