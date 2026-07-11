import type { TransitionState } from '../types';

export class TransitionSystem {
  public bridgeColor(state: TransitionState): [number, number, number] { return state.kind === 'COLOR_BRIDGE_CUT' ? [0.667, 0.047, 0.11] : [0, 0, 0]; }
}
