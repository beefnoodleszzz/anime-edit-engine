import { describe, expect, it } from 'vitest';
import { ProjectLoader } from '../engine/core/ProjectLoader';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

const typedProject = project as ProjectManifest;
const typedTimeline = timeline as TimelineManifest;

describe('ProjectLoader', () => {
  it('accepts the contiguous eight-second demo timeline', () => {
    expect(ProjectLoader.validate({ project: typedProject, timeline: typedTimeline }).project.id).toBe('001-demo');
  });
  it('rejects a source that is not registered', () => {
    const invalid = structuredClone(typedTimeline); invalid.shots[0]!.source = 'MISSING';
    expect(() => ProjectLoader.validate({ project: typedProject, timeline: invalid })).toThrow('Unknown source');
  });
});
