# Prepared-source color precision

`tools/prepare-sources.ts` decodes each raw source once to a lossless PNG sequence, then
re-encodes the per-shot frame selection to H.264 `yuv420p` (CRF 0) so it can play back in a
plain Chrome `<video>` element during HyperFrames capture.

## Why yuv420p, and why that's not a new loss

Every raw asset in this project is already `yuv420p` at the source (verified with `ffprobe
-show_entries stream=pix_fmt`):

```
assets/sources/HERO_IDLE_001.mp4  -> pix_fmt=yuv420p
assets/sources/wow-normalized.mp4 -> pix_fmt=yuv420p, color_space=bt709
```

So chroma has already been subsampled once, by whoever produced these assets, before this
pipeline ever sees them. Re-encoding the decoded PNG sequence back to `yuv420p` is a *second*
4:2:0 pass, not the first — the chroma detail it can lose is bounded by what the original
encode already discarded.

## Why not 4:4:4 / FFV1 / ProRes 4444

Those formats would avoid the second subsampling pass, but none of them decode in a plain
Chrome `<video>` element, which this pipeline requires (HyperFrames captures by playing the
prepared shot videos in a real browser tab):

- H.264 High 4:4:4 Predictive / `libx264rgb` — not supported by Chrome's built-in H.264 decode
  path for `<video>`.
- FFV1 — an archival codec; no browser ships a `<video>` decoder for it.
- ProRes 4444 — QuickTime/Apple ecosystem; no browser `<video>` support.
- A PNG sequence isn't a video codec at all and can't be a `<video src>`.

Given the constraint of "must play in the browser HyperFrames actually captures," 8-bit 4:2:0
H.264 is the one broadly Chrome-decodable choice available.

## What's actually verified, not assumed

`prepare-sources.ts` doesn't just assume "yuv420p is good enough." After encoding each shot it:

1. Decodes frame 0 of the just-encoded shot video back to a PNG (`ffmpeg -vframes 1`).
2. Compares that against the lossless source PNG the encode was built from, using
   `psnrBetweenPngs` (`engine/core/PngPixels.ts`) — real per-pixel RGB PSNR, not a guess.
3. Fails the build if PSNR drops below 20 dB (a floor low enough to tolerate normal chroma
   subsampling error, high enough to catch a real bug like frame misalignment).
4. Writes the measured PSNR to `<shot>.color-fidelity.json` next to the shot's manifest, so it
   is real, on-disk evidence rather than a claim in a comment.
