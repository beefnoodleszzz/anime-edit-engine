import type { ProjectManifest, RenderContext, RenderModeName } from '../types';

/** A single source of truth for both the engine and HyperFrames render settings. */
export function createRenderContext(project: ProjectManifest, mode: RenderModeName): RenderContext {
  const settings = project.renderModes[mode];
  if (!settings) throw new Error(`Unknown render mode: ${mode}`);
  return Object.freeze({ mode, ...settings, frameDeltaSeconds: 1 / settings.fps });
}

export function assertRenderParity(context: RenderContext, root: HTMLElement): void {
  const width = Number(root.dataset.width);
  const height = Number(root.dataset.height);
  const requestedFps = Number(document.documentElement.dataset.fps);
  // The authoring composition is review-sized. Master is resized by HyperFrames, but it
  // must still advertise the same cadence to avoid silently mixing frame deltas.
  if (context.mode !== 'master' && (width !== context.width || height !== context.height)) {
    throw new Error(`HyperFrames dimensions ${width}×${height} do not match ${context.mode} context ${context.width}×${context.height}.`);
  }
  if (requestedFps && requestedFps !== context.fps) throw new Error(`HyperFrames fps ${requestedFps} does not match ${context.mode} context ${context.fps}.`);
}
