import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { ProjectLoader } from '../engine/core/ProjectLoader';
import { createRenderContext } from '../engine/core/RenderContext';
import { Director } from '../engine/director/Director';
import { computeImageQc, cropPng, edgeMap } from '../engine/qc/ImageQc';
import { loadProjectConfig, resolveProjectId } from './project-io';

const { project, timeline } = await loadProjectConfig(resolveProjectId());
ProjectLoader.validate({ project, timeline });
const context = createRenderContext(project, 'master');
const requestedShot = process.argv[2];
const shots = requestedShot ? timeline.shots.filter((shot) => shot.id === requestedShot) : timeline.shots;
if (shots.length === 0) throw new Error(`Unknown shot: ${requestedShot}`);
const regions = project.qcRegions ?? [];
const reports = [];

for (const shot of shots) {
  const sourcePath = `cache/prepared/${project.id}/${shot.id}/${shot.id}.mp4`;
  const manifestPath = `cache/prepared/${project.id}/${shot.id}/${shot.id}.manifest.json`;
  if (!existsSync(sourcePath) || !existsSync(manifestPath)) throw new Error(`Prepared source is missing for ${shot.id}; run npm run prepare:sources first.`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { frameCount: number; interpolationMode: 'none' | 'blend'; duplicateFrameRatio: number; blendFrameRatio: number };
  const outputRoot = `projects/${project.id}/qc/shots/${shot.id}`;
  await mkdir(`${outputRoot}/regions`, { recursive: true });
  const points = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.min(manifest.frameCount - 1, Math.round((manifest.frameCount - 1) * ratio)));
  const frameReports = [];
  for (let index = 0; index < points.length; index += 1) {
    const frameNumber = points[index]!;
    const framePath = `${outputRoot}/frame-${index}.png`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', sourcePath, '-vf', `select='eq(n\\,${frameNumber})'`, '-frames:v', '1', framePath], { stdio: 'inherit' });
    const png = PNG.sync.read(await readFile(framePath));
    await writeFile(`${outputRoot}/frame-${index}-edges.png`, edgeMap(png));
    const regionFiles = [];
    for (const region of regions) {
      const file = `${outputRoot}/regions/frame-${index}-${region.id}.png`;
      await writeFile(file, cropPng(png, region));
      regionFiles.push(file);
    }
    frameReports.push({ frameIndex: frameNumber, progress: [0, 0.25, 0.5, 0.75, 1][index], file: framePath, edgeFile: `${outputRoot}/frame-${index}-edges.png`, regions: regionFiles, metrics: computeImageQc(png) });
  }
  const director = new Director(project, timeline, context);
  let blurFrames = 0;
  for (let frame = 0; frame < Math.round((shot.end - shot.start) * context.fps); frame += 1) if (director.resolve(shot.start + frame / context.fps).blur.samples > 1) blurFrames += 1;
  const averageSharpness = frameReports.reduce((sum, frame) => sum + frame.metrics.sharpness, 0) / Math.max(1, frameReports.length);
  const edgeRetention = frameReports.reduce((sum, frame) => sum + frame.metrics.edgeDensity, 0) / Math.max(1, frameReports.length);
  const report = { shotId: shot.id, sourceResolution: { width: project.sources.find((source) => source.id === shot.source)!.width, height: project.sources.find((source) => source.id === shot.source)!.height }, sourceFps: project.sources.find((source) => source.id === shot.source)!.fps, deliveryFps: context.fps, interpolationMode: manifest.interpolationMode, duplicateFrameRatio: manifest.duplicateFrameRatio, blendFrameRatio: manifest.blendFrameRatio, averageSharpness, edgeRetention, blurFrameRatio: blurFrames / Math.max(1, Math.round((shot.end - shot.start) * context.fps)), frames: frameReports };
  await writeFile(`${outputRoot}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  reports.push(report);
}
await writeFile(`projects/${project.id}/qc/shot-quality-report.json`, `${JSON.stringify({ projectId: project.id, shots: reports }, null, 2)}\n`);
console.log(`Wrote shot QC for ${reports.length} shot(s).`);
