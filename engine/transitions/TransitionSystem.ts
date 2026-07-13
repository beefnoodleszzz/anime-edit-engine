import type { TransitionState } from '../types';

const DEFAULT_BRIDGE_COLOR: [number, number, number] = [0.08, 0.08, 0.08];

export class TransitionSystem {
  public bridgeColor(state: TransitionState): [number, number, number] { return state.kind === 'COLOR_BRIDGE_CUT' ? state.bridgeColor ?? DEFAULT_BRIDGE_COLOR : [0, 0, 0]; }
}
