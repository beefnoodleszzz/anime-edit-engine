import type { BlurProfile, CameraVelocity, FrameContext, ProjectManifest, TimelineManifest, TransitionState } from '../types';
import type { RenderContext } from '../types';
import { assertFrameContext } from '../core/FrameContext';
import { EditCamera } from '../camera/EditCamera';
import { SourceLibrary } from '../source/SourceLibrary';
import { VelocityEnvelope } from './VelocityEnvelope';
import { ShotTimeline } from './ShotTimeline';

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
    const velocity = this.camera.velocity(shot.camera, progress, this.context.frameDeltaSeconds, shotDuration);
    const blur = this.blurProfile(velocity);
    const transformPath = this.transformPath(shot.camera, progress, shotDuration, blur);
    const transition = this.transition(shot.transitionIn, shot.transitionOut, progress);
    const frame: FrameContext = { time, frameIndex: Math.round(time * this.context.fps), shot, source, sourceTime, transform, transformPath, velocity, blur, transition,
      postFX: { glow: 0.18, chromatic: Math.min(0.006, velocity.magnitude * 0.0035), grain: 0.016, sharpen: velocity.magnitude < 0.15 ? 0.13 : 0.08 } };
    return assertFrameContext(frame);
  }

  private blurProfile(velocity: CameraVelocity): BlurProfile {
    const strength = Math.min(1, Math.max(0, (velocity.magnitude - 0.025) / 0.75));
    const samples = strength < 0.015 ? 1 : Math.max(2, Math.min(this.context.blurSamples, 2 + Math.round(strength * (this.context.blurSamples - 2))));
    return { strength, samples, shutterSeconds: this.context.frameDeltaSeconds * (0.25 + strength * 0.75) };
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
