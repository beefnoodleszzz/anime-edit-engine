import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRenderContext } from '../engine/core/RenderContext';
import { resolveProjectId, loadProjectConfig } from './project-io';

/**
 * Draft must be its own generated entry, exactly like tools/render-master.ts, instead of
 * driving the HyperFrames CLI at --fps 30 against index.html's declared review DOM (1080x1920
 * @60, mode=review). That mismatch made HyperFrames output 30fps while the Engine resolved
 * a review RenderContext (1080x1920@60/16 samples) — FrameIndex, camera velocity, shutter
 * delta, grain, and motion blur were all computed for 60fps and then emitted at 30fps.
 */
const { project } = await loadProjectConfig(resolveProjectId());
const context = createRenderContext(project, 'draft');
execFileSync('npx', ['tsx', 'tools/prepare-sources.ts'], { stdio: 'inherit' });

const entry = 'compositions/.draft.render.html';
await mkdir('compositions', { recursive: true });
const reviewEntry = await readFile('index.html', 'utf8');
const draftEntry = reviewEntry
  .replace('data-resolution="portrait" data-render-mode="review" data-fps="60"', `data-resolution="portrait-draft" data-render-mode="draft" data-fps="${context.fps}"`)
  .replaceAll('width=1080, height=1920', `width=${context.width}, height=${context.height}`)
  .replaceAll('1080px', `${context.width}px`)
  .replaceAll('1920px', `${context.height}px`)
  .replace('data-width="1080" data-height="1920"', `data-width="${context.width}" data-height="${context.height}"`)
  .replaceAll('src="cache/', 'src="../cache/')
  .replace('src="dist/main.js"', 'src="../dist/main.js"');
await writeFile(entry, draftEntry);
await mkdir('renders/preview', { recursive: true });
try {
  execFileSync('npx', ['--yes', 'hyperframes@0.7.49', 'render', '--composition', entry, '--fps', String(context.fps), '--quality', 'draft', '--video-frame-format', 'png', '--output', 'renders/preview/draft.mp4'], { stdio: 'inherit' });
} finally {
  await rm(entry, { force: true });
}
console.log(`Rendered draft preview at ${context.width}x${context.height}@${context.fps} (mode=draft, blurSamples=${context.blurSamples}).`);
