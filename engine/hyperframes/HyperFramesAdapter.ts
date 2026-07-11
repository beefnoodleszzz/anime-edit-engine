import * as THREE from 'three';
import type { AnimeEditEngine } from '../core/Engine';

declare global { interface Window { __hfThreeTime?: number; THREE?: typeof THREE; } }

/**
 * HyperFrames 0.7.49 real capture lifecycle, verified by reading the shipped runtime
 * (`node_modules/hyperframes/dist/hyperframe-runtime.js`) and CLI capture pipeline
 * (`node_modules/hyperframes/dist/cli.js`) — no public docs describe this, so the call chain
 * is recorded here:
 *
 *  1. Before capturing an output frame, the CLI injects a deterministic still image as the
 *     next sibling of every `video[data-start]` element:
 *     `<img class="__render_frame__" id="__render_frame_<videoId>__">`
 *     (cli.js: `injectRenderFrameSiblings` / the per-frame image-source updater). It waits for
 *     that image to finish loading before the frame is captured.
 *  2. The runtime monkeypatches `WebGLRenderingContext`/`WebGL2RenderingContext`
 *     `texImage2D`/`texSubImage2D` and `GPUQueue.copyExternalImageToTexture`
 *     (hyperframe-runtime.js: functions `to()`, `no()`, `io()`) so that any texture upload whose
 *     source is one of those `<video>` elements is transparently redirected to the injected,
 *     already-loaded still image. This — not native video decode/seek timing — is what makes a
 *     GPU texture upload from a `<video>` element frame-exact during capture. Our Compositor
 *     uploads via `THREE.VideoTexture` -> `texImage2D`/`texSubImage2D`, so it is covered by this
 *     substitution automatically; it must keep reading from the live `<video>` element (the
 *     Injector's real frame source is spliced in beneath that same call), not some parallel copy.
 *  3. HyperFrames' "three" deterministic adapter (`Kr()` in hyperframe-runtime.js) sets
 *     `window.__hfThreeTime` and dispatches `hf-seek` SYNCHRONOUSLY via
 *     `window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time } }))`. `dispatchEvent`
 *     for a `CustomEvent` calls listeners synchronously and does not return until they finish, so
 *     a listener that renders synchronously has fully completed before the dispatch call returns
 *     — no `await` boundary exists to miss.
 *  4. Capture readiness is the global flag `window.__renderReady`, computed by polling every
 *     deterministic adapter's `getReadyPromise()` (hyperframe-runtime.js: `Al()`/`El()`), and it
 *     is exactly what the CLI capture loop polls before taking a screenshot
 *     (cli.js: `compositionRuntimeReadyInBrowser` reads `Reflect.get(window, "__renderReady")`).
 *     The "three" adapter's own `getReadyPromise()` is gated on `window.THREE.DefaultLoadingManager`
 *     (`itemsTotal <= itemsLoaded`). That LoadingManager gate is the one officially awaitable hook
 *     HyperFrames exposes for a Three.js-driven engine, and it is already wired into the CLI's
 *     capture poll — so we drive it directly instead of publishing an unconsumed ad-hoc promise.
 */
export class HyperFramesAdapter {
  private static readonly LOADING_KEY = 'anime-edit-engine-frame';

  public constructor(private readonly engine: AnimeEditEngine) {
    // Exposes the exact Three.js module instance this engine renders with, so HyperFrames'
    // "three" adapter observes the same THREE.DefaultLoadingManager singleton we drive below.
    window.THREE = THREE;
  }

  public install(): void {
    window.addEventListener('hf-seek', (event: Event) => {
      const seek = event as CustomEvent<{ time: number }>;
      this.renderGated(seek.detail.time);
    });
  }

  /**
   * Renders one frame while holding HyperFrames' `window.__renderReady` gate low for the
   * duration. The render call is synchronous today, so the gate opens again before control
   * returns to the caller; if the render path ever grows a real async dependency, this is the
   * seam where itemStart/itemEnd should bracket the async work instead of this whole call.
   */
  public renderGated(time: number): void {
    const manager = THREE.DefaultLoadingManager;
    manager.itemStart(HyperFramesAdapter.LOADING_KEY);
    try {
      this.engine.renderFrame(time);
    } finally {
      manager.itemEnd(HyperFramesAdapter.LOADING_KEY);
    }
  }
}
