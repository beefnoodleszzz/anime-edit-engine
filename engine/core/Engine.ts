import type { ProjectConfig } from './ProjectLoader';
import type { RenderContext, RenderModeName } from '../types';
import { createRenderContext } from './RenderContext';
import { Director } from '../director/Director';
import { Compositor } from '../compositor/Compositor';

export class AnimeEditEngine {
  private readonly context: RenderContext;
  private readonly director;
  private readonly compositor;
  public constructor(config: ProjectConfig, modeName: RenderModeName, canvas: HTMLCanvasElement, preparedVideos: ReadonlyMap<string, HTMLVideoElement>) {
    this.context = createRenderContext(config.project, modeName);
    this.director = new Director(config.project, config.timeline, this.context);
    this.compositor = new Compositor(canvas, preparedVideos, this.context);
  }
  public renderFrame(time: number): void {
    const frame = this.director.resolve(time);
    this.compositor.render(frame, this.context);
  }
  public dispose(): void { this.compositor.dispose(); }
}
