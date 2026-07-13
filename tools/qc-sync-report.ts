import { writeFile, mkdir } from 'node:fs/promises';
import { ProjectLoader } from '../engine/core/ProjectLoader';
import { createRenderContext } from '../engine/core/RenderContext';
import { resolveSyncAnchors } from '../engine/timing/SyncPointResolver';
import { loadProjectConfig, resolveProjectId } from './project-io';

const { project, timeline } = await loadProjectConfig(resolveProjectId());
ProjectLoader.validate({ project, timeline });
const context = createRenderContext(project, 'master');
const reports = [];
for (const shot of timeline.shots) {
  const source = project.sources.find((candidate) => candidate.id === shot.source)!;
  const range = source.heroRanges[shot.rangeIndex]!;
  for (const anchor of resolveSyncAnchors(shot, source, timeline)) {
    const audioEventTime = anchor.audioEventId ? timeline.audioEvents?.find((event) => event.id === anchor.audioEventId)?.time : undefined;
    const outputTime = anchor.outputTime;
    const errorSeconds = audioEventTime === undefined ? 0 : outputTime - audioEventTime;
    reports.push({ shotId: shot.id, markerId: anchor.markerId, sourceTime: anchor.sourceTime, outputTime, audioEventId: anchor.audioEventId, audioEventTime, errorSeconds, errorFrames: errorSeconds * context.fps, sourceProgress: (anchor.sourceTime - range.start) / (range.end - range.start), outputProgress: (outputTime - shot.start) / (shot.end - shot.start) });
  }
}
await mkdir(`projects/${project.id}/qc`, { recursive: true });
await writeFile(`projects/${project.id}/qc/sync-report.json`, `${JSON.stringify({ projectId: project.id, deliveryFps: context.fps, syncPoints: reports }, null, 2)}\n`);
console.log(`Wrote ${reports.length} sync point report row(s).`);
