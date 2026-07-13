import type { FrameContext } from '../types';

export function assertFrameContext(frame: FrameContext): FrameContext {
  if (!Number.isFinite(frame.time) || !Number.isFinite(frame.sourceTime)) throw new Error('Frame context contains invalid time.');
  if (frame.sourceTime < 0 || frame.sourceTime > frame.source.duration + 0.0001) throw new Error('Resolved source time is out of bounds.');
  if (!Number.isInteger(frame.blur.samples) || frame.blur.samples < 1 || frame.transformPath.length !== frame.blur.samples) throw new Error('Frame context blur path is invalid.');
  return Object.freeze(frame);
}
