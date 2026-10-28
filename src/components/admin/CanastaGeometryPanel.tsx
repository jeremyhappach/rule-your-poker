import {useEffect} from 'react';
import {useDomainDraft} from '@/lib/geometryLab/GeometryLabDraftProvider';
import {CANASTA_GEOMETRY_KEY,CANASTA_GEOMETRY_DEFAULTS,CANASTA_GEOMETRY_BOUNDS,previewCanastaGeometry,type CanastaGeometry} from '@/components/canasta/geometry';
import {BufferedRatioInput} from './BufferedRatioInput';
const controls:{key:keyof CanastaGeometry;label:string;unit:string}[]=[
  {key:'cardWidth',label:'Card width',unit:'px'},{key:'handOverlap',label:'Hand fan overlap',unit:'ratio'},
  {key:'meldOverlap',label:'Meld fan overlap',unit:'ratio'},{key:'summaryWidth',label:'Summary width',unit:'felt'},
  {key:'pileBottom',label:'Pile bottom',unit:'felt'},{key:'pileGap',label:'Stock / discard gap',unit:'card'},
];
export function CanastaGeometryPanel(){
  const {value,setValue,reset}=useDomainDraft<CanastaGeometry>(CANASTA_GEOMETRY_KEY,CANASTA_GEOMETRY_DEFAULTS);
  useEffect(()=>{previewCanastaGeometry(value);return()=>previewCanastaGeometry(null);},[value]);
  return <section className="space-y-3" aria-label="Canasta geometry"><h3 className="font-semibold">Canasta cards and meld summary</h3>
    <p className="text-xs">Fans keep rank, suit and Joker marks exposed. Hand selection keeps at least 44px exposed targets. Felt placement stops before seats and the rail. Apply Changes saves; Cancel restores.</p>
    {controls.map(({key,label,unit})=><div className="flex items-center justify-between gap-2" key={key}><label>{label}</label><BufferedRatioInput value={value[key]} min={CANASTA_GEOMETRY_BOUNDS[key][0]} max={CANASTA_GEOMETRY_BOUNDS[key][1]} unitLabel={unit} ariaLabel={'Canasta '+label} onCommit={n=>setValue(old=>({...old,[key]:n}))}/></div>)}
    <button type="button" onClick={reset}>Reset Canasta geometry</button>
  </section>;
}
