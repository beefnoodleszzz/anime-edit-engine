import type { AudioEvent, SourceClip, TimelineManifest, TimelineShot, TimeMapPoint } from '../types';
import { buildTimeMap, type ResolvedSyncAnchor } from './TimeMapBuilder';

export function resolveSyncAnchors(shot: TimelineShot, source: SourceClip, timeline: TimelineManifest): readonly ResolvedSyncAnchor[] {
  const events = new Map((timeline.audioEvents ?? []).map((event) => [event.id, event]));
  const markers = new Map((source.markers ?? []).map((marker) => [marker.id, marker]));
  return (shot.syncPoints ?? []).map((point) => {
    const marker = point.markerRef ? markers.get(point.markerRef) : undefined;
    const event = point.audioEventRef ? events.get(point.audioEventRef) : undefined;
    if (point.markerRef && !marker) throw new Error(`Unknown source marker ${point.markerRef} for ${shot.id}.`);
    if (point.audioEventRef && !event) throw new Error(`Unknown audio event ${point.audioEventRef} for ${shot.id}.`);
    const sourceTime = marker?.sourceTime ?? point.sourceTime;
    const outputTime = event?.time ?? point.outputTime;
    if (sourceTime === undefined || outputTime === undefined) throw new Error(`Sync point for ${shot.id} needs a marker/sourceTime and an audioEvent/outputTime.`);
    return {
      sourceTime,
      outputTime,
      ...(point.kind === undefined ? {} : { kind: point.kind }),
      ...(point.markerRef === undefined ? {} : { markerId: point.markerRef }),
      ...(point.audioEventRef === undefined ? {} : { audioEventId: point.audioEventRef }),
    };
  });
}

export function resolveShotTimeMap(shot: TimelineShot, source: SourceClip, timeline: TimelineManifest, rangeStart: number, rangeEnd: number): readonly TimeMapPoint[] {
  if (shot.syncPoints?.length) return buildTimeMap(shot.start, shot.end, rangeStart, rangeEnd, resolveSyncAnchors(shot, source, timeline));
  return shot.timeMap ?? [];
}

export function audioEventById(timeline: TimelineManifest, id: string): AudioEvent {
  const event = timeline.audioEvents?.find((candidate) => candidate.id === id);
  if (!event) throw new Error(`Unknown audio event: ${id}`);
  return event;
}
