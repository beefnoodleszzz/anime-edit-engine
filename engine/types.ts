export type SourceType =
  | 'HERO_IDLE' | 'LOOK_BACK' | 'FACE' | 'EYE' | 'HAND_FACE' | 'CAPE_TURN'
  | 'CAPE_EXIT' | 'HAIR_WIPE' | 'DRAW' | 'SLASH' | 'WALK' | 'SIDE_PROFILE';

export type RenderModeName = 'draft' | 'review' | 'master';
export type CameraPresetName = 'HERO_CRASH_IN' | 'FACE_CROSS_LEFT' | 'FACE_CROSS_RIGHT' | 'EYE_PUSH' | 'WHIP_RIGHT' | 'REVERSE_PULL' | 'REVERSE_ORBIT';
export type TimeWarpName = 'crash' | 'steady' | 'hold' | 'accelerate' | 'whip' | 'release' | 'settle';
export type TransitionName = 'COLOR_BRIDGE_CUT' | 'FOREGROUND_OCCLUSION_WIPE' | 'VELOCITY_CUT' | 'WHIP';

export interface HeroRange { start: number; end: number; score: number; tags: string[]; }
export interface TransitionMetadata { dominantColor?: [number, number, number]; estimatedCoveragePeak?: number; direction?: 'left' | 'right' | 'up' | 'down'; }
export interface SourceClip {
  id: string; type: SourceType; file: string; width: number; height: number; fps: number; duration: number;
  heroRanges: HeroRange[]; tags: string[]; faceStability?: number; edgeStability?: number; motionQuality?: number; transitionMetadata?: TransitionMetadata;
}
export interface RenderMode { width: number; height: number; fps: number; blurSamples: number; postFX: 'reduced' | 'full'; }
export interface RenderContext extends RenderMode { mode: RenderModeName; frameDeltaSeconds: number; }
export interface ProjectManifest { id: string; name: string; duration: number; seed: number; renderModes: Record<RenderModeName, RenderMode>; sources: SourceClip[]; }
export interface TimelineShot {
  id: string; source: string; start: number; end: number; rangeIndex: number; camera: CameraPresetName; timeWarp: TimeWarpName;
  transitionIn?: TransitionName; transitionOut?: TransitionName;
}
export interface TimelineManifest { bpm: number; beats: number[]; shots: TimelineShot[]; }
export interface EditTransform { scale: number; x: number; y: number; rotation: number; pivotX: number; pivotY: number; }
export interface CameraVelocity { x: number; y: number; zoom: number; rotation: number; magnitude: number; directionX: number; directionY: number; }
export interface BlurProfile { strength: number; samples: number; shutterSeconds: number; }
export interface TransitionState { kind?: TransitionName; progress: number; colorBridgeAlpha: number; }
export interface PostFXState { glow: number; chromatic: number; grain: number; sharpen: number; }
export interface FrameContext {
  time: number; frameIndex: number; shot: TimelineShot; source: SourceClip; sourceTime: number;
  transform: EditTransform; transformPath: readonly EditTransform[]; velocity: CameraVelocity; blur: BlurProfile; transition: TransitionState; postFX: PostFXState;
}
