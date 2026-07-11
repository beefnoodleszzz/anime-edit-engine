import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { Director } from '../engine/director/Director';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

describe('Director', () => {
  const director = new Director(project as ProjectManifest, timeline as TimelineManifest, 120);
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
    expect(director.resolve(4.9).transition.kind).toBe('CAPE_WIPE');
    expect(director.resolve(4.9).transition.colorBridgeAlpha).toBeGreaterThan(0);
  });
});
