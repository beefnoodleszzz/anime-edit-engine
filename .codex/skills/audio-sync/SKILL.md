---
name: audio-sync
description: "Require a BGM-first workflow for anime edits: ingest a user-provided music track, analyze beats/downbeats/accents, lock visual sync points and source time maps, place SFX/voice cues, and validate the final mixed 4K60 deliverable. Use for every new project with music-driven editing, beat-synced cuts, action impacts, voice lines, or audio post-production."
---

# Audio Sync — BGM-First Production Gate

Treat music as an input to the edit, not a finishing layer. A new project cannot enter final storyboard locking, Kling source generation, or beat-sensitive timeline work until the user provides or explicitly selects the BGM.

## Mandatory workflow

1. **Collect BGM first.** Ask the user for a local audio/video file or a licensed asset. If the only reference is a downloaded social video, use it for timing study only; do not ship its audio without rights.
2. **Register the track.** Put the approved file under the new project's audio assets and record its path, trim range, duration, gain, fade, and license/source note in `audio.json`.
3. **Analyze rhythm.** Run the project's beat-analysis command to produce draft BPM, beat grid, downbeats, accents, confidence, and sections. Automatic detection is a proposal, never final truth.
4. **Human-lock accents.** Review waveform/energy around the intended excerpt and mark actual impact/drop/quiet points. Do not force every cut onto a BPM grid.
5. **Lock visual timing.** Add `syncPoints` to `timeline.json` for action start, impact, settle, reveal, and cut completion. Generate or author a monotonic piecewise `timeMap` from those anchors; never maintain two conflicting manual maps.
6. **Design source plates for editing.** Each Kling shot must have one readable action peak and a post-action hold. Reject footage with continuous random motion, multiple competing peaks, or no clean settle.
7. **Place audio events.** Map SFX and voice to semantic cues (`impact`, `chain-break`, `awakening`, `line`) with start time, gain, and optional ducking group. Use absolute seconds only after the musical accent is locked.
8. **Mix and validate.** Render video-only first, then mix music/voice/SFX with fades, ducking, limiter, 48 kHz stereo AAC. Validate video duration equals audio duration, no clipping, expected channels/sample rate, and no silent tails.

## Hard gates

- No BGM selected: stop before beat analysis and formal source generation.
- No human-locked accent map: do not claim that a timeline is beat-synced.
- No clean action peak in a source plate: regenerate or replace the plate; do not solve it with stronger global blur.
- No mixed-audio validation: do not call a silent video-only master the platform final.
- Keep `audio.json` as the hand-authored audio source/mix manifest. Keep beat analysis and derived maps separate from it; see [audio-schema.md](references/audio-schema.md).

## Project commands

```bash
npm run analyze-audio -- <bgm-or-video-file>
npm run select-audio-excerpt -- <bgm-file> 18
npm run qc:dense -- [shot-id]
npm run render:master
```

`render:master` must mix configured audio and write the final audio-bearing MP4. If the BGM is not configured for the active new project, stop and request it; do not silently substitute a generic track.

Do not submit paid media-generation jobs or generate formal Kling footage while the BGM gate is open.
