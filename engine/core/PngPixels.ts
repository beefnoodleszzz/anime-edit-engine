import { PNG } from 'pngjs';

export interface PixelAnalysis {
  width: number; height: number; alphaCoverage: number; meanLuminance: number;
  luminanceVariance: number; nonBlackPixelRatio: number; pixelHash: string;
}

const luma = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Decodes real PNG pixels and computes the metrics needed to tell a black/empty frame from a real one. */
export function analyzePngPixels(buffer: Buffer, hash: (data: Buffer) => string): PixelAnalysis {
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;
  const pixelCount = width * height;
  let alphaSum = 0; let luminanceSum = 0; let nonBlackCount = 0;
  const luminances = new Array<number>(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const r = data[offset]!; const g = data[offset + 1]!; const b = data[offset + 2]!; const a = data[offset + 3]!;
    alphaSum += a;
    const l = luma(r, g, b);
    luminances[index] = l;
    luminanceSum += l;
    if (r > 8 || g > 8 || b > 8) nonBlackCount += 1;
  }
  const meanLuminance = luminanceSum / pixelCount;
  let varianceSum = 0;
  for (let index = 0; index < pixelCount; index += 1) { const delta = luminances[index]! - meanLuminance; varianceSum += delta * delta; }
  return {
    width, height, alphaCoverage: alphaSum / (pixelCount * 255), meanLuminance,
    luminanceVariance: varianceSum / pixelCount, nonBlackPixelRatio: nonBlackCount / pixelCount, pixelHash: hash(data),
  };
}

/**
 * RGB PSNR (dB) between two same-size PNGs. Used to quantify the color error a yuv420p
 * intermediate re-encode introduces versus the lossless PNG it was encoded from (see
 * tools/prepare-sources.ts). Returns Infinity for pixel-identical images.
 */
export function psnrBetweenPngs(a: Buffer, b: Buffer): number {
  const pngA = PNG.sync.read(a); const pngB = PNG.sync.read(b);
  if (pngA.width !== pngB.width || pngA.height !== pngB.height) throw new Error(`Cannot compare PNGs of different sizes: ${pngA.width}x${pngA.height} vs ${pngB.width}x${pngB.height}.`);
  const pixelCount = pngA.width * pngA.height;
  let squaredError = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) { const delta = pngA.data[offset + channel]! - pngB.data[offset + channel]!; squaredError += delta * delta; }
  }
  const meanSquaredError = squaredError / (pixelCount * 3);
  return meanSquaredError === 0 ? Infinity : 10 * Math.log10((255 * 255) / meanSquaredError);
}
