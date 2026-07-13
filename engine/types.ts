export type SourceType =
  | 'HERO_IDLE' | 'LOOK_BACK' | 'FACE' | 'EYE' | 'HAND_FACE' | 'CAPE_TURN'
  | 'CAPE_EXIT' | 'HAIR_WIPE' | 'DRAW' | 'SLASH' | 'WALK' | 'SIDE_PROFILE'
  | 'CUSTOM';

export type RenderModeName = 'draft' | 'review' | 'master';
export type CameraPresetName = 'HERO_CRASH_IN' | 'FACE_CROSS_LEFT' | 'FACE_CROSS_RIGHT' | 'EYE_PUSH' | 'WHIP_RIGHT' | 'REVERSE_PULL' | 'REVERSE_ORBIT' | 'WARD_PUSH' | 'SLEEVE_PASS';
export type TimeWarpName = 'crash' | 'steady' | 'hold' | 'accelerate' | 'whip' | 'release' | 'settle';
export type TransitionName = 'COLOR_BRIDGE_CUT' | 'FOREGROUND_OCCLUSION_WIPE' | 'VELOCITY_CUT' | 'WHIP';
export type AssetUsage = 'concept' | 'production';
export type ProductionAssetPolicy = 'optional' | 'required';
export type QualityProfile = 'legacy' | 'cinematic' | 'anime-ultra-clear' | 'anime-impact' | 'custom';
export type SamplingMode = 'linear' | 'bicubic' | 'bicubic-sharp';
export type InterpolationMode = 'none' | 'blend';
export type BlurCoordinateSpace = 'progress' | 'absolute';
export type CameraEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier' | 'custom' | 'expoIn' | 'expoOut' | 'expoInOut' | 'power4In' | 'power4Out' | 'hold' | 'overshoot';
export type AudioEventType = 'beat' | 'downbeat' | 'accent' | 'drop' | 'transition' | 'break' | 'custom';
export type AudioEventSource = 'automatic' | 'manual';

export interface HeroRange { start: number; end: number; score: number; tags: string[]; }
export interface TransitionMetadata { dominantColor?: [number, number, number]; estimatedCoveragePeak?: number; direction?: 'left' | 'right' | 'up' | 'down'; }
export interface SourceMarker { id: string; kind: SyncPointKind; sourceTime: number; label?: string; }
export interface SourceClip {
  id: string; type: SourceType; file: string; width: number; height: number; fps: number; duration: number;
  heroRanges: HeroRange[]; tags: string[]; markers?: SourceMarker[]; faceStability?: number; edgeStability?: number; motionQuality?: number; transitionMetadata?: TransitionMetadata;
}
export interface RenderMode { width: number; height: number; fps: number; blurSamples: number; postFX: 'reduced' | 'full'; }
export interface RenderContext extends RenderMode { mode: RenderModeName; frameDeltaSeconds: number; }
export interface AudioTrack {
  id?: string;
  file: string;
  role?: 'music' | 'voice' | 'sfx' | 'ambient' | 'custom';
  start?: number;
  trimStart?: number;
  duration?: number;
  gainDb?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  syncEventRef?: string;
  cue?: string;
  duckMusicDb?: number;
}
export type ProjectAudioTrack = AudioTrack;
export interface ProjectAudioManifest {
  tracks?: AudioTrack[];
  music?: AudioTrack;
  voice?: AudioTrack[];
  sfx?: AudioTrack[];
  masterGainDb?: number;
}
export interface QcRegion { id: string; x: number; y: number; width: number; height: number; }
export interface ImageAsset { id: string; file: string; usage: AssetUsage; qcRegions?: QcRegion[]; }
export interface SharpenConfig { amount: number; threshold: number; limit: number; }
export interface PostFXConfig { glow: number; chromatic: number; grain: number; sharpen: SharpenConfig; clarity: number; contrast: number; saturation: number; samplingMode: SamplingMode; }
export interface QualityConfig { glow?: number; chromatic?: number; grain?: number; sharpen?: Partial<SharpenConfig>; clarity?: number; contrast?: number; saturation?: number; samplingMode?: SamplingMode; }
export interface AudioEvent { id: string; time: number; type: AudioEventType; strength?: number; source: AudioEventSource; label?: string; }
export interface ProjectManifest {
  id: string; name: string; duration: number; seed: number; renderModes: Record<RenderModeName, RenderMode>; sources: SourceClip[];
  qualityProfile?: QualityProfile; quality?: QualityConfig; images?: ImageAsset[]; imageAssets?: ImageAsset[]; firstFrames?: ImageAsset[]; qcRegions?: QcRegion[];
  productionAssetPolicy?: ProductionAssetPolicy; blurCoordinateSpace?: BlurCoordinateSpace; audioFile?: string; audio?: ProjectAudioManifest;
}
/**
 * Per-shot dial-back on the automatic velocity-driven blur (BlurProfile.ts): source plates with
 * their own baked-in motion (whip pans, sleeve sweeps) get double-blurred if the engine's own
 * camera motion blur stacks on top at full strength. All fields optional and additive-only over
 * the automatic profile — a shot without `blur` renders exactly as before this existed.
 */
