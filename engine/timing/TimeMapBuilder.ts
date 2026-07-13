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
  const anchorPoints = anchors.map((anchor) => ({
      outputProgress: (anchor.outputTime - shotStart) / Math.max(shotEnd - shotStart, 0.000001),
      sourceProgress: (anchor.sourceTime - rangeStart) / Math.max(rangeEnd - rangeStart, 0.000001),
    }))
    .map((point) => ({ outputProgress: Math.max(0, Math.min(1, point.outputProgress)), sourceProgress: Math.max(0, Math.min(1, point.sourceProgress)) }));
  const hasStartAnchor = anchorPoints.some((point) => Math.abs(point.outputProgress) < 0.000001);
  const hasEndAnchor = anchorPoints.some((point) => Math.abs(point.outputProgress - 1) < 0.000001);
  const points = [
    ...(hasStartAnchor ? [] : [{ outputProgress: 0, sourceProgress: 0 }]),
    ...anchorPoints,
    ...(hasEndAnchor ? [] : [{ outputProgress: 1, sourceProgress: 1 }]),
  ];

  const deduped: TimeMapPoint[] = [];
  for (const point of points) {
    const previous = deduped.at(-1);
    if (previous && Math.abs(previous.outputProgress - point.outputProgress) < 0.000001) continue;
    else deduped.push(point);
  }
  return deduped;
}
