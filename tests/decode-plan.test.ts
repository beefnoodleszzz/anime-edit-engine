import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json';
import { planDecodeJobs } from '../engine/source/DecodePlan';
import type { ProjectManifest } from '../engine/types';

describe('planDecodeJobs', () => {
  it('plans exactly one decode job for multiple source ids sharing one physical file', () => {
    const jobs = planDecodeJobs(['a', 'b', 'c'], () => 'same-fingerprint');
    expect(jobs.size).toBe(1);
    expect(jobs.get('same-fingerprint')).toEqual(['a', 'b', 'c']);
  });
  it('plans a separate decode job per distinct physical file', () => {
    const jobs = planDecodeJobs(['a', 'b'], (id) => (id === 'a' ? 'fp-a' : 'fp-b'));
    expect(jobs.size).toBe(2);
  });
  it('collapses the five demo sourceIds that share assets/sources/wow-normalized.mp4 into a single decode job', () => {
    const typed = project as ProjectManifest;
    const sharedFile = 'assets/sources/wow-normalized.mp4';
    const sharedSourceIds = typed.sources.filter((source) => source.file === sharedFile).map((source) => source.id);
    expect(sharedSourceIds).toEqual(['EYE_001', 'FACE_001', 'CAPE_TURN_001', 'CAPE_EXIT_001', 'DRAW_001']);
    const fingerprintOf = new Map(typed.sources.map((source) => [source.id, source.file] as const));
    const jobs = planDecodeJobs(typed.sources.map((source) => source.id), (id) => fingerprintOf.get(id)!);
    expect(jobs.get(sharedFile)).toEqual(sharedSourceIds);
    expect(jobs.size).toBe(new Set(typed.sources.map((source) => source.file)).size);
  });
});
