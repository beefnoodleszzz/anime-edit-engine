import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import { createRenderContext } from '../engine/core/RenderContext';
import { DEFAULT_FIRST_FRAME_THRESHOLDS, validateFirstFrame, validateMasterStream, validateDeliveryDuration } from '../engine/core/MasterValidation';
import { analyzePngPixels } from '../engine/core/PngPixels';
import type { ProjectManifest } from '../engine/types';

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

const encodePng = (paint: (index: number, width: number) => [number, number, number, number]): Buffer => {
  const width = 8; const height = 8;
  const png = new PNG({ width, height });
  for (let index = 0; index < width * height; index += 1) {
    const [r, g, b, a] = paint(index, width);
    const offset = index * 4;
    png.data[offset] = r; png.data[offset + 1] = g; png.data[offset + 2] = b; png.data[offset + 3] = a;
  }
  return PNG.sync.write(png);
};

describe('Master validation — stream (mock ffprobe JSON, no real 4K render)', () => {
  const context = createRenderContext(project as ProjectManifest, 'master');
  const stream = { width: 2160, height: 3840, r_frame_rate: '120/1', avg_frame_rate: '120/1', nb_read_frames: '960', duration: '8.000000' };
  it('requires strict CFR and duration-derived frame count', () => expect(validateMasterStream(stream, context, 8, 960)).toMatchObject({ expectedFrameCount: 960, isCfr: true }));
  it('rejects NTSC-like output', () => expect(() => validateMasterStream({ ...stream, avg_frame_rate: '120000/1001' }, context, 8, 960)).toThrow('strict CFR'));
  it('never hardcodes 960: frame count is duration * fps', () => {
    expect(validateMasterStream(stream, context, 8, 960).expectedFrameCount).toBe(Math.round(8 * context.fps));
    expect(() => validateMasterStream(stream, context, 4, 960)).toThrow('PNG frame count mismatch');
  });
  it('validates declared duration against the probed stream duration', () => expect(() => validateMasterStream({ ...stream, duration: '9.000000' }, context, 8, 960)).toThrow('duration mismatch'));

  it('validates the encoded stream against a lower deliveryFps while still requiring the full-rate PNG capture count', () => {
    const deliveredStream = { width: 2160, height: 3840, r_frame_rate: '60/1', avg_frame_rate: '60/1', nb_read_frames: '480', duration: '8.000000' };
    expect(validateMasterStream(deliveredStream, context, 8, 960, 60)).toMatchObject({ expectedFrameCount: 960, deliveryFrameCount: 480, isCfr: true });
    expect(() => validateMasterStream(deliveredStream, context, 8, 480, 60)).toThrow('PNG frame count mismatch');
    expect(() => validateMasterStream({ ...deliveredStream, r_frame_rate: '120/1' }, context, 8, 960, 60)).toThrow('strict CFR');
    expect(() => validateMasterStream({ ...deliveredStream, nb_read_frames: '960' }, context, 8, 960, 60)).toThrow('Encoded frame count mismatch');
  });

  it('rejects an H.264 level above the broad-playback ceiling (default 5.2)', () => {
    const deliveredStream = { width: 2160, height: 3840, r_frame_rate: '60/1', avg_frame_rate: '60/1', nb_read_frames: '480', duration: '8.000000', level: 60 };
    expect(() => validateMasterStream(deliveredStream, context, 8, 960, 60)).toThrow('level too high');
    expect(validateMasterStream({ ...deliveredStream, level: 52 }, context, 8, 960, 60)).toMatchObject({ isCfr: true });
  });
});

describe('Master validation — delivery duration (16s x 60fps = 960 frames)', () => {
  it('accepts stream and format durations within one delivery frame of the declared project duration', () => {
    expect(() => validateDeliveryDuration(16.0, 16.0, 16, 60)).not.toThrow();
    expect(() => validateDeliveryDuration(16.0 - 1 / 120, 16.0, 16, 60)).not.toThrow();
  });
  it('rejects a stream duration that drifts from the declared project duration', () => {
    expect(() => validateDeliveryDuration(48.0, 16.0, 16, 60)).toThrow('stream duration mismatch');
  });
  it('rejects a format (container-level) duration that drifts from the declared project duration', () => {
    expect(() => validateDeliveryDuration(16.0, 48.0, 16, 60)).toThrow('format duration mismatch');
  });
  it('validates 60fps delivery independently of the 120fps internal capture rate', () => {
    // 960 delivery frames at 60fps is 16s; the same 960 frames misread at 120fps would be 8s —
    // this must fail against the real duration even though 960 is also a valid frame count at 120fps.
    expect(() => validateDeliveryDuration(8.0, 8.0, 16, 60)).toThrow('stream duration mismatch');
  });
});

