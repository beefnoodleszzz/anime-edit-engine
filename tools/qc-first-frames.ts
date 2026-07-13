import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { assertProductionPng, computeImageQc, cropPng, edgeMap, highestFrequencyCrop } from '../engine/qc/ImageQc';
import { loadProjectConfig, resolveProjectId } from './project-io';

const { project } = await loadProjectConfig(resolveProjectId());
const outputRoot = `projects/${project.id}/qc/first-frames`;
await mkdir(outputRoot, { recursive: true });
const assets = [];
for (const asset of [...(project.images ?? []), ...(project.imageAssets ?? []), ...(project.firstFrames ?? [])]) {
  const buffer = await readFile(asset.file);
  const png = asset.usage === 'production' ? assertProductionPng(buffer, asset.file) : PNG.sync.read(buffer);
  const regions = asset.qcRegions ?? project.qcRegions ?? [];
  const base = `${outputRoot}/${asset.id}`;
  await mkdir(base, { recursive: true });
  await writeFile(`${base}/full.png`, PNG.sync.write(png));
  await writeFile(`${base}/edges.png`, edgeMap(png));
  const edge = highestFrequencyCrop(png);
  await writeFile(`${base}/high-frequency-edge.png`, edge.image);
  const regionReports = [];
  for (const region of regions) {
    await writeFile(`${base}/${region.id}.png`, cropPng(png, region));
    regionReports.push({ id: region.id, file: `${base}/${region.id}.png` });
  }
  assets.push({ id: asset.id, file: asset.file, usage: asset.usage, width: png.width, height: png.height, metrics: computeImageQc(png), highFrequencyEdge: { file: `${base}/high-frequency-edge.png`, region: edge.region }, regions: regionReports });
}
const report = { projectId: project.id, output: outputRoot, assetCount: assets.length, assets };
await writeFile(`projects/${project.id}/qc/first-frame-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${assets.length} first-frame QC asset(s) to ${outputRoot}.`);
