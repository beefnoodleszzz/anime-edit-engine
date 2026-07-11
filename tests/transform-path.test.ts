import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { Director } from '../engine/director/Director';
import { EditCamera } from '../engine/camera/EditCamera';
import { createRenderContext } from '../engine/core/RenderContext';
import type { EditTransform, ProjectManifest, TimelineManifest } from '../engine/types';
import { sourceUv } from './support/sourceUv';

const square = { sourceWidth: 100, sourceHeight: 100, outputWidth: 100, outputHeight: 100 };
const identity: EditTransform = { scale: 1, x: 0, y: 0, rotation: 0, pivotX: 0.5, pivotY: 0.5 };

describe('Director transform path (integration)', () => {
  const director = new Director(project as ProjectManifest, timeline as TimelineManifest, createRenderContext(project as ProjectManifest, 'master'));
  it('collapses all UV transforms to one point at zero motion', () => { const frame = director.resolve(2.7); expect(frame.transformPath).toHaveLength(1); });
  it('samples a full transform path for a whip', () => { const frame = director.resolve(4.7); expect(frame.transformPath.length).toBeGreaterThan(1); expect(frame.transformPath[0]).not.toEqual(frame.transformPath.at(-1)); });
});

describe('Blur samples stay locked to the transform path length (no Compositor-side transition re-boost)', () => {
  // s05 -> s06 (COLOR_BRIDGE_CUT) is this project's only real transition; sample at rest, mid-shot
  // motion, and squarely inside the outgoing/incoming transition edges, across every render mode.
  const times = { rest: 2.7, whip: 4.7, transitionOut: 4.9, transitionIn: 5.05 };
  for (const mode of ['draft', 'review', 'master'] as const) {
    it(`blur.samples === transformPath.length in every phase (${mode})`, () => {
      const director = new Director(project as ProjectManifest, timeline as TimelineManifest, createRenderContext(project as ProjectManifest, mode));
      for (const time of Object.values(times)) {
        const frame = director.resolve(time);
        expect(frame.transformPath).toHaveLength(frame.blur.samples);
      }
      const transitionFrame = director.resolve(times.transitionOut);
      expect(transitionFrame.transition.kind).toBe('COLOR_BRIDGE_CUT');
    });
  }

  it('transform path samples are centered symmetrically around the current frame in shutter time', () => {
    const director = new Director(project as ProjectManifest, timeline as TimelineManifest, createRenderContext(project as ProjectManifest, 'master'));
    const frame = director.resolve(times.whip);
    expect(frame.transformPath.length).toBeGreaterThan(2);
    const first = frame.transformPath[0]!; const last = frame.transformPath.at(-1)!;
    const center = frame.transformPath[Math.floor((frame.transformPath.length - 1) / 2)]!;
    // Symmetric shutter sampling: first/last endpoints are equidistant (in scale-space) from center.
    expect(Math.abs(Math.log(first.scale / center.scale))).toBeCloseTo(Math.abs(Math.log(last.scale / center.scale)), 2);
  });
});

