---
name: materials-registry
description: Manage character reference images, Kling generation provenance, and QC'd clips under materials/<character>/ — use when generating new character footage via Kling, auditing what material exists/is missing for a character, or wiring an approved clip into a project's timeline.
---

# Materials Registry

Source of truth: `materials/<character>/character.json` (identity/style), `references/manifest.json` (reference images + what each is good for), `clips.json` (every clip's provenance, QC, structured `heroRanges`). Field definitions: `materials/types.ts`. Shared compute logic (sha256, `usedBy`, missing-shot-type gaps): `materials/registry-lib.ts`.

**Registry metadata first, visual verification second.** Don't guess a clip's identity/quality from its frames without reading the registry, and don't trust the registry's `qc.status` without independently re-verifying per the Audit rule below — neither alone is enough.

## 1. Discover
Read, in order: `character.json` → `references/manifest.json` → `clips.json` → the target `projects/<id>/project.json` + `timeline.json`. Do not generate anything before this.

## 2. Audit
For each clip with `qc.status: "approved"`: if its file's sha256 is unchanged since last sync, a quick recheck (first/mid/last frame) is enough; if the sha256 changed or this is its first time being wired into a project, a full contact-sheet review is required. `任务成功 ≠ 素材可用` — a clip that generated successfully can still be watermarked, dead-zoned past some timestamp, or off-character.

## 3. Gap analysis
Run `npm run materials:validate` (read-only) to see the current, verified state — including `character.json.currentInventorySummary.missingShotTypes`. If it reports staleness, run `npm run materials:sync` first, then validate again. Never hand-edit `sha256`, `usedBy`, or `currentInventorySummary` — both are script-written.

## 4. Generate (every job is billed — confirm with the user first)
1. Discover the Kling connector's actual identity/submit/query/download tools for this session (they may be named `who_am_i` / `image_to_video` / `query_tasks` or differently) — don't call a remembered tool name or invent parameters; if unsure, look them up first.
2. Pick reference image(s) from `references/manifest.json` by `recommendedFor` matching the shot type being generated — not "throw all images in."
3. Confirm with the user: model, prompt, reference images, duration, resolution, and the number of billable jobs about to run. State exact cost only if the tool provides one; otherwise say "estimated" or "cost not available from this tool" — never fabricate a number. Never submit a trial/guess job.

## 5. Persist and recover
1. Pick a `gen-NNNN` id that has never been used for this character before — never reuse one, even after a failure.
2. Write `materials/<character>/generations/gen-NNNN/request.json` (model, prompt, reference images, arguments, submittedAt) **before** submitting.
3. Submit, record `providerTaskId`, poll the query tool. On failure or timeout: still keep `request.json`, write what's known into `result.json` (status: failed), and stop — don't auto-resubmit.
4. On success: Kling output URLs expire in 24h — download `output.mp4` promptly. `ffprobe` it and compute its sha256 before writing `result.json`. A failed/corrupt download must not produce a `clips.json` entry.

## 6. QC (AI-assisted — this is not approval)
On the downloaded `output.mp4`: ffprobe (codec/pix_fmt/dimensions/duration), contact sheet, watermark check, character-consistency check against the reference images, propose `heroRanges` (structured `{start,end,score,tags}` — never prose). Write `qc.status: "pending-human"`, `qc.reviewedBy: "ai-assisted"`, and a findings summary. **An AI must never write `qc.reviewedBy: "human"` or `qc.status: "approved"` for its own review** — that fabricates a review record `materials:validate` specifically checks for.

## 7. Human approval gate
Only the user can move a clip from `pending-human` to `approved` (or to `rejected`). Surface the QC findings and proposed `heroRanges` and wait for an explicit yes. If a clip already exists at `clips/<id>.mp4`, do not overwrite it without the user explicitly confirming a replacement.

## 8. Promote
Once approved: copy `generations/gen-NNNN/output.mp4` → `materials/<character>/clips/<id>.mp4`. A clip that fails QC stays in `generations/` and is never copied to `clips/`.

## 9. Integrate
Wiring a clip into a project touches, together: `project.json.sources[].file`/`heroRanges`, `timeline.json.shots[].source`, and the composition's source declarations — a static `index.html`'s prepared-source `<video data-prepared-shot="...">` elements today, or whatever generates them if this project later adopts a render-entry generator. Do **not** hand-edit `clips.json.usedBy` — it's derived.

## 10. Sync
Run `npm run materials:sync` after any of the above changes anything on disk (new generation downloaded, clip promoted, project/timeline wiring changed). It recomputes and writes `sha256`, `usedBy`, and `currentInventorySummary`/`missingShotTypes` — nothing else in this workflow should write those fields.

## 11. Validate
Run `npm run materials:validate` after sync (and before calling anything done). It is read-only and fails loudly on: stale derived fields, broken file references, `approved` without human review, out-of-bounds/overlapping `heroRanges`, ffprobe/registry media mismatches, dangling or missing project/timeline/index.html wiring.

## 12. Replacing a clip
When a new clip supersedes an old one for the same shot type: set the old clip's `qc.status: "superseded"` and `supersededBy: "<new-clip-id>"` — never delete its record, it's provenance.

## 13. Red lines
- Never wire a clip into `project.json` before it reaches `qc.status: "approved"`.
- Never let an AI set `qc.reviewedBy: "human"` or move a clip to `approved`.
- Never submit a Kling job without the user confirming model/prompt/references/cost first.
- Never reuse a `gen-NNNN` id, even after a failed job.
- Never hand-edit `sha256`, `usedBy`, or `currentInventorySummary` — run sync.
