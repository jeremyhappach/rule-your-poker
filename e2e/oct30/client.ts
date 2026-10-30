import { supabase as base, smokeDb } from '../incidents/localClient';
export { smokeDb };
const pending: Array<(value: unknown) => void> = [];
export const defaults = { release() { for (const resolve of pending.splice(0)) resolve({ data: { holm_multi_showdown_delay_ms: 1000 }, error: null }); } };
export const supabase = { ...base, from(table: string) {
  const q = base.from(table);
  if (table !== 'game_defaults') return q;
  const select = q.select;
  q.select = (fields: string) => {
    if (fields.includes('holm_multi_showdown_delay_ms')) q.maybeSingle = () => new Promise(resolve => pending.push(resolve));
    return select(fields);
  };
  return q;
} };
