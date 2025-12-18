export function createUuid(): string {
  // Prefer native crypto.randomUUID when available.
  // Fallback for older mobile browsers (notably some iOS versions).
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof (c as any).randomUUID === 'function') {
    return (c as any).randomUUID();
  }

  if (!c || typeof c.getRandomValues !== 'function') {
    // Last-resort fallback (should be rare). Not cryptographically strong.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = Math.floor(Math.random() * 16);
      const v = ch === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);

  // Per RFC 4122 section 4.4
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
