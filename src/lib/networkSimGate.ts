import type { NetworkSimMode } from './networkSim';

export function resolveNetworkSimulation(
  configuredMode: NetworkSimMode,
  configuredLogging: boolean,
): { mode: NetworkSimMode; loggingEnabled: boolean } {
  // Network conditions are a per-user transport preference, not a game-rule
  // harness. The global Harnesses Mode gate must never change this result.
  return { mode: configuredMode, loggingEnabled: configuredLogging };
}
