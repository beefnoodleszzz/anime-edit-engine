import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRenderContext } from '../engine/core/RenderContext';
import { validateMasterStream, validateFirstFrame, validateDeliveryDuration, type ProbeStream } from '../engine/core/MasterValidation';
import { analyzePngPixels } from '../engine/core/PngPixels';
import { resolveProjectId, loadProjectConfig } from './project-io';

const { project } = await loadProjectConfig(resolveProjectId());
const context = createRenderContext(project, 'master'); const frames = 'renders/frames'; const masterDir = `renders/master/${project.id}`;
// context.fps (120) is an internal capture rate for motion-blur sampling; Kling source plates are
// native ~24fps, so exporting the delivered file at 120fps CFR is >4x duplicate frames that inflate
// bitrate past what real-world H.264 decoders (phones, most players) can handle — see the 258-280
// Mbps / level=6.0 files this pipeline produced before this was caught. Deliver at a real, evenly-
// divisible frame rate instead; the PNG capture stage is untouched (still 120fps for blur quality).
const MASTER_DELIVERY_FPS = 60;
if (context.fps % MASTER_DELIVERY_FPS !== 0) throw new Error(`Internal render fps (${context.fps}) is not an integer multiple of MASTER_DELIVERY_FPS (${MASTER_DELIVERY_FPS}); frame-drop downsampling requires a clean ratio.`);
const deliveryFrameRatio = context.fps / MASTER_DELIVERY_FPS;
const master = `${masterDir}/master-4k-${MASTER_DELIVERY_FPS}.mp4`;
const expectedFrameCount = Math.round(project.duration * context.fps);
await rm(frames, { recursive: true, force: true }); await mkdir(frames, { recursive: true }); await mkdir(masterDir, { recursive: true });
execFileSync('npx', ['tsx', 'tools/prepare-sources.ts'], { stdio: 'inherit' });
const entry = 'compositions/.master.render.html'; await mkdir('compositions', { recursive: true }); const reviewEntry = await readFile('index.html', 'utf8');
const masterEntry = reviewEntry.replace('data-resolution="portrait" data-render-mode="review" data-fps="60"', 'data-resolution="portrait-4k" data-render-mode="master" data-fps="120"').replaceAll('width=1080, height=1920', 'width=2160, height=3840').replaceAll('1080px', '2160px').replaceAll('1920px', '3840px').replace('data-width="1080" data-height="1920"', 'data-width="2160" data-height="3840"').replaceAll('src="cache/', 'src="../cache/').replace('src="dist/main.js"', 'src="../dist/main.js"');
await writeFile(entry, masterEntry);
try { execFileSync('npx', ['--yes', 'hyperframes@0.7.49', 'render', '--composition', entry, '--fps', '120', '--format', 'png-sequence', '--video-frame-format', 'png', '--output', frames], { stdio: 'inherit' }); }
finally { await rm(entry, { force: true }); }
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
// select=not(mod(n,ratio)) drops every frame but the first of each `ratio`-sized run, which is
// exactly the internal capture's own upsampling pattern in reverse (prepare-sources.ts maps each
// ~24fps source frame onto `ratio` consecutive 120fps output frames) — this discards duplicate
// frames losslessly rather than blending or re-timing anything. setpts=N/(60*TB) re-derives clean,
// evenly-spaced 60fps presentation timestamps from the output frame index instead of leaving gaps
// from the dropped input PTS; -fps_mode cfr (not the deprecated/contradictory -vsync vfr, which
// ffmpeg 8.x rejects alongside an explicit -r) makes that strict CFR explicit rather than assumed.
// -maxrate/-bufsize/-profile/-level keep the encoded stream within a level real hardware decoders
// actually implement (see MASTER_DELIVERY_FPS comment above); CRF 18 matches prepare-sources.ts's
// own "visually lossless" floor (~50dB PSNR margin over the 20dB floor at CRF 14) while cutting
// bitrate roughly an order of magnitude from the CRF 10 this replaced. -video_track_timescale
// 60000 keeps the container's declared timescale a clean multiple of the delivery fps instead of
// inheriting one sized for the 120fps capture stage; +faststart moves the moov atom for streaming.
execFileSync('ffmpeg', ['-y', '-framerate', String(context.fps), '-start_number', String(startNumber), '-i', `${frames}/frame_%06d.png`, '-frames:v', String(expectedFrameCount),
  '-vf', `select='not(mod(n\\,${deliveryFrameRatio}))',setpts=N/(${MASTER_DELIVERY_FPS}*TB)`, '-r', String(MASTER_DELIVERY_FPS), '-fps_mode', 'cfr',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '80M', '-bufsize', '160M', '-profile:v', 'high', '-level:v', '5.2', '-pix_fmt', 'yuv420p',
  '-video_track_timescale', '60000', '-movflags', '+faststart', master], { stdio: 'inherit' });
const ffprobe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
  '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,time_base,duration_ts,duration,nb_frames,nb_read_frames,codec_name,profile,level,pix_fmt,bit_rate:format=duration,bit_rate',
  '-of', 'json', master], { encoding: 'utf8' })) as { streams: ProbeStream[]; format?: { duration?: string; bit_rate?: string } };
const stream = ffprobe.streams[0]; if (!stream) throw new Error('ffprobe found no video stream.'); const result = validateMasterStream(stream, context, project.duration, pngs.length, MASTER_DELIVERY_FPS);
const streamDuration = Number(stream.duration); const formatDuration = Number(ffprobe.format?.duration);
validateDeliveryDuration(streamDuration, formatDuration, project.duration, MASTER_DELIVERY_FPS);
const report = {
  mode: context.mode, width: context.width, height: context.height, captureFps: context.fps, deliveryFps: MASTER_DELIVERY_FPS, durationSeconds: project.duration,
  expectedFrameCount: result.expectedFrameCount, pngFrameCount: pngs.length, deliveryFrameCount: result.deliveryFrameCount, encodedFrameCount: Number(stream.nb_read_frames), codec: stream.codec_name,
  isCfr: result.isCfr, firstFrameValid: true, firstFrameAnalysis,
  streamDuration, formatDuration, timeBase: stream.time_base, profile: stream.profile,
  level: stream.level, pixelFormat: stream.pix_fmt, bitRate: Number(stream.bit_rate ?? ffprobe.format?.bit_rate),
  rFrameRate: stream.r_frame_rate, avgFrameRate: stream.avg_frame_rate,
  hyperFramesConfig: { composition: 'generated compositions/.master.render.html', width: 2160, height: 3840, fps: 120 },
  engineRenderContext: context, preparedSources: project.id, ffprobe, generatedAt: new Date().toISOString(), bytes: (await stat(master)).size,
};
await writeFile(`${masterDir}/master-report.json`, `${JSON.stringify(report, null, 2)}\n`);
