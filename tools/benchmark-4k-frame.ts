import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createRenderContext } from '../engine/core/RenderContext';
import { loadProjectConfig, resolveProjectId } from './project-io';

const projectId = resolveProjectId();
const { project } = await loadProjectConfig(projectId);
const context = createRenderContext(project, 'master');
const outputRoot = `renders/benchmarks/${project.id}/4k-frame`;
const frames = `${outputRoot}/frames`;
const entry = 'index.html';

await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });
execFileSync('npx', ['tsx', 'tools/generate-composition.ts'], { stdio: 'inherit', env: { ...process.env, PROJECT_ID: projectId } });
execFileSync('npx', ['tsx', 'tools/prepare-sources.ts'], { stdio: 'inherit', env: { ...process.env, PROJECT_ID: projectId } });

const secondsArg = process.argv.find((arg) => arg.startsWith('--seconds='));
const requestedSeconds = secondsArg ? Number(secondsArg.slice('--seconds='.length)) : 1 / context.fps;
if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) throw new Error(`Invalid benchmark duration: ${secondsArg}`);
const benchmarkDuration = Number(requestedSeconds.toFixed(6));
const expectedFrames = Math.max(1, Math.round(benchmarkDuration * context.fps));
const reviewEntry = await readFile(entry, 'utf8');
const benchmarkEntry = reviewEntry
  .replace('data-resolution="portrait" data-render-mode="review" data-fps="60"', `data-resolution="portrait-4k" data-render-mode="master" data-fps="${context.fps}"`)
  .replaceAll('width=1080, height=1920', 'width=2160, height=3840')
  .replaceAll('1080px', '2160px')
  .replaceAll('1920px', '3840px')
  .replace('data-width="1080" data-height="1920"', 'data-width="2160" data-height="3840"')
  .replace(/(id="root"[^>]*data-start="0" data-duration=")[^"]*(")/, `$1${benchmarkDuration}$2`)
  .replace(/(id="stage" class="clip" data-start="0" data-duration=")[^"]*(" data-track-index="1")/, `$1${benchmarkDuration}$2`);

await writeFile(entry, benchmarkEntry);
const started = performance.now();
try {
  execFileSync('npx', ['--yes', 'hyperframes@0.7.49', 'render', '--composition', entry, '--fps', String(context.fps), '--format', 'png-sequence', '--video-frame-format', 'png', '--output', frames], { stdio: 'inherit' });
} finally {
  await writeFile(entry, reviewEntry);
}
const elapsedMs = performance.now() - started;
const firstFrame = `${frames}/frame_000001.png`;
const bytes = (await stat(firstFrame)).size;
const report = { projectId: project.id, width: context.width, height: context.height, fps: context.fps, durationSeconds: benchmarkDuration, expectedFrames, elapsedMs, millisecondsPerFrame: elapsedMs / expectedFrames, output: frames, firstFrame, firstFrameBytes: bytes, generatedAt: new Date().toISOString() };
await writeFile(`${outputRoot}/benchmark-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`4K benchmark: ${expectedFrames} frame(s), ${elapsedMs.toFixed(1)}ms total, ${(elapsedMs / expectedFrames).toFixed(1)}ms/frame (${frames})`);
