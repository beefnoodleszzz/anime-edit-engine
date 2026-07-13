import { PNG } from 'pngjs';
import type { QcRegion } from '../types';

export const MIN_PRODUCTION_WIDTH = 1440;
export const MIN_PRODUCTION_HEIGHT = 2560;

export interface ImageQcMetrics { width: number; height: number; sharpness: number; edgeDensity: number; }

export function assertProductionPng(buffer: Buffer, file: string): PNG {
  if (buffer.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) throw new Error(`Production image must be PNG: ${file}.`);
  const png = PNG.sync.read(buffer);
  if (png.width < MIN_PRODUCTION_WIDTH || png.height < MIN_PRODUCTION_HEIGHT) throw new Error(`Production image is below ${MIN_PRODUCTION_WIDTH}×${MIN_PRODUCTION_HEIGHT}: ${file} (${png.width}×${png.height}).`);
  if (png.width * 16 !== png.height * 9) throw new Error(`Production image must use 9:16 aspect ratio: ${file} (${png.width}×${png.height}).`);
  return png;
}

export function cropPng(png: PNG, region: QcRegion): Buffer {
  const x = Math.max(0, Math.min(png.width - 1, Math.floor(region.x * png.width)));
  const y = Math.max(0, Math.min(png.height - 1, Math.floor(region.y * png.height)));
  const width = Math.max(1, Math.min(png.width - x, Math.round(region.width * png.width)));
  const height = Math.max(1, Math.min(png.height - y, Math.round(region.height * png.height)));
  const output = new PNG({ width, height });
  PNG.bitblt(png, output, x, y, width, height, 0, 0);
  return PNG.sync.write(output);
}

export function edgeMap(png: PNG): Buffer {
  const output = new PNG({ width: png.width, height: png.height });
  const luma = (x: number, y: number): number => {
    const xx = Math.max(0, Math.min(png.width - 1, x)); const yy = Math.max(0, Math.min(png.height - 1, y));
    const offset = (yy * png.width + xx) * 4;
    return 0.2126 * png.data[offset]! + 0.7152 * png.data[offset + 1]! + 0.0722 * png.data[offset + 2]!;
  };
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    const gx = -luma(x - 1, y - 1) + luma(x + 1, y - 1) - 2 * luma(x - 1, y) + 2 * luma(x + 1, y) - luma(x - 1, y + 1) + luma(x + 1, y + 1);
    const gy = -luma(x - 1, y - 1) - 2 * luma(x, y - 1) - luma(x + 1, y - 1) + luma(x - 1, y + 1) + 2 * luma(x, y + 1) + luma(x + 1, y + 1);
    const value = Math.max(0, Math.min(255, Math.round(Math.hypot(gx, gy))));
    const offset = (y * png.width + x) * 4;
    output.data[offset] = value; output.data[offset + 1] = value; output.data[offset + 2] = value; output.data[offset + 3] = 255;
  }
  return PNG.sync.write(output);
}

export function computeImageQc(png: PNG): ImageQcMetrics {
  const values: number[] = [];
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    const offset = (y * png.width + x) * 4;
    const center = 0.2126 * png.data[offset]! + 0.7152 * png.data[offset + 1]! + 0.0722 * png.data[offset + 2]!;
    const rightOffset = (y * png.width + Math.min(png.width - 1, x + 1)) * 4;
    const downOffset = (Math.min(png.height - 1, y + 1) * png.width + x) * 4;
    values.push(Math.abs(center - (0.2126 * png.data[rightOffset]! + 0.7152 * png.data[rightOffset + 1]! + 0.0722 * png.data[rightOffset + 2]!)) + Math.abs(center - (0.2126 * png.data[downOffset]! + 0.7152 * png.data[downOffset + 1]! + 0.0722 * png.data[downOffset + 2]!)));
  }
  const edgeDensity = values.filter((value) => value >= 24).length / Math.max(1, values.length);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const sharpness = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  return { width: png.width, height: png.height, sharpness, edgeDensity };
}

export function highestFrequencyCrop(png: PNG): { region: QcRegion; image: Buffer } {
  const size = 0.35; let best = { score: -Infinity, x: 0.5, y: 0.5 };
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
    const region = { id: `edge-${row}-${column}`, x: column / 4, y: row / 4, width: 0.25, height: 0.25 };
    const metrics = computeImageQc(PNG.sync.read(cropPng(png, region)));
    if (metrics.edgeDensity > best.score) best = { score: metrics.edgeDensity, x: region.x + region.width / 2, y: region.y + region.height / 2 };
  }
  const region = { id: 'high-frequency-edge', x: Math.max(0, Math.min(1 - size, best.x - size / 2)), y: Math.max(0, Math.min(1 - size, best.y - size / 2)), width: size, height: size };
  return { region, image: cropPng(png, region) };
}
