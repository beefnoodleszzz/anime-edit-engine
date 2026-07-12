import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolveProjectId, loadProjectConfig } from './project-io';

/**
 * HyperFrames only renders one active composition per directory (index.html at repo root);
 * `--composition <path>` cannot target a project subfolder that lacks its own hyperframes.json.
 * Switching the "active" project therefore means regenerating index.html's prepared-source
 * <video> block and duration attributes from that project's project.json/timeline.json, leaving
 * everything else (head, styles, the fixed `anime-edit-engine` composition-id registered on
 * window.__timelines, the dist/main.js entry) untouched.
 */
const randomHfId = (): string => `hf-${randomBytes(3).toString('hex')}`;
const round = (value: number): number => Number(value.toFixed(6));

const { project, timeline } = await loadProjectConfig(resolveProjectId());

const videoTags = timeline.shots
  .map((shot) => {
    const duration = round(shot.end - shot.start);
    return `      <video data-hf-id="${randomHfId()}" id="source-${shot.id}" data-prepared-shot="${shot.id}" class="clip prepared-source" src="cache/prepared/${project.id}/${shot.id}/${shot.id}.mp4" data-start="${round(shot.start)}" data-duration="${duration}" data-track-index="0" muted playsinline preload="auto"></video>`;
  })
  .join('\n');

const html = await readFile('index.html', 'utf8');

const videoBlockPattern = /(<!-- Each timed source is an independent CFR shot\. HyperFrames owns injection; only the canvas is visible\. -->\n)([\s\S]*?)(\n\s*<canvas)/;
if (!videoBlockPattern.test(html)) throw new Error('index.html does not match the expected prepared-source video block structure; refusing to overwrite.');

const withVideos = html.replace(videoBlockPattern, `$1${videoTags}$3`);
// The root <div> gains a data-project-id attribute (see below) on its first regenerate, which sits
// between data-composition-id and data-start on every run after that — [^>]* skips over it (and
// anything else) without crossing the tag boundary, so this stays idempotent across repeated runs.
const rootDurationPattern = /(id="root"[^>]*data-start="0" data-duration=")[^"]*(")/;
if (!rootDurationPattern.test(withVideos)) throw new Error('index.html root element does not match the expected data-start/data-duration structure; refusing to overwrite.');
const withRootDuration = withVideos.replace(rootDurationPattern, `$1${round(project.duration)}$2`);
const withProjectId = /data-project-id="[^"]*"/.test(withRootDuration)
  ? withRootDuration.replace(/data-project-id="[^"]*"/, `data-project-id="${project.id}"`)
  : withRootDuration.replace(/(id="root" data-composition-id="anime-edit-engine")/, `$1 data-project-id="${project.id}"`);
const canvasDurationPattern = /(id="stage" class="clip" data-start="0" data-duration=")[^"]*(" data-track-index="1")/;
if (!canvasDurationPattern.test(withProjectId)) throw new Error('index.html canvas element does not match the expected data-start/data-duration structure; refusing to overwrite.');
const withCanvasDuration = withProjectId.replace(canvasDurationPattern, `$1${round(project.duration)}$2`);
const withTitle = withCanvasDuration.replace(/<title>[^<]*<\/title>/, `<title>Anime Edit Engine — ${project.name}</title>`);

await writeFile('index.html', withTitle);
console.log(`Regenerated index.html for project "${project.id}" (${timeline.shots.length} shots, duration=${project.duration}s). Run with PROJECT_ID=${project.id} for prepare/render steps to match.`);
