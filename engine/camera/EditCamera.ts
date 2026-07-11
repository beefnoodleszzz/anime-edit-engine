import type { CameraPresetName, CameraVelocity, EditTransform } from '../types';

type Easing = 'linear' | 'smooth' | 'expoIn' | 'expoOut' | 'expoInOut' | 'power4In' | 'power4Out' | 'hold' | 'overshoot';
type Keyframe = EditTransform & { at: number; easing?: Easing };
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const ease = (name: Easing, value: number): number => { const t = clamp01(value); switch (name) { case 'linear': return t; case 'expoIn': return t === 0 ? 0 : 2 ** (10 * t - 10); case 'expoOut': return t === 1 ? 1 : 1 - 2 ** (-10 * t); case 'expoInOut': return t < 0.5 ? 2 ** (20 * t - 11) : 1 - 2 ** (-20 * t + 10); case 'power4In': return t ** 4; case 'power4Out': return 1 - (1 - t) ** 4; case 'hold': return t < 0.96 ? 0 : (t - 0.96) / 0.04; case 'overshoot': return 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2; default: return t * t * (3 - 2 * t); } };
const base = (at: number, partial: Partial<EditTransform> & Partial<Pick<Keyframe, 'easing'>>): Keyframe => ({ at, scale: 1, x: 0, y: 0, rotation: 0, pivotX: 0.5, pivotY: 0.5, ...partial });

const PRESETS: Record<CameraPresetName, readonly Keyframe[]> = {
  HERO_CRASH_IN: [base(0, { scale: 1.04, y: 0.02, easing: 'expoOut' }), base(0.10, { scale: 1.54, y: -0.04, easing: 'power4Out' }), base(0.65, { scale: 1.39, y: -0.02, easing: 'hold' }), base(0.85, { scale: 1.39, y: -0.02, easing: 'expoIn' }), base(1, { scale: 1.48, y: -0.035, easing: 'expoIn' })],
  FACE_CROSS_LEFT: [base(0, { scale: 1.32, x: -0.13, rotation: -2.4 }), base(0.55, { scale: 1.52, x: 0.035, rotation: 0.3 }), base(1, { scale: 1.49, x: 0.04 })],
  FACE_CROSS_RIGHT: [base(0, { scale: 1.43, x: 0.11, rotation: 1.2 }), base(0.74, { scale: 1.54, x: -0.04, rotation: -0.8 }), base(1, { scale: 1.62, x: -0.14, rotation: -2.8 })],
  // Kept deliberately slow: this is the sharp visual hold in SHARP → SMEAR → SHARP.
  EYE_PUSH: [base(0, { scale: 1.7, pivotY: 0.42 }), base(1, { scale: 1.82, pivotY: 0.42 })],
  WHIP_RIGHT: [base(0, { scale: 1.35, x: -0.08, rotation: -1, easing: 'power4In' }), base(0.3, { scale: 1.43, x: -0.02, rotation: 0.5, easing: 'linear' }), base(1, { scale: 1.78, x: 0.28, rotation: 8, easing: 'linear' })],
  REVERSE_PULL: [base(0, { scale: 1.66, x: 0.12, rotation: 2.6 }), base(0.55, { scale: 1.28, x: 0.01, rotation: 0.2 }), base(1, { scale: 1.22 })],
  REVERSE_ORBIT: [base(0, { scale: 1.45, x: 0.08, rotation: 2.5 }), base(0.75, { scale: 1.31, x: -0.03, rotation: -0.4 }), base(1, { scale: 1.29, x: 0, rotation: 0 })],
};

const lerp = (a: number, b: number, progress: number): number => a + (b - a) * progress;
const angleLerp = (a: number, b: number, progress: number): number => a + ((((b - a + 180) % 360) + 360) % 360 - 180) * progress;
export class EditCamera {
  public resolve(name: CameraPresetName, progress: number): EditTransform {
    const points = PRESETS[name];
    const p = clamp01(progress);
    const rightIndex = points.findIndex((point) => point.at >= p);
    const right = points[rightIndex < 0 ? points.length - 1 : rightIndex]!;
    const left = points[Math.max(0, rightIndex - 1)]!;
    const segment = right.at === left.at ? 1 : ease(left.easing ?? 'smooth', (p - left.at) / (right.at - left.at));
    return { scale: Math.exp(lerp(Math.log(left.scale), Math.log(right.scale), segment)), x: lerp(left.x, right.x, segment), y: lerp(left.y, right.y, segment), rotation: angleLerp(left.rotation, right.rotation, segment), pivotX: lerp(left.pivotX, right.pivotX, segment), pivotY: lerp(left.pivotY, right.pivotY, segment) };
  }

  public velocity(name: CameraPresetName, progress: number, frameDeltaSeconds: number, shotDurationSeconds: number): CameraVelocity {
    const progressDelta = frameDeltaSeconds / Math.max(shotDurationSeconds, 0.000001);
    const a = this.resolve(name, Math.max(0, progress - progressDelta));
    const b = this.resolve(name, Math.min(1, progress + progressDelta));
    const elapsedSeconds = Math.max(Math.min(1, progress + progressDelta) - Math.max(0, progress - progressDelta), 0.000001) * shotDurationSeconds;
    const x = (b.x - a.x) / elapsedSeconds; const y = (b.y - a.y) / elapsedSeconds;
    const zoom = Math.log(Math.max(b.scale, 0.000001) / Math.max(a.scale, 0.000001)) / elapsedSeconds;
    const rotation = (b.rotation - a.rotation) / elapsedSeconds;
    const magnitude = Math.min(1, Math.hypot(x, y, zoom * 0.2, rotation * 0.015));
    const planar = Math.hypot(x, y) || 1;
    return { x, y, zoom, rotation, magnitude, directionX: x / planar, directionY: y / planar };
  }
}
