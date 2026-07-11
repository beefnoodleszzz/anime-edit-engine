import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import { assertRenderParity, createRenderContext } from '../engine/core/RenderContext';
import type { ProjectManifest, RenderModeName } from '../engine/types';

describe('RenderContext parity', () => {
  const root = (width: number, height: number): HTMLElement => ({ dataset: { width: String(width), height: String(height) } }) as unknown as HTMLElement;

  const modes: Record<RenderModeName, { width: number; height: number; fps: number; blurSamples: number }> = {
    draft: { width: 540, height: 960, fps: 30, blurSamples: 4 },
    review: { width: 1080, height: 1920, fps: 60, blurSamples: 16 },
    master: { width: 2160, height: 3840, fps: 120, blurSamples: 24 },
  };

  it.each(Object.entries(modes))('accepts the exact %s contract', (modeName, expected) => {
    const context = createRenderContext(project as ProjectManifest, modeName as RenderModeName);
    expect(context).toMatchObject(expected);
    expect(() => assertRenderParity(context, root(expected.width, expected.height), expected.fps)).not.toThrow();
  });

  it.each(Object.entries(modes))('rejects every HyperFrames mismatch for %s', (modeName, expected) => {
    const context = createRenderContext(project as ProjectManifest, modeName as RenderModeName);
    expect(() => assertRenderParity(context, root(expected.width + 1, expected.height), expected.fps)).toThrow('RenderContext mismatch');
    expect(() => assertRenderParity(context, root(expected.width, expected.height + 1), expected.fps)).toThrow('RenderContext mismatch');
    expect(() => assertRenderParity(context, root(expected.width, expected.height), expected.fps + 1)).toThrow('RenderContext mismatch');
  });

  it('reports both configurations on mismatch', () => {
    const context = createRenderContext(project as ProjectManifest, 'master');
    expect(() => assertRenderParity(context, root(1080, 3840), 120)).toThrow(/HyperFrames=1080×3840@120.*Engine=2160×3840@120/);
  });

  const context = createRenderContext(project as ProjectManifest, 'master');
  it('accepts the exact master contract', () => expect(() => assertRenderParity(context, root(2160, 3840), 120)).not.toThrow());
  it.each([[1080, 3840, 120], [2160, 1920, 120], [2160, 3840, 60]])('rejects every HyperFrames mismatch', (width, height, fps) => expect(() => assertRenderParity(context, root(width, height), fps)).toThrow('RenderContext mismatch'));
});
