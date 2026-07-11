import { describe, expect, it } from 'vitest';
import { VelocityEnvelope } from '../engine/director/VelocityEnvelope';

describe('VelocityEnvelope', () => {
  const envelope = new VelocityEnvelope();
  it.each(['crash', 'steady', 'hold', 'accelerate', 'whip', 'release', 'settle'] as const)('%s preserves range endpoints', (kind) => {
    expect(envelope.map(kind, 0)).toBeCloseTo(0);
    expect(envelope.map(kind, 1)).toBeCloseTo(1);
  });
  it('is monotonic at 120 frame samples', () => {
    for (const kind of ['crash', 'steady', 'hold', 'accelerate', 'whip', 'release', 'settle'] as const) {
      let previous = -1;
      for (let frame = 0; frame <= 120; frame += 1) { const value = envelope.map(kind, frame / 120); expect(value).toBeGreaterThanOrEqual(previous); previous = value; }
    }
  });
});
