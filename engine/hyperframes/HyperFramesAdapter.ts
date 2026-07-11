import type { AnimeEditEngine } from '../core/Engine';

declare global { interface Window { __animeEngineReady?: Promise<void>; __hfThreeTime?: number; } }

/** HyperFrames invokes this with absolute composition time for every output frame. */
export class HyperFramesAdapter {
  private pending: Promise<void> = Promise.resolve();
  public constructor(private readonly engine: AnimeEditEngine) {}
  public install(): void {
    window.addEventListener('hf-seek', (event: Event) => {
      const seek = event as CustomEvent<{ time: number }>;
      // HyperFrames may dispatch its initial seek while media and WebGL are still becoming
      // ready. Keep a single ordered readiness chain instead of racing seek callbacks or
      // using a delay; consumers can await __animeEngineReady before capturing a frame.
      this.pending = this.pending.then(() => this.engine.renderFrame(seek.detail.time));
      window.__animeEngineReady = this.pending;
    });
  }
}
