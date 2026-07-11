import type { TimeWarpName } from '../types';

const LUT_SAMPLES = 4096;
export interface VelocityPoint { at: number; speed: number; }
const PRESETS: Record<TimeWarpName, readonly VelocityPoint[]> = {
  // crash deliberately enters fast, brakes through the body, then kicks into the cut.
  crash: [{ at: 0, speed: 2.4 }, { at: 0.10, speed: 2.1 }, { at: 0.65, speed: 0.26 }, { at: 0.85, speed: 0.12 }, { at: 1, speed: 2.8 }],
  steady: [{ at: 0, speed: 1 }, { at: 1, speed: 1 }],
  hold: [{ at: 0, speed: 0.85 }, { at: 0.25, speed: 0.16 }, { at: 0.75, speed: 0.16 }, { at: 1, speed: 0.85 }],
  accelerate: [{ at: 0, speed: 0.15 }, { at: 1, speed: 2.2 }],
  // Whip accelerates into, rather than away from, the outgoing cut.
  whip: [{ at: 0, speed: 0.18 }, { at: 0.45, speed: 0.7 }, { at: 0.75, speed: 2.2 }, { at: 1, speed: 3.5 }],
  release: [{ at: 0, speed: 2.1 }, { at: 1, speed: 0.4 }],
  settle: [{ at: 0, speed: 1.7 }, { at: 1, speed: 0.25 }],
};

const speedAt = (points: readonly VelocityPoint[], p: number): number => {
  const right = points.find((point) => point.at >= p) ?? points.at(-1)!;
  const left = points[Math.max(0, points.indexOf(right) - 1)]!;
  const ratio = right.at === left.at ? 1 : (p - left.at) / (right.at - left.at);
  return left.speed + (right.speed - left.speed) * ratio;
};

/** Integral-normalized velocity envelope. Its LUT is independent of runtime playback state. */
export class VelocityEnvelope {
  private readonly luts = new Map<TimeWarpName, readonly number[]>();
  public points(kind: TimeWarpName): readonly VelocityPoint[] { return PRESETS[kind]; }
  public speed(kind: TimeWarpName, progress: number): number { return speedAt(PRESETS[kind], Math.max(0, Math.min(1, progress))); }
  public map(kind: TimeWarpName, progress: number): number {
    const lut = this.lut(kind); const position = Math.max(0, Math.min(1, progress)) * (LUT_SAMPLES - 1); const index = Math.floor(position);
    return index >= LUT_SAMPLES - 1 ? 1 : lut[index]! + (lut[index + 1]! - lut[index]!) * (position - index);
  }
  public lut(kind: TimeWarpName): readonly number[] {
    const cached = this.luts.get(kind); if (cached) return cached;
    const values = new Array<number>(LUT_SAMPLES).fill(0); let integral = 0;
    for (let index = 1; index < LUT_SAMPLES; index += 1) { const a = (index - 1) / (LUT_SAMPLES - 1); const b = index / (LUT_SAMPLES - 1); integral += (this.speed(kind, a) + this.speed(kind, b)) * 0.5 / (LUT_SAMPLES - 1); values[index] = integral; }
    for (let index = 1; index < LUT_SAMPLES - 1; index += 1) values[index] = values[index]! / integral;
    values[LUT_SAMPLES - 1] = 1; const frozen = Object.freeze(values); this.luts.set(kind, frozen); return frozen;
  }
}
