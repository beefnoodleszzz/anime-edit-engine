import type { TimelineShot } from '../types';

export class ShotTimeline {
  public constructor(public readonly shots: readonly TimelineShot[]) {}
  public resolve(time: number): TimelineShot {
    const shot = this.shots.find((candidate) => time >= candidate.start && time < candidate.end) ?? this.shots.at(-1);
    if (!shot) throw new Error('No shot available.');
    return shot;
  }
  public localTime(shot: TimelineShot, time: number): number { return Math.min(shot.end - shot.start, Math.max(0, time - shot.start)); }
  public progress(shot: TimelineShot, time: number): number { return this.localTime(shot, time) / (shot.end - shot.start); }
}
