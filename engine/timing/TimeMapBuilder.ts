import type { TimeMapPoint } from '../types';

export interface ResolvedSyncAnchor {
  kind?: string;
  markerId?: string;
  audioEventId?: string;
  sourceTime: number;
  outputTime: number;
}

export function buildTimeMap(
  shotStart: number,
  shotEnd: number,
  rangeStart: number,
  rangeEnd: number,
  anchors: readonly ResolvedSyncAnchor[],
): readonly TimeMapPoint[] {
  const points = [
    { outputProgress: 0, sourceProgress: 0 },
    ...anchors.map((anchor) => ({
      outputProgress: (anchor.outputTime - shotStart) / Math.max(shotEnd - shotStart, 0.000001),
      sourceProgress: (anchor.sourceTime - rangeStart) / Math.max(rangeEnd - rangeStart, 0.000001),
    })),
    { outputProgress: 1, sourceProgress: 1 },
  ].map((point) => ({ outputProgress: Math.max(0, Math.min(1, point.outputProgress)), sourceProgress: Math.max(0, Math.min(1, point.sourceProgress)) }));

  const deduped: TimeMapPoint[] = [];
  for (const point of points) {
    const previous = deduped.at(-1);
    if (previous && Math.abs(previous.outputProgress - point.outputProgress) < 0.000001) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return deduped;
}
