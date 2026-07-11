import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { createRenderContext } from '../engine/core/RenderContext';
import { PreparedSourcePlanner } from '../engine/source/PreparedSource';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

describe('PreparedSourcePlanner', () => {
  const typedProject = project as ProjectManifest; const typedTimeline = timeline as TimelineManifest;
  const context = createRenderContext(typedProject, 'master');
  it('creates deterministic, independently cacheable frame maps for every shot', () => {
    const planner = new PreparedSourcePlanner(); const manifest = planner.planShot(typedProject, typedTimeline, context, 's01', 'source-fingerprint', 121);
    expect(manifest.frameCount).toBe(144);
    expect(manifest.sourceFrameMap).toHaveLength(144);
    expect(manifest.sourceFrameMap[0]?.outputFrame).toBe(0);
    expect(manifest.sourceFrameMap.at(-1)?.outputFrame).toBe(143);
    expect(manifest.sourceFrameMap.every((frame) => frame.sourceFrame >= 0)).toBe(true);
    planner.assertValid(manifest, typedProject, typedTimeline, context, 'source-fingerprint', 121);
  });
  it('rejects a stale prepared manifest', () => {
    const planner = new PreparedSourcePlanner(); const manifest = structuredClone(planner.planShot(typedProject, typedTimeline, context, 's01', 'source-fingerprint', 121));
    manifest.fps = 60;
    expect(() => planner.assertValid(manifest, typedProject, typedTimeline, context, 'source-fingerprint', 121)).toThrow('stale');
  });
});
