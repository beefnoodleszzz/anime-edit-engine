import type { BlurProfile, CameraVelocity, FrameContext, ProjectManifest, ShotBlurOverride, TimelineManifest, TransitionState, BlurWindow } from '../types';
import type { RenderContext } from '../types';
import { assertFrameContext } from '../core/FrameContext';
import { EditCamera } from '../camera/EditCamera';
import { SourceLibrary } from '../source/SourceLibrary';
import { VelocityEnvelope } from './VelocityEnvelope';
import { ShotTimeline } from './ShotTimeline';
import { resolveBlurProfile } from '../compositor/BlurProfile';
import { mergeQualityConfig, resolveQualityConfig, samplingModeForRender } from '../compositor/QualityProfile';
import { resolveShotTimeMap } from '../timing/SyncPointResolver';

export class Director {
  private readonly project: ProjectManifest;
  private readonly timeline: ShotTimeline;
  private readonly timelineManifest: TimelineManifest;
  private readonly sourceLibrary: SourceLibrary;
  private readonly context: RenderContext;
  private readonly warp = new VelocityEnvelope();
  private readonly camera = new EditCamera();

  public constructor(project: ProjectManifest, timeline: TimelineManifest, context: RenderContext) {
    this.project = project;
    this.timelineManifest = timeline;
    this.timeline = new ShotTimeline(timeline.shots);
    this.sourceLibrary = new SourceLibrary(project.sources);
    this.context = context;
  }

  public resolve(time: number): FrameContext {
    const shot = this.timeline.resolve(time);
    const source = this.sourceLibrary.get(shot.source);
    const range = source.heroRanges[shot.rangeIndex];
    if (!range) throw new Error(`Hero range missing for ${shot.id}`);
    const progress = this.timeline.progress(shot, time);
    const sourceProgress = this.resolveSourceProgress(shot, progress, range.start, range.end);
    const sourceTime = range.start + sourceProgress * (range.end - range.start);
    const transform = this.camera.resolve(shot.camera, progress);
    const shotDuration = shot.end - shot.start;
    const transition = this.transition(shot, progress);
    const velocity = this.camera.velocity(shot.camera, progress, this.context.frameDeltaSeconds, shotDuration);
    const legacyAutomatic = !this.project.qualityProfile && !this.project.quality && !shot.blurWindows && !shot.interpolation;
    const automaticBlur = shot.blurWindows?.length
      ? this.resolveBlurWindows(shot.blurWindows, progress, shot.start, shotDuration)
      : legacyAutomatic
        ? resolveBlurProfile(Math.min(1, velocity.magnitude + this.transitionBlur(transition)), this.context)
        : { strength: 0, samples: 1, shutterSeconds: 0 };
    const blur = this.applyShotBlurOverride(automaticBlur, shot.blur, progress, shotDuration);
    const transformPath = this.transformPath(shot.camera, progress, shotDuration, blur);
    const postFX = this.applyShotPostFX(shot.postFX);
    const frame: FrameContext = { time, frameIndex: Math.round(time * this.context.fps), shot, source, sourceTime, transform, transformPath, velocity, blur, transition, postFX };
    return assertFrameContext(frame);
  }

  private transitionBlur(state: TransitionState): number { return state.kind ? Math.sin(Math.PI * state.progress) * 0.55 : 0; }

  private resolveSourceProgress(shot: FrameContext['shot'], outputProgress: number, rangeStart: number, rangeEnd: number): number {
    const timeMap = resolveShotTimeMap(shot, this.sourceLibrary.get(shot.source), this.timelineManifest, rangeStart, rangeEnd);
    if (timeMap.length === 0) return this.warp.map(shot.timeWarp, outputProgress);
    const rightIndex = timeMap.findIndex((point) => point.outputProgress >= outputProgress);
    const right = timeMap[rightIndex < 0 ? timeMap.length - 1 : rightIndex]!;
    const left = timeMap[Math.max(0, rightIndex - 1)]!;
    if (right.outputProgress === left.outputProgress) return right.sourceProgress;
    const ratio = (outputProgress - left.outputProgress) / (right.outputProgress - left.outputProgress);
    return Math.max(0, Math.min(1, left.sourceProgress + (right.sourceProgress - left.sourceProgress) * ratio));
  }

