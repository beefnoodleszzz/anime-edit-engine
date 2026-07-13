import { describe, expect, it } from 'vitest';
import { resolveShotTimeMap, resolveSyncAnchors } from '../engine/timing/SyncPointResolver';
import type { SourceClip, TimelineManifest, TimelineShot } from '../engine/types';

const source = { id: 'source', type: 'FACE', file: 'source.mp4', width: 2160, height: 3840, fps: 24, duration: 3, heroRanges: [{ start: 0, end: 3, score: 1, tags: [] }], tags: [], markers: [{ id: 'impact', kind: 'impact', sourceTime: 1.5 }] } as SourceClip;
const shot = { id: 'shot', source: 'source', start: 2, end: 4, rangeIndex: 0, camera: 'EYE_PUSH', timeWarp: 'hold', syncPoints: [{ markerRef: 'impact', audioEventRef: 'drop' }] } as TimelineShot;
const timeline = { bpm: 100, beats: [], audioEvents: [{ id: 'drop', time: 3, type: 'drop', source: 'manual' }], shots: [shot] } as TimelineManifest;

describe('marker and audio event sync', () => {
  it('resolves semantic references to absolute anchors', () => {
    expect(resolveSyncAnchors(shot, source, timeline)[0]).toMatchObject({ sourceTime: 1.5, outputTime: 3, markerId: 'impact', audioEventId: 'drop' });
    expect(resolveShotTimeMap(shot, source, timeline, 0, 3)).toEqual([{ outputProgress: 0, sourceProgress: 0 }, { outputProgress: 0.5, sourceProgress: 0.5 }, { outputProgress: 1, sourceProgress: 1 }]);
  });
  it('keeps absolute legacy sync points working', () => {
    const legacy = { ...shot, syncPoints: [{ kind: 'impact', sourceTime: 1, outputTime: 2.5 }] } as TimelineShot;
    expect(resolveShotTimeMap(legacy, source, timeline, 0, 3)[1]).toEqual({ outputProgress: 0.25, sourceProgress: 1 / 3 });
  });
  it('preserves explicit start and end anchors over automatic endpoints', () => {
    const boundary = { ...shot, start: 2, end: 4, syncPoints: [{ kind: 'hold', sourceTime: 0.5, outputTime: 2 }, { kind: 'cut', sourceTime: 2.5, outputTime: 4 }] } as TimelineShot;
    expect(resolveShotTimeMap(boundary, source, timeline, 0, 3)).toEqual([{ outputProgress: 0, sourceProgress: 0.5 / 3 }, { outputProgress: 1, sourceProgress: 2.5 / 3 }]);
  });
  it('keeps the first explicit anchor when output times repeat', () => {
    const repeated = { ...shot, syncPoints: [{ kind: 'impact', sourceTime: 1, outputTime: 3 }, { kind: 'cut', sourceTime: 2, outputTime: 3 }] } as TimelineShot;
    expect(resolveShotTimeMap(repeated, source, timeline, 0, 3)[1]).toEqual({ outputProgress: 0.5, sourceProgress: 1 / 3 });
  });
});
