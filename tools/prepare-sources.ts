import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { ProjectLoader } from '../engine/core/ProjectLoader';
import { createRenderContext } from '../engine/core/RenderContext';
import { PreparedSourcePlanner } from '../engine/source/PreparedSource';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

const config = ProjectLoader.validate({ project: project as ProjectManifest, timeline: timeline as TimelineManifest });
const context = createRenderContext(config.project, 'master');
const destination = `cache/prepared/${config.project.id}`;
const fingerprint = async (file: string): Promise<string> => {
  const info = await stat(file); const contents = await readFile(file);
  return createHash('sha256').update(`${info.size}:${info.mtimeMs}:`).update(contents).digest('hex');
};
const fingerprints = Object.fromEntries(await Promise.all(config.project.sources.map(async (source) => [source.file, await fingerprint(source.file)] as const)));
const planner = new PreparedSourcePlanner();
const manifest = planner.plan(config.project, config.timeline, context, fingerprints);
await mkdir(destination, { recursive: true });
const manifestPath = `${destination}/master.manifest.json`;
let stale = false;
if (existsSync(manifestPath)) {
  try { planner.assertValid(JSON.parse(await readFile(manifestPath, 'utf8')), config.project, config.timeline, context, fingerprints); }
  catch { stale = true; }
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Each entry is a single decoded source frame with an explicit one-master-frame duration.
// The concat demuxer keeps the filter graph constant-size even for long edits.
const quoteConcatPath = (file: string): string => file.replace(/'/g, "'\\''");
const concat = ['ffconcat version 1.0', ...manifest.frames.flatMap((frame) => {
  const start = frame.sourceFrame / frame.sourceFps;
  const end = (frame.sourceFrame + 1) / frame.sourceFps;
  return [`file '${quoteConcatPath(resolve(frame.sourceFile))}'`, `inpoint ${start.toFixed(9)}`, `outpoint ${end.toFixed(9)}`, `duration ${(1 / context.fps).toFixed(9)}`];
})];
await writeFile(`${destination}/master.ffconcat`, `${concat.join('\n')}\n`);
const output = `${destination}/master.mp4`;
if (!existsSync(output) || process.argv.includes('--force') || stale) {
  execFileSync('ffmpeg', ['-y', '-safe', '0', '-f', 'concat', '-i', `${destination}/master.ffconcat`, '-vf', `setpts=N/(${context.fps}*TB),scale=1080:1920,setsar=1,format=yuv420p`, '-an', '-r', String(context.fps), '-frames:v', String(manifest.frameCount), '-c:v', 'libx264', '-crf', '12', '-preset', 'medium', output], { stdio: 'inherit' });
}
console.log(`Prepared ${manifest.frameCount} CFR frames at ${output}`);
