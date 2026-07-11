export class RenderClock {
  public constructor(public readonly fps: number) {
    if (!Number.isInteger(fps) || fps < 1 || fps > 240) throw new Error(`Invalid fps: ${fps}`);
  }
  public frameAt(time: number): number { return Math.max(0, Math.round(time * this.fps)); }
  public timeAt(frame: number): number { return frame / this.fps; }
  public delta(): number { return 1 / this.fps; }
}