describe('Master validation — first frame pixels (real PNG decode, synthetic fixtures)', () => {
  it('rejects a fully black opaque PNG (the previous byte-length check could not detect this)', () => {
    const blackPng = encodePng(() => [0, 0, 0, 255]);
    const analysis = analyzePngPixels(blackPng, sha256);
    expect(analysis.nonBlackPixelRatio).toBe(0);
    expect(() => validateFirstFrame(analysis)).toThrow('mostly black');
  });
  it('rejects a fully transparent PNG', () => {
    const transparentPng = encodePng(() => [200, 120, 40, 0]);
    const analysis = analyzePngPixels(transparentPng, sha256);
    expect(analysis.alphaCoverage).toBe(0);
    expect(() => validateFirstFrame(analysis)).toThrow('alpha coverage');
  });
  it('rejects a flat, fully-colored PNG with no detail (zero variance)', () => {
    const flatPng = encodePng(() => [128, 90, 40, 255]);
    const analysis = analyzePngPixels(flatPng, sha256);
    expect(analysis.luminanceVariance).toBeLessThan(1e-9);
    expect(() => validateFirstFrame(analysis)).toThrow('no visible detail');
  });
  it('accepts a real, detailed, opaque PNG', () => {
    const detailedPng = encodePng((index, width) => { const x = index % width; const y = Math.floor(index / width); return [(x * 37) % 255, (y * 61) % 255, ((x + y) * 23) % 255, 255]; });
    const analysis = analyzePngPixels(detailedPng, sha256);
    expect(() => validateFirstFrame(analysis)).not.toThrow();
    expect(analysis.alphaCoverage).toBeCloseTo(1, 5);
    expect(analysis.nonBlackPixelRatio).toBeGreaterThan(DEFAULT_FIRST_FRAME_THRESHOLDS.minNonBlackPixelRatio);
    expect(analysis.meanLuminance).toBeGreaterThan(DEFAULT_FIRST_FRAME_THRESHOLDS.minMeanLuminance);
    expect(analysis.luminanceVariance).toBeGreaterThan(DEFAULT_FIRST_FRAME_THRESHOLDS.minLuminanceVariance);
  });
  it('accepts a legitimately dark scene with a small lit detail region (old nonBlackPixelRatio >= 0.5 floor would have wrongly rejected this)', () => {
    // 6/64 (~9%) bright detail pixels against a near-black background: a real dark shot, not an empty capture.
    const nearBlackPng = encodePng((index) => (index < 6 ? [60, 45, 30, 255] : [2, 2, 1, 255]));
    const analysis = analyzePngPixels(nearBlackPng, sha256);
    expect(analysis.nonBlackPixelRatio).toBeCloseTo(6 / 64, 5);
    expect(analysis.nonBlackPixelRatio).toBeLessThan(0.5); // would have failed the old floor
    expect(() => validateFirstFrame(analysis)).not.toThrow();
  });
  it('rejects a uniformly near-black PNG with no lit pixels and no detail (a genuinely empty/failed capture)', () => {
    const emptyDarkPng = encodePng(() => [2, 2, 1, 255]);
    const analysis = analyzePngPixels(emptyDarkPng, sha256);
    expect(analysis.nonBlackPixelRatio).toBe(0);
    expect(() => validateFirstFrame(analysis)).toThrow('mostly black');
  });
  it('computes a stable pixel hash for identical pixels and a different hash for different pixels', () => {
    const a = analyzePngPixels(encodePng(() => [10, 20, 30, 255]), sha256);
    const b = analyzePngPixels(encodePng(() => [10, 20, 30, 255]), sha256);
    const c = analyzePngPixels(encodePng(() => [30, 20, 10, 255]), sha256);
    expect(a.pixelHash).toBe(b.pixelHash);
    expect(a.pixelHash).not.toBe(c.pixelHash);
  });
});
