import type { ProjectManifest, TimelineManifest } from '../types';

export interface ProjectConfig { project: ProjectManifest; timeline: TimelineManifest; }

export class ProjectLoader {
  public static validate(config: ProjectConfig): ProjectConfig {
    const { project, timeline } = config;
    if (project.duration <= 0 || !Number.isFinite(project.duration)) throw new Error('Project duration must be positive.');
    if (timeline.shots.length === 0) throw new Error('Timeline requires at least one shot.');
    const sourceIds = new Set(project.sources.map((source) => source.id));
    const epsilon = 0.000001; let previousEnd = 0; let previousId = 'start';
    for (const shot of timeline.shots) {
      const source = project.sources.find((candidate) => candidate.id === shot.source);
      if (!sourceIds.has(shot.source) || !source) throw new Error(`Unknown source: ${shot.source}`);
      if (Math.abs(shot.start - previousEnd) > epsilon || shot.end <= shot.start) throw new Error(`Timeline is not contiguous: previous=${previousId}, current=${shot.id}, expected=${previousEnd}, actual=${shot.start}, difference=${Math.abs(shot.start - previousEnd)}, epsilon=${epsilon}.`);
      const range = source.heroRanges[shot.rangeIndex];
      if (!range || range.start < 0 || range.end > source.duration || range.end <= range.start) throw new Error(`Invalid hero range for ${shot.id}.`);
      if (shot.transitionOut === 'FOREGROUND_OCCLUSION_WIPE' && (source.transitionMetadata?.estimatedCoveragePeak ?? 0) < 0.8) throw new Error(`Outgoing occlusion coverage is insufficient for ${shot.id}.`);
      previousEnd = shot.end; previousId = shot.id;
    }
    for (let index = 1; index < timeline.shots.length; index += 1) {
      const previous = timeline.shots[index - 1]!; const next = timeline.shots[index]!;
      if (previous.transitionOut === 'FOREGROUND_OCCLUSION_WIPE' && (project.sources.find((source) => source.id === next.source)?.transitionMetadata?.estimatedCoveragePeak ?? 0) < 0.8) throw new Error(`Incoming occlusion coverage is insufficient for ${next.id}.`);
    }
    if (Math.abs(previousEnd - project.duration) > 0.0001) throw new Error('Timeline must end at project duration.');
    return config;
  }
}
