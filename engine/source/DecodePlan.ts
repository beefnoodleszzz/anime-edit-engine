/**
 * Groups source ids by physical file fingerprint so a decode job is planned once per unique
 * file, not once per SourceClip id. Several SourceClip ids in this project (EYE_001,
 * FACE_001, CAPE_TURN_001, CAPE_EXIT_001, DRAW_001) point at the same physical file with
 * different hero ranges; keying the decode cache by sourceId would decode that file five times.
 */
export function planDecodeJobs(sourceIds: readonly string[], fingerprintOf: (sourceId: string) => string): ReadonlyMap<string, readonly string[]> {
  const jobs = new Map<string, string[]>();
  for (const sourceId of sourceIds) {
    const fingerprint = fingerprintOf(sourceId);
    const existing = jobs.get(fingerprint);
    if (existing) existing.push(sourceId); else jobs.set(fingerprint, [sourceId]);
  }
  return jobs;
}
