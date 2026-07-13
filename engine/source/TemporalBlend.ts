import { PNG } from 'pngjs';

export interface FrameBracket { lower: number; upper: number; weight: number; blendStrength: number; }

export function frameBracket(framePts: readonly number[], targetSeconds: number, maxWeight = 0.45): FrameBracket {
  if (framePts.length === 0) throw new Error('framePts must not be empty.');
  if (targetSeconds <= framePts[0]!) return { lower: 0, upper: 0, weight: 0, blendStrength: Math.max(0, Math.min(1, maxWeight)) };
  const last = framePts.length - 1;
  if (targetSeconds >= framePts[last]!) return { lower: last, upper: last, weight: 0, blendStrength: Math.max(0, Math.min(1, maxWeight)) };
  let lo = 0; let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (framePts[mid]! <= targetSeconds) lo = mid; else hi = mid;
  }
  const span = Math.max(0.000001, framePts[hi]! - framePts[lo]!);
  return { lower: lo, upper: hi, weight: Math.max(0, Math.min(1, (targetSeconds - framePts[lo]!) / span)), blendStrength: Math.max(0, Math.min(1, maxWeight)) };
}

const srgbToLinear = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (value: number): number => {
  const c = Math.max(0, Math.min(1, value));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
};

export function effectiveBlendAlpha(weight: number, maxWeight = 1): number {
  const temporal = Math.max(0, Math.min(1, weight));
  const strength = Math.max(0, Math.min(1, maxWeight));
  return temporal <= 0.5 ? temporal * strength : 1 - (1 - temporal) * strength;
}

export function blendPngBuffers(aBuffer: Buffer, bBuffer: Buffer, weight: number, maxWeight = 1): Buffer {
  const a = PNG.sync.read(aBuffer); const b = PNG.sync.read(bBuffer);
  if (a.width !== b.width || a.height !== b.height) throw new Error('Cannot blend PNGs with different dimensions.');
  const output = new PNG({ width: a.width, height: a.height });
  const mix = effectiveBlendAlpha(weight, maxWeight);
  for (let index = 0; index < output.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const linear = srgbToLinear(a.data[index + channel]!) * (1 - mix) + srgbToLinear(b.data[index + channel]!) * mix;
      output.data[index + channel] = linearToSrgb(linear);
    }
    output.data[index + 3] = Math.round(a.data[index + 3]! * (1 - mix) + b.data[index + 3]! * mix);
  }
  return PNG.sync.write(output);
}
