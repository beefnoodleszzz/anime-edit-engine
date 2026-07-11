import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import { resolveBlurProfile } from '../engine/compositor/BlurProfile';
import { createRenderContext } from '../engine/core/RenderContext';
import type { ProjectManifest } from '../engine/types';
describe('BlurProfile', () => { const master = createRenderContext(project as ProjectManifest, 'master'); const review = createRenderContext(project as ProjectManifest, 'review');
  it('has a true zero-blur region', () => expect(resolveBlurProfile(0.099, master)).toMatchObject({ strength: 0, samples: 1 }));
  it('is monotonic and respects mode caps', () => { const scores = [0.1, 0.25, 0.55, 1].map((score) => resolveBlurProfile(score, master).samples); expect(scores).toEqual([...scores].sort((a, b) => a - b)); expect(resolveBlurProfile(1, review).samples).toBeLessThanOrEqual(12); expect(resolveBlurProfile(1, master).samples).toBeLessThanOrEqual(24); });
});
