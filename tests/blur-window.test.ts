import { describe, expect, it } from 'vitest';
import { Director } from '../engine/director/Director';
import { createRenderContext } from '../engine/core/RenderContext';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

const project = { id: 'blur-window', name: 'blur-window', duration: 1, seed: 1, qualityProfile: 'anime-ultra-clear', renderModes: { draft: { width: 10, height: 10, fps: 30, blurSamples: 4, postFX: 'reduced' }, review: { width: 10, height: 10, fps: 60, blurSamples: 8, postFX: 'full' }, master: { width: 10, height: 10, fps: 60, blurSamples: 8, postFX: 'full' } }, sources: [{ id: 'source', type: 'CAPE_TURN', file: 'source.mp4', width: 2160, height: 3840, fps: 24, duration: 2, heroRanges: [{ start: 0, end: 2, score: 1, tags: [] }], tags: [] }] } as ProjectManifest;
const timeline = { bpm: 100, beats: [], shots: [{ id: 'shot', source: 'source', start: 0, end: 1, rangeIndex: 0, camera: 'WHIP_RIGHT', timeWarp: 'whip', blurWindows: [{ startProgress: 0.4, endProgress: 0.6, strength: 0.8, maxSamples: 6 }] }] } as TimelineManifest;

describe('blur windows', () => {
  it('is clear outside explicitly configured windows', () => {
    const director = new Director(project, timeline, createRenderContext(project, 'master'));
    expect(director.resolve(0.1).blur.samples).toBe(1);
    expect(director.resolve(0.5).blur.samples).toBeGreaterThan(1);
    expect(director.resolve(0.9).blur.samples).toBe(1);
  });
});
