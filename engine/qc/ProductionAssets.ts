import { readFile } from 'node:fs/promises';
import type { ImageAsset, ProjectManifest } from '../types';
import { assertProductionPng, computeImageQc } from './ImageQc';

export interface ProductionAssetValidation {
  id: string;
  file: string;
  width: number;
  height: number;
  passed: true;
}

export function listImageAssets(project: ProjectManifest): ImageAsset[] {
  return [...(project.images ?? []), ...(project.imageAssets ?? []), ...(project.firstFrames ?? [])];
}

export async function validateProjectProductionAssets(project: ProjectManifest): Promise<ProductionAssetValidation[]> {
  const production = listImageAssets(project).filter((asset) => asset.usage === 'production');
  const results: ProductionAssetValidation[] = [];
  for (const asset of production) {
    const png = assertProductionPng(await readFile(asset.file), asset.file);
    const metrics = computeImageQc(png);
    results.push({ id: asset.id, file: asset.file, width: metrics.width, height: metrics.height, passed: true });
  }
  return results;
}
