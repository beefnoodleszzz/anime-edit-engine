import type { TimeWarpName } from '../types';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const smoothstep = (value: number): number => { const t = clamp01(value); return t * t * (3 - 2 * t); };

/** Integral-normalized time mapping. It never relies on accumulated playback state. */
export class VelocityEnvelope {
  public map(kind: TimeWarpName, progress: number): number {
    const p = clamp01(progress);
    switch (kind) {
      case 'hold': return p;
      case 'steady': return p;
      case 'crash': return p * p * (2.4 - 1.4 * p);
      case 'accelerate': return p * p;
      case 'whip': return p < 0.6 ? p * 0.55 : 0.33 + (p - 0.6) * 1.675;
      case 'release': return smoothstep(p);
      case 'settle': return 1 - (1 - p) * (1 - p);
    }
  }
}
