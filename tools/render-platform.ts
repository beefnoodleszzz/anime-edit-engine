import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, link, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRenderContext } from '../engine/core/RenderContext';
import { loadProjectConfig, resolveProjectId } from './project-io';

const projectId = resolveProjectId();
const { project } = await loadProjectConfig(projectId);
const context = createRenderContext(project, 'master');
const master = `renders/master/${project.id}/master-4k-${context.fps}.mp4`;
if (!existsSync(master)) {
  console.log(`Master is missing; rendering ${master} once as the shared platform source.`);
  execFileSync('npm', ['run', 'render:master'], { stdio: 'inherit', env: { ...process.env, PROJECT_ID: projectId } });
}
if (!existsSync(master)) throw new Error(`Master was not produced: ${master}`);
const masterHash = createHash('sha256').update(await readFile(master)).digest('hex');
const outputRoot = `renders/platform/${project.id}`;
await mkdir(outputRoot, { recursive: true });
const variants = [
  { name: '1080p', width: 1080, height: 1920 },
  { name: '1440p', width: 1440, height: 2560 },
  { name: '2160p', width: 2160, height: 3840 },
];
const reports = [];
for (const variant of variants) {
  const output = `${outputRoot}/${variant.name}.mp4`;
  let generation = 'transcoded';
  if (variant.width === context.width && variant.height === context.height) {
    generation = 'master-link-or-copy';
    await rm(output, { force: true });
    try { await link(master, output); } catch { await copyFile(master, output); }
  } else {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', master, '-vf', `scale=${variant.width}:${variant.height}:flags=lanczos`, '-r', String(context.fps), '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', String(project.duration), '-movflags', '+faststart', output], { stdio: 'inherit' });
  }
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration,codec_name,pix_fmt,color_space,color_transfer,color_primaries:format=duration', '-of', 'json', output], { encoding: 'utf8' })) as { streams: Array<Record<string, string>>; format?: { duration?: string } };
  reports.push({ ...variant, file: output, generation, bytes: (await stat(output)).size, sourceMaster: master, sourceMasterSha256: masterHash, ffprobe: probe });
}
await writeFile(`${outputRoot}/platform-report.json`, `${JSON.stringify({ projectId: project.id, sourceMaster: master, sourceMasterSha256: masterHash, deliveryFps: context.fps, variants: reports }, null, 2)}\n`);
console.log(`Wrote ${variants.length} platform variant(s) to ${outputRoot}.`);
