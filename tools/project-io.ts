import { readFile } from 'node:fs/promises';
import type { ProjectAudioManifest, ProjectManifest, TimelineManifest } from '../engine/types';

export const DEFAULT_PROJECT_ID = '001-demo';

/**
 * PROJECT_ID (env var, not a CLI flag) selects which projects/<id>/ the render/prepare tools
 * operate on. An env var — not argv — is required because render-draft.ts / render-master.ts /
 * render-validation.ts chain through `npm run prepare:sources` and spawn `tools/prepare-sources.ts`
 * as their own subprocess: a CLI flag appended via `npm run x -- --project=y` only reaches the
 * last command in that chain, silently leaving the earlier steps on the default project. An env
 * var is inherited by every child process for free.
 */
export function resolveProjectId(): string {
  return process.env['PROJECT_ID'] ?? DEFAULT_PROJECT_ID;
}

export async function loadProjectConfig(projectId: string): Promise<{ project: ProjectManifest; timeline: TimelineManifest }> {
  const project = JSON.parse(await readFile(`projects/${projectId}/project.json`, 'utf8')) as ProjectManifest;
  const timeline = JSON.parse(await readFile(`projects/${projectId}/timeline.json`, 'utf8')) as TimelineManifest;
  return { project, timeline };
}

export async function loadAudioManifest(project: ProjectManifest): Promise<ProjectAudioManifest | undefined> {
  if (project.audioFile) return JSON.parse(await readFile(project.audioFile, 'utf8')) as ProjectAudioManifest;
  return project.audio;
}
