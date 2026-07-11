import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { psnrBetweenPngs } from '../engine/core/PngPixels';

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

describe('psnrBetweenPngs', () => {
  it('is Infinity for pixel-identical images', () => {
    const png = encodePng((index) => [index % 255, (index * 2) % 255, (index * 3) % 255, 255]);
    expect(psnrBetweenPngs(png, png)).toBe(Infinity);
  });
  it('decreases as pixel error increases', () => {
    const base = encodePng(() => [128, 128, 128, 255]);
    const smallError = encodePng(() => [130, 128, 128, 255]);
    const largeError = encodePng(() => [200, 60, 128, 255]);
    const psnrSmall = psnrBetweenPngs(base, smallError);
    const psnrLarge = psnrBetweenPngs(base, largeError);
    expect(psnrSmall).toBeGreaterThan(psnrLarge);
  });
  it('rejects mismatched image sizes', () => {
    const a = PNG.sync.write(new PNG({ width: 4, height: 4 }));
    const b = PNG.sync.write(new PNG({ width: 8, height: 8 }));
    expect(() => psnrBetweenPngs(a, b)).toThrow('different sizes');
  });
});
