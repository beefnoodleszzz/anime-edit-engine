import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { CharacterManifest, ClipsRegistry, ReferencesManifest } from '../materials/types';
import { sha256File } from '../materials/registry-lib';

/**
 * Scaffolds materials/<slug>/ for a new character: copies reference images in, computes their
 * sha256, and writes skeleton character.json / references/manifest.json / clips.json. Fills in
 * only what's mechanically derivable (file, sha256) — the creative fields (view/strengths/
 * recommendedFor per reference image, character.json's visualAnchors/styleKeywords/colorPalette/
 * continuityRules) are left as TODO placeholders for a human+AI review pass afterward, same as
 * materials/shaosiming/ was hand-authored. See .claude/skills/materials-registry/SKILL.md.
 *
 * Usage: npx tsx tools/materials-new-character.ts <slug> --images <dir>
 */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

const [slug, ...rest] = process.argv.slice(2);
const imagesFlagIndex = rest.indexOf('--images');
const imagesDir = imagesFlagIndex >= 0 ? rest[imagesFlagIndex + 1] : undefined;
if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Usage: materials-new-character <slug> --images <dir> — slug must be lowercase alphanumeric/hyphen.');
if (!imagesDir || !existsSync(imagesDir)) throw new Error('Usage: materials-new-character <slug> --images <dir> — <dir> must exist and contain reference images.');

const base = join('materials', slug);
if (existsSync(base)) throw new Error(`${base} already exists — refusing to overwrite an existing character.`);

const referencesDir = join(base, 'references');
await mkdir(referencesDir, { recursive: true });
await mkdir(join(base, 'generations'), { recursive: true });
await mkdir(join(base, 'clips'), { recursive: true });
await mkdir(join(base, 'qc'), { recursive: true });

const imageFiles = (await readdir(imagesDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort();
if (imageFiles.length === 0) throw new Error(`No .png/.jpg/.jpeg files found in ${imagesDir}.`);

const references: ReferencesManifest['references'] = [];
for (const file of imageFiles) {
  const source = join(imagesDir, file);
  const destination = join(referencesDir, file);
  await copyFile(source, destination);
  references.push({
    id: file.replace(extname(file), ''),
    file,
    sha256: await sha256File(destination),
    view: 'front',
    framing: 'portrait',
    strengths: [],
    recommendedFor: [],
    avoidFor: [],
    notes: 'TODO: fill in after visual review (actual angle/framing, what shot types this is good for).',
  });
}

const referencesManifest: ReferencesManifest = { schemaVersion: 1, character: slug, references };
await writeFile(join(referencesDir, 'manifest.json'), `${JSON.stringify(referencesManifest, null, 2)}\n`);

const now = new Date().toISOString();
const characterManifest: CharacterManifest = {
  schemaVersion: 1, id: slug, name: slug, status: 'active',
  identity: { genderPresentation: 'TODO', agePresentation: 'TODO', world: 'TODO' },
  visualAnchors: { face: [], eyes: [], hair: [], costume: [], accessories: [], silhouette: [] },
  styleKeywords: [], colorPalette: { primary: [], secondary: [], accent: [] },
  continuityRules: [], forbiddenChanges: [],
  currentInventorySummary: { approvedClips: 0, missingShotTypes: [] },
  updatedAt: now,
};
await writeFile(join(base, 'character.json'), `${JSON.stringify(characterManifest, null, 2)}\n`);

const clipsRegistry: ClipsRegistry = { schemaVersion: 1, character: slug, updatedAt: now, clips: [] };
await writeFile(join(base, 'clips.json'), `${JSON.stringify(clipsRegistry, null, 2)}\n`);

console.log(`Scaffolded materials/${slug}/ with ${references.length} reference image(s).`);
console.log('Next steps:');
console.log(`  1. Fill in materials/${slug}/references/manifest.json (view/strengths/recommendedFor per image).`);
console.log(`  2. Fill in materials/${slug}/character.json (identity/visualAnchors/styleKeywords/colorPalette/continuityRules).`);
console.log('  3. Draft a storyboard (shot list, camera, timeWarp, narrative intent per beat) for review before generating any footage.');
