/**
 * Utility functions for compact hand descriptions in Hand History
 * These shortened descriptions are ONLY used in the history panel,
 * not in live dealer announcements.
 */

/**
 * Convert a verbose hand description to a compact format for hand history display.
 * Examples:
 * - "Hap won showdown with a pair of Kings" → "Hap: pair K"
 * - "Bot 2 won with Two pair - Aces and 7s" → "Bot 2: two pair A/7"
 * - "everyone folded - pussy tax" → "pussy tax"
 * - "Bot 2 won leg" → "Bot 2 ($2)" (value passed separately)
 * - "3 players anted $1" → "3 × $1"
 */
export function compactHandDescription(
  description: string | null | undefined,
  winnerName?: string | null
): string {
  if (!description) return '';
  
  const desc = description.toLowerCase();
  
  // "everyone folded - pussy tax" → "pussy tax"
  if (desc.includes('everyone folded') || desc.includes('pussy tax')) {
    return 'pussy tax';
  }
  
  // Ante descriptions: "3 players anted $1" → "3 × $1"
  const anteMatch = description.match(/(\d+)\s*players?\s*anted?\s*\$?(\d+)/i);
  if (anteMatch) {
    return `${anteMatch[1]} × $${anteMatch[2]}`;
  }
  
  // Leg purchase: extract player and value from winning_hand_description
  // Format is usually "PlayerName won leg" - we want "PlayerName ($X)"
  if (desc.includes('won leg') || desc.includes('leg purchase')) {
    // The value will be formatted by the caller with the chip delta
    return winnerName || 'Leg';
  }
  
  // Holm-specific: Handle various Holm showdown descriptions
  // Patterns: "Won showdown (chopped)", "Won showdown (continued)", truncated "Won show..."
  // Also: "beat Chucky", "beats Chucky", "X won - beats Chucky"
  if (desc.includes('won showdown') || desc.includes('won show')) {
    // Extract just the core outcome - check for various patterns
    if (desc.includes('chop') || desc.includes('split')) {
      return winnerName ? `${winnerName}: chopped` : 'chopped';
    }
    if (desc.includes('beat') && desc.includes('chucky')) {
      return winnerName ? `${winnerName}: beat Chucky` : 'beat Chucky';
    }
    // "continued" or truncated "continu" or "co..."
    if (desc.includes('continu') || desc.includes('(co')) {
      return winnerName ? `${winnerName}: won` : 'won';
    }
    // Generic showdown win - extract hand if present
    const handRank = extractCompactHandRank(description);
    if (handRank && winnerName) {
      return `${winnerName}: ${handRank}`;
    }
    return winnerName ? `${winnerName}: won` : 'won';
  }
  
  // Additional Holm patterns: "X beats Chucky" or "beats Chucky with..."
  if (desc.includes('beats chucky') || desc.includes('beat chucky')) {
    return winnerName ? `${winnerName}: beat Chucky` : 'beat Chucky';
  }
  
  // Fix malformed descriptions like "Won showdown with Won show..."
  // These happen when the description gets duplicated/corrupted
  let cleanDesc = description;
  const wonShowMatch = description.match(/won\s+(showdown\s+)?with\s+won\s+show/i);
  if (wonShowMatch) {
    // Try to extract the actual hand after the corruption
    cleanDesc = description.replace(/won\s+(showdown\s+)?with\s+won\s+show[^\w]*/i, '');
  }
  
  // Showdown descriptions - extract the hand rank
  // "Hap won showdown with a pair of Kings" → "pair K"
  // "Bot 2 won with Two pair - Aces and 7s" → "two pair A/7"
  const handRank = extractCompactHandRank(cleanDesc);
  if (handRank && winnerName) {
    return `${winnerName}: ${handRank}`;
  }
  if (handRank) {
    return handRank;
  }
  
  // Chopped pot
  if (desc.includes('chop') || desc.includes('split')) {
    return winnerName ? `${winnerName}: chopped` : 'chopped';
  }
  
  // Beat Chucky descriptions (already handled above, but keep as fallback)
  if (desc.includes('beat chucky') || desc.includes('beats chucky')) {
    return winnerName ? `${winnerName}: beat Chucky` : 'beat Chucky';
  }
  
  // Fallback: just return a truncated version
  if (description.length > 30) {
    return description.substring(0, 27) + '...';
  }
  
  return description;
}

/**
 * Extract a compact hand rank from a description.
 * Examples:
 * - "pair of Kings" → "pair K"
 * - "Two pair - Aces and 7s" → "two pair A/7"
 * - "Flush - hearts" → "flush"
 * - "Straight - 5 high" → "straight 5"
 * - "Full house - Kings over 3s" → "full house K/3"
 * - "Three of a kind - 8s" → "trips 8"
 * - "High card - Ace" → "high A"
 */
