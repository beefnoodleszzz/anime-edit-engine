import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { ProjectLoader } from '../engine/core/ProjectLoader';
import { createRenderContext } from '../engine/core/RenderContext';
import { PreparedSourcePlanner, type PreparedSourceManifest } from '../engine/source/PreparedSource';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

const config = ProjectLoader.validate({ project: project as ProjectManifest, timeline: timeline as TimelineManifest });
const context = createRenderContext(config.project, 'master');
const root = `cache/prepared/${config.project.id}`;
const planner = new PreparedSourcePlanner();
const force = process.argv.includes('--force');
const fingerprint = async (file: string): Promise<string> => createHash('sha256').update(await readFile(file)).digest('hex');
const probe = (file: string): { width: number; height: number; fps: string; frames: number; duration: number } => {
  const payload = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration', '-of', 'json', file], { encoding: 'utf8' })) as { streams: Array<{ width: number; height: number; r_frame_rate: string; avg_frame_rate: string; nb_read_frames: string; duration: string }> };
  const stream = payload.streams[0]; if (!stream) throw new Error(`No video stream in ${file}`);
  return { width: stream.width, height: stream.height, fps: stream.r_frame_rate, frames: Number(stream.nb_read_frames), duration: Number(stream.duration) };
};
const assertPrepared = (file: string, manifest: PreparedSourceManifest): void => {
  const actual = probe(file);
  if (actual.width !== manifest.width || actual.height !== manifest.height || actual.fps !== `${manifest.fps}/1` || actual.frames !== manifest.frameCount || Math.abs(actual.duration - manifest.duration) > 1 / manifest.fps) throw new Error(`Prepared source validation failed for ${manifest.shotId}: ${JSON.stringify(actual)}`);
};
const decodeOnce = async (sourceId: string, sourceFile: string, sourceFingerprint: string): Promise<string> => {
  const directory = join(root, '_decoded', sourceId); const marker = join(directory, 'fingerprint.txt');
  if (!force && existsSync(marker) && await readFile(marker, 'utf8') === sourceFingerprint && existsSync(join(directory, 'frame_000001.png'))) return directory;
  const staging = `${directory}.tmp`; await rm(staging, { recursive: true, force: true }); await mkdir(staging, { recursive: true });
  // One decode pass creates a lossless, numerically indexed source of truth. No seek, GOP,
  // concat demuxer, or PTS rewrite participates in selecting prepared frames.
  execFileSync('ffmpeg', ['-y', '-i', sourceFile, '-map', '0:v:0', '-vsync', '0', join(staging, 'frame_%06d.png')], { stdio: 'inherit' });
  await writeFile(join(staging, 'fingerprint.txt'), sourceFingerprint); await rm(directory, { recursive: true, force: true }); await rename(staging, directory); return directory;
};

await mkdir(root, { recursive: true });
const sourceFingerprints = new Map(await Promise.all(config.project.sources.map(async (source) => [source.id, await fingerprint(source.file)] as const)));
for (const shot of config.timeline.shots) {
  const source = config.project.sources.find((candidate) => candidate.id === shot.source)!;
  const decoded = await decodeOnce(source.id, source.file, sourceFingerprints.get(source.id)!);
  const decodedFrameCount = (await readdir(decoded)).filter((file) => /^frame_\d{6}\.png$/.test(file)).length;
  const manifest = planner.planShot(config.project, config.timeline, context, shot.id, sourceFingerprints.get(source.id)!, decodedFrameCount);
  const directory = join(root, shot.id); const video = join(directory, `${shot.id}.mp4`); const manifestPath = join(directory, `${shot.id}.manifest.json`);
  let valid = false;
  if (!force && existsSync(video) && existsSync(manifestPath)) {
    try { planner.assertValid(JSON.parse(await readFile(manifestPath, 'utf8')), config.project, config.timeline, context, sourceFingerprints.get(source.id)!, decodedFrameCount); assertPrepared(video, manifest); valid = true; } catch { valid = false; }
  }
  if (valid) continue;
  const staging = `${directory}.tmp`; const frames = join(staging, 'frames'); await rm(staging, { recursive: true, force: true }); await mkdir(frames, { recursive: true });
  for (const frame of manifest.sourceFrameMap) await copyFile(join(decoded, `frame_${String(frame.sourceFrame + 1).padStart(6, '0')}.png`), join(frames, `frame_${String(frame.outputFrame).padStart(6, '0')}.png`));
  const stagedVideo = join(staging, `${shot.id}.mp4`);
  execFileSync('ffmpeg', ['-y', '-framerate', String(context.fps), '-start_number', '0', '-i', join(frames, 'frame_%06d.png'), '-frames:v', String(manifest.frameCount), '-c:v', 'libx264', '-crf', '0', '-preset', 'medium', '-g', '1', '-pix_fmt', 'yuv420p', stagedVideo], { stdio: 'inherit' });
  assertPrepared(stagedVideo, manifest);
  await writeFile(join(staging, `${shot.id}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(directory, { recursive: true, force: true }); await rename(staging, directory);
}
console.log(`Prepared ${config.timeline.shots.length} frame-accurate CFR shot sources in ${root}`);
