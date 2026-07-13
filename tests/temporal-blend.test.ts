import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { blendPngBuffers, frameBracket } from '../engine/source/TemporalBlend';

const pixel = (value: number): Buffer => { const png = new PNG({ width: 1, height: 1 }); png.data[0] = value; png.data[1] = value; png.data[2] = value; png.data[3] = 255; return PNG.sync.write(png); };

describe('temporal blend', () => {
  it('uses real PTS and clamps blend weight', () => {
    expect(frameBracket([0, 0.041667, 0.083334], 0.03, 0.45)).toEqual({ lower: 0, upper: 1, weight: 0.45 });
    expect(frameBracket([0, 0.041667], 0)).toEqual({ lower: 0, upper: 0, weight: 0 });
  });
  it('blends pixels deterministically', () => {
    expect(PNG.sync.read(blendPngBuffers(pixel(0), pixel(100), 0.45)).data[0]).toBe(45);
  });
});
