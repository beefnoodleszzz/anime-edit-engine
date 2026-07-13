import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import timeline from '../projects/001-demo/timeline.json';
import { PreparedSourcePlanner, nearestFrameIndex } from '../engine/source/PreparedSource';
import { createRenderContext } from '../engine/core/RenderContext';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

const fps = 24;
const frameCount = 121; // 24fps CFR source: true PTS span is 0..5.0s, container duration is 5.041667s.
const framePts = Array.from({ length: frameCount }, (_, index) => index / fps);

describe('nearestFrameIndex (exact PTS-based source frame mapping)', () => {
  it('maps sourceTime = 0 to frame 0', () => expect(nearestFrameIndex(framePts, 0)).toBe(0));
  it('maps sourceTime = 1/fps to frame 1', () => expect(nearestFrameIndex(framePts, 1 / fps)).toBe(1));
  it('maps sourceTime = 10/fps to frame 10', () => expect(nearestFrameIndex(framePts, 10 / fps)).toBe(10));
  it('maps a hero range start (0.8s) to the true nearest frame', () => expect(nearestFrameIndex(framePts, 0.8)).toBe(19));
  it('maps a hero range end (4.35s) to the true nearest frame', () => expect(nearestFrameIndex(framePts, 4.35)).toBe(104));
  it('maps the last legal source frame at its true PTS, not the container duration', () => {
    expect(nearestFrameIndex(framePts, (frameCount - 1) / fps)).toBe(frameCount - 1);
    expect(nearestFrameIndex(framePts, 5.0)).toBe(frameCount - 1);
  });
  it('clamps sourceTime beyond the last true PTS (container duration padding) to the last frame', () => {
    expect(nearestFrameIndex(framePts, 5.041667)).toBe(frameCount - 1);
  });
  it('breaks distance ties toward the earlier frame, deterministically', () => {
    expect(nearestFrameIndex([0, 1, 2], 0.5)).toBe(0);
    expect(nearestFrameIndex([0, 1, 2], 1.5)).toBe(1);
  });
  it('does not reproduce the old duration-ratio one-frame bias at sourceTime = 5.0s', () => {
    const buggyDurationRatioFrame = Math.round((5.0 / 5.041667) * (frameCount - 1));
    expect(buggyDurationRatioFrame).toBe(119);
    expect(nearestFrameIndex(framePts, 5.0)).not.toBe(buggyDurationRatioFrame);
    expect(nearestFrameIndex(framePts, 5.0)).toBe(120);
  });
});

describe('PreparedSourcePlanner source frame map', () => {
  it('maps every output shot frame to a bounded integer decoded-source index equal to nearestFrameIndex(sourceTime)', () => {
    const manifest = new PreparedSourcePlanner().planShot(project as ProjectManifest, timeline as TimelineManifest, createRenderContext(project as ProjectManifest, 'master'), 's05', 'fingerprint', Array.from({ length: 480 }, (_, index) => index / 30));
    expect(manifest.sourceFrameMap).toHaveLength(Math.round(0.8 * 60));
    for (const frame of manifest.sourceFrameMap) {
      expect(Number.isInteger(frame.sourceFrame) && frame.sourceFrame >= 0 && frame.sourceFrame < 480).toBe(true);
      expect(frame.sourceFrame).toBe(nearestFrameIndex(Array.from({ length: 480 }, (_, index) => index / 30), frame.sourceTime));
      expect(frame.timeErrorSeconds).toBeGreaterThanOrEqual(0);
      // Interior mappings land within half a source-frame period; only edge clamping (when
      // sourceTime falls outside this fixture's synthetic 0..16s PTS span) can exceed it.
      if (frame.sourceFrame > 0 && frame.sourceFrame < 479) expect(frame.timeErrorSeconds).toBeLessThanOrEqual(1 / 30 / 2 + 1e-9);
    }
  });
});
