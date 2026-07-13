import type { ProjectManifest, TimelineManifest, TimelineShot } from '../types';

export interface ProjectConfig { project: ProjectManifest; timeline: TimelineManifest; }

const MIN_OCCLUSION_COVERAGE = 0.8;

export class ProjectLoader {
  public static validate(config: ProjectConfig): ProjectConfig {
    const { project, timeline } = config;
    if (project.duration <= 0 || !Number.isFinite(project.duration)) throw new Error('Project duration must be positive.');
    if (timeline.shots.length === 0) throw new Error('Timeline requires at least one shot.');
    this.validateAudio(project);
    const sourceIds = new Set(project.sources.map((source) => source.id));
    const maxBlurSamples = Math.max(...Object.values(project.renderModes).map((mode) => mode.blurSamples));
    const epsilon = 0.000001; let previousEnd = 0; let previousId = 'start';
    for (const shot of timeline.shots) {
      const source = project.sources.find((candidate) => candidate.id === shot.source);
      if (!sourceIds.has(shot.source) || !source) throw new Error(`Unknown source: ${shot.source}`);
      if (Math.abs(shot.start - previousEnd) > epsilon || shot.end <= shot.start) throw new Error(`Timeline is not contiguous: previous=${previousId}, current=${shot.id}, expected=${previousEnd}, actual=${shot.start}, difference=${Math.abs(shot.start - previousEnd)}, epsilon=${epsilon}.`);
      const range = source.heroRanges[shot.rangeIndex];
      if (!range || range.start < 0 || range.end > source.duration || range.end <= range.start) throw new Error(`Invalid hero range for ${shot.id}.`);
      this.validateBlurOverride(shot, maxBlurSamples);
      this.validatePostFXOverride(shot);
      this.validateSyncMap(shot, range.start, range.end);
      previousEnd = shot.end; previousId = shot.id;
    }
    if (Math.abs(previousEnd - project.duration) > 0.0001) throw new Error('Timeline must end at project duration.');
    this.validateTransitions(project, timeline);
    return config;
  }

  private static validateAudio(project: ProjectManifest): void {
    const tracks = [project.audio?.music, ...(project.audio?.voice ?? []), ...(project.audio?.sfx ?? [])].filter(Boolean);
    for (const track of tracks) {
      if (!track?.file) throw new Error('Audio track file is required.');
      if (track.start !== undefined && (!Number.isFinite(track.start) || track.start < 0)) throw new Error(`Audio track start is invalid: ${track.start}.`);
      if (track.volume !== undefined && (!Number.isFinite(track.volume) || track.volume < 0)) throw new Error(`Audio track volume is invalid: ${track.volume}.`);
      for (const [name, value] of Object.entries({ trimStart: track.trimStart, duration: track.duration, gainDb: track.gainDb, fadeIn: track.fadeIn, fadeOut: track.fadeOut, duckMusicDb: track.duckMusicDb })) {
        if (value !== undefined && (!Number.isFinite(value) || (['trimStart', 'duration', 'fadeIn', 'fadeOut', 'duckMusicDb'].includes(name) && value < 0))) throw new Error(`Audio track ${name} is invalid: ${value}.`);
      }
    }
    if (project.audio?.masterGainDb !== undefined && !Number.isFinite(project.audio.masterGainDb)) throw new Error(`Audio masterGainDb is invalid: ${project.audio.masterGainDb}.`);
  }

  /** maxSamples is checked against the highest blurSamples ceiling across all render modes (not just the mode being rendered right now) so a shot's override is valid regardless of which mode later renders it. */
  private static validateBlurOverride(shot: TimelineShot, maxBlurSamples: number): void {
    const blur = shot.blur;
    if (!blur) return;
    if (blur.scale !== undefined && (blur.scale < 0 || blur.scale > 1)) throw new Error(`Invalid blur.scale for ${shot.id}: ${blur.scale} (must be within [0, 1]).`);
    if (blur.maxSamples !== undefined && (blur.maxSamples < 1 || blur.maxSamples > maxBlurSamples)) throw new Error(`Invalid blur.maxSamples for ${shot.id}: ${blur.maxSamples} (must be within [1, ${maxBlurSamples}]).`);
    if (blur.edgeFade !== undefined && (blur.edgeFade < 0 || blur.edgeFade >= 0.5)) throw new Error(`Invalid blur.edgeFade for ${shot.id}: ${blur.edgeFade} (must be within [0, 0.5)).`);
    if (blur.maxShutterSeconds !== undefined && blur.maxShutterSeconds < 0) throw new Error(`Invalid blur.maxShutterSeconds for ${shot.id}: ${blur.maxShutterSeconds} (must be >= 0).`);
  }

