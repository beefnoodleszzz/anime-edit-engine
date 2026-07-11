import type { ProjectManifest, RenderContext, TimelineManifest } from '../types';
import { Director } from '../director/Director';

export const PREPARED_SOURCE_COMPILER_VERSION = 1;

export interface PreparedFrame {
  outputFrame: number; sourceId: string; sourceFile: string; sourceFps: number; sourceFrame: number; sourceTime: number; shotId: string;
}
export interface PreparedSourceManifest {
  compilerVersion: number; projectId: string; width: number; height: number; fps: number; duration: number;
  frameCount: number; frames: readonly PreparedFrame[]; sourceFingerprints: Record<string, string>; configFingerprint: string;
}

const stable = (value: unknown): string => JSON.stringify(value, (_key, nested) => nested && typeof nested === 'object' && !Array.isArray(nested) ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))) : nested);

/** Builds the exact CFR source mapping consumed by the master render. */
export class PreparedSourcePlanner {
  public plan(project: ProjectManifest, timeline: TimelineManifest, context: RenderContext, sourceFingerprints: Record<string, string>): PreparedSourceManifest {
    const frameCount = Math.round(project.duration * context.fps);
    const director = new Director(project, timeline, context);
    const frames = Array.from({ length: frameCount }, (_, outputFrame) => {
      const frame = director.resolve(outputFrame / context.fps);
      return Object.freeze({ outputFrame, sourceId: frame.source.id, sourceFile: frame.source.file, sourceFps: frame.source.fps, sourceFrame: Math.min(Math.round(frame.sourceTime * frame.source.fps), Math.ceil(frame.source.duration * frame.source.fps) - 1), sourceTime: frame.sourceTime, shotId: frame.shot.id });
    });
    const manifest: PreparedSourceManifest = {
      compilerVersion: PREPARED_SOURCE_COMPILER_VERSION, projectId: project.id, width: context.width, height: context.height, fps: context.fps, duration: project.duration,
      frameCount, frames, sourceFingerprints, configFingerprint: stable({ project, timeline, context: { mode: context.mode, width: context.width, height: context.height, fps: context.fps } }),
    };
    return Object.freeze(manifest);
  }

  public assertValid(manifest: PreparedSourceManifest, project: ProjectManifest, timeline: TimelineManifest, context: RenderContext, sourceFingerprints: Record<string, string>): void {
    const expected = this.plan(project, timeline, context, sourceFingerprints);
    if (stable(manifest) !== stable(expected)) throw new Error('Prepared source manifest is stale or incompatible with the current project.');
  }
}