function extractCompactHandRank(description: string): string | null {
  const desc = description.toLowerCase();
  
  // Royal flush
  if (desc.includes('royal flush')) return 'royal flush';
  
  // Straight flush
  if (desc.includes('straight flush')) {
    const highMatch = desc.match(/straight flush[^]*?(\d+|ace|king|queen|jack|ten)/i);
    return highMatch ? `str flush ${rankToShort(highMatch[1])}` : 'str flush';
  }
  
  // Four of a kind / Quads
  if (desc.includes('four of a kind') || desc.includes('quads')) {
    const rankMatch = desc.match(/(?:four of a kind|quads)[^]*?(\d+s?|aces?|kings?|queens?|jacks?|tens?)/i);
    return rankMatch ? `quads ${rankToShort(rankMatch[1])}` : 'quads';
  }
  
  // Full house
  if (desc.includes('full house')) {
    const fullMatch = desc.match(/full house[^]*?(\d+s?|aces?|kings?|queens?|jacks?|tens?)[^]*?(?:over|and)[^]*?(\d+s?|aces?|kings?|queens?|jacks?|tens?)/i);
    if (fullMatch) {
      return `full ${rankToShort(fullMatch[1])}/${rankToShort(fullMatch[2])}`;
    }
    return 'full house';
  }
  
  // Flush
  if (desc.includes('flush') && !desc.includes('straight')) {
    return 'flush';
  }
  
  // Straight
  if (desc.includes('straight') && !desc.includes('flush')) {
    const highMatch = desc.match(/straight[^]*?(\d+|ace|king|queen|jack|ten)/i);
    return highMatch ? `straight ${rankToShort(highMatch[1])}` : 'straight';
  }
  
  // Three of a kind / Trips / Set
  if (desc.includes('three of a kind') || desc.includes('trips') || desc.includes('set')) {
    const rankMatch = desc.match(/(?:three of a kind|trips|set)[^]*?(\d+s?|aces?|kings?|queens?|jacks?|tens?)/i);
    return rankMatch ? `trips ${rankToShort(rankMatch[1])}` : 'trips';
  }
  
  // Two pair
  if (desc.includes('two pair')) {
    const twoMatch = desc.match(/two pair[^]*?(\d+s?|aces?|kings?|queens?|jacks?|tens?)[^]*?(?:and|\/)[^]*?(\d+s?|aces?|kings?|queens?|jacks?|tens?)/i);
    if (twoMatch) {
      return `two pair ${rankToShort(twoMatch[1])}/${rankToShort(twoMatch[2])}`;
    }
    return 'two pair';
  }
  
  // Pair
  if (desc.includes('pair')) {
    const pairMatch = desc.match(/pair[^]*?(?:of\s+)?(\d+s?|aces?|kings?|queens?|jacks?|tens?)/i);
    return pairMatch ? `pair ${rankToShort(pairMatch[1])}` : 'pair';
  }
  
  // High card
  if (desc.includes('high card') || desc.includes('high -')) {
    const highMatch = desc.match(/high[^]*?(\d+|ace|king|queen|jack|ten)/i);
    return highMatch ? `high ${rankToShort(highMatch[1])}` : 'high card';
  }
  
  // 3-5-7 specific
  if (desc.includes('3-5-7') || desc.includes('357')) {
    return '3-5-7!';
  }
  
  // Legs winner pattern: "X legs"
  const legsMatch = desc.match(/(\d+)\s*legs?/i);
  if (legsMatch) {
    return `${legsMatch[1]} legs`;
  }
  
  return null;
}

/**
 * Convert a rank name to a short form
 * - "Kings" → "K"
 * - "Aces" → "A"
 * - "10s" → "10"
 */
function rankToShort(rank: string): string {
  const r = rank.toLowerCase().replace(/s$/, ''); // Remove trailing 's'
  
  switch (r) {
    case 'ace': case 'a': return 'A';
    case 'king': case 'k': return 'K';
    case 'queen': case 'q': return 'Q';
    case 'jack': case 'j': return 'J';
    case 'ten': case '10': return '10';
    case '9': case '8': case '7': case '6': case '5': case '4': case '3': case '2':
      return r;
    default:
      // Try to extract just the number
      const numMatch = rank.match(/(\d+)/);
      return numMatch ? numMatch[1] : rank.charAt(0).toUpperCase();
  }
}

/**
 * Format a leg award description compactly
 * @param winnerName - The name of the player who won the leg
 * @param legValue - The value of the leg in chips
 */
export function compactLegDescription(winnerName: string, legValue?: number): string {
  if (legValue !== undefined && legValue > 0) {
    return `${winnerName} ($${legValue})`;
  }
  return winnerName;
}
