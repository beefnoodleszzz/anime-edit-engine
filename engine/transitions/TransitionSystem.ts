import type { TransitionState } from '../types';

/**
 * Measured, not guessed: averaged the actual pixel color of CAPE_TURN_001.mp4 at its heroRange
 * end (t=4.1s) and CAPE_EXIT_001.mp4 at its heroRange start (t=2.0s) — the two frames the
 * s05->s06 COLOR_BRIDGE_CUT cut actually bridges — via `ffmpeg -ss <t> -frames:v 1` + a 1x1
 * resize average. The previous constant (0.667, 0.047, 0.11 — a saturated crimson) was tuned for
 * the old wow-normalized.mp4 footage those shots used to source from; once CAPE_TURN_001/
 * CAPE_EXIT_001 were replaced with shaosiming's purple-toned Kling footage, that hardcoded red
 * flashed across the cut instead of blending with the actual on-screen colors. Re-measure this
 * whenever CAPE_TURN_001 or CAPE_EXIT_001's source footage changes.
 */
const CAPE_TURN_CAPE_EXIT_BRIDGE_COLOR: [number, number, number] = [55 / 255, 51.5 / 255, 78 / 255];

export class TransitionSystem {
  public bridgeColor(state: TransitionState): [number, number, number] { return state.kind === 'COLOR_BRIDGE_CUT' ? CAPE_TURN_CAPE_EXIT_BRIDGE_COLOR : [0, 0, 0]; }
}
