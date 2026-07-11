import type { ProjectManifest, RenderContext, TimelineManifest } from '../types';
import { Director } from '../director/Director';

export const PREPARED_SOURCE_COMPILER_VERSION = 2;

export interface PreparedFrame {
  outputFrame: number; sourceId: string; sourceFile: string; sourceFrame: number; sourceTime: number; shotId: string;
}
export interface PreparedSourceManifest {
  compilerVersion: number; projectId: string; shotId: string; sourceId: string;
  width: number; height: number; fps: number; duration: number; frameCount: number;
  sourceFrameMap: readonly PreparedFrame[]; sourceFingerprint: string; decodedFrameCount: number;
  heroRange: { start: number; end: number }; timeWarp: string; configFingerprint: string;
}

const stable = (value: unknown): string => JSON.stringify(value, (_key, nested) => nested && typeof nested === 'object' && !Array.isArray(nested) ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))) : nested);

/** Plans one independently cacheable shot. Image extraction performs the actual frame selection. */
export class PreparedSourcePlanner {
  public planShot(project: ProjectManifest, timeline: TimelineManifest, context: RenderContext, shotId: string, sourceFingerprint: string, decodedFrameCount: number): PreparedSourceManifest {
    const shot = timeline.shots.find((candidate) => candidate.id === shotId);
    if (!shot) throw new Error(`Unknown shot: ${shotId}`);
    const source = project.sources.find((candidate) => candidate.id === shot.source);
    if (!source) throw new Error(`Unknown source: ${shot.source}`);
    const range = source.heroRanges[shot.rangeIndex];
    if (!range) throw new Error(`Hero range missing for ${shot.id}`);
    const director = new Director(project, timeline, context);
    const frameCount = Math.round((shot.end - shot.start) * context.fps);
    const sourceFrameMap = Array.from({ length: frameCount }, (_, outputFrame) => {
      const frame = director.resolve(shot.start + outputFrame / context.fps);
      return Object.freeze({ outputFrame, sourceId: source.id, sourceFile: source.file, sourceFrame: Math.min(Math.round(frame.sourceTime / source.duration * (decodedFrameCount - 1)), decodedFrameCount - 1), sourceTime: frame.sourceTime, shotId: shot.id });
    });
    return Object.freeze({
      compilerVersion: PREPARED_SOURCE_COMPILER_VERSION, projectId: project.id, shotId: shot.id, sourceId: source.id,
      width: source.width, height: source.height, fps: context.fps, duration: shot.end - shot.start, frameCount,
      sourceFrameMap, sourceFingerprint, decodedFrameCount, heroRange: { start: range.start, end: range.end }, timeWarp: shot.timeWarp,
      configFingerprint: stable({ shot, source: { id: source.id, width: source.width, height: source.height, fps: source.fps, duration: source.duration }, context: { mode: context.mode, fps: context.fps } }),
    });
  }

  public assertValid(manifest: PreparedSourceManifest, project: ProjectManifest, timeline: TimelineManifest, context: RenderContext, sourceFingerprint: string, decodedFrameCount: number): void {
    const expected = this.planShot(project, timeline, context, manifest.shotId, sourceFingerprint, decodedFrameCount);
    if (stable(manifest) !== stable(expected)) throw new Error('Prepared source manifest is stale or incompatible with the current project.');
  }
}
