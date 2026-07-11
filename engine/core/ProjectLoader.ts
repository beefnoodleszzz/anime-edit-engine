import type { ProjectManifest, TimelineManifest, TimelineShot } from '../types';

export interface ProjectConfig { project: ProjectManifest; timeline: TimelineManifest; }

const MIN_OCCLUSION_COVERAGE = 0.8;

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
      previousEnd = shot.end; previousId = shot.id;
    }
    if (Math.abs(previousEnd - project.duration) > 0.0001) throw new Error('Timeline must end at project duration.');
    this.validateTransitions(project, timeline);
    return config;
  }

  /**
   * FOREGROUND_OCCLUSION_WIPE must be validated from both sides independently (a shot's own
   * transitionIn, not only derived from the previous shot's transitionOut), the two sides must
   * be paired (an outgoing wipe with no matching incoming wipe on the next shot is a broken
   * transition, not a valid one-sided effect), and — when both sides declare a wipe direction —
   * the directions must agree, or the wipe visually reverses mid-cut.
   */
  private static validateTransitions(project: ProjectManifest, timeline: TimelineManifest): void {
    const sourceOf = (shot: TimelineShot) => project.sources.find((candidate) => candidate.id === shot.source)!;
    const coverageOf = (shot: TimelineShot) => sourceOf(shot).transitionMetadata?.estimatedCoveragePeak ?? 0;
    const directionOf = (shot: TimelineShot) => sourceOf(shot).transitionMetadata?.direction;

    for (let index = 0; index < timeline.shots.length; index += 1) {
      const shot = timeline.shots[index]!;
      const next = timeline.shots[index + 1];
      const previous = timeline.shots[index - 1];

      if (shot.transitionOut === 'FOREGROUND_OCCLUSION_WIPE') {
        if (coverageOf(shot) < MIN_OCCLUSION_COVERAGE) throw new Error(`Outgoing occlusion coverage is insufficient for ${shot.id}: ${coverageOf(shot)} < ${MIN_OCCLUSION_COVERAGE}.`);
        if (!next || next.transitionIn !== 'FOREGROUND_OCCLUSION_WIPE') throw new Error(`Outgoing FOREGROUND_OCCLUSION_WIPE on ${shot.id} has no paired transitionIn on the following shot (${next?.id ?? 'none'}).`);
      }
      if (shot.transitionIn === 'FOREGROUND_OCCLUSION_WIPE') {
        if (coverageOf(shot) < MIN_OCCLUSION_COVERAGE) throw new Error(`Incoming occlusion coverage is insufficient for ${shot.id}: ${coverageOf(shot)} < ${MIN_OCCLUSION_COVERAGE}.`);
        if (!previous || previous.transitionOut !== 'FOREGROUND_OCCLUSION_WIPE') throw new Error(`Incoming FOREGROUND_OCCLUSION_WIPE on ${shot.id} has no paired transitionOut on the previous shot (${previous?.id ?? 'none'}).`);
        const outgoingDirection = previous ? directionOf(previous) : undefined;
        const incomingDirection = directionOf(shot);
        if (outgoingDirection && incomingDirection && outgoingDirection !== incomingDirection) throw new Error(`FOREGROUND_OCCLUSION_WIPE direction mismatch between ${previous!.id} (${outgoingDirection}) and ${shot.id} (${incomingDirection}).`);
      }
    }
  }
}
