import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Slider} from '@/components/ui/slider';
import {useDomainDraft} from '@/lib/geometryLab/GeometryLabDraftProvider';
import {QUINTZEE_ROLL_TIMING_KEY,QUINTZEE_ROLL_TIMING_DEFAULTS,QUINTZEE_ROLL_TIMING_BOUNDS,sanitizeQuintzeeRollTiming,type QuintzeeRollTiming} from '@/lib/geometryLab/quintzeeRollTiming';

export function QuintzeeRollTimingPanel(){
 const {value,setValue,reset,dirty}=useDomainDraft<QuintzeeRollTiming>(QUINTZEE_ROLL_TIMING_KEY,QUINTZEE_ROLL_TIMING_DEFAULTS);
 const set=(durationMs:number)=>setValue(sanitizeQuintzeeRollTiming({durationMs}));
 return <div className="space-y-3 py-2">
  <div><Label htmlFor="quintzee-roll-duration">Roll duration (milliseconds)</Label>{dirty&&<span className="ml-2 text-xs text-amber-500">(draft)</span>}</div>
  <Input id="quintzee-roll-duration" type="number" {...QUINTZEE_ROLL_TIMING_BOUNDS} value={value.durationMs} onChange={e=>set(Number(e.target.value))}/>
  <Slider aria-label="Quintzee roll duration (milliseconds)" {...QUINTZEE_ROLL_TIMING_BOUNDS} value={[value.durationMs]} onValueChange={([v])=>set(v)}/>
  <p className="text-xs text-muted-foreground">{value.durationMs} ms of visible rumble, after the server response. Both themes use this duration. Reveal and controls unlock together; a roll already in progress keeps its original duration. Gameplay clocks are unchanged.</p>
  <Button size="sm" variant="outline" onClick={reset}>Reset section (draft only)</Button>
  <p className="text-xs text-muted-foreground">Default: 1500 ms. Apply Changes saves the draft; Cancel discards it.</p>
 </div>;
}
