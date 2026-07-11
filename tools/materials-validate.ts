import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import type { CharacterManifest, Clip, ClipsRegistry, ReferencesManifest } from '../materials/types';
import { computeApprovedShotTypes, computeMissingShotTypes, computeUsedBy, listCharacters, loadAllProjects, loadIndexHtml, sha256File, type LoadedProject } from '../materials/registry-lib';

/**
 * Read-only. Never writes a file — a "validate" that mutates state makes CI/local runs
 * order-dependent and hides whether a diff came from a real edit or a side effect. If anything
 * here is stale (sha256, usedBy, currentInventorySummary), run `npm run materials:sync` first.
 */
const errors: string[] = [];
const warnings: string[] = [];

const materialsRoot = 'materials';
const characters = await listCharacters(materialsRoot);
if (characters.length === 0) throw new Error(`No character directories found under ${materialsRoot}/.`);
const allProjects = await loadAllProjects();
const indexHtml = await loadIndexHtml();

const probeMedia = (file: string): { width: number; height: number; fps: string; duration: number; codec: string; pixelFormat: string; hasAudio: boolean } => {
  const payload = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], { encoding: 'utf8' })) as { streams: Array<Record<string, string | number | undefined>> };
  const video = payload.streams.find((stream) => stream.codec_type === 'video');
  if (!video) throw new Error(`${file}: no video stream`);
  const hasAudio = payload.streams.some((stream) => stream.codec_type === 'audio');
  return { width: Number(video.width), height: Number(video.height), fps: String(video.r_frame_rate), duration: Number(video.duration), codec: String(video.codec_name), pixelFormat: String(video.pix_fmt), hasAudio };
};

