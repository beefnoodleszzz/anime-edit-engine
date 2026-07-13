import { PNG } from 'pngjs';

export interface FrameBracket { lower: number; upper: number; weight: number; }

export function frameBracket(framePts: readonly number[], targetSeconds: number, maxWeight = 0.45): FrameBracket {
  if (framePts.length === 0) throw new Error('framePts must not be empty.');
  if (targetSeconds <= framePts[0]!) return { lower: 0, upper: 0, weight: 0 };
  const last = framePts.length - 1;
  if (targetSeconds >= framePts[last]!) return { lower: last, upper: last, weight: 0 };
  let lo = 0; let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (framePts[mid]! <= targetSeconds) lo = mid; else hi = mid;
  }
  const span = Math.max(0.000001, framePts[hi]! - framePts[lo]!);
  return { lower: lo, upper: hi, weight: Math.min(maxWeight, Math.max(0, (targetSeconds - framePts[lo]!) / span)) };
}

export function blendPngBuffers(aBuffer: Buffer, bBuffer: Buffer, weight: number): Buffer {
  const a = PNG.sync.read(aBuffer); const b = PNG.sync.read(bBuffer);
  if (a.width !== b.width || a.height !== b.height) throw new Error('Cannot blend PNGs with different dimensions.');
  const output = new PNG({ width: a.width, height: a.height });
  const mix = Math.max(0, Math.min(1, weight));
  for (let index = 0; index < output.data.length; index += 1) output.data[index] = Math.round(a.data[index]! * (1 - mix) + b.data[index]! * mix);
  return PNG.sync.write(output);
}
