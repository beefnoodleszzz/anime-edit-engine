import type { SourceClip } from '../types';

export class SourceLibrary {
  private readonly clips = new Map<string, SourceClip>();
  public constructor(sources: readonly SourceClip[]) {
    for (const source of sources) {
      if (this.clips.has(source.id)) throw new Error(`Duplicate source id: ${source.id}`);
      this.clips.set(source.id, source);
    }
  }
  public get(id: string): SourceClip { const source = this.clips.get(id); if (!source) throw new Error(`Source not found: ${id}`); return source; }
  public list(): readonly SourceClip[] { return [...this.clips.values()]; }
}