  private resolveBlurWindows(windows: readonly BlurWindow[], progress: number, shotStart: number, shotDurationSeconds: number): BlurProfile {
    const coordinateSpace = this.project.blurCoordinateSpace ?? 'progress';
    const active = windows.map((window) => {
      const start = coordinateSpace === 'progress' ? window.startProgress! : window.startTime!;
      const end = coordinateSpace === 'progress' ? window.endProgress! : window.endTime!;
      const position = coordinateSpace === 'progress' ? progress : shotStart + progress * shotDurationSeconds;
      if (position < start || position > end) return undefined;
      const fadeIn = window.fadeIn ? Math.min(1, (position - start) / window.fadeIn) : 1;
      const fadeOut = window.fadeOut ? Math.min(1, (end - position) / window.fadeOut) : 1;
      return { window, strength: window.strength * Math.min(fadeIn, fadeOut) };
    }).filter((value): value is { window: BlurWindow; strength: number } => Boolean(value));
    const selected = active.at(-1);
    if (!selected || selected.strength <= 0) return { strength: 0, samples: 1, shutterSeconds: 0 };
    const { window, strength } = selected;
    const sampleCeiling = Math.min(this.context.blurSamples, window.maxSamples ?? this.context.blurSamples);
    if (sampleCeiling <= 1) return { strength, samples: 1, shutterSeconds: 0 };
    return {
      strength,
      samples: Math.max(2, Math.min(sampleCeiling, Math.round(2 + strength * (sampleCeiling - 2)))),
      shutterSeconds: Math.min(window.maxShutterSeconds ?? Infinity, this.context.frameDeltaSeconds * (0.25 + strength * 0.75)),
    };
  }

  /**
   * Dials the automatic blur back per-shot. Every field is optional and only ever narrows the
   * automatic profile (a shot without `override` returns `blur` untouched — old timelines with
   * no `blur` field render identically to before this existed). Samples are always reconverged
   * from whatever strength survives scale/edgeFade, mirroring resolveBlurProfile's own
   * strength -> samples mapping — a scaled-down strength must not keep sampling at the
   * un-scaled count, or the override buys motion-blur cost without buying sharpness.
   */
  private applyShotBlurOverride(blur: BlurProfile, override: ShotBlurOverride | undefined, progress: number, shotDurationSeconds: number): BlurProfile {
    if (!override) return blur;
    const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
    const sampleCeiling = Math.min(this.context.blurSamples, override.maxSamples ?? this.context.blurSamples);
    const reconverge = (strength: number): number => (strength <= 0 || sampleCeiling <= 1 ? 1 : Math.max(2, Math.min(sampleCeiling, Math.round(2 + strength * (sampleCeiling - 2)))));

    let strength = blur.strength;
    let shutterSeconds = blur.shutterSeconds;
    let samples = blur.samples;

    if (override.scale !== undefined) {
      strength *= override.scale;
      shutterSeconds *= override.scale;
      samples = reconverge(strength);
    }

    if (override.maxShutterSeconds !== undefined) shutterSeconds = Math.min(shutterSeconds, override.maxShutterSeconds);

    if (override.edgeFade !== undefined && override.edgeFade > 0) {
      const startFade = clamp01(progress / override.edgeFade);
      const endFade = clamp01((1 - progress) / override.edgeFade);
      const edgeWeight = Math.min(startFade, endFade);
      if (edgeWeight <= 0.001) return { strength: 0, samples: 1, shutterSeconds: 0 };
      strength *= edgeWeight;
      shutterSeconds *= edgeWeight;
      samples = reconverge(strength);
    }

    if (override.maxSamples !== undefined) samples = Math.min(samples, override.maxSamples);
    samples = Math.max(1, Math.min(samples, this.context.blurSamples));

    // First/last captured output frame of the shot, derived from real timing (frameDeltaSeconds
    // / shotDuration / progress), not a guessed progress threshold — a shot's frame spacing in
    // progress-space is frameDeltaSeconds/shotDurationSeconds, so "within one frame of an edge"
    // is the honest test for "is this the boundary frame".
    const frameProgressSpan = this.context.frameDeltaSeconds / Math.max(shotDurationSeconds, 0.000001);
    if (override.disableAtStart && progress < frameProgressSpan) return { strength: 0, samples: 1, shutterSeconds: 0 };
    if (override.disableAtEnd && progress > 1 - frameProgressSpan) return { strength: 0, samples: 1, shutterSeconds: 0 };

    return { strength, samples, shutterSeconds };
  }

