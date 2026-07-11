import type { RenderContext } from '../types';
import type { PixelAnalysis } from './PngPixels';

export interface ProbeStream { width: number; height: number; r_frame_rate: string; avg_frame_rate: string; nb_read_frames: string; duration: string; codec_name?: string; }
export function validateMasterStream(stream: ProbeStream, context: RenderContext, durationSeconds: number, pngFrameCount: number): { expectedFrameCount: number; isCfr: boolean } {
  const expectedFrameCount = Math.round(durationSeconds * context.fps);
  if (context.mode !== 'master') throw new Error('Master validation requires master RenderContext.');
  if (pngFrameCount !== expectedFrameCount) throw new Error(`PNG frame count mismatch: expected ${expectedFrameCount}, got ${pngFrameCount}.`);
  if (stream.width !== context.width || stream.height !== context.height) throw new Error(`Master dimensions mismatch: ${stream.width}×${stream.height}.`);
  if (stream.r_frame_rate !== `${context.fps}/1` || stream.avg_frame_rate !== `${context.fps}/1`) throw new Error(`Master is not strict CFR ${context.fps}/1.`);
  if (Number(stream.nb_read_frames) !== expectedFrameCount) throw new Error(`Encoded frame count mismatch: ${stream.nb_read_frames}.`);
  if (Math.abs(Number(stream.duration) - durationSeconds) > 1 / context.fps) throw new Error(`Master duration mismatch: ${stream.duration}.`);
  return { expectedFrameCount, isCfr: true };
}

export interface FirstFrameThresholds { minAlphaCoverage: number; minNonBlackPixelRatio: number; minLuminanceVariance: number; }
/**
 * A black PNG is not "empty bytes" — PNG header/IHDR/zlib framing/CRCs guarantee a non-zero,
 * non-trivial byte length even for a fully black image, so a byte-length/all-zero-bytes check
 * (the previous implementation) cannot detect a black first frame. These thresholds operate on
 * real decoded pixels instead.
 */
export const DEFAULT_FIRST_FRAME_THRESHOLDS: FirstFrameThresholds = { minAlphaCoverage: 0.99, minNonBlackPixelRatio: 0.5, minLuminanceVariance: 0.0005 };

export function validateFirstFrame(analysis: PixelAnalysis, thresholds: FirstFrameThresholds = DEFAULT_FIRST_FRAME_THRESHOLDS): void {
  if (analysis.alphaCoverage < thresholds.minAlphaCoverage) throw new Error(`First master frame alpha coverage is too low: ${analysis.alphaCoverage} (need >= ${thresholds.minAlphaCoverage}).`);
  if (analysis.nonBlackPixelRatio < thresholds.minNonBlackPixelRatio) throw new Error(`First master frame is mostly black: nonBlackPixelRatio=${analysis.nonBlackPixelRatio} (need >= ${thresholds.minNonBlackPixelRatio}).`);
  if (analysis.luminanceVariance < thresholds.minLuminanceVariance) throw new Error(`First master frame has no visible detail: luminanceVariance=${analysis.luminanceVariance} (need >= ${thresholds.minLuminanceVariance}).`);
}
