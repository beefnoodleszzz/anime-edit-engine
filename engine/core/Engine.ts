import type { ProjectConfig } from './ProjectLoader';
import type { RenderContext, RenderModeName } from '../types';
import { createRenderContext } from './RenderContext';
import { Director } from '../director/Director';
import { SourceVideo } from '../source/SourceVideo';
import { Compositor } from '../compositor/Compositor';

export class AnimeEditEngine {
  private readonly context: RenderContext;
  private readonly director;
  private readonly sourceVideo;
  private readonly compositor;
  public constructor(config: ProjectConfig, modeName: RenderModeName, canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    this.context = createRenderContext(config.project, modeName);
    this.director = new Director(config.project, config.timeline, this.context);
    this.sourceVideo = new SourceVideo(video, video.getAttribute('src')?.startsWith('cache/prepared/') ?? false);
    this.compositor = new Compositor(canvas, video, this.context);
  }
  public async renderFrame(time: number): Promise<void> {
    const frame = this.director.resolve(time);
    await this.sourceVideo.seek(frame.source.file, frame.sourceTime, frame.source.duration);
    this.compositor.render(frame, this.context);
  }
  public dispose(): void { this.compositor.dispose(); }
}
