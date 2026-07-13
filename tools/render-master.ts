import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRenderContext } from '../engine/core/RenderContext';
import { validateMasterStream, validateFirstFrame, validateDeliveryDuration, type ProbeStream } from '../engine/core/MasterValidation';
import { analyzePngPixels } from '../engine/core/PngPixels';
import { validateProjectProductionAssets } from '../engine/qc/ProductionAssets';
import { resolveProjectId, loadAudioManifest, loadProjectConfig, listAudioTracks } from './project-io';

const { project, timeline } = await loadProjectConfig(resolveProjectId());
const context = createRenderContext(project, 'master'); const frames = 'renders/frames'; const masterDir = `renders/master/${project.id}`;
await validateProjectProductionAssets(project);
// Master capture and delivery intentionally share the project's configured 60FPS default.
// This keeps frame-exact motion, blur, validation, and the final CFR file on one clock instead
// of rendering a hidden higher-rate intermediate and silently dropping duplicate frames afterward.
const MASTER_DELIVERY_FPS = context.fps;
const master = `${masterDir}/master-4k-${MASTER_DELIVERY_FPS}.mp4`;
const audioManifest = await loadAudioManifest(project);
const audioTracks = listAudioTracks(audioManifest);
const silentMaster = audioTracks.length > 0 ? `${masterDir}/master-4k-${MASTER_DELIVERY_FPS}.silent.mp4` : master;
const expectedFrameCount = Math.round(project.duration * context.fps);
await rm(frames, { recursive: true, force: true }); await mkdir(frames, { recursive: true }); await mkdir(masterDir, { recursive: true });
execFileSync('npx', ['tsx', 'tools/generate-composition.ts'], { stdio: 'inherit' });
execFileSync('npx', ['tsx', 'tools/prepare-sources.ts'], { stdio: 'inherit' });
const entry = 'index.html'; const reviewEntry = await readFile(entry, 'utf8');
const masterEntry = reviewEntry.replace('data-resolution="portrait" data-render-mode="review" data-fps="60"', `data-resolution="portrait-4k" data-render-mode="master" data-fps="${context.fps}"`).replaceAll('width=1080, height=1920', 'width=2160, height=3840').replaceAll('1080px', '2160px').replaceAll('1920px', '3840px').replace('data-width="1080" data-height="1920"', 'data-width="2160" data-height="3840"');
await writeFile(entry, masterEntry);
try { execFileSync('npx', ['--yes', 'hyperframes@0.7.49', 'render', '--composition', entry, '--fps', String(context.fps), '--format', 'png-sequence', '--video-frame-format', 'png', '--output', frames], { stdio: 'inherit' }); }
finally { await writeFile(entry, reviewEntry); }
const pngs = (await readdir(frames)).filter((file) => /^frame_\d{6}\.png$/.test(file)).sort();
if (pngs.length !== expectedFrameCount) throw new Error(`PNG frame count mismatch: expected ${expectedFrameCount}, got ${pngs.length}.`);
// The HyperFrames CLI's own png-sequence writer numbers frames starting at 1
// (frame_000001.png .. frame_NNNNNN.png), unlike this project's own frame_%06d convention
// (prepare-sources.ts / render-draft.ts) which is 0-indexed. Never hardcode a filename or a
// -start_number here — derive both from the real, sorted directory listing.
const firstFrameName = pngs[0]!;
const startNumber = Number(firstFrameName.match(/^frame_(\d{6})\.png$/)![1]);
const firstFramePng = await readFile(`${frames}/${firstFrameName}`);
const firstFrameAnalysis = analyzePngPixels(firstFramePng, (data) => createHash('sha256').update(data).digest('hex'));
validateFirstFrame(firstFrameAnalysis);
// The PNG sequence is already captured at the delivery rate. Keep the encode path one-to-one so
// frame count and timing remain directly auditable; -fps_mode cfr makes the strict CFR contract
// explicit rather than relying on the encoder's default.
// -maxrate/-bufsize/-profile/-level keep the encoded stream within a level real hardware decoders
// actually implement (see MASTER_DELIVERY_FPS comment above); CRF 18 matches prepare-sources.ts's
// own "visually lossless" floor (~50dB PSNR margin over the 20dB floor at CRF 14) while cutting
// bitrate roughly an order of magnitude from the CRF 10 this replaced. -video_track_timescale
// 60000 keeps the container's declared timescale a clean multiple of the 60fps delivery rate;
// +faststart moves the moov atom for streaming.
execFileSync('ffmpeg', ['-y', '-framerate', String(context.fps), '-start_number', String(startNumber), '-i', `${frames}/frame_%06d.png`, '-frames:v', String(expectedFrameCount),
  '-r', String(MASTER_DELIVERY_FPS), '-fps_mode', 'cfr',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '80M', '-bufsize', '160M', '-profile:v', 'high', '-level:v', '5.2', '-pix_fmt', 'yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-video_track_timescale', '60000', '-movflags', '+faststart', silentMaster], { stdio: 'inherit' });
