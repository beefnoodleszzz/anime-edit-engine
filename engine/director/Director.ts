import type { BlurProfile, CameraVelocity, FrameContext, ProjectManifest, ShotBlurOverride, TimelineManifest, TransitionState } from '../types';
import type { RenderContext } from '../types';
import { assertFrameContext } from '../core/FrameContext';
import { EditCamera } from '../camera/EditCamera';
import { SourceLibrary } from '../source/SourceLibrary';
import { VelocityEnvelope } from './VelocityEnvelope';
import { ShotTimeline } from './ShotTimeline';
import { resolveBlurProfile } from '../compositor/BlurProfile';

export class Director {
  private readonly timeline: ShotTimeline;
  private readonly sourceLibrary: SourceLibrary;
  private readonly context: RenderContext;
  private readonly warp = new VelocityEnvelope();
  private readonly camera = new EditCamera();

  public constructor(project: ProjectManifest, timeline: TimelineManifest, context: RenderContext) {
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
    const sourceTime = range.start + this.warp.map(shot.timeWarp, progress) * (range.end - range.start);
    const transform = this.camera.resolve(shot.camera, progress);
    const shotDuration = shot.end - shot.start;
    const transition = this.transition(shot.transitionIn, shot.transitionOut, progress);
    const velocity = this.camera.velocity(shot.camera, progress, this.context.frameDeltaSeconds, shotDuration);
    const automaticBlur = resolveBlurProfile(Math.min(1, velocity.magnitude + this.transitionBlur(transition)), this.context);
    const blur = this.applyShotBlurOverride(automaticBlur, shot.blur, progress, shotDuration);
    const transformPath = this.transformPath(shot.camera, progress, shotDuration, blur);
    const frame: FrameContext = { time, frameIndex: Math.round(time * this.context.fps), shot, source, sourceTime, transform, transformPath, velocity, blur, transition,
      postFX: { glow: 0.18, chromatic: Math.min(0.006, velocity.magnitude * 0.0035), grain: 0.016, sharpen: velocity.magnitude < 0.15 ? 0.13 : 0.08 } };
    return assertFrameContext(frame);
  }

  private transitionBlur(state: TransitionState): number { return state.kind ? Math.sin(Math.PI * state.progress) * 0.55 : 0; }

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
    const reconverge = (strength: number): number => (strength <= 0 ? 1 : Math.max(2, Math.min(sampleCeiling, Math.round(2 + strength * (sampleCeiling - 2)))));

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

  private transition(incoming: FrameContext['shot']['transitionIn'], outgoing: FrameContext['shot']['transitionOut'], progress: number): TransitionState {
    const isIn = incoming && progress < 0.12;
    const isOut = outgoing && progress > 0.76;
    const edge = isIn ? 1 - progress / 0.12 : isOut ? (progress - 0.76) / 0.24 : 0;
    const state: TransitionState = { progress: edge, colorBridgeAlpha: (isIn || isOut) ? Math.sin(Math.PI * edge) * 0.25 : 0 };
    const kind = isIn ? incoming : isOut ? outgoing : undefined;
    if (kind) state.kind = kind;
    return state;
  }

  public velocityMatches(outgoing: CameraVelocity, incoming: CameraVelocity, threshold = 0.72): boolean {
    const direction = outgoing.directionX * incoming.directionX + outgoing.directionY * incoming.directionY;
    const magnitude = 1 - Math.min(1, Math.abs(outgoing.magnitude - incoming.magnitude));
    return direction * 0.65 + magnitude * 0.35 >= threshold;
  }
}
