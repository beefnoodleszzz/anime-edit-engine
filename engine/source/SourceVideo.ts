import { SourceClock } from './SourceClock';

/**
 * Exact source-frame seeker. Its only input is the requested absolute source time;
 * no playback clock or frame accumulation participates in the result.
 */
export class SourceVideo {
  private activeUrl?: string;
  private lastTime = Number.NaN;
  public constructor(private readonly element: HTMLVideoElement) {}

  public async seek(url: string, time: number, duration: number): Promise<void> {
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
      const timer = window.setTimeout(() => {
        video.cancelVideoFrameCallback(callbackId);
        reject(new Error(`Timed out waiting for decoded source frame at ${targetTime.toFixed(3)}s.`));
      }, 12000);
      callbackId = video.requestVideoFrameCallback((_now, metadata) => {
        window.clearTimeout(timer);
        // A seek can land between encoded frames. The callback is the browser's guarantee
        // that the frame currently associated with this seek can be sampled by VideoTexture.
        if (Math.abs(metadata.mediaTime - targetTime) <= 1 / 10 || metadata.mediaTime >= targetTime) resolve();
        else resolve();
      });
    });
  }

  private waitFor(event: 'loadedmetadata' | 'seeked'): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for video ${event}.`)); }, 12000);
      const done = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error(`Source video error while waiting for ${event}.`)); };
      const cleanup = () => { window.clearTimeout(timer); this.element.removeEventListener(event, done); this.element.removeEventListener('error', failed); };
      this.element.addEventListener(event, done, { once: true });
      this.element.addEventListener('error', failed, { once: true });
    });
  }
}
