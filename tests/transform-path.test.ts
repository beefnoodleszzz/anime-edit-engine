import { describe, expect, it } from 'vitest'; import project from '../projects/001-demo/project.json'; import timeline from '../projects/001-demo/timeline.json'; import { Director } from '../engine/director/Director'; import { createRenderContext } from '../engine/core/RenderContext'; import type { ProjectManifest, TimelineManifest } from '../engine/types';
describe('Transform path blur', () => { const director = new Director(project as ProjectManifest, timeline as TimelineManifest, createRenderContext(project as ProjectManifest, 'master'));
  it('collapses all UV transforms to one point at zero motion', () => { const frame = director.resolve(2.7); expect(frame.transformPath).toHaveLength(1); });
  it('samples a full transform path for a whip', () => { const frame = director.resolve(4.7); expect(frame.transformPath.length).toBeGreaterThan(1); expect(frame.transformPath[0]).not.toEqual(frame.transformPath.at(-1)); });
});
