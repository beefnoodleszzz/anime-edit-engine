---
name: materials-registry
description: Manage character reference images, Kling generation provenance, and QC'd clips under materials/<character>/ — use when generating new character footage via Kling, auditing what material exists/is missing for a character, or wiring an approved clip into a project's timeline.
---

# Materials Registry

Source of truth lives in `materials/<character>/`: `character.json` (identity/style), `references/manifest.json` (reference images + what each is good for), `clips.json` (every generated/approved clip's provenance, QC, and hero ranges). Don't re-derive this by eyeballing video — read the JSON first.

Full field definitions: `materials/types.ts`.

## Discover
Read, in order: `materials/<character>/character.json` → `references/manifest.json` → `clips.json` → the target `projects/<id>/project.json` + `timeline.json`. Do not generate anything before this.

## Audit (don't trust `clips.json` blindly)
For each clip with `qc.status: "approved"`:
- file's sha256 unchanged since `media.sha256` → quick recheck (first/mid/last frame) is enough.
- sha256 changed, or this is the clip's first time being wired into a project → full contact sheet review required before trusting it. `任务成功 ≠ 素材可用` — a clip that rendered successfully can still be watermarked, dead-zoned, or off-character.

## Gap analysis
Run `npm run materials:validate` — it recomputes `character.json.currentInventorySummary.missingShotTypes` (project `source.type`s with zero approved clips of that type) and fails loudly on any broken cross-reference. Don't hand-maintain this summary or the `sha256`/`usedBy` fields — they're script-generated.

## Generate (every job is billed — confirm with the user first)
1. Call kling `who_am_i` once per session to confirm auth and the live model/argument spec.
2. Pick reference image(s) from `references/manifest.json` by `recommendedFor` matching the shot type being generated — not "throw all images in."
3. Confirm with the user: model, prompt, reference images, duration, resolution, count, expected cost. Never submit a trial/guess job.
4. Create `materials/<character>/generations/gen-NNNN/`, write `request.json` **before** submitting (model, prompt, reference images, arguments, submittedAt) — if the session dies mid-flight, the spend is still traceable.
5. Submit, record `providerTaskId`, poll `query_tasks`. Kling output URLs expire in 24h — download `output.mp4` promptly, then write `result.json`.

## QC and promote
Never promote straight from a successful generation. Required before `qc.status: "approved"`:
ffprobe (codec/pix_fmt/dimensions/duration) → contact sheet → watermark check → character-consistency check against the reference images → pick `heroRanges` (structured `{start,end,score,tags}`, never prose). `qc.reviewedBy` must be `"human"` for a clip to be approved — `materials:validate` rejects an approved clip reviewed by anything else.

## Integrate
Wiring a clip into a project touches four places together, never one at a time: `clips.json.usedBy`, `project.json.sources[].file`/`heroRanges`, `timeline.json.shots[].source`, and `index.html`'s prepared-source `<video data-prepared-shot="...">` elements. Run `npm run materials:validate` after — it checks all four are consistent, not just that each one individually parses.
