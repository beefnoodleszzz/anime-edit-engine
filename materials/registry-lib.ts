import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Clip, ClipUsedBy } from './types';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

/**
 * Shared by tools/materials-sync.ts (writes) and tools/materials-validate.ts (read-only compare)
 * so the two can never disagree on what "in sync" means — duplicating this logic in both files
 * would reproduce the exact kind of silent-drift risk this registry exists to prevent.
 */

export const sha256File = async (file: string): Promise<string> => createHash('sha256').update(await readFile(file)).digest('hex');

export const listCharacters = async (materialsRoot = 'materials'): Promise<string[]> =>
  (await readdir(materialsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

export interface LoadedProject { id: string; project: ProjectManifest; timeline: TimelineManifest; }

/** This repo has one shared root index.html (no per-project composition entry) — see index.html's own src="cache/prepared/<project>/..." convention. */
export const loadIndexHtml = async (): Promise<string> => (existsSync('index.html') ? readFile('index.html', 'utf8') : Promise.resolve(''));

export const loadAllProjects = async (projectsRoot = 'projects'): Promise<LoadedProject[]> => {
  if (!existsSync(projectsRoot)) return [];
  const ids = (await readdir(projectsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const loaded: LoadedProject[] = [];
  for (const id of ids) {
    const projectPath = join(projectsRoot, id, 'project.json');
    const timelinePath = join(projectsRoot, id, 'timeline.json');
    if (!existsSync(projectPath) || !existsSync(timelinePath)) continue;
    const project = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectManifest;
    const timeline = JSON.parse(await readFile(timelinePath, 'utf8')) as TimelineManifest;
    loaded.push({ id, project, timeline });
  }
  return loaded;
};

/** A clip is "used by" a project source when the ids match AND the files resolve to the same physical path — id equality alone is not enough (two characters could reuse a shot-type-ish id). */
export const computeUsedBy = (clip: Clip, projects: readonly LoadedProject[]): ClipUsedBy[] => {
  const usedBy: ClipUsedBy[] = [];
  for (const { id, project } of projects) {
    for (const source of project.sources) {
      if (source.id === clip.id && resolve(source.file) === resolve(clip.file)) usedBy.push({ project: id, sourceId: source.id });
    }
  }
  return usedBy;
};

export const computeApprovedShotTypes = (clips: readonly Clip[]): Set<string> =>
  new Set(clips.filter((clip) => clip.qc.status === 'approved').map((clip) => clip.shotType));

/**
 * Every source.type declared across the given projects is "required" by design intent; anything
 * with zero approved clips of that type is missing. Callers must pre-filter `projects` down to
 * ones this character actually participates in (via computeUsedBy on its clips) — passing every
 * project in the repo would attribute one character's shot-type gaps to an unrelated character.
 */
export const computeMissingShotTypes = (approvedShotTypes: ReadonlySet<string>, projects: readonly LoadedProject[]): string[] => {
  const missing = new Set<string>();
  for (const { project } of projects) for (const source of project.sources) if (!approvedShotTypes.has(source.type)) missing.add(source.type);
  return [...missing].sort();
};
