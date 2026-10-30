/** One privacy-safe string for the canonical rail and its accessible text. */
export function formatThreeFiveSevenShowdownAnnouncement(result: string | null | undefined, reveal: boolean, round: number) {
  const parts = result?.split('|||') ?? [];
  const base = parts[0] ?? '';
  const hand = parts.find(part => part.startsWith('HANDNAME:'));
  // Current authority emits plain "X wins with Y". Older in-flight results
  // used HANDNAME metadata; both must pass through the same privacy boundary.
  const current = base.match(/^(.*?) wins with (.+)$/);
  if (!hand && !current) return base;
  const winner = current?.[1] ?? base.replace(/ won showdown$/, '');
  if (!reveal) return `${winner} won (no reveal)`;
  // In rounds 1/2 the cards have selective visibility, but the announcement
  // must remain secret for every viewer, including players who stayed.
  if (round < 3) return `${winner} wins (secret reveal)`;
  return current ? base : `${winner} won with ${hand!.slice('HANDNAME:'.length)}`;
}
