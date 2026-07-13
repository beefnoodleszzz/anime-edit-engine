# New-project audio schema

Keep hand-authored audio sources and derived beat analysis separate.

## `audio.json`

```json
{
  "music": {
    "file": "assets/audio/bgm.wav",
    "trimStart": 32.4,
    "duration": 18,
    "gainDb": -3,
    "fadeIn": 0.08,
    "fadeOut": 0.25,
    "licenseNote": "user-provided / cleared"
  },
  "voice": [
    { "file": "assets/audio/line.wav", "start": 16.2, "gainDb": -1, "cue": "line" }
  ],
  "sfx": [
    { "file": "assets/audio/chain-break.wav", "start": 5.0, "gainDb": -3, "cue": "chain-break", "duckMusicDb": 5 }
  ],
  "masterGainDb": -1
}
```

The new project may use `audio.json` instead of embedding this manifest in `project.json`. The render pipeline should normalize paths relative to the repository root, trim inputs before mixing, apply fades/gain, duck music around voice/impact cues, limit the result, and encode 48 kHz stereo AAC.

## `audio-analysis.json`

This is derived from the selected BGM and may be regenerated:

```json
{
  "source": "assets/audio/bgm.wav",
  "excerpt": { "start": 32.4, "duration": 18 },
  "bpm": 100,
  "timeSignature": [4, 4],
  "beats": [0, 0.6, 1.2],
  "downbeats": [0, 2.4],
  "accents": [
    { "time": 7.2, "strength": 1, "type": "drop", "confidence": 0.94 }
  ],
  "sections": [
    { "start": 0, "end": 4.8, "type": "build", "confidence": 0.78 }
  ]
}
```

Automatic analysis is a draft. Human-reviewed accent times are the timing authority.

## Timeline anchors

Use `syncPoints` as the manual source of truth:

```json
{
  "kind": "impact",
  "outputTime": 6.0,
  "sourceTime": 2.36,
  "accentRef": "drop-01"
}
```

The engine may derive a monotonic piecewise `timeMap` from these points. Never hand-edit both an anchor list and an independent map without regenerating and validating the map.
