export const TRI_TOWERS_HUMANS_ONLY_MESSAGE =
  'TriTowers currently requires 2–7 human players. Remove or sit out any bots before starting.';

// Only known setup exceptions become user-facing guidance. Unknown failures
// retain the shared fallback instead of exposing raw server messages.
const setupMessages = new Map<string, string>([
  ['tri_towers:humans_only', TRI_TOWERS_HUMANS_ONLY_MESSAGE],
  ['tri_towers:player_count', 'Have 2–7 human players take active seats before starting TriTowers.'],
  ['tri_towers:real_money_closed', 'TriTowers currently supports fake-money sessions only. Create a session with Real Money turned off.'],
  ['tri_towers:tester_required', 'Every human in the session needs an active approved account for TriTowers. Ask the host to check player access.'],
  ['tri_towers:release_closed', 'TriTowers is currently unavailable. Ask the host to check game access before trying again.'],
  ['tri_towers:dealer_required', 'Only the current human dealer can start TriTowers.'],
  ['tri_towers:config', 'Use a whole-number stake from 1 to 9,999. If setup has expired, return to the current dealer setup.'],
  ['tri_towers:setup_identity', 'The dealer or setup window has changed, or the session is paused or ending. Return to the current session setup before trying again.'],
  ['tri_towers:setup_replay_conflict', 'This setup was already submitted with different settings. Return to the session to see the current game.'],
  ['tri_towers:setup_retired', 'This setup is no longer current. Return to the session to continue.'],
  ['tri_towers:unfinished_pot', "The previous game's pot has not been settled. Finish that game before starting TriTowers."],
]);

export function triTowersSetupFailureMessage(message: string): string | null {
  return setupMessages.get(message.trim()) ?? null;
}
