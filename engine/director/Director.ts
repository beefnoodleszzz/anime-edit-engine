import type { CameraVelocity, FrameContext, ProjectManifest, TimelineManifest, TransitionState } from '../types';
import { RenderClock } from '../core/RenderClock';
import { assertFrameContext } from '../core/FrameContext';
import { EditCamera } from '../camera/EditCamera';
import { SourceLibrary } from '../source/SourceLibrary';
import { VelocityEnvelope } from './VelocityEnvelope';
import { ShotTimeline } from './ShotTimeline';

export class Director {
  private readonly timeline: ShotTimeline;
  private readonly sourceLibrary: SourceLibrary;
  private readonly clock: RenderClock;
  private readonly warp = new VelocityEnvelope();
  private readonly camera = new EditCamera();

  public constructor(project: ProjectManifest, timeline: TimelineManifest, fps: number) {
    this.timeline = new ShotTimeline(timeline.shots);
    this.sourceLibrary = new SourceLibrary(project.sources);
    this.clock = new RenderClock(fps);
  }

  public resolve(time: number): FrameContext {
    const shot = this.timeline.resolve(time);
    const source = this.sourceLibrary.get(shot.source);
    const range = source.heroRanges[shot.rangeIndex];
    if (!range) throw new Error(`Hero range missing for ${shot.id}`);
    const progress = this.timeline.progress(shot, time);
    const sourceTime = range.start + this.warp.map(shot.timeWarp, progress) * (range.end - range.start);
    const transform = this.camera.resolve(shot.camera, progress);
    const velocity = this.camera.velocity(shot.camera, progress, this.clock.delta());
    const transition = this.transition(shot.transitionIn, shot.transitionOut, progress);
    const frame: FrameContext = { time, frameIndex: this.clock.frameAt(time), shot, source, sourceTime, transform, velocity, transition,
      postFX: { glow: 0.18, chromatic: Math.min(0.006, velocity.magnitude * 0.0035), grain: 0.016, sharpen: velocity.magnitude < 0.15 ? 0.13 : 0.08 } };
    return assertFrameContext(frame);
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
