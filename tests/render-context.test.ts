import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import { assertRenderParity, createRenderContext } from '../engine/core/RenderContext';
import type { ProjectManifest } from '../engine/types';

describe('RenderContext parity', () => {
  const context = createRenderContext(project as ProjectManifest, 'master');
  const root = (width: number, height: number): HTMLElement => ({ dataset: { width: String(width), height: String(height) } }) as unknown as HTMLElement;
  it('accepts the exact master contract', () => expect(() => assertRenderParity(context, root(2160, 3840), 120)).not.toThrow());
  it.each([[1080, 3840, 120], [2160, 1920, 120], [2160, 3840, 60]])('rejects every HyperFrames mismatch', (width, height, fps) => expect(() => assertRenderParity(context, root(width, height), fps)).toThrow('RenderContext mismatch'));
});
