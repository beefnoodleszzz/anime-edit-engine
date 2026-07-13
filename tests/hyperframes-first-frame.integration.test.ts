import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { EditCamera } from '../engine/camera/EditCamera';
import { sourceUv } from './support/sourceUv';
import { findChromiumExecutable } from './support/chromium';

/**
 * This is the ONE test in this project that drives the real `npx hyperframes render` CLI end
 * to end, as opposed to tests/first-frame.test.ts, which calls `HyperFramesAdapter.renderGated()`
 * directly and only proves the browser-side Compositor/WebGL path. Nothing here reimplements or
 * bypasses HyperFrames: the composition entry (tests/fixtures/hf-cli-entry.ts) exposes no
 * test-only render hook, so every captured pixel is the product of the real chain:
 *
 *   npx hyperframes render
 *   -> HyperFrames runtime's "three" deterministic adapter
 *   -> injected per-frame <img class="__render_frame__"> siblings + texImage2D substitution
 *   -> synchronous `hf-seek` CustomEvent dispatch
 *   -> HyperFramesAdapter's real event listener (installed by tests/fixtures/hf-cli-entry.ts)
 *   -> AnimeEditEngine.renderFrame -> Director.resolve -> Compositor.render -> WebGL canvas
 *   -> HyperFrames' own screenshot/capture pipeline -> frame_NNNNNN.png on disk
 *
 * Two independently discovered, undocumented CLI behaviors (found by actually running it, not
 * by reading docs) shape this test's fixture layout:
 *   1. `hyperframes render --composition <path>` rejects any composition outside the project
 *      directory (the one containing hyperframes.json) — a system tmpdir cannot be used, unlike
 *      tests/first-frame.test.ts's puppeteer-driven harness. The fixture therefore lives under
 *      this repo at .hf-integration-fixture/ (gitignored, removed in afterAll).
 *   2. Every asset `src` (video, script) is resolved by HyperFrames against the PROJECT ROOT,
 *      not the composition file's own directory, regardless of nesting — the same convention
 *      tools/render-master.ts and tools/render-draft.ts already rely on (`src="cache/..."`,
 *      `src="dist/main.js"`, both project-root-relative).
 */
const projectRoot = process.cwd();
const fixtureRoot = '.hf-integration-fixture';
const chromePath = findChromiumExecutable();
const strict = process.env['REQUIRE_HYPERFRAMES_INTEGRATION'] === '1';
// findChromiumExecutable() checks the same ~/.cache/hyperframes/chrome location the CLI's own
// browser manager uses, so its result is also a reasonable proxy for "can npx hyperframes render
// actually launch a browser here". In strict mode we never skip on this signal — if it's wrong,
// the CLI invocation below fails for real and the suite reports a real failure, not a false skip.
const shouldRun = strict || Boolean(chromePath);

const html = (compositionId: string, videoSrc: string): string => `<!DOCTYPE html><html lang="en" data-resolution="fixture" data-render-mode="master" data-fps="4">
<head><meta charset="UTF-8"><meta name="viewport" content="width=64, height=64">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>* { box-sizing: border-box; } html, body { width: 64px; height: 64px; margin: 0; overflow: hidden; background: #000; } #root { position: relative; width: 64px; height: 64px; overflow: hidden; } #stage { position: absolute; inset: 0; width: 64px; height: 64px; display: block; } .prepared-source { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }</style>
</head>
<body>
<div data-hf-id="hf-root" id="root" data-composition-id="${compositionId}" data-start="0" data-duration="1" data-width="64" data-height="64">
  <video data-hf-id="hf-v1" id="source-s01" data-prepared-shot="s01" class="clip prepared-source" src="${videoSrc}" data-start="0" data-duration="1" data-track-index="0" muted playsinline preload="auto"></video>
  <canvas data-hf-id="hf-stage" id="stage" class="clip" data-start="0" data-duration="1" data-track-index="1" aria-label="fixture"></canvas>
</div>
<script>
  window.__timelines = window.__timelines || {};
  window.__timelines['${compositionId}'] = gsap.timeline({ paused: true });
</script>
<script type="module" src="${fixtureRoot}/dist/main.js"></script>
</body></html>`;

/** Real CLI invocation (not puppeteer-core): HyperFrames manages its own headless browser. */
const runHyperFramesRender = (compositionRelPath: string, outputRelPath: string): string => {
  const result = spawnSync('npx', ['--yes', 'hyperframes@0.7.49', 'render', '--composition', compositionRelPath, '--fps', '4', '--format', 'png-sequence', '--video-frame-format', 'png', '--output', outputRelPath], { cwd: projectRoot, encoding: 'utf8' });
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(`hyperframes render failed (exit ${result.status}):\n${combined}`);
  return combined;
};

