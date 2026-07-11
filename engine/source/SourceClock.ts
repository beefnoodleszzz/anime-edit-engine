/** Converts a normalized local edit time to an absolute source timestamp. */
export class SourceClock {
  public static clamp(time: number, duration: number): number { return Math.max(0, Math.min(duration - 0.00001, time)); }
  public static quantize(time: number, fps: number): number { return Math.round(time * fps) / fps; }
}
