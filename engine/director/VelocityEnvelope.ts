import type { TimeWarpName } from '../types';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const LUT_SAMPLES = 4096;
const velocity = (kind: TimeWarpName, p: number): number => {
  switch (kind) {
    case 'hold': return 0.08 + 0.92 * p * p;
    case 'steady': return 1;
    case 'crash': return 0.18 + 2.8 * p * p;
    case 'accelerate': return 0.15 + 2.2 * p;
    case 'whip': return 0.12 + 3.4 * Math.exp(-Math.pow((p - 0.72) / 0.14, 2));
    case 'release': return 2.1 - 1.65 * p;
    case 'settle': return 1.7 - 1.25 * p;
  }
};

/** A deterministic, integral-normalized velocity envelope rather than a position curve. */
export class VelocityEnvelope {
  private readonly luts = new Map<TimeWarpName, readonly number[]>();
  public map(kind: TimeWarpName, progress: number): number {
    const p = clamp01(progress);
    const lut = this.lut(kind); const position = p * (LUT_SAMPLES - 1); const index = Math.floor(position);
    return index >= LUT_SAMPLES - 1 ? 1 : lut[index]! + (lut[index + 1]! - lut[index]!) * (position - index);
  }
  public lut(kind: TimeWarpName): readonly number[] {
    const cached = this.luts.get(kind); if (cached) return cached;
    const values = new Array<number>(LUT_SAMPLES).fill(0); let integral = 0;
    for (let i = 1; i < LUT_SAMPLES; i += 1) { const a = (i - 1) / (LUT_SAMPLES - 1); const b = i / (LUT_SAMPLES - 1); integral += (velocity(kind, a) + velocity(kind, b)) * 0.5 / (LUT_SAMPLES - 1); values[i] = integral; }
    for (let i = 1; i < LUT_SAMPLES - 1; i += 1) values[i] = values[i]! / integral;
    values[LUT_SAMPLES - 1] = 1;
    const frozen = Object.freeze(values); this.luts.set(kind, frozen); return frozen;
  }
}
