import type { FrameContext } from '../types';

export function assertFrameContext(frame: FrameContext): FrameContext {
  if (!Number.isFinite(frame.time) || !Number.isFinite(frame.sourceTime)) throw new Error('Frame context contains invalid time.');
  if (frame.sourceTime < 0 || frame.sourceTime > frame.source.duration + 0.0001) throw new Error('Resolved source time is out of bounds.');
  return Object.freeze(frame);
}
