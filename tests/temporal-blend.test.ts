import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { blendPngBuffers, effectiveBlendAlpha, frameBracket } from '../engine/source/TemporalBlend';

const pixel = (value: number): Buffer => { const png = new PNG({ width: 1, height: 1 }); png.data[0] = value; png.data[1] = value; png.data[2] = value; png.data[3] = 255; return PNG.sync.write(png); };

describe('temporal blend', () => {
  it('keeps real PTS weight continuous and stores maxWeight as blend strength', () => {
    const bracket = frameBracket([0, 0.041667, 0.083334], 0.03, 0.45);
    expect(bracket.lower).toBe(0);
    expect(bracket.upper).toBe(1);
    expect(bracket.weight).toBeCloseTo(0.719994, 5);
    expect(bracket.blendStrength).toBe(0.45);
    expect(frameBracket([0, 0.041667], 0)).toEqual({ lower: 0, upper: 0, weight: 0, blendStrength: 0.45 });
    expect(frameBracket([0, 0.041667, 0.083334], 0.041666, 0.45).weight).toBeGreaterThan(0.99);
    expect(frameBracket([0, 0.041667, 0.083334], 0.041668, 0.45).weight).toBeLessThan(0.001);
    expect(effectiveBlendAlpha(0.99, 0.45)).toBeGreaterThan(0.99);
    expect(effectiveBlendAlpha(0.01, 0.45)).toBeLessThan(0.01);
  });
  it('blends pixels deterministically in linear light', () => {
    expect(PNG.sync.read(blendPngBuffers(pixel(0), pixel(100), 0.5, 1)).data[0]).toBe(71);
  });
});
