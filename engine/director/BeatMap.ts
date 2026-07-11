export class BeatMap {
  public constructor(public readonly bpm: number, public readonly beats: readonly number[]) {}
  public nearest(time: number): number { return this.beats.reduce((best, beat) => Math.abs(beat - time) < Math.abs(best - time) ? beat : best, this.beats[0] ?? 0); }
  public isOnBeat(time: number, tolerance = 1 / 120): boolean { return Math.abs(this.nearest(time) - time) <= tolerance; }
}
