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

  describe('shot.blur validation', () => {
    it('accepts a timeline with no blur field on any shot (old timelines stay valid)', () => {
      expect(typedTimeline.shots.every((shot) => shot.blur === undefined)).toBe(true);
      expect(() => ProjectLoader.validate({ project: typedProject, timeline: typedTimeline })).not.toThrow();
    });
    it('accepts a fully-specified blur override', () => {
      const valid = structuredClone(typedTimeline); valid.shots[0]!.blur = { scale: 0.5, maxSamples: 8, maxShutterSeconds: 0.005, edgeFade: 0.08, disableAtStart: true, disableAtEnd: true };
      expect(() => ProjectLoader.validate({ project: typedProject, timeline: valid })).not.toThrow();
    });
    it('rejects scale below 0', () => {
      const invalid = structuredClone(typedTimeline); invalid.shots[0]!.blur = { scale: -0.1 };
      expect(() => ProjectLoader.validate({ project: typedProject, timeline: invalid })).toThrow('blur.scale');
    });
    it('rejects scale above 1', () => {
      const invalid = structuredClone(typedTimeline); invalid.shots[0]!.blur = { scale: 1.1 };
      expect(() => ProjectLoader.validate({ project: typedProject, timeline: invalid })).toThrow('blur.scale');
    });
    it('rejects maxSamples below 1', () => {
      const invalid = structuredClone(typedTimeline); invalid.shots[0]!.blur = { maxSamples: 0 };
      expect(() => ProjectLoader.validate({ project: typedProject, timeline: invalid })).toThrow('blur.maxSamples');
    });
    it('rejects maxSamples above the highest render mode blurSamples ceiling', () => {
      const maxBlurSamples = Math.max(...Object.values(typedProject.renderModes).map((mode) => mode.blurSamples));
      const invalid = structuredClone(typedTimeline); invalid.shots[0]!.blur = { maxSamples: maxBlurSamples + 1 };
      expect(() => ProjectLoader.validate({ project: typedProject, timeline: invalid })).toThrow('blur.maxSamples');
    });
    it('rejects edgeFade below 0', () => {
      const invalid = structuredClone(typedTimeline); invalid.shots[0]!.blur = { edgeFade: -0.01 };
      expect(() => ProjectLoader.validate({ project: typedProject, timeline: invalid })).toThrow('blur.edgeFade');
    });
    it('rejects edgeFade at or above 0.5', () => {
      const invalid = structuredClone(typedTimeline); invalid.shots[0]!.blur = { edgeFade: 0.5 };
      expect(() => ProjectLoader.validate({ project: typedProject, timeline: invalid })).toThrow('blur.edgeFade');
    });
  });
});