for (const character of characters) {
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
    const actual = await sha256File(file);
    if (actual !== reference.sha256) errors.push(`${character}/references: ${reference.id} sha256 is stale (manifest=${reference.sha256}, actual=${actual}) — run materials:sync`);
  }
  const referenceFileIds = new Set(references.references.map((reference) => reference.file));

  const clipIds = new Set<string>();
  const generationIds = new Set<string>();
  for (const clip of clipsRegistry.clips) {
    if (clipIds.has(clip.id)) errors.push(`${character}/clips: duplicate clip id "${clip.id}"`);
    clipIds.add(clip.id);
    if (clip.generation.generationId) {
      if (generationIds.has(clip.generation.generationId)) errors.push(`${character}/clips: duplicate generationId "${clip.generation.generationId}"`);
      generationIds.add(clip.generation.generationId);
    }

    const underCharacterDir = resolve(clip.file).startsWith(resolve(base) + '/');
    if (clip.migrationPending && underCharacterDir) errors.push(`${character}/clips: ${clip.id}.migrationPending=true but file is already under ${base}/ — clear the flag`);
    if (!clip.migrationPending && !underCharacterDir) errors.push(`${character}/clips: ${clip.id} file (${clip.file}) is outside ${base}/ and migrationPending is not set`);

    if (!existsSync(clip.file)) { errors.push(`${character}/clips: ${clip.id} file not found: ${clip.file}`); continue; }
    const actualSha = await sha256File(clip.file);
    if (actualSha !== clip.media.sha256) errors.push(`${character}/clips: ${clip.id} sha256 is stale (registry=${clip.media.sha256}, actual=${actualSha}) — run materials:sync`);

    const probed = probeMedia(clip.file);
    if (probed.width !== clip.media.width || probed.height !== clip.media.height) errors.push(`${character}/clips: ${clip.id} dimensions mismatch: registry=${clip.media.width}x${clip.media.height}, ffprobe=${probed.width}x${probed.height}`);
    if (probed.codec !== clip.media.codec) errors.push(`${character}/clips: ${clip.id} codec mismatch: registry=${clip.media.codec}, ffprobe=${probed.codec}`);
    if (probed.pixelFormat !== clip.media.pixelFormat) errors.push(`${character}/clips: ${clip.id} pixelFormat mismatch: registry=${clip.media.pixelFormat}, ffprobe=${probed.pixelFormat}`);
    if (probed.hasAudio !== clip.media.hasAudio) errors.push(`${character}/clips: ${clip.id} hasAudio mismatch: registry=${clip.media.hasAudio}, ffprobe=${probed.hasAudio}`);
    if (Math.abs(probed.duration - clip.media.durationSeconds) > 0.05) errors.push(`${character}/clips: ${clip.id} duration mismatch: registry=${clip.media.durationSeconds}, ffprobe=${probed.duration}`);

    for (const referenceFile of clip.sourceReferenceImages) {
      if (!referenceFileIds.has(referenceFile)) errors.push(`${character}/clips: ${clip.id} references unknown reference image "${referenceFile}"`);
    }
    if (clip.generation.requestPath && !existsSync(clip.generation.requestPath)) errors.push(`${character}/clips: ${clip.id}.generation.requestPath does not exist: ${clip.generation.requestPath}`);

    const sorted = [...clip.heroRanges].sort((a, b) => a.start - b.start);
    for (const range of sorted) {
      if (range.start < 0 || range.end > clip.media.durationSeconds || range.end <= range.start) errors.push(`${character}/clips: ${clip.id} heroRange [${range.start}, ${range.end}] is out of bounds for a ${clip.media.durationSeconds}s clip`);
    }
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index]!.start < sorted[index - 1]!.end) errors.push(`${character}/clips: ${clip.id} heroRanges overlap: [${sorted[index - 1]!.start}, ${sorted[index - 1]!.end}] and [${sorted[index]!.start}, ${sorted[index]!.end}]`);
    }

    if (clip.qc.status === 'approved') {
      if (clip.heroRanges.length === 0) errors.push(`${character}/clips: ${clip.id} is approved but has no heroRanges`);
      if (!clip.media.sha256) errors.push(`${character}/clips: ${clip.id} is approved but has no sha256`);
      if (clip.qc.reviewedBy !== 'human') errors.push(`${character}/clips: ${clip.id} is approved but reviewedBy="${clip.qc.reviewedBy}" — only a human review can approve a clip (AI-assisted QC must stay "pending-human")`);
    }
    if (clip.qc.status === 'superseded' && !clip.supersededBy) errors.push(`${character}/clips: ${clip.id} is superseded but supersededBy is not set`);

    const expectedUsedBy = computeUsedBy(clip, allProjects);
    if (JSON.stringify(expectedUsedBy) !== JSON.stringify(clip.usedBy)) errors.push(`${character}/clips: ${clip.id}.usedBy is stale (registry has ${JSON.stringify(clip.usedBy)}, expected ${JSON.stringify(expectedUsedBy)}) — run materials:sync`);
    for (const usage of clip.usedBy) {
      const target = allProjects.find((candidate) => candidate.id === usage.project);
      if (!target) { errors.push(`${character}/clips: ${clip.id}.usedBy references unknown project "${usage.project}"`); continue; }
      const shotsUsingSource = target.timeline.shots.filter((shot) => shot.source === usage.sourceId);
      if (shotsUsingSource.length === 0) warnings.push(`${character}/clips: ${clip.id} -> ${usage.project}/${usage.sourceId} is wired but no timeline shot uses it`);
      for (const shot of shotsUsingSource) {
        if (indexHtml && !indexHtml.includes(`data-prepared-shot="${shot.id}"`)) errors.push(`${character}/clips: index.html has no prepared-source <video> for shot ${shot.id} (${usage.project}/${usage.sourceId})`);
      }
    }
  }

  const relevantProjectIds = new Set(clipsRegistry.clips.flatMap((clip: Clip) => clip.usedBy.map((usage) => usage.project)));
  const relevantProjects: LoadedProject[] = allProjects.filter((project) => relevantProjectIds.has(project.id));
  const approvedShotTypes = computeApprovedShotTypes(clipsRegistry.clips);
  const approvedClips = clipsRegistry.clips.filter((clip) => clip.qc.status === 'approved').length;
  const expectedMissingShotTypes = computeMissingShotTypes(approvedShotTypes, relevantProjects);
  if (characterManifest.currentInventorySummary.approvedClips !== approvedClips || JSON.stringify(characterManifest.currentInventorySummary.missingShotTypes) !== JSON.stringify(expectedMissingShotTypes)) {
    errors.push(`${character}: character.json currentInventorySummary is stale (has approvedClips=${characterManifest.currentInventorySummary.approvedClips}/missingShotTypes=${JSON.stringify(characterManifest.currentInventorySummary.missingShotTypes)}, expected approvedClips=${approvedClips}/missingShotTypes=${JSON.stringify(expectedMissingShotTypes)}) — run materials:sync`);
  }
}

for (const { id, project, timeline } of allProjects) {
  for (const shot of timeline.shots) {
    if (!project.sources.some((source) => source.id === shot.source)) errors.push(`${id}: timeline shot ${shot.id} references unknown source ${shot.source}`);
  }
}

console.log(`Checked ${characters.length} character(s) under ${materialsRoot}/.`);
if (warnings.length > 0) { console.warn(`\n${warnings.length} warning(s):`); for (const warning of warnings) console.warn(`  - ${warning}`); }
if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('materials:validate passed.');
