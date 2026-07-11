import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFile as readFileCb } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import type { Browser, Page } from 'puppeteer-core';
import { PNG } from 'pngjs';
import { analyzePngPixels } from '../engine/core/PngPixels';
import { findChromiumExecutable } from './support/chromium';

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mp4': 'video/mp4' };

/** Module scripts and <video src> both hit CORS/opaque-origin restrictions under file://; serve over real HTTP instead. */
const serveDirectory = (root: string): Promise<{ server: Server; origin: string }> => new Promise((resolve) => {
  const server = createServer((request, response) => {
    const path = join(root, decodeURIComponent((request.url ?? '/').split('?')[0]!));
    readFileCb(path, (error, data) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
      response.end(data);
    });
  });
  server.listen(0, '127.0.0.1', () => { const address = server.address(); const port = typeof address === 'object' && address ? address.port : 0; resolve({ server, origin: `http://127.0.0.1:${port}` }); });
});

/**
 * Real browser regression for "is frame 0 actually rendered before capture". This drives the
 * production Compositor + HyperFramesAdapter (not a reimplementation) inside a real headless
 * Chromium: a tiny synthetic CFR fixture video is decoded by the real <video> element, the real
 * `hf-seek` -> `HyperFramesAdapter.renderGated` -> `Engine.renderFrame` -> `Compositor.render`
 * -> WebGL path runs, and the canvas is read back as real PNG pixels (via pngjs), not a
 * hand-written byte array and not a PNG-file-is-nonzero-bytes proxy.
 */
const chromePath = findChromiumExecutable();

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