  private static validatePostFXOverride(shot: TimelineShot): void {
    for (const [name, value] of Object.entries(shot.postFX ?? {})) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`Invalid shot postFX ${name} for ${shot.id}: ${value}.`);
    }
  }

  private static validateSyncMap(shot: TimelineShot, rangeStart: number, rangeEnd: number): void {
    const syncPoints = shot.syncPoints ?? [];
    let previousOutput = -Infinity;
    let previousSource = -Infinity;
    for (const point of syncPoints) {
      if (!Number.isFinite(point.outputTime) || point.outputTime < shot.start || point.outputTime > shot.end) throw new Error(`Invalid sync point outputTime for ${shot.id}: ${point.outputTime}.`);
      if (!Number.isFinite(point.sourceTime) || point.sourceTime < rangeStart || point.sourceTime > rangeEnd) throw new Error(`Invalid sync point sourceTime for ${shot.id}: ${point.sourceTime}.`);
      if (point.outputTime < previousOutput || point.sourceTime < previousSource) throw new Error(`Sync points must be monotonic for ${shot.id}.`);
      previousOutput = point.outputTime; previousSource = point.sourceTime;
    }
    let previousMapOutput = -Infinity;
    let previousMapSource = -Infinity;
    for (const point of shot.timeMap ?? []) {
      if (!Number.isFinite(point.outputProgress) || point.outputProgress < 0 || point.outputProgress > 1 || !Number.isFinite(point.sourceProgress) || point.sourceProgress < 0 || point.sourceProgress > 1) throw new Error(`Invalid timeMap point for ${shot.id}.`);
      if (point.outputProgress < previousMapOutput || point.sourceProgress < previousMapSource) throw new Error(`timeMap must be monotonic for ${shot.id}.`);
      previousMapOutput = point.outputProgress; previousMapSource = point.sourceProgress;
    }
  }

  /**
   * FOREGROUND_OCCLUSION_WIPE must be validated from both sides independently (a shot's own
   * transitionIn, not only derived from the previous shot's transitionOut), the two sides must
   * be paired (an outgoing wipe with no matching incoming wipe on the next shot is a broken
   * transition, not a valid one-sided effect), and — when both sides declare a wipe direction —
   * the directions must agree, or the wipe visually reverses mid-cut.
   */
  private static validateTransitions(project: ProjectManifest, timeline: TimelineManifest): void {
    const sourceOf = (shot: TimelineShot) => project.sources.find((candidate) => candidate.id === shot.source)!;
    const coverageOf = (shot: TimelineShot) => sourceOf(shot).transitionMetadata?.estimatedCoveragePeak ?? 0;
    const directionOf = (shot: TimelineShot) => sourceOf(shot).transitionMetadata?.direction;

    for (let index = 0; index < timeline.shots.length; index += 1) {
      const shot = timeline.shots[index]!;
      const next = timeline.shots[index + 1];
      const previous = timeline.shots[index - 1];

      if (shot.transitionOut === 'FOREGROUND_OCCLUSION_WIPE') {
        if (coverageOf(shot) < MIN_OCCLUSION_COVERAGE) throw new Error(`Outgoing occlusion coverage is insufficient for ${shot.id}: ${coverageOf(shot)} < ${MIN_OCCLUSION_COVERAGE}.`);
        if (!next || next.transitionIn !== 'FOREGROUND_OCCLUSION_WIPE') throw new Error(`Outgoing FOREGROUND_OCCLUSION_WIPE on ${shot.id} has no paired transitionIn on the following shot (${next?.id ?? 'none'}).`);
      }
      if (shot.transitionIn === 'FOREGROUND_OCCLUSION_WIPE') {
        if (coverageOf(shot) < MIN_OCCLUSION_COVERAGE) throw new Error(`Incoming occlusion coverage is insufficient for ${shot.id}: ${coverageOf(shot)} < ${MIN_OCCLUSION_COVERAGE}.`);
        if (!previous || previous.transitionOut !== 'FOREGROUND_OCCLUSION_WIPE') throw new Error(`Incoming FOREGROUND_OCCLUSION_WIPE on ${shot.id} has no paired transitionOut on the previous shot (${previous?.id ?? 'none'}).`);
        const outgoingDirection = previous ? directionOf(previous) : undefined;
        const incomingDirection = directionOf(shot);
        if (outgoingDirection && incomingDirection && outgoingDirection !== incomingDirection) throw new Error(`FOREGROUND_OCCLUSION_WIPE direction mismatch between ${previous!.id} (${outgoingDirection}) and ${shot.id} (${incomingDirection}).`);
      }
    }
  }
}
