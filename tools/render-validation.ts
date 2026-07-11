import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { ProjectLoader } from '../engine/core/ProjectLoader';
import { createRenderContext } from '../engine/core/RenderContext';
import { analyzePngPixels } from '../engine/core/PngPixels';
import { validateFirstFrame } from '../engine/core/MasterValidation';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

/**
 * V0 Validation Preview: a single fixed review-mode render (1080x1920@60, 8s, 480 frames) used
 * to prove the engine end to end, not a step toward the master (2160x3840@120) pipeline. index.html
 * is already a strict review entry (data-render-mode="review" data-fps="60", 1080x1920), so this
 * renders it directly instead of generating a compositions/.validation.render.html duplicate —
 * fewer moving parts, and it sidesteps HyperFrames' asset-path resolution rules that render-master.ts
 * / render-draft.ts must work around because their entries live one directory deeper.
 */
interface ProbeStream {
  width: number; height: number; r_frame_rate: string; avg_frame_rate: string;
  nb_read_frames: string; duration: string; codec_name: string; pix_fmt: string;
}

const config = ProjectLoader.validate({ project: project as ProjectManifest, timeline: timeline as TimelineManifest });
const context = createRenderContext(config.project, 'review');
if (context.width !== 1080 || context.height !== 1920 || context.fps !== 60 || context.blurSamples !== 16 || context.postFX !== 'full') {
  throw new Error(`Review RenderContext does not match the V0 validation spec (1080x1920@60, 16 samples, full postFX): ${JSON.stringify(context)}`);
}

const indexHtml = await readFile('index.html', 'utf8');
if (!indexHtml.includes('data-render-mode="review"') || !indexHtml.includes('data-fps="60"') || !indexHtml.includes('data-width="1080"') || !indexHtml.includes('data-height="1920"')) {
  throw new Error('index.html is not a strict 1080x1920@60 review entry; the V0 validation render requires it to already be one.');
}
for (const shot of config.timeline.shots) {
  const videoPath = `cache/prepared/${config.project.id}/${shot.id}/${shot.id}.mp4`;
  if (!indexHtml.includes(`src="${videoPath}"`)) throw new Error(`index.html does not reference the prepared source for ${shot.id} (${videoPath}).`);
}

const outDir = 'renders/validation';
const outputMp4 = `${outDir}/anime-edit-validation.mp4`;
await mkdir(outDir, { recursive: true });

execFileSync('npx', ['--yes', 'hyperframes@0.7.49', 'render', '--composition', '.', '--fps', String(context.fps), '--quality', 'high', '--format', 'mp4', '--output', outputMp4], { stdio: 'inherit' });

const durationSeconds = config.project.duration;
const expectedFrameCount = Math.round(durationSeconds * context.fps);

const ffprobe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration,codec_name,pix_fmt', '-of', 'json', outputMp4], { encoding: 'utf8' })) as { streams: ProbeStream[] };
const stream = ffprobe.streams[0];
if (!stream) throw new Error('ffprobe found no video stream in the validation render.');

const mismatches: string[] = [];
if (stream.width !== context.width) mismatches.push(`width=${stream.width} (expected ${context.width})`);
if (stream.height !== context.height) mismatches.push(`height=${stream.height} (expected ${context.height})`);
if (stream.r_frame_rate !== `${context.fps}/1`) mismatches.push(`r_frame_rate=${stream.r_frame_rate} (expected ${context.fps}/1)`);
if (stream.avg_frame_rate !== `${context.fps}/1`) mismatches.push(`avg_frame_rate=${stream.avg_frame_rate} (expected ${context.fps}/1)`);
if (Number(stream.nb_read_frames) !== expectedFrameCount) mismatches.push(`nb_read_frames=${stream.nb_read_frames} (expected ${expectedFrameCount})`);
if (Math.abs(Number(stream.duration) - durationSeconds) > 1 / context.fps) mismatches.push(`duration=${stream.duration} (expected ~${durationSeconds}, tolerance ${1 / context.fps})`);
if (stream.codec_name !== 'h264') mismatches.push(`codec_name=${stream.codec_name} (expected h264)`);
if (stream.pix_fmt !== 'yuv420p') mismatches.push(`pix_fmt=${stream.pix_fmt} (expected yuv420p)`);
if (mismatches.length > 0) throw new Error(`Validation render failed FFprobe checks: ${mismatches.join(', ')}`);
const isCfr = stream.r_frame_rate === `${context.fps}/1` && stream.avg_frame_rate === `${context.fps}/1`;

const firstFramePath = `${outDir}/first-frame.png`;
execFileSync('ffmpeg', ['-y', '-i', outputMp4, '-frames:v', '1', firstFramePath], { stdio: 'inherit' });
const firstFramePng = await readFile(firstFramePath);
const firstFrameAnalysis = analyzePngPixels(firstFramePng, (data) => createHash('sha256').update(data).digest('hex'));
validateFirstFrame(firstFrameAnalysis);

const preparedShots = await Promise.all(config.timeline.shots.map(async (shot) => {
  const videoPath = `cache/prepared/${config.project.id}/${shot.id}/${shot.id}.mp4`;
  const manifest = JSON.parse(await readFile(`cache/prepared/${config.project.id}/${shot.id}/${shot.id}.manifest.json`, 'utf8')) as { frameCount: number };
  return { shotId: shot.id, videoPath, frameCount: manifest.frameCount };
}));

const bytes = (await stat(outputMp4)).size;
const report = {
  version: 'v0-validation',
  mode: context.mode,
  width: context.width,
  height: context.height,
  fps: context.fps,
  durationSeconds,
  expectedFrameCount,
  encodedFrameCount: Number(stream.nb_read_frames),
  codec: stream.codec_name,
  pixelFormat: stream.pix_fmt,
  rFrameRate: stream.r_frame_rate,
  avgFrameRate: stream.avg_frame_rate,
  isCfr,
  firstFrameValid: true,
  firstFrameAnalysis,
  preparedShots,
  outputPath: outputMp4,
  bytes,
  generatedAt: new Date().toISOString(),
};
await writeFile(`${outDir}/validation-report.json`, `${JSON.stringify(report, null, 2)}\n`);

// Static preview page (validation/index.html) plays the video from its own directory, so the
// generated artifacts are copied alongside it for local playback without a full `npm run build`.
await mkdir('validation', { recursive: true });
await copyFile(outputMp4, 'validation/anime-edit-validation.mp4');
await copyFile(firstFramePath, 'validation/first-frame.png');
await copyFile(`${outDir}/validation-report.json`, 'validation/validation-report.json');

console.log(`Validation render complete: ${outputMp4} (${bytes} bytes), ${stream.nb_read_frames} frames @ ${stream.r_frame_rate}, ${stream.width}x${stream.height}, ${stream.codec_name}/${stream.pix_fmt}.`);
