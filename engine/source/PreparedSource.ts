import type { ProjectManifest, RenderContext, TimelineManifest } from '../types';
import { Director } from '../director/Director';

export const PREPARED_SOURCE_COMPILER_VERSION = 3;

export interface PreparedFrame {
  outputFrame: number; sourceId: string; sourceFile: string; sourceFrame: number; sourceTime: number;
  selectedFramePts: number; timeErrorSeconds: number; clamped: boolean; shotId: string;
}
export interface PreparedSourceManifest {
  compilerVersion: number; projectId: string; shotId: string; sourceId: string;
  width: number; height: number; fps: number; duration: number; frameCount: number;
  sourceFrameMap: readonly PreparedFrame[]; sourceFingerprint: string; decodedFrameCount: number;
  heroRange: { start: number; end: number }; timeWarp: string; configFingerprint: string;
  timeErrorSummary: { maxTimeErrorSeconds: number; meanTimeErrorSeconds: number; clampedFrameCount: number };
}

const stable = (value: unknown): string => JSON.stringify(value, (_key, nested) => nested && typeof nested === 'object' && !Array.isArray(nested) ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))) : nested);

/**
 * Nearest-PTS lookup against a decode's real, ffprobe-reported presentation timestamps.
 * A duration/frameCount ratio assumes frames are spaced exactly duration/(count-1) apart,
 * which is false for real CFR video (last frame PTS is (count-1)/fps, not duration) and
 * produces a one-frame bias. Binary search against true PTS removes that bias; ties prefer
 * the earlier frame so the mapping is deterministic.
 */
export function nearestFrameIndex(framePts: readonly number[], targetSeconds: number): number {
  if (framePts.length === 0) throw new Error('framePts must not be empty.');
  if (targetSeconds <= framePts[0]!) return 0;
  const last = framePts.length - 1;
  if (targetSeconds >= framePts[last]!) return last;
  let lo = 0; let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (framePts[mid]! <= targetSeconds) lo = mid; else hi = mid;
  }
  const distanceToLower = Math.abs(targetSeconds - framePts[lo]!);
  const distanceToUpper = Math.abs(framePts[hi]! - targetSeconds);
  return distanceToUpper < distanceToLower ? hi : lo;
}

/** Plans one independently cacheable shot. Image extraction performs the actual frame selection. */
export class PreparedSourcePlanner {
  public planShot(project: ProjectManifest, timeline: TimelineManifest, context: RenderContext, shotId: string, sourceFingerprint: string, framePts: readonly number[]): PreparedSourceManifest {
    const shot = timeline.shots.find((candidate) => candidate.id === shotId);
    if (!shot) throw new Error(`Unknown shot: ${shotId}`);
    const source = project.sources.find((candidate) => candidate.id === shot.source);
    if (!source) throw new Error(`Unknown source: ${shot.source}`);
    const range = source.heroRanges[shot.rangeIndex];
    if (!range) throw new Error(`Hero range missing for ${shot.id}`);
    const director = new Director(project, timeline, context);
    const frameCount = Math.round((shot.end - shot.start) * context.fps);
    const firstPts = framePts[0]!; const lastPts = framePts[framePts.length - 1]!;
    const sourceFrameMap = Array.from({ length: frameCount }, (_, outputFrame) => {
      const frame = director.resolve(shot.start + outputFrame / context.fps);
      const sourceFrame = nearestFrameIndex(framePts, frame.sourceTime);
      const selectedFramePts = framePts[sourceFrame]!;
      const clamped = frame.sourceTime <= firstPts || frame.sourceTime >= lastPts;
      return Object.freeze({ outputFrame, sourceId: source.id, sourceFile: source.file, sourceFrame, sourceTime: frame.sourceTime, selectedFramePts, timeErrorSeconds: Math.abs(selectedFramePts - frame.sourceTime), clamped, shotId: shot.id });
    });
    const interior = sourceFrameMap.filter((frame) => !frame.clamped);
    const timeErrorSummary = {
      maxTimeErrorSeconds: interior.length > 0 ? Math.max(...interior.map((frame) => frame.timeErrorSeconds)) : 0,
      meanTimeErrorSeconds: interior.length > 0 ? interior.reduce((sum, frame) => sum + frame.timeErrorSeconds, 0) / interior.length : 0,
      clampedFrameCount: sourceFrameMap.length - interior.length,
    };
    return Object.freeze({
      compilerVersion: PREPARED_SOURCE_COMPILER_VERSION, projectId: project.id, shotId: shot.id, sourceId: source.id,
      width: source.width, height: source.height, fps: context.fps, duration: shot.end - shot.start, frameCount,
      sourceFrameMap, sourceFingerprint, decodedFrameCount: framePts.length, heroRange: { start: range.start, end: range.end }, timeWarp: shot.timeWarp,
      configFingerprint: stable({ shot, source: { id: source.id, width: source.width, height: source.height, fps: source.fps, duration: source.duration }, context: { mode: context.mode, fps: context.fps } }),
      timeErrorSummary,
    });
  }

  public assertValid(manifest: PreparedSourceManifest, project: ProjectManifest, timeline: TimelineManifest, context: RenderContext, sourceFingerprint: string, framePts: readonly number[]): void {
    const expected = this.planShot(project, timeline, context, manifest.shotId, sourceFingerprint, framePts);
    if (stable(manifest) !== stable(expected)) throw new Error('Prepared source manifest is stale or incompatible with the current project.');
  }
}
