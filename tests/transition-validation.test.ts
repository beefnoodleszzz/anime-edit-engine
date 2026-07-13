import { describe, expect, it } from 'vitest';
import { ProjectLoader } from '../engine/core/ProjectLoader';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

const clone = (): { project: ProjectManifest; timeline: TimelineManifest } => ({ project: structuredClone(project) as ProjectManifest, timeline: structuredClone(timeline) as TimelineManifest });
/** s05 (CAPE_TURN_001) -> s06 (CAPE_EXIT_001) is the only adjacent pair in the demo timeline. */
const withWipe = (coveragePeak: [number, number], direction?: [string | undefined, string | undefined]) => {
  const { project: p, timeline: t } = clone();
  p.sources.find((source) => source.id === 'CAPE_TURN_001')!.transitionMetadata = { estimatedCoveragePeak: coveragePeak[0], ...(direction?.[0] ? { direction: direction[0] as 'left' } : {}) };
  p.sources.find((source) => source.id === 'CAPE_EXIT_001')!.transitionMetadata = { estimatedCoveragePeak: coveragePeak[1], ...(direction?.[1] ? { direction: direction[1] as 'left' } : {}) };
  t.shots[4]!.transitionOut = 'FOREGROUND_OCCLUSION_WIPE';
  t.shots[5]!.transitionIn = 'FOREGROUND_OCCLUSION_WIPE';
  return { project: p, timeline: t };
};

describe('Transition validation', () => {
  it('requires 0.8 foreground coverage', () => {
    const p = structuredClone(project) as ProjectManifest;
    const t = structuredClone(timeline) as TimelineManifest;
    t.shots[4]!.transitionOut = 'FOREGROUND_OCCLUSION_WIPE';
    expect(() => ProjectLoader.validate({ project: p, timeline: t })).toThrow('Outgoing occlusion');
  });

  it('reports timeline epsilon details', () => {
    const t = structuredClone(timeline) as TimelineManifest;
    t.shots[1]!.start += 0.01;
    expect(() => ProjectLoader.validate({ project: project as ProjectManifest, timeline: t })).toThrow('difference=');
  });

  it('validates an outgoing wipe with sufficient coverage and a paired incoming wipe', () => {
    const { project: p, timeline: t } = withWipe([0.85, 0.9]);
    expect(() => ProjectLoader.validate({ project: p, timeline: t })).not.toThrow();
  });

  it('rejects a transitionIn set alone, with no paired transitionOut on the previous shot', () => {
    const { project: p, timeline: t } = withWipe([0.85, 0.9]);
    delete t.shots[4]!.transitionOut;
    expect(() => ProjectLoader.validate({ project: p, timeline: t })).toThrow(/no paired transitionOut/);
  });

  it('rejects an outgoing wipe with no paired transitionIn on the next shot', () => {
    const { project: p, timeline: t } = withWipe([0.85, 0.9]);
    delete t.shots[5]!.transitionIn;
    expect(() => ProjectLoader.validate({ project: p, timeline: t })).toThrow(/no paired transitionIn/);
  });

  it('rejects insufficient coverage specifically on the incoming side even when outgoing coverage is fine', () => {
    const { project: p, timeline: t } = withWipe([0.9, 0.5]);
    expect(() => ProjectLoader.validate({ project: p, timeline: t })).toThrow('Incoming occlusion');
  });

  it('accepts matching wipe directions on both sides', () => {
    const { project: p, timeline: t } = withWipe([0.85, 0.9], ['left', 'left']);
    expect(() => ProjectLoader.validate({ project: p, timeline: t })).not.toThrow();
  });

  it('rejects mismatched wipe directions between the outgoing and incoming source', () => {
    const { project: p, timeline: t } = withWipe([0.85, 0.9], ['left', 'right']);
    expect(() => ProjectLoader.validate({ project: p, timeline: t })).toThrow(/direction mismatch/);
  });
});
