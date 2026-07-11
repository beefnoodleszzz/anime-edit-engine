# V0 Validation Manual Review

Reviewed by inspecting `renders/validation/anime-edit-validation.mp4` directly: full-video contact
sheets (`ffmpeg fps=4, tile=4x8`, 32 frames across 8s), a dense sheet of shot s01 (12 frames across
0–1.1s), a dense sheet of shots s05/s06 (12 frames across 4.0–5.1s), a tail sheet of the last 2.5s,
and the raw source `assets/sources/wow-normalized.mp4` at t=18–24s for comparison. This is a real
frame-by-frame visual inspection, not a fabricated conclusion.

## Result

FAIL

## Reviewed Items

- First frame: Not black, alpha/luminance checks pass — but frame 0 of s01 (HERO_CRASH_IN) shows a
  strong ghosting/double-exposure artifact (the face and eyebrows are visibly doubled). This clears
  completely by frame 6 (t≈0.1s) and stays sharp for the rest of the shot. Looks like a motion-blur
  strength spike isolated to the very first frame, not a stylistic effect — the blur value there is
  far higher than the same camera move produces one frame later.
- Shot continuity: s01–s05 (0.0s–5.0s, HERO_IDLE_003 / LOOK_BACK_002 / EYE_001 / FACE_001 /
  CAPE_TURN_001) all show real, continuous anime content with correct camera framing per shot.
  s06 (CAPE_EXIT_001, 5.0–6.2s) starts on real content but degrades before its own shot ends.
  s07 (DRAW_001, 6.2–8.0s, the entire final 1.8s of the video) has **no real content at all**.
- Camera: HERO_CRASH_IN, FACE_CROSS_LEFT/RIGHT, EYE_PUSH read correctly for s01–s04. WHIP_RIGHT
  (s05) and REVERSE_PULL (s06, while it still has content) show a strong canted/rotated frame with
  visible directional blur streaks — direction reads correctly, no unexpected flips.
- Motion blur: Sharp and controlled for s02–s05 interior frames. The s01 frame-0 spike above is the
  one real defect; the whip shot (s05) shows convincing directional streaking without smearing the
  whole frame.
- Transitions: The s05→s06 COLOR_BRIDGE_CUT cut (t=5.0s) does not show an obvious solid-color
  mismatch or occlusion error in the sampled frames, but by this point the source is already partly
  degraded (see below), which makes the cut hard to judge cleanly.
- Final frame: **Black / TikTok app loading screen**, not engine content. Fails the "video does not
  end on a black frame" requirement outright.
- Visible artifacts:
  1. **Source content missing, not a render bug.** `assets/sources/wow-normalized.mp4` (used for
     EYE_001/FACE_001/CAPE_TURN_001/CAPE_EXIT_001/DRAW_001) stops containing real anime footage at
     roughly t≈20.3–20.5s of its own 24s runtime and becomes the TikTok app's own "loading video"
     screen (logo + progress bar + `@claihfx` search UI) for the rest of its length. `CAPE_EXIT_001`'s
     declared heroRange ends exactly at 20.5s (right at this boundary) and `DRAW_001`'s declared range
     (20.6–23.7s, tags `["reference","ending"]`) falls **entirely inside the dead zone** — there is no
     real footage there to select frames from. This is a `project.json` source-metadata problem
     (bad hero-range data for this specific source clip), not an engine/camera/blur/render bug — the
     pipeline is faithfully sampling and encoding exactly what's in the source file.
  2. **Burned-in TikTok watermark.** `wow-normalized.mp4` has a persistent "TikTok / @claihfx" mark
     in the lower-right corner through its entire real-content range too. It's cropped out of frame
     by the tight EYE_PUSH/FACE_CROSS zooms (s03/s04), but becomes partially visible once the camera
     widens/rotates for WHIP_RIGHT and REVERSE_PULL (s05 from ~t=4.4s onward, s06). This is present
     in every shot sourced from this file, independent of the dead-zone issue above.
  3. No visible browser/console error text was baked into any captured frame (the HyperFrames
     capture log shows benign `WebGL: INVALID_VALUE: texImage2D: no video` warnings during the
     pre-video-attach calibration phase only, in stdout, not on screen).

## Main Problems

1. `DRAW_001`'s hero range (20.6–23.7s) and the tail of `CAPE_EXIT_001`'s hero range (approaching
   20.5s) point at a TikTok "loading" screen in the raw source, not real footage — shot s07 (the
   entire last 1.8s of the 8s demo) and the tail of s06 render as a black/UI-chrome dead zone. This
   is a source-selection data bug, not a rendering bug: `npm run prepare:sources` and
   `render:validation` both did exactly what they were told with the frames that actually exist.
2. `wow-normalized.mp4` (backing EYE_001/FACE_001/CAPE_TURN_001/CAPE_EXIT_001/DRAW_001 — 5 of 7
   shots) carries a burned-in TikTok watermark that becomes visible once the camera isn't tightly
   zoomed in, which is not acceptable in a demo that's meant to look like an original edit.
3. Frame 0 of s01 (HERO_CRASH_IN) has a real, reproducible motion-blur strength spike vs. every
   frame right after it — worth root-causing (likely a boundary condition in how velocity/blur is
   computed for the very first sampled frame of a shot) even though it's cosmetically minor next to
   problems 1–2.

## Decision

Adjust

Everything the validation build was actually meant to prove about the *engine* — HyperFrames
lifecycle, Prepared Source pipeline, Timeline execution, Camera, Transform Path Blur, Transitions,
480-frame CFR 1080x1920@60 MP4 output — worked, and s01–s04 look genuinely good. But the demo isn't
watchable end to end: it ends on a TikTok loading screen instead of content, and half its shots carry
someone else's watermark. Before showing this further: swap `wow-normalized.mp4` for a clean,
watermark-free source (or re-derive `CAPE_EXIT_001`/`DRAW_001`'s heroRanges to land inside its real
20.5s of usable footage, though 3.1s of remaining runtime isn't enough to refill both ranges) — that
is a footage/metadata fix, not a re-architecture, so it doesn't reopen the scope this validation round
was meant to close.
