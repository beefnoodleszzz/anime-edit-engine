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
    const heroRange = (project as ProjectManifest).sources.find((source) => source.id === frame.shot.source)!.heroRanges[frame.shot.rangeIndex]!;
    expect(frame.sourceTime).toBeGreaterThanOrEqual(heroRange.start);
    expect(frame.sourceTime).toBeLessThanOrEqual(heroRange.end);
  });
  it('calculates a 60 Hz frame index without playback state', () => {
    expect(director.resolve(6.2).frameIndex).toBe(372);
  });
  it('creates cape bridge opacity around the wipe edge', () => {
    expect(director.resolve(4.9).transition.kind).toBe('COLOR_BRIDGE_CUT');
    expect(director.resolve(4.9).transition.colorBridgeAlpha).toBeGreaterThan(0);
  });
  it('derives a bridge color from the outgoing and incoming source metadata', () => {
    const typedProject = structuredClone(project) as ProjectManifest;
    typedProject.sources.find((source) => source.id === 'CAPE_TURN_001')!.transitionMetadata = { dominantColor: [0.2, 0.1, 0.05] };
    typedProject.sources.find((source) => source.id === 'CAPE_EXIT_001')!.transitionMetadata = { dominantColor: [0.6, 0.4, 0.2] };
    const metadataDirector = new Director(typedProject, timeline as TimelineManifest, createRenderContext(typedProject, 'master'));
    expect(metadataDirector.resolve(4.9).transition.bridgeColor).toEqual([0.4, 0.25, 0.125]);
  });
  it('maps a source action peak to an explicit output sync point', () => {
    const syncTimeline = structuredClone(timeline) as TimelineManifest;
    syncTimeline.shots[4]!.syncPoints = [
      { kind: 'gesture-start', outputTime: 4.2, sourceTime: 1.5 },
      { kind: 'impact', outputTime: 4.6, sourceTime: 3.6 },
      { kind: 'settle', outputTime: 5.0, sourceTime: 4.2 },
    ];
    const syncDirector = new Director(project as ProjectManifest, syncTimeline, createRenderContext(project as ProjectManifest, 'master'));
    expect(syncDirector.resolve(4.6).sourceTime).toBeCloseTo(3.6, 5);
    expect(syncDirector.resolve(4.8).sourceTime).toBeGreaterThan(3.6);
  });
  it('provides adaptive transform samples around active camera motion', () => {
    const sharp = director.resolve(2.7);
    const whip = director.resolve(4.7);
    expect(sharp.blur.samples).toBe(1);
    expect(whip.blur.samples).toBeGreaterThan(1);
    expect(whip.transformPath).toHaveLength(whip.blur.samples);
  });
});
