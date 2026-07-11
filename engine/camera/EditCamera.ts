import type { CameraPresetName, CameraVelocity, EditTransform } from '../types';

type Keyframe = EditTransform & { at: number };
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const ease = (value: number): number => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const base = (at: number, partial: Partial<EditTransform>): Keyframe => ({ at, scale: 1, x: 0, y: 0, rotation: 0, pivotX: 0.5, pivotY: 0.5, ...partial });

const PRESETS: Record<CameraPresetName, readonly Keyframe[]> = {
  HERO_CRASH_IN: [base(0, { scale: 1.04, y: 0.02 }), base(0.32, { scale: 1.44, y: -0.03 }), base(1, { scale: 1.38, y: -0.02 })],
  FACE_CROSS_LEFT: [base(0, { scale: 1.32, x: -0.13, rotation: -2.4 }), base(0.55, { scale: 1.52, x: 0.035, rotation: 0.3 }), base(1, { scale: 1.49, x: 0.04 })],
  FACE_CROSS_RIGHT: [base(0, { scale: 1.43, x: 0.11, rotation: 1.2 }), base(0.74, { scale: 1.54, x: -0.04, rotation: -0.8 }), base(1, { scale: 1.62, x: -0.14, rotation: -2.8 })],
  // Kept deliberately slow: this is the sharp visual hold in SHARP → SMEAR → SHARP.
  EYE_PUSH: [base(0, { scale: 1.7, pivotY: 0.42 }), base(1, { scale: 1.82, pivotY: 0.42 })],
  WHIP_RIGHT: [base(0, { scale: 1.35, x: -0.08, rotation: -1 }), base(1, { scale: 1.65, x: 0.2, rotation: 6 })],
  REVERSE_PULL: [base(0, { scale: 1.66, x: 0.12, rotation: 2.6 }), base(0.55, { scale: 1.28, x: 0.01, rotation: 0.2 }), base(1, { scale: 1.22 })],
  REVERSE_ORBIT: [base(0, { scale: 1.45, x: 0.08, rotation: 2.5 }), base(0.75, { scale: 1.31, x: -0.03, rotation: -0.4 }), base(1, { scale: 1.29, x: 0, rotation: 0 })],
};

const lerp = (a: number, b: number, progress: number): number => a + (b - a) * progress;
export class EditCamera {
  public resolve(name: CameraPresetName, progress: number): EditTransform {
    const points = PRESETS[name];
    const p = clamp01(progress);
    const rightIndex = points.findIndex((point) => point.at >= p);
    const right = points[rightIndex < 0 ? points.length - 1 : rightIndex]!;
    const left = points[Math.max(0, rightIndex - 1)]!;
    const segment = right.at === left.at ? 1 : ease((p - left.at) / (right.at - left.at));
    return { scale: lerp(left.scale, right.scale, segment), x: lerp(left.x, right.x, segment), y: lerp(left.y, right.y, segment), rotation: lerp(left.rotation, right.rotation, segment), pivotX: lerp(left.pivotX, right.pivotX, segment), pivotY: lerp(left.pivotY, right.pivotY, segment) };
  }

  public velocity(name: CameraPresetName, progress: number, delta: number): CameraVelocity {
    const a = this.resolve(name, Math.max(0, progress - delta));
    const b = this.resolve(name, Math.min(1, progress + delta));
    const divisor = Math.max(delta * 2, 0.000001);
    const x = (b.x - a.x) / divisor; const y = (b.y - a.y) / divisor; const zoom = (b.scale - a.scale) / divisor; const rotation = (b.rotation - a.rotation) / divisor;
    const magnitude = Math.min(1, Math.hypot(x, y, zoom * 0.2, rotation * 0.015));
    const planar = Math.hypot(x, y) || 1;
    return { x, y, zoom, rotation, magnitude, directionX: x / planar, directionY: y / planar };
  }
}
