/**
 * Types for the materials/<character>/ registry: character identity, reference-image manifest,
 * and the clip provenance/QC index (clips.json). This is the schema — checked read-only by
 * tools/materials-validate.ts and kept in sync by tools/materials-sync.ts — the same pattern
 * this project already uses for project.json / timeline.json (engine/types.ts +
 * ProjectLoader.validate()) instead of a separate JSON Schema layer.
 */

/**
 * pending: newly generated, no QC yet. pending-human: AI-assisted QC done (contact sheet,
 * ffprobe, watermark/consistency check) but a human has not signed off — this is NOT approved,
 * an AI must never write "approved" for its own review. approved: human has signed off.
 * rejected: failed QC, kept for provenance. superseded: replaced by a newer clip, kept for
 * provenance (see Clip.supersededBy).
 */
export type QcStatus = 'pending' | 'pending-human' | 'approved' | 'rejected' | 'superseded';
export type ReviewedBy = 'human' | 'ai-assisted' | 'automated';

export interface HeroRange { start: number; end: number; score: number; tags: string[]; }

export interface CharacterManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  status: 'active' | 'archived';
  identity: { genderPresentation: string; agePresentation: string; world: string; };
  visualAnchors: { face: string[]; eyes: string[]; hair: string[]; costume: string[]; accessories: string[]; silhouette: string[]; };
  styleKeywords: string[];
  colorPalette: { primary: string[]; secondary: string[]; accent: string[]; };
  continuityRules: string[];
  forbiddenChanges: string[];
  /** Written by tools/materials-sync.ts — do not hand-edit; materials:validate fails if this is stale. */
  currentInventorySummary: { approvedClips: number; missingShotTypes: string[]; };
  updatedAt: string;
}

export interface ReferenceImage {
  id: string;
  file: string;
  sha256: string;
  view: 'front' | 'left-45' | 'right-45' | 'back' | 'full-body';
  framing: 'portrait' | 'full-body';
  strengths: string[];
  recommendedFor: string[];
  avoidFor: string[];
  notes: string;
}

export interface ReferencesManifest {
  schemaVersion: 1;
  character: string;
  references: ReferenceImage[];
}

export interface ClipMedia {
  durationSeconds: number; width: number; height: number; fps: number;
  codec: string; pixelFormat: string; hasAudio: boolean;
  /** sha256 of the clip file — written by tools/materials-sync.ts, not hand-edited. */
  sha256: string;
}

export interface ClipGeneration {
  generationId: string;
  providerTaskId: string;
  model: string;
  requestPath: string;
}

export interface ClipQc {
  status: QcStatus;
  reviewedAt: string;
  reviewedBy: ReviewedBy;
  notes: string;
  issues: string[];
  contactSheet: string;
}

export interface ClipUsedBy { project: string; sourceId: string; }

/** Optional semantic ownership for non-character source plates used by ensemble projects. */
export type ClipAssetKind = 'character' | 'ensemble' | 'prop' | 'environment' | 'effect';

export interface Clip {
  id: string;
  file: string;
  /** True while `file` legitimately still lives outside materials/<character>/clips/ (e.g. not yet
   * migrated from assets/sources/). materials:validate requires file location and this flag to agree. */
  migrationPending: boolean;
  shotType: string;
  media: ClipMedia;
  generation: ClipGeneration;
  sourceReferenceImages: string[];
  /** Defaults to character for legacy records; use ensemble/prop/environment/effect for new work. */
  assetKind?: ClipAssetKind;
  /** Character or asset ids represented by an ensemble/prop/effect plate. */
  subjectRefs?: string[];
  heroRanges: HeroRange[];
  qc: ClipQc;
  /** Set only when qc.status is "superseded": the clip.id that replaced this one. */
  supersededBy?: string;
  /** Written by tools/materials-sync.ts from project.json/timeline.json — do not hand-edit. */
  usedBy: ClipUsedBy[];
}

export interface ClipsRegistry {
  schemaVersion: 1;
  character: string;
  updatedAt: string;
  clips: Clip[];
}

export interface GenerationRequest {
  generationId: string;
  character: string;
  tool: 'image_to_video' | 'text_to_video' | 'image_to_image' | 'text_to_image';
  model: string;
  prompt: string;
  referenceImages: string[];
  arguments: Record<string, string>;
  submittedAt: string;
}

export interface GenerationResult {
  generationId: string;
  providerTaskId: string;
  status: 'succeeded' | 'failed';
  outputSha256: string;
  completedAt: string;
}
