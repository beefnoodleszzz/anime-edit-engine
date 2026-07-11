import type { AnimeEditEngine } from '../core/Engine';

declare global { interface Window { __animeEngineReady?: Promise<void>; __hfThreeTime?: number; } }

/** HyperFrames invokes this with absolute composition time for every output frame. */
export class HyperFramesAdapter {
  public constructor(private readonly engine: AnimeEditEngine) {}
  public install(): void {
    window.addEventListener('hf-seek', async (event: Event) => {
      const seek = event as CustomEvent<{ time: number }>;
      await this.engine.renderFrame(seek.detail.time);
    });
  }
}