export interface ShotBlurOverride {
  /** Scales the automatic strength and shutterSeconds. 0 disables, 1 is a no-op. Samples reconverge from the scaled strength, not just the strength value alone. */
  scale?: number;
  /** Hard ceiling on blur.samples for this shot, also clamped by the active RenderContext.blurSamples. */
  maxSamples?: number;
  /** Hard ceiling on blur.shutterSeconds, to keep fast camera moves from smearing into long trails. */
  maxShutterSeconds?: number;
  /** Fraction (0..1) of shot progress at both the start and end over which blur fades to zero. 0.08 = fade in over the first 8% and out over the last 8%. */
  edgeFade?: number;
  /** Forces samples=1/shutterSeconds=0 on the shot's first captured output frame. */
  disableAtStart?: boolean;
  /** Forces samples=1/shutterSeconds=0 on the shot's last captured output frame. */
  disableAtEnd?: boolean;
}
export interface ShotPostFXOverride { glow?: number; chromatic?: number; grain?: number; sharpen?: number | Partial<SharpenConfig>; clarity?: number; contrast?: number; saturation?: number; samplingMode?: SamplingMode; }
export interface CameraKeyframe {
  time: number; scale?: number; x?: number; y?: number; rotation?: number; pivotX?: number; pivotY?: number;
  easing?: CameraEasing; cubicBezier?: [number, number, number, number];
}
export interface CameraKeyframeConfig { keyframes: CameraKeyframe[]; }
export interface BlurWindow {
  startProgress?: number; endProgress?: number; startTime?: number; endTime?: number;
  strength: number; maxSamples?: number; maxShutterSeconds?: number; fadeIn?: number; fadeOut?: number;
}
export interface InterpolationConfig { mode: InterpolationMode; maxWeight?: number; }
export interface TimelineShot {
  id: string; source: string; start: number; end: number; rangeIndex: number; camera: CameraPresetName | CameraKeyframeConfig; timeWarp: TimeWarpName;
  transitionIn?: TransitionName; transitionOut?: TransitionName; blur?: ShotBlurOverride; blurWindows?: BlurWindow[]; interpolation?: InterpolationConfig;
  postFX?: ShotPostFXOverride; syncPoints?: SyncPoint[]; timeMap?: TimeMapPoint[];
}
export type SyncPointKind = 'action-start' | 'gesture-start' | 'impact' | 'settle' | 'reveal' | 'hold' | 'cut' | 'custom';
export interface SyncPoint { kind?: SyncPointKind; markerRef?: string; audioEventRef?: string; outputTime?: number; sourceTime?: number; accentRef?: string; }
export interface TimeMapPoint { outputProgress: number; sourceProgress: number; }
export interface TimelineManifest { bpm: number; beats: number[]; downbeats?: number[]; accents?: Array<{ time: number; strength: number; type: string; confidence?: number }>; audioEvents?: AudioEvent[]; shots: TimelineShot[]; }
export interface EditTransform { scale: number; x: number; y: number; rotation: number; pivotX: number; pivotY: number; }
export interface CameraVelocity { x: number; y: number; zoom: number; rotation: number; magnitude: number; directionX: number; directionY: number; }
export interface BlurProfile { strength: number; samples: number; shutterSeconds: number; }
export interface TransitionState { kind?: TransitionName; progress: number; colorBridgeAlpha: number; bridgeColor?: [number, number, number]; }
export interface PostFXState extends PostFXConfig {}
export interface FrameContext {
  time: number; frameIndex: number; shot: TimelineShot; source: SourceClip; sourceTime: number;
  transform: EditTransform; transformPath: readonly EditTransform[]; velocity: CameraVelocity; blur: BlurProfile; transition: TransitionState; postFX: PostFXState;
}
