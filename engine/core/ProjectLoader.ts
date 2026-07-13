import type { ProjectManifest, TimelineManifest, TimelineShot, QualityConfig, QcRegion, AudioTrack } from '../types';

export interface ProjectConfig { project: ProjectManifest; timeline: TimelineManifest; }

const MIN_OCCLUSION_COVERAGE = 0.8;

export class ProjectLoader {
  public static validate(config: ProjectConfig): ProjectConfig {
    const { project, timeline } = config;
    if (project.duration <= 0 || !Number.isFinite(project.duration)) throw new Error('Project duration must be positive.');
    if (timeline.shots.length === 0) throw new Error('Timeline requires at least one shot.');
    this.validateImages(project);
    this.validateAudioEvents(timeline);
    if (project.qualityProfile !== undefined && !['legacy', 'cinematic', 'anime-ultra-clear', 'anime-impact', 'custom'].includes(project.qualityProfile)) throw new Error(`Invalid qualityProfile: ${project.qualityProfile}.`);
    this.validateQuality(project.quality);
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
      this.validateBlurWindows(project, shot, maxBlurSamples);
      this.validateInterpolation(shot);
      this.validateCamera(shot);
      this.validatePostFXOverride(shot);
      this.validateSyncMap(timeline, shot, source, range.start, range.end);
      previousEnd = shot.end; previousId = shot.id;
    }
    if (Math.abs(previousEnd - project.duration) > 0.0001) throw new Error('Timeline must end at project duration.');
    this.validateTransitions(project, timeline);
    return config;
  }

  private static validateAudio(project: ProjectManifest): void {
    const tracks = this.audioTracks(project);
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

  private static audioTracks(project: ProjectManifest): AudioTrack[] {
    return [
      ...(project.audio?.tracks ?? []), project.audio?.music, ...(project.audio?.voice ?? []), ...(project.audio?.sfx ?? []),
    ].filter((track): track is AudioTrack => Boolean(track));
  }

  private static validateImages(project: ProjectManifest): void {
    const ids = new Set<string>();
    const validateRegion = (region: QcRegion): void => {
      if (!region.id || [region.x, region.y, region.width, region.height].some((value) => !Number.isFinite(value))) throw new Error(`Invalid QC region ${region.id}.`);
      if (region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1 || region.y + region.height > 1) throw new Error(`QC region ${region.id} must fit within normalized [0, 1] bounds.`);
    };
    for (const region of project.qcRegions ?? []) validateRegion(region);
    for (const image of [...(project.images ?? []), ...(project.imageAssets ?? []), ...(project.firstFrames ?? [])]) {
      if (ids.has(image.id)) throw new Error(`Duplicate image asset id: ${image.id}.`);
      ids.add(image.id);
      if (!image.file || !['concept', 'production'].includes(image.usage)) throw new Error(`Image asset ${image.id} needs a valid file and usage.`);
      for (const region of image.qcRegions ?? []) validateRegion(region);
    }
  }

  private static validateAudioEvents(timeline: TimelineManifest): void {
    const ids = new Set<string>();
    for (const event of timeline.audioEvents ?? []) {
      if (ids.has(event.id)) throw new Error(`Duplicate audio event id: ${event.id}.`);
      ids.add(event.id);
      if (!event.id || !Number.isFinite(event.time) || event.time < 0 || !['automatic', 'manual'].includes(event.source)) throw new Error(`Invalid audio event: ${event.id}.`);
      if (event.strength !== undefined && (!Number.isFinite(event.strength) || event.strength < 0 || event.strength > 1)) throw new Error(`Invalid audio event strength: ${event.id}.`);
    }
  }

  private static validateQuality(quality: QualityConfig | undefined): void {
    if (!quality) return;
    const values = [quality.glow, quality.chromatic, quality.grain, quality.clarity, quality.contrast, quality.saturation].filter((value): value is number => value !== undefined);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Quality values must be finite and non-negative.');
    const sharpen = typeof quality.sharpen === 'number' ? { amount: quality.sharpen } : quality.sharpen;
    if (sharpen && Object.values(sharpen).some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) throw new Error('Quality sharpen values must be finite and non-negative.');
    if (quality.samplingMode !== undefined && !['linear', 'bicubic', 'bicubic-sharp'].includes(quality.samplingMode)) throw new Error(`Invalid quality samplingMode: ${quality.samplingMode}.`);
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

  private static validateBlurWindows(project: ProjectManifest, shot: TimelineShot, maxBlurSamples: number): void {
    const coordinateSpace = project.blurCoordinateSpace ?? 'progress';
    let previousEnd = -Infinity;
    for (const window of shot.blurWindows ?? []) {
      const start = coordinateSpace === 'progress' ? window.startProgress : window.startTime;
      const end = coordinateSpace === 'progress' ? window.endProgress : window.endTime;
      if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error(`Invalid blur window for ${shot.id}.`);
      const min = coordinateSpace === 'progress' ? 0 : shot.start;
      const max = coordinateSpace === 'progress' ? 1 : shot.end;
      if (start < min || end > max || start < previousEnd) throw new Error(`Blur windows must be ordered and inside the shot for ${shot.id}.`);
      if (!Number.isFinite(window.strength) || window.strength < 0 || window.strength > 1) throw new Error(`Invalid blur window strength for ${shot.id}.`);
      if (window.maxSamples !== undefined && (window.maxSamples < 1 || window.maxSamples > maxBlurSamples)) throw new Error(`Invalid blur window maxSamples for ${shot.id}.`);
      if (window.maxShutterSeconds !== undefined && (!Number.isFinite(window.maxShutterSeconds) || window.maxShutterSeconds < 0)) throw new Error(`Invalid blur window maxShutterSeconds for ${shot.id}.`);
      for (const fade of [window.fadeIn, window.fadeOut]) if (fade !== undefined && (!Number.isFinite(fade) || fade < 0)) throw new Error(`Invalid blur window fade for ${shot.id}.`);
      previousEnd = end;
    }
  }

  private static validateInterpolation(shot: TimelineShot): void {
    if (!shot.interpolation) return;
    if (!['none', 'blend'].includes(shot.interpolation.mode)) throw new Error(`Invalid interpolation mode for ${shot.id}.`);
    if (shot.interpolation.maxWeight !== undefined && (!Number.isFinite(shot.interpolation.maxWeight) || shot.interpolation.maxWeight < 0 || shot.interpolation.maxWeight > 1)) throw new Error(`Invalid interpolation maxWeight for ${shot.id}.`);
  }

  private static validateCamera(shot: TimelineShot): void {
    if (typeof shot.camera === 'string') return;
    if (!shot.camera?.keyframes || shot.camera.keyframes.length < 2) throw new Error(`Camera keyframes require at least two points for ${shot.id}.`);
    let previous = -Infinity;
    for (const keyframe of shot.camera.keyframes) {
      if (!Number.isFinite(keyframe.time) || keyframe.time < 0 || keyframe.time > 1 || keyframe.time < previous) throw new Error(`Camera keyframes must be monotonic in [0, 1] for ${shot.id}.`);
      if (keyframe.scale !== undefined && (!Number.isFinite(keyframe.scale) || keyframe.scale <= 0)) throw new Error(`Camera scale is invalid for ${shot.id}.`);
      previous = keyframe.time;
    }
  }

  private static validatePostFXOverride(shot: TimelineShot): void {
    const override = shot.postFX;
    if (!override) return;
    for (const [name, value] of Object.entries({ glow: override.glow, chromatic: override.chromatic, grain: override.grain, clarity: override.clarity, contrast: override.contrast, saturation: override.saturation })) if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`Invalid shot postFX ${name} for ${shot.id}: ${value}.`);
    if (override.samplingMode !== undefined && !['linear', 'bicubic', 'bicubic-sharp'].includes(override.samplingMode)) throw new Error(`Invalid shot postFX samplingMode for ${shot.id}.`);
    const sharpen = typeof override.sharpen === 'number' ? { amount: override.sharpen } : override.sharpen;
    if (sharpen && Object.values(sharpen).some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) throw new Error(`Invalid shot sharpen config for ${shot.id}.`);
  }

  private static validateSyncMap(timeline: TimelineManifest, shot: TimelineShot, source: ProjectManifest['sources'][number], rangeStart: number, rangeEnd: number): void {
    const syncPoints = shot.syncPoints ?? [];
    let previousOutput = -Infinity;
    let previousSource = -Infinity;
    for (const point of syncPoints) {
      const marker = point.markerRef ? source.markers?.find((candidate) => candidate.id === point.markerRef) : undefined;
      const event = point.audioEventRef ? timeline.audioEvents?.find((candidate) => candidate.id === point.audioEventRef) : undefined;
      if (point.markerRef && !marker) throw new Error(`Unknown source marker ${point.markerRef} for ${shot.id}.`);
      if (point.audioEventRef && !event) throw new Error(`Unknown audio event ${point.audioEventRef} for ${shot.id}.`);
      const outputTime = event?.time ?? point.outputTime;
      const sourceTime = marker?.sourceTime ?? point.sourceTime;
      if (!Number.isFinite(outputTime) || outputTime! < shot.start || outputTime! > shot.end) throw new Error(`Invalid sync point outputTime for ${shot.id}: ${outputTime}.`);
      if (!Number.isFinite(sourceTime) || sourceTime! < rangeStart || sourceTime! > rangeEnd) throw new Error(`Invalid sync point sourceTime for ${shot.id}: ${sourceTime}.`);
      if (outputTime! < previousOutput || sourceTime! < previousSource) throw new Error(`Sync points must be monotonic for ${shot.id}.`);
      previousOutput = outputTime!; previousSource = sourceTime!;
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
