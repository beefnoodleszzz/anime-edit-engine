import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterManifest, ClipsRegistry, ReferencesManifest } from '../materials/types';
import type { ProjectManifest, TimelineManifest } from '../engine/types';

/**
 * Cross-checks the materials/<character>/ registry (character.json, references/manifest.json,
 * clips.json) against itself and against every projects/<id>/ it's wired into — the automated
 * backstop for the "three places must stay in sync" rule (project.json / timeline.json /
 * index.html) that this project has so far only enforced by convention.
 */
const errors: string[] = [];
const warnings: string[] = [];

const sha256 = async (file: string): Promise<string> => createHash('sha256').update(await readFile(file)).digest('hex');

const materialsRoot = 'materials';
const characterDirs = (await readdir(materialsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
if (characterDirs.length === 0) throw new Error(`No character directories found under ${materialsRoot}/.`);

for (const character of characterDirs) {
  const base = join(materialsRoot, character);
  const characterPath = join(base, 'character.json');
  const referencesPath = join(base, 'references', 'manifest.json');
  const clipsPath = join(base, 'clips.json');
  if (!existsSync(characterPath)) { errors.push(`${character}: missing character.json`); continue; }
  if (!existsSync(referencesPath)) { errors.push(`${character}: missing references/manifest.json`); continue; }
  if (!existsSync(clipsPath)) { errors.push(`${character}: missing clips.json`); continue; }

  const characterManifest = JSON.parse(await readFile(characterPath, 'utf8')) as CharacterManifest;
  const references = JSON.parse(await readFile(referencesPath, 'utf8')) as ReferencesManifest;
  const clipsRegistry = JSON.parse(await readFile(clipsPath, 'utf8')) as ClipsRegistry;

  for (const reference of references.references) {
    const file = join(base, 'references', reference.file);
    if (!existsSync(file)) { errors.push(`${character}/references: ${reference.id} file not found: ${file}`); continue; }
    const actual = await sha256(file);
    if (actual !== reference.sha256) errors.push(`${character}/references: ${reference.id} sha256 mismatch (manifest=${reference.sha256}, actual=${actual})`);
  }

  const referenceIds = new Set(references.references.map((reference) => reference.file));
  const projectCache = new Map<string, { project: ProjectManifest; timeline: TimelineManifest; indexHtml: string }>();
  const loadProject = async (id: string) => {
    if (projectCache.has(id)) return projectCache.get(id)!;
    const projectPath = join('projects', id, 'project.json');
    const timelinePath = join('projects', id, 'timeline.json');
    if (!existsSync(projectPath) || !existsSync(timelinePath)) { errors.push(`${character}: usedBy references unknown project "${id}"`); return undefined; }
    const project = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectManifest;
    const timeline = JSON.parse(await readFile(timelinePath, 'utf8')) as TimelineManifest;
    const indexHtml = existsSync('index.html') ? await readFile('index.html', 'utf8') : '';
    const loaded = { project, timeline, indexHtml };
    projectCache.set(id, loaded);
    return loaded;
  };

  let approvedClips = 0;
  const approvedShotTypes = new Set<string>();
  for (const clip of clipsRegistry.clips) {
    if (!existsSync(clip.file)) { errors.push(`${character}/clips: ${clip.id} file not found: ${clip.file}`); continue; }
    const actual = await sha256(clip.file);
    if (actual !== clip.media.sha256) errors.push(`${character}/clips: ${clip.id} sha256 mismatch (registry=${clip.media.sha256}, actual=${actual}) — file changed since last validate`);
    for (const referenceFile of clip.sourceReferenceImages) {
      if (!referenceIds.has(referenceFile)) warnings.push(`${character}/clips: ${clip.id} references unknown reference image "${referenceFile}"`);
    }
    if (clip.qc.status === 'approved') {
      approvedClips += 1;
      approvedShotTypes.add(clip.shotType);
      if (clip.heroRanges.length === 0) errors.push(`${character}/clips: ${clip.id} is approved but has no heroRanges`);
      if (clip.qc.reviewedBy !== 'human') errors.push(`${character}/clips: ${clip.id} is approved but was not reviewed by a human (reviewedBy=${clip.qc.reviewedBy})`);
    }

    for (const usage of clip.usedBy) {
      const loaded = await loadProject(usage.project);
      if (!loaded) continue;
      const { project, timeline, indexHtml } = loaded;
      const source = project.sources.find((candidate) => candidate.id === usage.sourceId);
      if (!source) { errors.push(`${character}/clips: ${clip.id}.usedBy points at ${usage.project}/${usage.sourceId}, which does not exist in project.json`); continue; }
      const shotsUsingSource = timeline.shots.filter((shot) => shot.source === usage.sourceId);
      if (shotsUsingSource.length === 0) warnings.push(`${character}/clips: ${clip.id} -> ${usage.project}/${usage.sourceId} is declared but no timeline shot uses it`);
      for (const shot of shotsUsingSource) {
        if (indexHtml && !indexHtml.includes(`data-prepared-shot="${shot.id}"`)) errors.push(`${character}/clips: ${usage.project}/index.html has no prepared-source <video> for shot ${shot.id} (uses ${usage.sourceId})`);
      }
    }
  }

  // Cross-reference every project this character is wired into: every source.type present in
  // project.json is "required" by design intent; flag any with zero approved clips of that type.
  const missingShotTypes = new Set<string>();
  for (const { project } of projectCache.values()) {
    for (const source of project.sources) {
      if (!approvedShotTypes.has(source.type)) missingShotTypes.add(source.type);
    }
  }
  for (const [id, { project, timeline }] of projectCache) {
    for (const shot of timeline.shots) {
      if (!project.sources.some((source) => source.id === shot.source)) errors.push(`${id}: timeline shot ${shot.id} references unknown source ${shot.source}`);
    }
  }

  characterManifest.currentInventorySummary = { approvedClips, missingShotTypes: [...missingShotTypes].sort() };
  characterManifest.updatedAt = new Date().toISOString();
  await writeFile(characterPath, `${JSON.stringify(characterManifest, null, 2)}\n`);
}

console.log(`Checked ${characterDirs.length} character(s) under ${materialsRoot}/.`);
if (warnings.length > 0) { console.warn(`\n${warnings.length} warning(s):`); for (const warning of warnings) console.warn(`  - ${warning}`); }
if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('materials:validate passed.');
