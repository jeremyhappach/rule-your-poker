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
  _diceValues: number[],
  _heldMask: boolean[],
  _context: DiceAuditContext
): void {
  // Dice audit logging disabled — kept as no-op stub
}

/**
 * Get the current roll number (1, 2, or 3) based on rollsRemaining.
 * rollsRemaining = 3 means first roll, etc.
 */
export function getRollNumber(rollsRemainingBefore: number): number {
  // If rollsRemaining was 3, this is roll 1; if 2, roll 2; if 1, roll 3
  return 4 - rollsRemainingBefore;
}
