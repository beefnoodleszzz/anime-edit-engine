import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import { createRenderContext } from '../engine/core/RenderContext';
import { DEFAULT_FIRST_FRAME_THRESHOLDS, validateFirstFrame, validateMasterStream } from '../engine/core/MasterValidation';
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
    expect(analysis.luminanceVariance).toBeGreaterThan(DEFAULT_FIRST_FRAME_THRESHOLDS.minLuminanceVariance);
  });
  it('computes a stable pixel hash for identical pixels and a different hash for different pixels', () => {
    const a = analyzePngPixels(encodePng(() => [10, 20, 30, 255]), sha256);
    const b = analyzePngPixels(encodePng(() => [10, 20, 30, 255]), sha256);
    const c = analyzePngPixels(encodePng(() => [30, 20, 10, 255]), sha256);
    expect(a.pixelHash).toBe(b.pixelHash);
    expect(a.pixelHash).not.toBe(c.pixelHash);
  });
});
