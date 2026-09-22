import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loadFarkleAdminDefaults, saveFarkleAdminDefaults, type FarkleAdminDefaults } from '@/lib/farkle/dealerDefaults';
import { FARKLE_ENDGAME_LABELS, type FarkleEndgame, type FarkleRules } from '@/lib/farkle/types';

const kinds = ['3', '4', '5', '6'] as const;
const combos = [
  ['straight', 'Straight'], ['threePairs', 'Three pairs'],
  ['twoTriplets', 'Two triplets'], ['fourPlusPair', 'Four of a kind + pair'],
] as const;

/** Edits only the Farkle Admin Defaults row. Frozen dealer-game configs are never updated. */
export function FarkleDefaultsEditor() {
  const [defaults, setDefaults] = useState<FarkleAdminDefaults | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastEnabled, setLastEnabled] = useState<Partial<Record<(typeof combos)[number][0], number>>>({});
  useEffect(() => {
    let active = true;
    loadFarkleAdminDefaults().then(value => { if (active) setDefaults(value); })
      .catch(() => { if (active) setError('Farkle defaults are unavailable.'); });
    return () => { active = false; };
  }, []);
  if (!defaults) return <p role="status">{error || 'Loading Farkle defaults…'}</p>;

  const { scoring, endgame, botPolicy, botBankThreshold } = defaults.farkle_rules;
  const update = (patch: Partial<FarkleAdminDefaults>) => { setSaved(false); setDefaults(current => current && { ...current, ...patch }); };
  const updateRules = (rules: Partial<FarkleAdminDefaults['farkle_rules']>) => update({ farkle_rules: { ...defaults.farkle_rules, ...rules } });
  const updateScoring = (rules: Partial<FarkleRules>) => updateRules({ scoring: { ...scoring, ...rules } });
  const numeric = (label: string, value: number, onChange: (value: number) => void, min = 0, step = 1) =>
    <Label className="flex items-center justify-between gap-2 text-sm" key={label}><span>{label}</span>
      <Input aria-label={label} type="number" inputMode="decimal" min={min} step={step} className="w-24" value={value}
        onChange={event => onChange(Number(event.target.value))} /></Label>;
  const save = async () => {
    setSaving(true); setError(''); setSaved(false);
    try { setDefaults(await saveFarkleAdminDefaults(defaults)); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save Farkle defaults.'); }
    finally { setSaving(false); }
  };

  return <section className="space-y-4" aria-label="Farkle admin defaults">
    <p className="text-sm">Changes apply to new dealer games only. Existing games keep their frozen rules.</p>
    <div className="grid gap-2">
      {numeric('Default stake', defaults.ante_amount, ante_amount => update({ ante_amount }), 1)}
      {numeric('Target score', defaults.points_to_win, points_to_win => update({ points_to_win }), 1)}
      <Label className="flex items-center justify-between gap-2 text-sm"><span>Default endgame</span><select aria-label="Default endgame" className="rounded border border-input bg-background p-2" value={endgame}
        onChange={event => updateRules({ endgame: event.target.value as FarkleEndgame })}>
        {Object.entries(FARKLE_ENDGAME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></Label>
      <p className="text-xs">Opening minimum: none · Repeated-Farkle penalty: unsupported in v1</p>
      <p className="text-sm">Bot policy: {botPolicy}</p>
      {numeric('Bot bank threshold', botBankThreshold, botBankThreshold => updateRules({ botBankThreshold }), 1)}
      {numeric('Human turn seconds', defaults.decision_timer_seconds, decision_timer_seconds => update({ decision_timer_seconds }), 1)}
      {numeric('Bot action delay seconds', defaults.bot_decision_delay_seconds, bot_decision_delay_seconds => update({ bot_decision_delay_seconds }), 0.001, 0.001)}
    </div>
    <div className="space-y-2 border-t pt-3"><h3 className="font-semibold">Scoring</h3>
      <p className="text-xs">Set a score to 0 to disable that scoring rule. The server uses the highest legal interpretation.</p>
      {numeric('Single 1', scoring.singles['1'], value => updateScoring({ singles: { ...scoring.singles, '1': value } }))}
      {numeric('Single 5', scoring.singles['5'], value => updateScoring({ singles: { ...scoring.singles, '5': value } }))}
      {kinds.map(kind => <div key={kind} className="grid gap-1 border-t pt-2"><strong className="text-sm">{kind} of a kind</strong>
        {scoring.ofAKind[kind].map((value, index) => numeric(`${kind} × ${index + 1}`, value, next => updateScoring({ ofAKind: {
          ...scoring.ofAKind, [kind]: scoring.ofAKind[kind].map((prior, i) => i === index ? next : prior),
        } }), 0))}
      </div>)}
      {combos.map(([key, label]) => <div key={key} className="flex items-center gap-2">
        <Label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`${label} enabled`} checked={scoring[key] > 0}
          onChange={event => {
            if (!event.target.checked) setLastEnabled(previous => ({ ...previous, [key]: scoring[key] }));
            updateScoring({ [key]: event.target.checked ? (lastEnabled[key] ?? 1) : 0 });
          }} />{label}</Label>
        <Input aria-label={`${label} points`} type="number" min="0" step="1" className="ml-auto w-24" value={scoring[key]}
          onChange={event => updateScoring({ [key]: Number(event.target.value) })} />
      </div>)}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm">Farkle defaults saved for future games.</p>}
    <Button type="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Farkle Defaults'}</Button>
  </section>;
}
