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
const master = `renders/master/${project.id}/master-4k-${context.fps}.mp4`;
if (!existsSync(master)) throw new Error(`Master render is required for shot QC: ${master}. Run npm run render:master first.`);
const requestedShot = process.argv[2];
const shots = requestedShot ? timeline.shots.filter((shot) => shot.id === requestedShot) : timeline.shots;
if (shots.length === 0) throw new Error(`Unknown shot: ${requestedShot}`);
const defaultFaceRegion = { id: 'face-center', x: 0.28, y: 0.12, width: 0.44, height: 0.34 };
const regions = project.qcRegions?.length ? project.qcRegions : [defaultFaceRegion];
const reports = [];

for (const shot of shots) {
  const sourcePath = `cache/prepared/${project.id}/${shot.id}/${shot.id}.mp4`;
  const manifestPath = `cache/prepared/${project.id}/${shot.id}/${shot.id}.manifest.json`;
  if (!existsSync(sourcePath) || !existsSync(manifestPath)) throw new Error(`Prepared source is missing for ${shot.id}; run npm run prepare:sources first.`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { frameCount: number; interpolationMode: 'none' | 'blend'; duplicateFrameRatio: number; blendFrameRatio: number };
  const outputRoot = `projects/${project.id}/qc/shots/${shot.id}`;
  await mkdir(`${outputRoot}/regions`, { recursive: true });
  await mkdir(`${outputRoot}/source`, { recursive: true });
  await mkdir(`${outputRoot}/rendered`, { recursive: true });
  const points = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.min(manifest.frameCount - 1, Math.round((manifest.frameCount - 1) * ratio)));
  const frameReports = [];
  for (let index = 0; index < points.length; index += 1) {
    const frameNumber = points[index]!;
    const sourceFramePath = `${outputRoot}/source/frame-${index}.png`;
    const renderedFramePath = `${outputRoot}/rendered/frame-${index}.png`;
    const renderedGlobalFrame = Math.min(Math.round(project.duration * context.fps) - 1, Math.round(shot.start * context.fps) + frameNumber);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', sourcePath, '-vf', `select='eq(n\\,${frameNumber})'`, '-frames:v', '1', sourceFramePath], { stdio: 'inherit' });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', master, '-vf', `select='eq(n\\,${renderedGlobalFrame})'`, '-frames:v', '1', renderedFramePath], { stdio: 'inherit' });
    const sourcePng = PNG.sync.read(await readFile(sourceFramePath));
    const renderedPng = PNG.sync.read(await readFile(renderedFramePath));
    const sourceMetrics = computeImageQc(sourcePng);
    const renderedMetrics = computeImageQc(renderedPng);
    await writeFile(`${outputRoot}/source/frame-${index}-edges.png`, edgeMap(sourcePng));
    await writeFile(`${outputRoot}/rendered/frame-${index}-edges.png`, edgeMap(renderedPng));
    const regionFiles = [];
    for (const region of regions) {
      const sourceFile = `${outputRoot}/regions/frame-${index}-${region.id}-source.png`;
      const renderedFile = `${outputRoot}/regions/frame-${index}-${region.id}-rendered.png`;
      await writeFile(sourceFile, cropPng(sourcePng, region));
      await writeFile(renderedFile, cropPng(renderedPng, region));
      regionFiles.push({ id: region.id, source: sourceFile, rendered: renderedFile });
    }
    frameReports.push({
      frameIndex: frameNumber,
      renderedGlobalFrame,
      progress: [0, 0.25, 0.5, 0.75, 1][index],
      source: { file: sourceFramePath, edgeFile: `${outputRoot}/source/frame-${index}-edges.png`, metrics: sourceMetrics },
      rendered: { file: renderedFramePath, edgeFile: `${outputRoot}/rendered/frame-${index}-edges.png`, metrics: renderedMetrics },
      edgeRetention: renderedMetrics.edgeDensity / Math.max(0.000001, sourceMetrics.edgeDensity),
      regions: regionFiles,
    });
  }
  const director = new Director(project, timeline, context);
  let blurFrames = 0;
  for (let frame = 0; frame < Math.round((shot.end - shot.start) * context.fps); frame += 1) if (director.resolve(shot.start + frame / context.fps).blur.samples > 1) blurFrames += 1;
  const averageSourceSharpness = frameReports.reduce((sum, frame) => sum + frame.source.metrics.sharpness, 0) / Math.max(1, frameReports.length);
  const averageRenderedSharpness = frameReports.reduce((sum, frame) => sum + frame.rendered.metrics.sharpness, 0) / Math.max(1, frameReports.length);
  const edgeRetention = frameReports.reduce((sum, frame) => sum + frame.edgeRetention, 0) / Math.max(1, frameReports.length);
  const report = { shotId: shot.id, master, sourceResolution: { width: project.sources.find((source) => source.id === shot.source)!.width, height: project.sources.find((source) => source.id === shot.source)!.height }, renderedResolution: { width: context.width, height: context.height }, sourceFps: project.sources.find((source) => source.id === shot.source)!.fps, deliveryFps: context.fps, interpolationMode: manifest.interpolationMode, duplicateFrameRatio: manifest.duplicateFrameRatio, blendFrameRatio: manifest.blendFrameRatio, averageSourceSharpness, averageRenderedSharpness, edgeRetention, blurFrameRatio: blurFrames / Math.max(1, Math.round((shot.end - shot.start) * context.fps)), frames: frameReports };
  await writeFile(`${outputRoot}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  reports.push(report);
}
await writeFile(`projects/${project.id}/qc/shot-quality-report.json`, `${JSON.stringify({ projectId: project.id, shots: reports }, null, 2)}\n`);
console.log(`Wrote shot QC for ${reports.length} shot(s).`);
