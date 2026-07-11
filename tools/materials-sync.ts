import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterManifest, ClipsRegistry, ReferencesManifest } from '../materials/types';
import { computeApprovedShotTypes, computeMissingShotTypes, computeUsedBy, listCharacters, loadAllProjects, sha256File } from '../materials/registry-lib';

/**
 * The only script allowed to write materials/<character>/{character.json,references/manifest.json,clips.json}
 * derived fields (sha256, usedBy, currentInventorySummary). tools/materials-validate.ts is read-only —
 * it recomputes the same values and fails if they don't match what's on disk, instead of silently
 * fixing them, so CI/a stale run can never mask a real inconsistency.
 */
const materialsRoot = 'materials';
const characters = await listCharacters(materialsRoot);
const allProjects = await loadAllProjects();
let changedFiles = 0;

for (const character of characters) {
  const base = join(materialsRoot, character);
  const referencesPath = join(base, 'references', 'manifest.json');
  const clipsPath = join(base, 'clips.json');
  const characterPath = join(base, 'character.json');
  if (!existsSync(referencesPath) || !existsSync(clipsPath) || !existsSync(characterPath)) { console.warn(`${character}: skipped (missing character.json / references/manifest.json / clips.json)`); continue; }

  const references = JSON.parse(await readFile(referencesPath, 'utf8')) as ReferencesManifest;
  let referencesChanged = false;
  for (const reference of references.references) {
    const file = join(base, 'references', reference.file);
    if (!existsSync(file)) continue;
    const actual = await sha256File(file);
    if (actual !== reference.sha256) { reference.sha256 = actual; referencesChanged = true; }
  }
  if (referencesChanged) { await writeFile(referencesPath, `${JSON.stringify(references, null, 2)}\n`); changedFiles += 1; console.log(`${character}: updated references/manifest.json sha256`); }

  const clipsRegistry = JSON.parse(await readFile(clipsPath, 'utf8')) as ClipsRegistry;
  let clipsChanged = false;
  for (const clip of clipsRegistry.clips) {
    if (existsSync(clip.file)) {
      const actual = await sha256File(clip.file);
      if (actual !== clip.media.sha256) { clip.media.sha256 = actual; clipsChanged = true; }
    }
    const usedBy = computeUsedBy(clip, allProjects);
    if (JSON.stringify(usedBy) !== JSON.stringify(clip.usedBy)) { clip.usedBy = usedBy; clipsChanged = true; }
  }
  if (clipsChanged) { clipsRegistry.updatedAt = new Date().toISOString(); await writeFile(clipsPath, `${JSON.stringify(clipsRegistry, null, 2)}\n`); changedFiles += 1; console.log(`${character}: updated clips.json (sha256/usedBy)`); }

  const relevantProjectIds = new Set(clipsRegistry.clips.flatMap((clip) => clip.usedBy.map((usage) => usage.project)));
  const relevantProjects = allProjects.filter((project) => relevantProjectIds.has(project.id));
  const approvedShotTypes = computeApprovedShotTypes(clipsRegistry.clips);
  const approvedClips = clipsRegistry.clips.filter((clip) => clip.qc.status === 'approved').length;
  const missingShotTypes = computeMissingShotTypes(approvedShotTypes, relevantProjects);

  const characterManifest = JSON.parse(await readFile(characterPath, 'utf8')) as CharacterManifest;
  const summaryChanged = characterManifest.currentInventorySummary.approvedClips !== approvedClips || JSON.stringify(characterManifest.currentInventorySummary.missingShotTypes) !== JSON.stringify(missingShotTypes);
  if (summaryChanged) {
    characterManifest.currentInventorySummary = { approvedClips, missingShotTypes };
    characterManifest.updatedAt = new Date().toISOString();
    await writeFile(characterPath, `${JSON.stringify(characterManifest, null, 2)}\n`);
    changedFiles += 1;
    console.log(`${character}: updated character.json currentInventorySummary (approvedClips=${approvedClips}, missingShotTypes=[${missingShotTypes.join(', ')}])`);
  }
}

console.log(changedFiles === 0 ? 'materials:sync — already up to date, nothing changed.' : `materials:sync — updated ${changedFiles} file(s). Run npm run materials:validate next.`);