if (audioTracks.length > 0) {
  execFileSync('npx', ['tsx', 'tools/mix-audio.ts', '--input', silentMaster, '--output', master], { stdio: 'inherit' });
  await rm(silentMaster, { force: true });
}
const ffprobe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
  '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,time_base,duration_ts,duration,nb_frames,nb_read_frames,codec_name,profile,level,pix_fmt,bit_rate:format=duration,bit_rate',
  '-of', 'json', master], { encoding: 'utf8' })) as { streams: ProbeStream[]; format?: { duration?: string; bit_rate?: string } };
const stream = ffprobe.streams[0]; if (!stream) throw new Error('ffprobe found no video stream.'); const result = validateMasterStream(stream, context, project.duration, pngs.length, MASTER_DELIVERY_FPS);
const streamDuration = Number(stream.duration); const formatDuration = Number(ffprobe.format?.duration);
validateDeliveryDuration(streamDuration, formatDuration, project.duration, MASTER_DELIVERY_FPS);
let audioValidation: unknown = undefined;
if (audioTracks.length > 0) {
  const audioProbe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels,duration:format=duration', '-of', 'json', master], { encoding: 'utf8' })) as { streams: Array<{ codec_name?: string; sample_rate?: string; channels?: number; duration?: string }> };
  const audio = audioProbe.streams[0];
  if (!audio || audio.codec_name !== 'aac' || audio.sample_rate !== '48000' || audio.channels !== 2) throw new Error(`Final audio stream must be AAC 48kHz stereo: ${JSON.stringify(audio)}.`);
  validateDeliveryDuration(Number(audio.duration), Number(audio.duration), project.duration, MASTER_DELIVERY_FPS);
  audioValidation = audio;
}
const preparedReports = await Promise.all(timeline.shots.map(async (shot) => {
  const path = `cache/prepared/${project.id}/${shot.id}/${shot.id}.manifest.json`;
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return undefined; }
}));
const prepared = preparedReports.filter(Boolean) as Array<{ interpolationMode?: string; duplicateFrameRatio?: number; blendFrameRatio?: number }>;
const sourceFpsValues = [...new Set(timeline.shots.map((shot) => project.sources.find((source) => source.id === shot.source)!.fps))];
const motionReport = { sourceFps: sourceFpsValues.length === 1 ? sourceFpsValues[0] : sourceFpsValues, deliveryFps: context.fps, duplicateFrameRatio: prepared.reduce((sum, item) => sum + (item.duplicateFrameRatio ?? 0), 0) / Math.max(1, prepared.length), blendFrameRatio: prepared.reduce((sum, item) => sum + (item.blendFrameRatio ?? 0), 0) / Math.max(1, prepared.length), interpolationMode: [...new Set(prepared.map((item) => item.interpolationMode ?? 'none'))].join(',') };
const report = {
  mode: context.mode, width: context.width, height: context.height, captureFps: context.fps, deliveryFps: MASTER_DELIVERY_FPS, durationSeconds: project.duration,
  expectedFrameCount: result.expectedFrameCount, pngFrameCount: pngs.length, deliveryFrameCount: result.deliveryFrameCount, encodedFrameCount: Number(stream.nb_read_frames), codec: stream.codec_name,
  isCfr: result.isCfr, firstFrameValid: true, firstFrameAnalysis,
  streamDuration, formatDuration, timeBase: stream.time_base, profile: stream.profile,
  level: stream.level, pixelFormat: stream.pix_fmt, bitRate: Number(stream.bit_rate ?? ffprobe.format?.bit_rate),
  rFrameRate: stream.r_frame_rate, avgFrameRate: stream.avg_frame_rate,
  sourceFps: motionReport.sourceFps, duplicateFrameRatio: motionReport.duplicateFrameRatio, blendFrameRatio: motionReport.blendFrameRatio, interpolationMode: motionReport.interpolationMode,
  motion: motionReport, audio: audioValidation,
  hyperFramesConfig: { composition: 'temporary 4K index.html', width: 2160, height: 3840, fps: context.fps },
  engineRenderContext: context, preparedSources: project.id, ffprobe, generatedAt: new Date().toISOString(), bytes: (await stat(master)).size,
};
await writeFile(`${masterDir}/master-report.json`, `${JSON.stringify(report, null, 2)}\n`);
