import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import project from '../projects/001-demo/project.json';
import { createRenderContext } from '../engine/core/RenderContext';
import { validateMasterStream, validateFirstFrame, type ProbeStream } from '../engine/core/MasterValidation';
import { analyzePngPixels } from '../engine/core/PngPixels';
import type { ProjectManifest } from '../engine/types';

const context = createRenderContext(project as ProjectManifest, 'master'); const frames = 'renders/frames'; const master = 'renders/master/master-4k-120.mp4';
const expectedFrameCount = Math.round((project as ProjectManifest).duration * context.fps);
await rm(frames, { recursive: true, force: true }); await mkdir(frames, { recursive: true }); await mkdir('renders/master', { recursive: true });
execFileSync('npx', ['tsx', 'tools/prepare-sources.ts'], { stdio: 'inherit' });
const entry = 'compositions/.master.render.html'; await mkdir('compositions', { recursive: true }); const reviewEntry = await readFile('index.html', 'utf8');
const masterEntry = reviewEntry.replace('data-resolution="portrait" data-render-mode="review" data-fps="60"', 'data-resolution="portrait-4k" data-render-mode="master" data-fps="120"').replaceAll('width=1080, height=1920', 'width=2160, height=3840').replaceAll('1080px', '2160px').replaceAll('1920px', '3840px').replace('data-width="1080" data-height="1920"', 'data-width="2160" data-height="3840"').replaceAll('src="cache/', 'src="../cache/').replace('src="dist/main.js"', 'src="../dist/main.js"');
await writeFile(entry, masterEntry);
try { execFileSync('npx', ['--yes', 'hyperframes@0.7.49', 'render', '--composition', entry, '--fps', '120', '--format', 'png-sequence', '--output', frames], { stdio: 'inherit' }); }
finally { await rm(entry, { force: true }); }
const pngs = (await readdir(frames)).filter((file) => /^frame_\d{6}\.png$/.test(file)).sort();
if (pngs.length !== expectedFrameCount) throw new Error(`PNG frame count mismatch: expected ${expectedFrameCount}, got ${pngs.length}.`);
const firstFramePng = await readFile(`${frames}/frame_000000.png`);
const firstFrameAnalysis = analyzePngPixels(firstFramePng, (data) => createHash('sha256').update(data).digest('hex'));
validateFirstFrame(firstFrameAnalysis);
execFileSync('ffmpeg', ['-y', '-framerate', String(context.fps), '-start_number', '0', '-i', `${frames}/frame_%06d.png`, '-frames:v', String(expectedFrameCount), '-vsync', 'cfr', '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', master], { stdio: 'inherit' });
const ffprobe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration,codec_name', '-of', 'json', master], { encoding: 'utf8' })) as { streams: ProbeStream[] };
const stream = ffprobe.streams[0]; if (!stream) throw new Error('ffprobe found no video stream.'); const result = validateMasterStream(stream, context, (project as ProjectManifest).duration, pngs.length);
const report = {
  mode: context.mode, width: context.width, height: context.height, fps: context.fps, durationSeconds: (project as ProjectManifest).duration,
  expectedFrameCount: result.expectedFrameCount, pngFrameCount: pngs.length, encodedFrameCount: Number(stream.nb_read_frames), codec: stream.codec_name,
  isCfr: result.isCfr, firstFrameValid: true, firstFrameAnalysis,
  hyperFramesConfig: { composition: 'generated compositions/.master.render.html', width: 2160, height: 3840, fps: 120 },
  engineRenderContext: context, preparedSources: (project as ProjectManifest).id, ffprobe, generatedAt: new Date().toISOString(), bytes: (await stat(master)).size,
};
await writeFile('renders/master/master-report.json', `${JSON.stringify(report, null, 2)}\n`);
