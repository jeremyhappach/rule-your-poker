/**
 * Dice Roll Audit Logging
 * 
 * Temporary system to record every die value for statistical validation.
 * Records individual die values to verify uniform distribution (~16.67% per numeral).
 */

import { supabase } from "@/integrations/supabase/client";

interface DiceAuditContext {
  gameId?: string;
  roundId?: string;
  playerId?: string;
  rollNumber: number; // 1, 2, or 3
}

/**
 * Log individual die values to the audit table.
 * Fire-and-forget - doesn't block gameplay.
 */
export function logDiceRolls(
  diceValues: number[],
  heldMask: boolean[],
  context: DiceAuditContext
): void {
  // Only log dice that were actually rolled (not held)
  const inserts: Array<{
    game_id: string | null;
    round_id: string | null;
    player_id: string | null;
    die_index: number;
    die_value: number;
    roll_number: number;
  }> = [];

  diceValues.forEach((value, index) => {
    // Only log unheld dice (the ones that were actually rolled)
    if (!heldMask[index] && value >= 1 && value <= 6) {
      inserts.push({
        game_id: context.gameId ?? null,
        round_id: context.roundId ?? null,
        player_id: context.playerId ?? null,
        die_index: index,
        die_value: value,
        roll_number: context.rollNumber,
      });
    }
  });

  if (inserts.length === 0) return;

  // Fire-and-forget insert
  supabase
    .from("dice_roll_audit" as any)
    .insert(inserts as any)
    .then(({ error }) => {
      if (error) {
        console.warn("[DICE_AUDIT] Failed to log rolls:", error.message);
      }
    });
}

/**
 * Get the current roll number (1, 2, or 3) based on rollsRemaining.
 * rollsRemaining = 3 means first roll, etc.
 */
export function getRollNumber(rollsRemainingBefore: number): number {
  // If rollsRemaining was 3, this is roll 1; if 2, roll 2; if 1, roll 3
  return 4 - rollsRemainingBefore;
}
