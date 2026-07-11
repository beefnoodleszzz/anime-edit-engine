import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { createRenderContext } from '../engine/core/RenderContext';
import { PreparedSourcePlanner } from '../engine/source/PreparedSource';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

describe('PreparedSourcePlanner', () => {
  const typedProject = project as ProjectManifest; const typedTimeline = timeline as TimelineManifest;
  const context = createRenderContext(typedProject, 'master');
  const fingerprints = Object.fromEntries(typedProject.sources.map((source) => [source.file, `fingerprint:${source.file}`]));
  it('creates a deterministic linear 960-frame master mapping', () => {
    const planner = new PreparedSourcePlanner(); const manifest = planner.plan(typedProject, typedTimeline, context, fingerprints);
    expect(manifest.frameCount).toBe(960);
    expect(manifest.frames).toHaveLength(960);
    expect(manifest.frames[0]?.outputFrame).toBe(0);
    expect(manifest.frames.at(-1)?.outputFrame).toBe(959);
    expect(manifest.frames.every((frame) => frame.sourceFrame >= 0)).toBe(true);
    planner.assertValid(manifest, typedProject, typedTimeline, context, fingerprints);
  });
  it('rejects a stale prepared manifest', () => {
    const planner = new PreparedSourcePlanner(); const manifest = structuredClone(planner.plan(typedProject, typedTimeline, context, fingerprints));
    manifest.fps = 60;
    expect(() => planner.assertValid(manifest, typedProject, typedTimeline, context, fingerprints)).toThrow('stale');
  });
});
