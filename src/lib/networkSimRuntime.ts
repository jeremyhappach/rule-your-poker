export type NetworkSimMode =
  | 'off'
  | 'moderate'
  | 'heavy'
  | 'reorder'
  | 'cross_country'
  | 'cross_country_chaos';

export const NETWORK_SIM_MODE_LABELS: Record<NetworkSimMode, string> = {
  off: 'Off',
  moderate: 'Moderate Lag',
  heavy: 'Heavy Lag',
  reorder: 'Reorder/Burst',
  cross_country: 'Cross-Country',
  cross_country_chaos: 'Cross-Country Chaos',
};

export interface NetworkSimProfile {
  baseMs: number;
  jitterMs: number;
  spikeChance: number;
  spikeMs: number;
}

export const NETWORK_SIM_PROFILES: Record<NetworkSimMode, NetworkSimProfile> = {
  off: { baseMs: 0, jitterMs: 0, spikeChance: 0, spikeMs: 0 },
  moderate: { baseMs: 150, jitterMs: 75, spikeChance: 0, spikeMs: 0 },
  heavy: { baseMs: 500, jitterMs: 250, spikeChance: 0, spikeMs: 0 },
  reorder: { baseMs: 0, jitterMs: 600, spikeChance: 0, spikeMs: 0 },
  cross_country: { baseMs: 250, jitterMs: 100, spikeChance: 0.10, spikeMs: 1200 },
  // The continuous Chaos engine owns this mode's phase-specific values.
  cross_country_chaos: { baseMs: 0, jitterMs: 0, spikeChance: 0, spikeMs: 0 },
};

export interface NetworkSimRuntimeState {
  mode: NetworkSimMode;
  loggingEnabled: boolean;
  userId: string | null;
  gameId: string | null;
  roundId: string | null;
  handNumber: number | null;
}

const runtimeState: NetworkSimRuntimeState = {
  mode: 'off',
  loggingEnabled: false,
  userId: null,
  gameId: null,
  roundId: null,
  handNumber: null,
};

export function updateNetworkSimRuntime(partial: Partial<NetworkSimRuntimeState>): void {
  Object.assign(runtimeState, partial);
}

export function getNetworkSimRuntime(): Readonly<NetworkSimRuntimeState> {
  return runtimeState;
}
