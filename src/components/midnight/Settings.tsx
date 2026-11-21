import {useId,type ReactNode} from 'react';
import {Input} from '@/components/ui/input';
import {Switch} from '@/components/ui/switch';
import './midnight.css';

export function AmountControl({label,value,onChange,min=0,max,disabled=false,id,prefix='$',invalid}:{label:string;value:string;onChange:(value:string)=>void;min?:number;max?:number;disabled?:boolean;id?:string;prefix?:string;invalid?:boolean}){
  const step=(delta:number)=>onChange(String(Math.max(min,Math.min(max??Infinity,(Number(value)||0)+delta))));
  return <div className="midnight-amount"><button type="button" aria-label={'Decrease '+label} disabled={disabled||Number(value)<=min} onClick={()=>step(-1)}>−</button><div><span aria-hidden="true">{prefix}</span><Input id={id} aria-label={label} aria-invalid={invalid} type="text" inputMode="numeric" value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/></div><button type="button" aria-label={'Increase '+label} disabled={disabled||(max!==undefined&&Number(value)>=max)} onClick={()=>step(1)}>+</button></div>;
}
export function SettingRow({label,value,open,onToggle,children}:{label:string;value:ReactNode;open:boolean;onToggle:()=>void;children:ReactNode}){
  const id=useId();
  return <section className="midnight-setting"><button type="button" className="midnight-setting-summary" aria-expanded={open} aria-controls={id} onClick={onToggle}><span>{label}</span><strong>{value}</strong><span aria-hidden="true">{open?'⌃':'›'}</span></button><div id={id} hidden={!open} className="midnight-setting-editor">{children}</div></section>;
}
export function ToggleRow({label,description,checked,onChange}:{label:string;description?:string;checked:boolean;onChange:(value:boolean)=>void}){
  const id=useId();
  return <div className="midnight-toggle"><label htmlFor={id}>{label}{description&&<small>{description}</small>}</label><Switch id={id} checked={checked} onCheckedChange={onChange}/></div>;
}
