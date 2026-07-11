import type { ProjectConfig } from './ProjectLoader';
import type { RenderModeName } from '../types';
import { Director } from '../director/Director';
import { SourceVideo } from '../source/SourceVideo';
import { Compositor } from '../compositor/Compositor';

export class AnimeEditEngine {
  private readonly mode;
  private readonly director;
  private readonly sourceVideo;
  private readonly compositor;
  public constructor(config: ProjectConfig, modeName: RenderModeName, canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    this.mode = config.project.renderModes[modeName];
    this.director = new Director(config.project, config.timeline, this.mode.fps);
    this.sourceVideo = new SourceVideo(video);
    this.compositor = new Compositor(canvas, video, this.mode);
  }
  public async renderFrame(time: number): Promise<void> {
    const frame = this.director.resolve(time);
    await this.sourceVideo.seek(frame.source.file, frame.sourceTime, frame.source.duration);
    this.compositor.render(frame, this.mode);
  }
  public dispose(): void { this.compositor.dispose(); }
}