const readCenterPixel = async (framePath: string): Promise<{ r: number; g: number; b: number; a: number }> => {
  const png = PNG.sync.read(await readFile(framePath));
  const offset = (32 * png.width + 32) * 4;
  return { r: png.data[offset]!, g: png.data[offset + 1]!, b: png.data[offset + 2]!, a: png.data[offset + 3]! };
};

describe.skipIf(!shouldRun)('Real HyperFrames CLI integration (npx hyperframes render, not a reimplementation)', () => {
  let colorCycleLog = '';

  beforeAll(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
    await mkdir(`${fixtureRoot}/dist`, { recursive: true });
    await mkdir(`${fixtureRoot}/color-cycle`, { recursive: true });
    await mkdir(`${fixtureRoot}/split-transform`, { recursive: true });

    await build({
      logLevel: 'silent',
      build: { outDir: `${fixtureRoot}/dist`, emptyOutDir: false, rollupOptions: { input: 'tests/fixtures/hf-cli-entry.ts', output: { entryFileNames: 'main.js' } } },
    });

    // Fixture A: 4 frames, each a distinct solid full-frame color (red/green/blue/yellow) at
    // 0/0.25/0.5/0.75s. The composition entry never seeks or plays the <video> itself — if a
    // captured output frame's color didn't match its real capture time, that would mean either
    // hf-seek fired with the wrong time, or the texture upload used a stale/native-decoded frame
    // instead of HyperFrames' injected one. This is Method C (pixel-based) from the review: a
    // fixture engineered so injection failure is visible, not just "canvas isn't black".
    const colorFrameColors: Array<[number, number, number]> = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
    for (let index = 0; index < colorFrameColors.length; index += 1) {
      const png = new PNG({ width: 64, height: 64 });
      const [r, g, b] = colorFrameColors[index]!;
      for (let pixel = 0; pixel < 64 * 64; pixel += 1) { png.data[pixel * 4] = r; png.data[pixel * 4 + 1] = g; png.data[pixel * 4 + 2] = b; png.data[pixel * 4 + 3] = 255; }
      await writeFile(`${fixtureRoot}/color-cycle/frame_${String(index).padStart(6, '0')}.png`, PNG.sync.write(png));
    }
    spawnSync('ffmpeg', ['-y', '-framerate', '4', '-start_number', '0', '-i', `${fixtureRoot}/color-cycle/frame_%06d.png`, '-frames:v', '4', '-pix_fmt', 'yuv420p', '-vsync', 'cfr', `${fixtureRoot}/color-cycle/fixture.mp4`], { cwd: projectRoot });
    await writeFile(`${fixtureRoot}/color-cycle/index.html`, html('hf-color-cycle-fixture', `${fixtureRoot}/color-cycle/fixture.mp4`));

    // Fixture B: the same left-red/right-blue split used by tests/first-frame.test.ts, proving
    // (through the real CLI this time, not a direct renderGated() call) that the captured canvas
    // reflects the camera transform applied on top of the source, not a raw pass-through.
    spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=32x64:d=1:r=4', '-f', 'lavfi', '-i', 'color=c=blue:s=32x64:d=1:r=4', '-filter_complex', 'hstack=inputs=2', '-frames:v', '4', '-pix_fmt', 'yuv420p', `${fixtureRoot}/split-transform/fixture.mp4`], { cwd: projectRoot });
    await writeFile(`${fixtureRoot}/split-transform/index.html`, html('hf-split-transform-fixture', `${fixtureRoot}/split-transform/fixture.mp4`));

    colorCycleLog = runHyperFramesRender(`${fixtureRoot}/color-cycle/index.html`, `${fixtureRoot}/color-cycle/frames`);
    runHyperFramesRender(`${fixtureRoot}/split-transform/index.html`, `${fixtureRoot}/split-transform/frames`);
  }, 120000);

  afterAll(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('captures 4 output frames, each matching its own real capture time, not a stale or native-decoded frame (real injected-frame substitution)', async () => {
    // +/-6 tolerance: the fixture round-trips through yuv420p chroma subsampling and H.264
    // encoding (like every other prepared source in this pipeline — see docs/color-fidelity.md),
    // which perturbs saturated RGB by a few levels even for a flat-color frame. The tolerance is
    // two orders of magnitude tighter than the ~255-level jump a wrong/stale frame would produce.
    const expected: Array<[number, number, number]> = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
    for (let index = 0; index < expected.length; index += 1) {
      const [r, g, b] = expected[index]!;
      const pixel = await readCenterPixel(`${fixtureRoot}/color-cycle/frames/frame_${String(index + 1).padStart(6, '0')}.png`);
      expect(pixel.r).toBeCloseTo(r, -1); // toBeCloseTo(x, -1) => |actual - x| < 5
      expect(pixel.g).toBeCloseTo(g, -1);
      expect(pixel.b).toBeCloseTo(b, -1);
      expect(pixel.a).toBe(255);
    }
  });

  it('the real HyperFrames CLI dispatched hf-seek at every distinct output time, in order: hf-seek received < render started < render completed (parsed from relayed browser console output, not fabricated)', () => {
    const lines = colorCycleLog.split('\n').filter((line) => line.includes('[anime-edit-diagnostic]'));
    expect(lines.length).toBeGreaterThan(0);
    const events = lines.map((line) => {
      const match = line.match(/\[anime-edit-diagnostic\] (hf-seek received|render started|render completed) time=([\d.]+)/);
      if (!match) throw new Error(`Unparseable diagnostic line: ${line}`);
      return { stage: match[1]!, time: Number(match[2]) };
    });
    // The very first render is the composition entry's own cold-start paint (see
    // tests/fixtures/hf-cli-entry.ts / engine/main.ts), which runs before HyperFrames dispatches
    // its first real hf-seek and so has no preceding "hf-seek received" — expected and ignored
    // here. Every OTHER render must be directly preceded by the hf-seek that triggered it.
    const observedTimes = new Set<number>();
    for (let index = 0; index < events.length; index += 1) {
      if (events[index]!.stage !== 'hf-seek received') continue;
      const received = events[index]!; const started = events[index + 1]; const completed = events[index + 2];
      if (!started || !completed) throw new Error(`Truncated event sequence after hf-seek received time=${received.time}`);
      expect(started.stage).toBe('render started');
      expect(completed.stage).toBe('render completed');
      expect(started.time).toBe(received.time);
      expect(completed.time).toBe(received.time);
      observedTimes.add(received.time);
    }
    expect([...observedTimes].sort((a, b) => a - b)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it('frame 0 (progress=0, an exact camera keyframe) reflects the camera transform, not a raw pass-through of the source', async () => {
    // FACE_CROSS_LEFT at progress=0 is exact: scale=1.14, x=-0.13, pivot=(0.5,0.5). Canvas
    // center samples uv=pivot, so rotation/scale cancel and the sampled source UV x is exactly
    // 0.5 + x = 0.37 — inside the fixture's red (left) half. A raw pass-through would show a
    // mixed red/blue seam at the canvas center instead.
    const transform = new EditCamera().resolve('FACE_CROSS_LEFT', 0);
    const [sampleX] = sourceUv([0.5, 0.5], { transform, sourceWidth: 64, sourceHeight: 64, outputWidth: 64, outputHeight: 64 });
    expect(sampleX).toBeLessThan(0.5);
    const pixel = await readCenterPixel(`${fixtureRoot}/split-transform/frames/frame_000001.png`);
    expect(pixel.r).toBeGreaterThan(150);
    expect(pixel.b).toBeLessThan(100);
  });

  it('frame 3 (progress=0.75, past the FACE_CROSS_LEFT x=0 crossover) samples the opposite half, proving the transform tracks time', async () => {
    const transform = new EditCamera().resolve('FACE_CROSS_LEFT', 0.75);
    const [sampleX] = sourceUv([0.5, 0.5], { transform, sourceWidth: 64, sourceHeight: 64, outputWidth: 64, outputHeight: 64 });
    expect(sampleX).toBeGreaterThan(0.5);
    const pixel = await readCenterPixel(`${fixtureRoot}/split-transform/frames/frame_000004.png`);
    expect(pixel.b).toBeGreaterThan(150);
    expect(pixel.r).toBeLessThan(100);
  });
});

if (!shouldRun) {
  // eslint-disable-next-line no-console
  console.warn('[hyperframes-first-frame.integration.test.ts] No headless Chromium found and REQUIRE_HYPERFRAMES_INTEGRATION is not set — real HyperFrames CLI integration suite skipped. Run with REQUIRE_HYPERFRAMES_INTEGRATION=1 (npm run test:integration) to force a hard failure instead of a skip.');
}
