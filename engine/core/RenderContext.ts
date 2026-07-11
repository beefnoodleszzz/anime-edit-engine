import type { ProjectManifest, RenderContext, RenderModeName } from '../types';

/** A single source of truth for both the engine and HyperFrames render settings. */
export function createRenderContext(project: ProjectManifest, mode: RenderModeName): RenderContext {
  const settings = project.renderModes[mode];
  if (!settings) throw new Error(`Unknown render mode: ${mode}`);
  return Object.freeze({ mode, ...settings, frameDeltaSeconds: 1 / settings.fps });
}

export function assertRenderParity(context: RenderContext, root: HTMLElement, documentFps = Number(document.documentElement.dataset.fps)): void {
  const width = Number(root.dataset.width);
  const height = Number(root.dataset.height);
  const mismatches = [`mode=${context.mode}`, `HyperFrames=${width}×${height}@${documentFps}`, `Engine=${context.width}×${context.height}@${context.fps}`, `blurSamples=${context.blurSamples}`];
  if (width !== context.width || height !== context.height || documentFps !== context.fps) throw new Error(`RenderContext mismatch: ${mismatches.join(', ')}.`);
}
