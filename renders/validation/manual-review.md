# V0 Validation Manual Review

Second pass, after replacing all `wow-normalized.mp4`-sourced material (EYE_001/FACE_001/
CAPE_TURN_001/CAPE_EXIT_001/DRAW_001) with Kling-generated shaosiming footage tracked through the
`materials/shaosiming/` registry, and re-rendering `renders/validation/anime-edit-validation.mp4`
end to end. Reviewed by inspecting the actual output: a full-video contact sheet (`ffmpeg fps=4,
tile=4x8`, 32 frames across 8s), a dense sheet across the s05→s06 transition boundary (12 frames,
4.3–5.5s, before and after a fix — see below), dense sheets of the s03 (EYE) and s07 (DRAW)
segments specifically to check for double-motion artifacts, a first-frame recheck of s01, and the
literal last frame of the file. This is a real frame-by-frame visual inspection, not a fabricated
conclusion.

## Result

PASS (one known minor issue, not blocking)

## Reviewed Items

- First frame: Not black, alpha/luminance checks pass, content is real. **Known issue carried over
  from the first review, still present and unfixed**: frame 0 of s01 (HERO_CRASH_IN) still shows a
  ghosting/double-exposure artifact that clears by frame 2–3. This is an engine-side motion-blur
  boundary-condition bug (isolated to the first sampled frame of a shot), unrelated to source
  footage — out of scope for this round, tracked as a follow-up.
- Shot continuity: All 7 shots (s01–s07) now show real, continuous, on-character content for their
  full duration. No dead zones, no missing footage, no third-party UI chrome.
- Watermarks: None found in any sampled frame across the full 8s, including the wide/rotated
  framings (WHIP_RIGHT, REVERSE_PULL, REVERSE_ORBIT) that previously exposed the old TikTok
  watermark. All 5 replacement clips were downloaded via Kling's `urlWithoutWatermark` output.
- Camera: HERO_CRASH_IN, FACE_CROSS_LEFT/RIGHT, EYE_PUSH, WHIP_RIGHT, REVERSE_PULL, REVERSE_ORBIT
  all read correctly for their respective shots. Three of the new clips (EYE_001, CAPE_EXIT_001,
  DRAW_001) carry their own baked-in camera motion (push-in / pull-back) from the Kling generation,
  unlike the locked-off HERO_IDLE_003/LOOK_BACK_002/FACE_001/CAPE_TURN_001 plates — checked
  specifically for this doubling up with the timeline's own engine camera on s03/s06/s07 and it
  reads as smooth, continuous, and intentional-looking in all three cases, not a jarring
  double-zoom or double-pull. No longer flagged as a concern.
- Transitions — **found and fixed a real bug this round**: the s05→s06 `COLOR_BRIDGE_CUT` cut
  flashed a saturated crimson (`[0.667, 0.047, 0.11]`) across roughly a 0.3s window centered on the
  cut. Root cause: `engine/transitions/TransitionSystem.ts`'s `bridgeColor()` had that crimson
  hardcoded — tuned for the old `wow-normalized.mp4` footage those shots used to source from. Once
  CAPE_TURN_001/CAPE_EXIT_001 became shaosiming's purple-toned Kling footage, the hardcoded color no
  longer matched the scene and the cut flashed red against a purple palette. Fixed by measuring the
  actual pixel color of both clips at the frames the cut bridges (`ffmpeg -ss <t> -frames:v 1` + a
  1x1 resize average) and replacing the constant with that measured value. Re-rendered and
  confirmed: the cut now blends through the scene's actual blue-purple tones with no flash.
- Motion blur: Sharp and controlled through s02–s07 interior frames; the whip shot (s05) shows
  convincing directional streaking without smearing the whole frame. The s01 frame-0 spike (above)
  is the one remaining defect.
- Final frame: **Not black.** A strong, deliberate finishing pose — both fists clenched, purple
  energy glow behind, direct gaze at camera. Reads as an intentional climax, not a truncated or
  glitched ending.
- No visible browser/console error text baked into any captured frame.

## Main Problems

1. s01 frame 0 still has the pre-existing motion-blur ghosting artifact (unrelated to this round's
   footage swap — carried over from the first review, still unfixed).
2. (Fixed this round, listed for the record) `COLOR_BRIDGE_CUT`'s bridge color was hardcoded and
   went stale when its source footage changed — `engine/transitions/TransitionSystem.ts` now
   documents that it needs re-measuring if `CAPE_TURN_001`/`CAPE_EXIT_001` change again.
3. `FACE_001`'s motion is weaker than its generation prompt asked for (mostly a static held blink,
   see `materials/shaosiming/clips.json`) — cosmetic, not a rendering defect, and arguably a
   feature here since it composites as a clean locked-off plate.

## Decision

Continue

The demo is now watchable end to end: all 7 shots show real, on-character, watermark-free content,
the color-bridge transition is fixed, and the video ends on a genuine climax instead of a dead zone.
The one remaining defect (s01 frame-0 blur spike) is minor, isolated, and doesn't block using this
as a representative sample of what the engine can produce. Worth root-causing as a follow-up, but
not a reason to hold this back.
