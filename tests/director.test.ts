import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { Director } from '../engine/director/Director';
import type { ProjectManifest, TimelineManifest } from '../engine/types';
import { createRenderContext } from '../engine/core/RenderContext';

describe('Director', () => {
  const director = new Director(project as ProjectManifest, timeline as TimelineManifest, createRenderContext(project as ProjectManifest, 'master'));
  it('resolves the same absolute time to the same state', () => {
    expect(director.resolve(4.8)).toEqual(director.resolve(4.8));
  });
  it('maps source time inside the selected hero range', () => {
    const frame = director.resolve(2.7);
    expect(frame.shot.id).toBe('s03');
    expect(frame.sourceTime).toBeGreaterThanOrEqual(8.9);
    expect(frame.sourceTime).toBeLessThanOrEqual(11.2);
  });
  it('calculates a 120 Hz frame index without playback state', () => {
    expect(director.resolve(6.2).frameIndex).toBe(744);
  });
  it('creates cape bridge opacity around the wipe edge', () => {
    expect(director.resolve(4.9).transition.kind).toBe('COLOR_BRIDGE_CUT');
    expect(director.resolve(4.9).transition.colorBridgeAlpha).toBeGreaterThan(0);
  });
  it('provides adaptive transform samples around active camera motion', () => {
    const sharp = director.resolve(2.7);
    const whip = director.resolve(4.7);
    expect(sharp.blur.samples).toBe(1);
    expect(whip.blur.samples).toBeGreaterThan(1);
    expect(whip.transformPath).toHaveLength(whip.blur.samples);
  });
});
