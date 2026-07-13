import type { RenderContext } from '../types';
import type { PixelAnalysis } from './PngPixels';

export interface ProbeStream {
  width: number; height: number; r_frame_rate: string; avg_frame_rate: string; nb_read_frames: string; duration: string; codec_name?: string;
  profile?: string; level?: number; pix_fmt?: string; bit_rate?: string; time_base?: string; duration_ts?: number; nb_frames?: string;
}
/**
 * context.fps is the project's capture/motion-blur and delivery rate by default. The optional
 * deliveryFps argument remains for callers that intentionally validate a lower-rate derivative,
 * while pngFrameCount/expectedFrameCount always validate the configured capture stage.
 */
export function validateMasterStream(stream: ProbeStream, context: RenderContext, durationSeconds: number, pngFrameCount: number, deliveryFps: number = context.fps, maxLevel = 52): { expectedFrameCount: number; deliveryFrameCount: number; isCfr: boolean } {
  const expectedFrameCount = Math.round(durationSeconds * context.fps);
  const deliveryFrameCount = Math.round(durationSeconds * deliveryFps);
  if (context.mode !== 'master') throw new Error('Master validation requires master RenderContext.');
  if (pngFrameCount !== expectedFrameCount) throw new Error(`PNG frame count mismatch: expected ${expectedFrameCount}, got ${pngFrameCount}.`);
  if (stream.width !== context.width || stream.height !== context.height) throw new Error(`Master dimensions mismatch: ${stream.width}×${stream.height}.`);
  if (stream.r_frame_rate !== `${deliveryFps}/1` || stream.avg_frame_rate !== `${deliveryFps}/1`) throw new Error(`Master is not strict CFR ${deliveryFps}/1.`);
  if (Number(stream.nb_read_frames) !== deliveryFrameCount) throw new Error(`Encoded frame count mismatch: ${stream.nb_read_frames}.`);
  if (Math.abs(Number(stream.duration) - durationSeconds) > 1 / deliveryFps) throw new Error(`Master duration mismatch: ${stream.duration}.`);
  // libx264 reports level as level*10 (52 = Level 5.2) — the ceiling real hardware decoders
  // widely implement; Level 6.0+ streams silently fail to decode on most phones/players (see the
  // 258-280 Mbps / level=6.0 files this pipeline produced before deliveryFps/CRF were fixed).
  if (stream.level !== undefined && stream.level > maxLevel) throw new Error(`Master H.264 level too high for broad playback: ${stream.level} (need <= ${maxLevel}).`);
  return { expectedFrameCount, deliveryFrameCount, isCfr: true };
}

/**
 * ffprobe's stream-level duration (derived from the video stream's own timestamps) and the
 * container's format-level duration (derived from the moov atom) can diverge if an encode step
 * mishandles PTS — checked independently of validateMasterStream so a duration mismatch surfaces
 * as its own failure, not folded into the CFR/frame-count checks above.
 */
export function validateDeliveryDuration(streamDuration: number, formatDuration: number, durationSeconds: number, deliveryFps: number): void {
  const tolerance = 1 / deliveryFps;
  if (!Number.isFinite(streamDuration) || Math.abs(streamDuration - durationSeconds) > tolerance) throw new Error(`Master stream duration mismatch: ${streamDuration} (expected ~${durationSeconds}).`);
  if (!Number.isFinite(formatDuration) || Math.abs(formatDuration - durationSeconds) > tolerance) throw new Error(`Master format duration mismatch: ${formatDuration} (expected ~${durationSeconds}).`);
}

export interface FirstFrameThresholds { minAlphaCoverage: number; minNonBlackPixelRatio: number; minMeanLuminance: number; minLuminanceVariance: number; }
/**
 * A black PNG is not "empty bytes" — PNG header/IHDR/zlib framing/CRCs guarantee a non-zero,
 * non-trivial byte length even for a fully black image, so a byte-length/all-zero-bytes check
 * (the previous implementation) cannot detect a black first frame. These thresholds operate on
 * real decoded pixels instead.
 *
 * This is deliberately not an "is it bright" check — a legitimately dark anime frame (night
 * scene, silhouette) can have most of its pixels near-black. What distinguishes that from a
 * genuinely empty/failed capture is that it isn't *uniformly* empty: minNonBlackPixelRatio and
 * minLuminanceVariance only require a small fraction of visible, non-flat detail, not overall
 * brightness.
 */
export const DEFAULT_FIRST_FRAME_THRESHOLDS: FirstFrameThresholds = { minAlphaCoverage: 0.99, minNonBlackPixelRatio: 0.01, minMeanLuminance: 0.002, minLuminanceVariance: 0.00005 };

export function validateFirstFrame(analysis: PixelAnalysis, thresholds: FirstFrameThresholds = DEFAULT_FIRST_FRAME_THRESHOLDS): void {
  if (analysis.alphaCoverage < thresholds.minAlphaCoverage) throw new Error(`First master frame alpha coverage is too low: ${analysis.alphaCoverage} (need >= ${thresholds.minAlphaCoverage}).`);
  if (analysis.nonBlackPixelRatio < thresholds.minNonBlackPixelRatio) throw new Error(`First master frame is mostly black: nonBlackPixelRatio=${analysis.nonBlackPixelRatio} (need >= ${thresholds.minNonBlackPixelRatio}).`);
  if (analysis.meanLuminance < thresholds.minMeanLuminance) throw new Error(`First master frame is too dim to be real content: meanLuminance=${analysis.meanLuminance} (need >= ${thresholds.minMeanLuminance}).`);
  if (analysis.luminanceVariance < thresholds.minLuminanceVariance) throw new Error(`First master frame has no visible detail: luminanceVariance=${analysis.luminanceVariance} (need >= ${thresholds.minLuminanceVariance}).`);
}
