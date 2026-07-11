import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const frames = 'renders/frames';
const master = 'renders/master/master-4k-120.mp4';
const expectedFrames = 960;
const prepared = 'cache/prepared/001-demo/master.mp4';
const indexPath = 'index.html';

execFileSync('npx', ['tsx', 'tools/prepare-sources.ts'], { stdio: 'inherit' });
if (!existsSync(prepared)) throw new Error('Prepared CFR source was not produced.');
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });
await mkdir('renders/master', { recursive: true });
const originalIndex = await readFile(indexPath, 'utf8');
const masterIndex = originalIndex
  .replace('data-render-mode="review" data-fps="60"', 'data-render-mode="master" data-fps="120"')
  .replace(/src="assets\/sources\/[^"]+\.mp4"/, `src="${prepared}"`);
if (masterIndex === originalIndex) throw new Error('Unable to configure index.html for the prepared master source.');

try {
  await writeFile(indexPath, masterIndex);
  execFileSync('npx', ['--yes', 'hyperframes@0.7.49', 'render', '--resolution', 'portrait-4k', '--fps', '120', '--format', 'png-sequence', '--output', frames], { stdio: 'inherit' });
} finally {
  await writeFile(indexPath, originalIndex);
}
const pngs = (await readdir(frames)).filter((file) => /^frame_\d{6}\.png$/.test(file)).sort();
if (pngs.length !== expectedFrames || !existsSync(`${frames}/frame_000000.png`)) throw new Error(`Master render frame count mismatch: expected ${expectedFrames}, received ${pngs.length}.`);
execFileSync('ffmpeg', ['-y', '-framerate', '120', '-start_number', '0', '-i', `${frames}/frame_%06d.png`, '-frames:v', String(expectedFrames), '-vsync', 'cfr', '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', master], { stdio: 'inherit' });
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames', '-of', 'json', master], { encoding: 'utf8' })) as { streams: Array<{ width: number; height: number; r_frame_rate: string; avg_frame_rate: string; nb_read_frames: string; }> };
const stream = probe.streams[0];
if (!stream || stream.width !== 2160 || stream.height !== 3840 || stream.nb_read_frames !== String(expectedFrames) || !['120/1', '120000/1001'].includes(stream.avg_frame_rate)) throw new Error(`Master CFR validation failed: ${JSON.stringify(stream)}`);
const report = { output: master, bytes: (await stat(master)).size, expectedFrames, width: stream.width, height: stream.height, fps: stream.avg_frame_rate, frames: Number(stream.nb_read_frames), preparedManifest: 'cache/prepared/001-demo/master.manifest.json' };
await writeFile('renders/master/master-report.json', `${JSON.stringify(report, null, 2)}\n`);