describe.skipIf(!chromePath)('First-frame render contract (real headless Chromium)', () => {
  let workdir: string;
  let browser: Browser;
  let page: Page;
  let server: Server;

  beforeAll(async () => {
    if (!chromePath) return;
    workdir = await mkdtemp(join(tmpdir(), 'anime-edit-first-frame-'));

    // A 64x64, 4fps, 4-frame CFR fixture: left half red, right half blue. Small enough to
    // decode and assert on in milliseconds, real enough to prove the WebGL path end to end.
    const fixtureVideo = join(workdir, 'fixture.mp4');
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=32x64:d=1:r=4', '-f', 'lavfi', '-i', 'color=c=blue:s=32x64:d=1:r=4', '-filter_complex', 'hstack=inputs=2', '-frames:v', '4', '-pix_fmt', 'yuv420p', fixtureVideo], { stdio: 'ignore' });

    await build({
      logLevel: 'silent',
      build: { outDir: workdir, emptyOutDir: false, rollupOptions: { input: join(import.meta.dirname, 'fixtures/first-frame-harness.ts'), output: { entryFileNames: 'harness.js' } } },
    });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
      <video id="source-s01" class="clip" src="/fixture.mp4" data-start="0" muted playsinline preload="auto"></video>
      <canvas id="stage" width="64" height="64"></canvas>
      <script type="module" src="/harness.js"></script>
    </body></html>`;
    await writeFile(join(workdir, 'harness.html'), html);

    const served = await serveDirectory(workdir);
    server = served.server;

    const puppeteer = await import('puppeteer-core');
    browser = await puppeteer.launch({
      executablePath: chromePath, headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required'],
    });
    page = await browser.newPage();
    page.on('pageerror', (error) => { throw error; });
    await page.goto(`${served.origin}/harness.html`);
    await page.waitForFunction(() => window.__harnessReady === true || window.__harnessError !== undefined, { timeout: 15000 });
    const harnessError = await page.evaluate(() => window.__harnessError);
    if (harnessError) throw new Error(`Harness failed to initialize: ${harnessError}`);
    await page.evaluate(() => new Promise<void>((resolve) => {
      const video = document.querySelector('video')!;
      if (video.readyState >= 2) { resolve(); return; }
      video.addEventListener('loadeddata', () => resolve(), { once: true });
    }));
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((resolve) => server ? server.close(resolve) : resolve(undefined));
    if (workdir) await rm(workdir, { recursive: true, force: true });
  });

  const readCanvasPng = async (): Promise<Buffer> => {
    const dataUrl = await page.evaluate(() => document.querySelector('canvas')!.toDataURL('image/png'));
    return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  };

  it('is fully black before any render call', async () => {
    const analysis = analyzePngPixels(await readCanvasPng(), sha256);
    expect(analysis.nonBlackPixelRatio).toBe(0);
  });

  it('renders frame 0 through the real hf-seek -> renderGated -> Compositor path, wired to the THREE.DefaultLoadingManager readiness gate', async () => {
    const gateEvents = await page.evaluate(() => new Promise<{ started: boolean; loaded: boolean }>((resolve) => {
      const manager = window.THREE!.DefaultLoadingManager;
      const events = { started: false, loaded: false };
      const previousOnStart = manager.onStart; const previousOnLoad = manager.onLoad;
      manager.onStart = (...args) => { events.started = true; previousOnStart?.(...args); };
      manager.onLoad = () => { events.loaded = true; previousOnLoad?.(); };
      window.__harnessRenderGated!(0);
      manager.onStart = previousOnStart; manager.onLoad = previousOnLoad;
      resolve(events);
    }));
    expect(gateEvents).toEqual({ started: true, loaded: true });

    const analysis = analyzePngPixels(await readCanvasPng(), sha256);
    // Non-black, opaque (alpha:false context), with real spatial variance — not a flat clear color.
    expect(analysis.nonBlackPixelRatio).toBeGreaterThan(0.9);
    expect(analysis.alphaCoverage).toBeCloseTo(1, 5);
    expect(analysis.luminanceVariance).toBeGreaterThan(0);
  });

  it('frame 0 reflects the camera transform applied on top of the source, not a pass-through of the raw video', async () => {
    // FACE_CROSS_LEFT at progress=0 is exact (zero blur, single sample): scale=1.32, x=-0.13,
    // pivot=(0.5,0.5). Since the canvas center samples uv=pivot, rotation/scale cancel out and
    // the sampled source UV is exactly (0.5 + x, 0.5) = (0.37, 0.5) — inside the fixture's red
    // (left) half. A pass-through render of the raw video would show a mixed red/blue seam
    // exactly at the canvas center instead.
    await page.evaluate(() => window.__harnessRenderGated!(0));
    const png = PNG.sync.read(await readCanvasPng());
    const centerOffset = (32 * png.width + 32) * 4;
    const [r, , b] = [png.data[centerOffset]!, png.data[centerOffset + 1]!, png.data[centerOffset + 2]!];
    expect(r).toBeGreaterThan(150);
    expect(b).toBeLessThan(100);
  });

  it('frame at progress=1 samples the opposite (blue) half, proving the transform tracks time, not a fixed offset', async () => {
    // FACE_CROSS_LEFT at progress=1 is also exact: x=+0.04 -> sample UV=(0.54, 0.5), blue half.
    await page.evaluate(() => window.__harnessRenderGated!(40));
    const png = PNG.sync.read(await readCanvasPng());
    const centerOffset = (32 * png.width + 32) * 4;
    const [r, , b] = [png.data[centerOffset]!, png.data[centerOffset + 1]!, png.data[centerOffset + 2]!];
    expect(b).toBeGreaterThan(150);
    expect(r).toBeLessThan(100);
  });

  it('is deterministic: repeated renders of frame 0 hash identically', async () => {
    await page.evaluate(() => window.__harnessRenderGated!(0));
    const first = analyzePngPixels(await readCanvasPng(), sha256).pixelHash;
    await page.evaluate(() => window.__harnessRenderGated!(0));
    const second = analyzePngPixels(await readCanvasPng(), sha256).pixelHash;
    expect(second).toBe(first);
  });
});

if (!chromePath) {
  // eslint-disable-next-line no-console
  console.warn('[first-frame.test.ts] No headless Chromium found (checked CHROME_PATH, ~/.cache/puppeteer, ~/.cache/hyperframes, ~/Library/Caches/ms-playwright, /Applications). Real browser first-frame suite skipped.');
}
