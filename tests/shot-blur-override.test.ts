import { describe, expect, it } from 'vitest';
import { Director } from '../engine/director/Director';
import { EditCamera } from '../engine/camera/EditCamera';
import { resolveBlurProfile } from '../engine/compositor/BlurProfile';
import { createRenderContext } from '../engine/core/RenderContext';
import type { ProjectManifest, ShotBlurOverride, TimelineManifest, TimelineShot } from '../engine/types';

// A minimal, self-contained fixture rather than the 001-demo/002-jingxuan project files: every
// test needs full control over shot duration (WHIP_RIGHT only reads as high motion in a short
// shot — see tests/camera.test.ts's 0.8s case) and exactly one shot per timeline, so overrides
// can be exercised in isolation without a neighboring shot's contiguity/transition math involved.
const DURATION = 0.8;
const project: ProjectManifest = {
  id: 'blur-fixture', name: 'Blur Fixture', duration: DURATION, seed: 1,
  renderModes: {
    draft: { width: 100, height: 100, fps: 30, blurSamples: 4, postFX: 'reduced' },
    review: { width: 100, height: 100, fps: 60, blurSamples: 16, postFX: 'full' },
    master: { width: 100, height: 100, fps: 60, blurSamples: 24, postFX: 'full' },
  },
  sources: [{ id: 'SRC', type: 'WALK', file: 'src.mp4', width: 100, height: 100, fps: 24, duration: 20, heroRanges: [{ start: 0, end: 20, score: 1, tags: [] }], tags: [] }],
};

const shot = (blur?: ShotBlurOverride): TimelineShot => ({ id: 'a', source: 'SRC', start: 0, end: DURATION, rangeIndex: 0, camera: 'WHIP_RIGHT', timeWarp: 'whip', ...(blur ? { blur } : {}) });
const context = createRenderContext(project, 'master');
const directorFor = (blur?: ShotBlurOverride): Director => new Director(project, { bpm: 100, beats: [], shots: [shot(blur)] } as TimelineManifest, context);

describe('Shot blur override', () => {
  it('a shot with no blur field matches the automatic profile exactly (old timelines render unchanged)', () => {
    const director = directorFor(undefined);
    const t = DURATION * 0.5;
    const frame = director.resolve(t);
    const camera = new EditCamera();
    const velocity = camera.velocity('WHIP_RIGHT', 0.5, context.frameDeltaSeconds, DURATION);
    const expected = resolveBlurProfile(Math.min(1, velocity.magnitude), context);
    expect(frame.blur).toEqual(expected);
    expect(frame.transformPath).toHaveLength(frame.blur.samples);
  });

  it('scale reduces strength and shutterSeconds, and reconverges samples down rather than only strength', () => {
    const t = DURATION * 0.5;
    const base = directorFor(undefined).resolve(t);
    const scaled = directorFor({ scale: 0.3 }).resolve(t);
    expect(base.blur.samples).toBeGreaterThan(1);
    expect(scaled.blur.strength).toBeCloseTo(base.blur.strength * 0.3, 5);
    expect(scaled.blur.shutterSeconds).toBeCloseTo(base.blur.shutterSeconds * 0.3, 8);
    expect(scaled.blur.samples).toBeLessThan(base.blur.samples);
    expect(scaled.transformPath).toHaveLength(scaled.blur.samples);
  });

  it('maxSamples caps samples regardless of automatic strength, and stays consistent with transformPath', () => {
    const frame = directorFor({ maxSamples: 3 }).resolve(DURATION * 0.5);
    expect(frame.blur.samples).toBeLessThanOrEqual(3);
    expect(frame.transformPath).toHaveLength(frame.blur.samples);
  });

  it('maxShutterSeconds caps shutterSeconds', () => {
    const uncapped = directorFor(undefined).resolve(DURATION * 0.5);
    const capped = directorFor({ maxShutterSeconds: 0.001 }).resolve(DURATION * 0.5);
    expect(uncapped.blur.shutterSeconds).toBeGreaterThan(0.001);
    expect(capped.blur.shutterSeconds).toBeLessThanOrEqual(0.001);
  });

  it('edgeFade fades blur to zero approaching the shot start and end, full strength mid-shot', () => {
    const director = directorFor({ edgeFade: 0.1 });
    const start = director.resolve(DURATION * 0.0001);
    const middle = director.resolve(DURATION * 0.5);
    const end = director.resolve(DURATION * 0.9999);
    expect(start.blur).toEqual({ strength: 0, samples: 1, shutterSeconds: 0 });
    expect(end.blur).toEqual({ strength: 0, samples: 1, shutterSeconds: 0 });
    expect(middle.blur.samples).toBeGreaterThan(1);
  });

  it('disableAtStart forces samples=1/shutterSeconds=0 only on the first captured frame', () => {
    const director = directorFor({ disableAtStart: true });
    const first = director.resolve(0);
    const later = director.resolve(DURATION * 0.5);
    expect(first.blur).toEqual({ strength: 0, samples: 1, shutterSeconds: 0 });
    expect(later.blur.samples).toBeGreaterThan(1);
  });

  it('disableAtEnd forces samples=1/shutterSeconds=0 only on the last captured frame', () => {
    const director = directorFor({ disableAtEnd: true });
    const last = director.resolve(DURATION - context.frameDeltaSeconds / 2);
    const earlier = director.resolve(DURATION * 0.5);
    expect(last.blur).toEqual({ strength: 0, samples: 1, shutterSeconds: 0 });
    expect(earlier.blur.samples).toBeGreaterThan(1);
  });

  it('transformPath.length always equals blur.samples across the whole shot with every override combined', () => {
    const director = directorFor({ scale: 0.5, maxSamples: 5, maxShutterSeconds: 0.004, edgeFade: 0.08, disableAtStart: true, disableAtEnd: true });
    for (const fraction of [0, 0.05, 0.15, 0.5, 0.85, 0.95, 1]) {
      const frame = director.resolve(Math.min(DURATION, DURATION * fraction));
      expect(frame.transformPath).toHaveLength(frame.blur.samples);
      expect(frame.blur.samples).toBeLessThanOrEqual(5);
    }
  });
});
