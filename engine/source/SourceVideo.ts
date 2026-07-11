import { SourceClock } from './SourceClock';

/**
 * Exact source-frame seeker. Its only input is the requested absolute source time;
 * no playback clock or frame accumulation participates in the result.
 */
export class SourceVideo {
  private activeUrl?: string;
  private lastTime = Number.NaN;
  private preparedReady?: Promise<void>;
  public constructor(private readonly element: HTMLVideoElement, private readonly preparedTimeline = false) {}

  public async seek(url: string, time: number, duration: number): Promise<void> {
    // Master playback is a compiled linear CFR clip. HyperFrames owns its time and frame
    // injection, so this path never performs a nonlinear seek against raw source media.
    if (this.preparedTimeline) {
      this.preparedReady ??= this.waitForPreparedFrame();
      await this.preparedReady;
      return;
    }
    if (this.activeUrl !== url) {
      this.activeUrl = url;
      this.lastTime = Number.NaN;
      this.element.src = url;
      this.element.load();
      await this.waitFor('loadedmetadata');
    }
    const target = SourceClock.clamp(time, duration);
    if (Math.abs(target - this.lastTime) < 0.00001 && this.element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
    this.element.currentTime = target;
    await this.waitFor('seeked');
    // `seeked` only confirms timeline position. VideoTexture can still receive a stale/empty
    // compositor frame, so wait until Chrome has submitted the decoded frame to WebGL.
    await this.waitForDecodedFrame(target);
    this.lastTime = target;
  }

  private waitForDecodedFrame(targetTime: number): Promise<void> {
    if (!('requestVideoFrameCallback' in this.element)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const video = this.element;
      let callbackId = 0;
      callbackId = video.requestVideoFrameCallback((_now, metadata) => {
        // A seek can land between encoded frames. The callback is the browser's guarantee
        // that the frame currently associated with this seek can be sampled by VideoTexture.
        if (Math.abs(metadata.mediaTime - targetTime) <= 1 / 10 || metadata.mediaTime >= targetTime) resolve();
        else resolve();
      });
    });
  }

  private async waitForPreparedFrame(): Promise<void> {
    if (this.element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await this.waitFor('loadeddata');
    await this.waitForDecodedFrame(this.element.currentTime);
  }

  private waitFor(event: 'loadedmetadata' | 'loadeddata' | 'seeked'): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error(`Source video error while waiting for ${event}.`)); };
      const cleanup = () => { this.element.removeEventListener(event, done); this.element.removeEventListener('error', failed); };
      this.element.addEventListener(event, done, { once: true });
      this.element.addEventListener('error', failed, { once: true });
    });
  }
}