  private transformPath(camera: FrameContext['shot']['camera'], progress: number, duration: number, blur: BlurProfile): readonly FrameContext['transform'][] {
    if (blur.samples === 1) return [this.camera.resolve(camera, progress)];
    return Array.from({ length: blur.samples }, (_, index) => {
      const fraction = index / (blur.samples - 1) - 0.5;
      return this.camera.resolve(camera, progress + fraction * blur.shutterSeconds / duration);
    });
  }

  private applyShotPostFX(override: FrameContext['shot']['postFX']): FrameContext['postFX'] {
    const base = resolveQualityConfig(this.project);
    const merged = mergeQualityConfig(base, override);
    const sharpen = typeof override?.sharpen === 'number' ? { ...merged.sharpen, amount: override.sharpen } : merged.sharpen;
    return {
      ...merged,
      sharpen,
      chromatic: merged.chromatic,
      samplingMode: samplingModeForRender(this.context.mode, merged.samplingMode),
      // Keep the velocity parameter available to the frame model for reports while avoiding
      // automatic chromatic/grain injection in the clear profiles.
      grain: merged.grain,
      glow: merged.glow,
      clarity: merged.clarity,
    };
  }

  private transition(shot: FrameContext['shot'], progress: number): TransitionState {
    const incoming = shot.transitionIn;
    const outgoing = shot.transitionOut;
    const isIn = incoming && progress < 0.12;
    const isOut = outgoing && progress > 0.76;
    const edge = isIn ? 1 - progress / 0.12 : isOut ? (progress - 0.76) / 0.24 : 0;
    const state: TransitionState = { progress: edge, colorBridgeAlpha: (isIn || isOut) ? Math.sin(Math.PI * edge) * 0.25 : 0 };
    const kind = isIn ? incoming : isOut ? outgoing : undefined;
    if (kind) state.kind = kind;
    if (kind === 'COLOR_BRIDGE_CUT') state.bridgeColor = this.bridgeColorFor(shot, isIn ? -1 : 1);
    return state;
  }

  private bridgeColorFor(shot: FrameContext['shot'], neighborDirection: -1 | 1): [number, number, number] {
    const index = this.timeline.shots.indexOf(shot);
    const neighbor = this.timeline.shots[index + neighborDirection];
    const currentColor = this.project.sources.find((source) => source.id === shot.source)?.transitionMetadata?.dominantColor;
    const neighborColor = neighbor ? this.project.sources.find((source) => source.id === neighbor.source)?.transitionMetadata?.dominantColor : undefined;
    if (currentColor && neighborColor) return currentColor.map((value, channel) => (value + neighborColor[channel]!) / 2) as [number, number, number];
    return currentColor ?? neighborColor ?? [0.08, 0.08, 0.08];
  }

  public velocityMatches(outgoing: CameraVelocity, incoming: CameraVelocity, threshold = 0.72): boolean {
    const direction = outgoing.directionX * incoming.directionX + outgoing.directionY * incoming.directionY;
    const magnitude = 1 - Math.min(1, Math.abs(outgoing.magnitude - incoming.magnitude));
    return direction * 0.65 + magnitude * 0.35 >= threshold;
  }
}
