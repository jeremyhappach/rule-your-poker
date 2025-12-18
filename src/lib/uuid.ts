/**
 * UUID generation utility with fallback for browsers without crypto.randomUUID
 * Some mobile browsers (especially older ones) don't support crypto.randomUUID()
 */
export function generateUUID(): string {
  console.log('[UUID] Generating UUID...');
  
  // Try native crypto.randomUUID first
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      const uuid = crypto.randomUUID();
      console.log('[UUID] Generated via crypto.randomUUID:', uuid);
      return uuid;
    } catch (e) {
      console.warn('[UUID] crypto.randomUUID() failed, using fallback:', e);
    }
  } else {
    console.warn('[UUID] crypto.randomUUID not available, using fallback');
  }
  
  // Fallback implementation using crypto.getRandomValues
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      
      // Set version (4) and variant bits
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      console.log('[UUID] Generated via crypto.getRandomValues fallback:', uuid);
      return uuid;
    } catch (e) {
      console.warn('[UUID] crypto.getRandomValues() fallback failed:', e);
    }
  }
  
  // Last resort: Math.random() based UUID (not cryptographically secure but works everywhere)
  console.warn('[UUID] Using Math.random() fallback - not cryptographically secure');
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  console.log('[UUID] Generated via Math.random fallback:', uuid);
  return uuid;
}
