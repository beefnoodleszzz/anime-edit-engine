import type { RenderContext } from '../types';

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
