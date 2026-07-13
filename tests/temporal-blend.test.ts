import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { blendPngBuffers, frameBracket } from '../engine/source/TemporalBlend';

const pixel = (value: number): Buffer => { const png = new PNG({ width: 1, height: 1 }); png.data[0] = value; png.data[1] = value; png.data[2] = value; png.data[3] = 255; return PNG.sync.write(png); };

describe('temporal blend', () => {
  it('keeps real PTS weight continuous without local strength clipping', () => {
    const bracket = frameBracket([0, 0.041667, 0.083334], 0.03);
    expect(bracket.lower).toBe(0);
    expect(bracket.upper).toBe(1);
    expect(bracket.weight).toBeCloseTo(0.719994, 5);
    expect(frameBracket([0, 0.041667], 0)).toEqual({ lower: 0, upper: 0, weight: 0 });
    expect(frameBracket([0, 0.041667, 0.083334], 0.020833).weight).toBeCloseTo(0.5, 4);
    expect(frameBracket([0, 0.041667, 0.083334], 0.020834).weight).toBeCloseTo(0.5, 3);
    expect(frameBracket([0, 0.041667, 0.083334], 0.041666).weight).toBeGreaterThan(0.99);
    expect(frameBracket([0, 0.041667, 0.083334], 0.041668).weight).toBeLessThan(0.001);
  });
  it('blends pixels deterministically in linear light', () => {
    expect(PNG.sync.read(blendPngBuffers(pixel(0), pixel(100), 0.5)).data[0]).toBe(71);
  });
});
