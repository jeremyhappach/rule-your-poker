import type { NetworkSimMode } from './networkSim';

export function resolveNetworkSimulation(
  configuredMode: NetworkSimMode,
  configuredLogging: boolean,
  harnessesModeEnabled: boolean,
): { mode: NetworkSimMode; loggingEnabled: boolean } {
  if (!harnessesModeEnabled) return { mode: 'off', loggingEnabled: false };
  return { mode: configuredMode, loggingEnabled: configuredLogging };
}
