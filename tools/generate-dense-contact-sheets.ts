import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolveProjectId, loadProjectConfig } from './project-io';

const requestedShot = process.argv[2];
const { project, timeline } = await loadProjectConfig(resolveProjectId());
const shots = requestedShot ? timeline.shots.filter((shot) => shot.id === requestedShot) : timeline.shots;
if (shots.length === 0) throw new Error(`Unknown shot: ${requestedShot}`);

for (const shot of shots) {
  const source = `cache/prepared/${project.id}/${shot.id}/${shot.id}.mp4`;
  const manifestPath = `cache/prepared/${project.id}/${shot.id}/${shot.id}.manifest.json`;
  if (!existsSync(source) || !existsSync(manifestPath)) throw new Error(`Prepared source is missing for ${shot.id}; run npm run prepare:sources first.`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { frameCount: number };
  const points = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.min(manifest.frameCount - 1, Math.round((manifest.frameCount - 1) * ratio)));
  const select = points.map((frame) => `eq(n\\,${frame})`).join('+');
  const output = `renders/qc/${project.id}/${shot.id}-dense.jpg`;
  await mkdir(`renders/qc/${project.id}`, { recursive: true });
  execFileSync('ffmpeg', [
    '-y', '-i', source,
    '-vf', `select='${select}',scale=360:-2,tile=5x1:padding=4:margin=4`,
    '-fps_mode', 'vfr', '-frames:v', '1', '-update', '1', output,
  ], { stdio: 'inherit' });
  console.log(`${shot.id}: ${output} (0/25/50/75/100%)`);
}
