import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { assertProductionPng, computeImageQc } from '../engine/qc/ImageQc';

const png = (width: number, height: number): Buffer => { const image = new PNG({ width, height }); image.data.fill(255); return PNG.sync.write(image); };

describe('production image QC', () => {
  it('rejects undersized production images', () => expect(() => assertProductionPng(png(941, 1672), 'small.png')).toThrow(/below/));
  it('accepts valid 9:16 production images and computes objective metrics', () => expect(computeImageQc(assertProductionPng(png(1440, 2560), 'valid.png'))).toMatchObject({ width: 1440, height: 2560 }));
});
