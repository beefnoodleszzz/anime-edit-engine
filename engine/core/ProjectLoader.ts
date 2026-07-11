import type { ProjectManifest, TimelineManifest } from '../types';

export interface ProjectConfig { project: ProjectManifest; timeline: TimelineManifest; }

export class ProjectLoader {
  public static validate(config: ProjectConfig): ProjectConfig {
    const { project, timeline } = config;
    if (project.duration <= 0 || !Number.isFinite(project.duration)) throw new Error('Project duration must be positive.');
    if (timeline.shots.length === 0) throw new Error('Timeline requires at least one shot.');
    const sourceIds = new Set(project.sources.map((source) => source.id));
    let previousEnd = 0;
    for (const shot of timeline.shots) {
      if (!sourceIds.has(shot.source)) throw new Error(`Unknown source: ${shot.source}`);
      if (shot.start !== previousEnd || shot.end <= shot.start) throw new Error(`Timeline must be contiguous at ${shot.id}.`);
      previousEnd = shot.end;
    }
    if (Math.abs(previousEnd - project.duration) > 0.0001) throw new Error('Timeline must end at project duration.');
    return config;
  }
}