describe('sourceUv CPU reference (mirrors the fragment shader sourceUv())', () => {
  it('zero motion maps every sample UV to itself', () => {
    for (const uv of [[0.5, 0.5], [0.1, 0.9], [0.8, 0.2]] as const) {
      const [sx, sy] = sourceUv(uv, { transform: identity, ...square });
      expect(sx).toBeCloseTo(uv[0], 10);
      expect(sy).toBeCloseTo(uv[1], 10);
    }
  });

  it('pure translation is collinear: every sampled UV shifts by the same constant vector', () => {
    const transform: EditTransform = { ...identity, x: 0.07, y: -0.04 };
    const samples: Array<[number, number]> = [[0.2, 0.3], [0.5, 0.5], [0.9, 0.1]];
    for (const uv of samples) {
      const [sx, sy] = sourceUv(uv, { transform, ...square });
      expect(sx).toBeCloseTo(uv[0] + 0.07, 10);
      expect(sy).toBeCloseTo(uv[1] - 0.04, 10);
    }
  });

  it('zoom samples along the ray from the pivot through the canvas point (radial, toward pivot)', () => {
    const transform: EditTransform = { ...identity, scale: 2 };
    const uv: [number, number] = [0.8, 0.7];
    const [sx, sy] = sourceUv(uv, { transform, ...square });
    const canvasVector = [uv[0] - transform.pivotX, uv[1] - transform.pivotY];
    const sourceVector = [sx - transform.pivotX, sy - transform.pivotY];
    // Same direction as the canvas ray from the pivot, scaled by exactly 1/scale.
    expect(sourceVector[0]! / canvasVector[0]!).toBeCloseTo(1 / transform.scale, 10);
    expect(sourceVector[1]! / canvasVector[1]!).toBeCloseTo(1 / transform.scale, 10);
  });

  it('rotation preserves distance to the pivot', () => {
    const uv: [number, number] = [0.75, 0.35];
    const canvasDistance = Math.hypot(uv[0] - identity.pivotX, uv[1] - identity.pivotY);
    for (const rotation of [15, 90, 173, -140]) {
      const transform: EditTransform = { ...identity, rotation };
      const [sx, sy] = sourceUv(uv, { transform, ...square });
      const sourceDistance = Math.hypot(sx - transform.pivotX, sy - transform.pivotY);
      expect(sourceDistance).toBeCloseTo(canvasDistance, 10);
    }
  });

  it('zoom + rotation together trace a spiral: radius shrinks with scale, angle sweeps exactly with rotation', () => {
    const uv: [number, number] = [0.9, 0.5]; // uv - pivot = (0.4, 0): angle 0 before rotation.
    const canvasRadius = Math.hypot(uv[0] - identity.pivotX, uv[1] - identity.pivotY);
    const steps = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const transform: EditTransform = { ...identity, scale: 1 + t, rotation: t * 90 };
      const [sx, sy] = sourceUv(uv, { transform, ...square });
      return { radius: Math.hypot(sx - transform.pivotX, sy - transform.pivotY), angle: Math.atan2(sy - transform.pivotY, sx - transform.pivotX), scale: transform.scale, rotation: transform.rotation };
    });
    for (const step of steps) {
      expect(step.radius).toBeCloseTo(canvasRadius / step.scale, 10);
      expect(step.angle).toBeCloseTo((step.rotation * Math.PI) / 180, 10);
    }
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]!.radius).toBeLessThan(steps[index - 1]!.radius); // zoom pulls inward
      expect(steps[index]!.angle).toBeGreaterThan(steps[index - 1]!.angle); // rotation sweeps forward
    }
  });

  it('pivot changes the sampled source UV for the same scale/rotation (not just a field that exists)', () => {
    const base = { scale: 1.6, x: 0.05, y: -0.02, rotation: 12 };
    const uv: [number, number] = [0.7, 0.6];
    const centerPivot = sourceUv(uv, { transform: { ...base, pivotX: 0.5, pivotY: 0.5 }, ...square });
    const offCenterPivot = sourceUv(uv, { transform: { ...base, pivotX: 0.25, pivotY: 0.42 }, ...square });
    expect(centerPivot).not.toEqual(offCenterPivot);
    expect(Math.hypot(centerPivot[0] - offCenterPivot[0], centerPivot[1] - offCenterPivot[1])).toBeGreaterThan(0.01);
  });
});

describe('EditCamera log-space scale interpolation', () => {
  it('interpolates scale as a geometric mean under linear easing (log-space, not linear-space)', () => {
    const camera = new EditCamera();
    // WHIP_RIGHT's second segment (0.3 -> 1) is linear easing: scale 1.43 -> 1.78.
    const midpoint = camera.resolve('WHIP_RIGHT', 0.65).scale; // t = (0.65-0.3)/(1-0.3) = 0.5
    const geometricMean = Math.sqrt(1.43 * 1.78);
    const arithmeticMean = (1.43 + 1.78) / 2;
    expect(midpoint).toBeCloseTo(geometricMean, 3);
    expect(Math.abs(midpoint - arithmeticMean)).toBeGreaterThan(0.001);
  });
});
