import {useState,useSyncExternalStore} from 'react';
import {audioTrace} from '@/lib/audio/audioTrace';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';

export function AudioDiagnostics({onClose}:{onClose:()=>void}){
 const {active,saved}=useSyncExternalStore(audioTrace.subscribe,audioTrace.getSnapshot);
 const [message,setMessage]=useState(''),[text,setText]=useState('');
 const file=()=>new File([audioTrace.export()],`ptown-audio-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,{type:'application/json'});
 const share=async()=>{const report=file();try{
  if(navigator.canShare?.({files:[report]})){await navigator.share({files:[report],title:'P-Town audio trace'});return;}
  setText(audioTrace.export());setMessage('Use Save trace, or copy the text below.');
 }catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setMessage('Sharing was unavailable. Use Save trace or Copy trace.');}};
 const save=()=>{const report=file(),url=URL.createObjectURL(report),a=document.createElement('a');a.href=url;a.download=report.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const copy=async()=>{const report=audioTrace.export();try{await navigator.clipboard.writeText(report);setMessage('Trace copied. Paste it into this support chat.');}catch{setText(report);setMessage('Select and copy the trace below.');}};
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-w-sm max-h-[90%] overflow-y-auto">
  <DialogHeader><DialogTitle>Audio diagnostics</DialogTitle><DialogDescription>Record a local sound trace to help investigate missing cues.</DialogDescription></DialogHeader>
  <p className="text-sm">Start a trace, close this panel and play TriTowers. After a missing sound, return to Help → Audio diagnostics, stop and share the trace.</p>
  <p className="text-sm text-muted-foreground">Stops after 20 minutes or 1,200 events. It stays on this device until you share it. No microphone recording, cards or passwords are collected.</p>
  <p role="status">{active?'Recording sound events':saved?'Trace saved on this device':'Tracing is off'}</p>
  <div className="flex flex-wrap gap-2">
   {active?<Button onClick={()=>audioTrace.stop()}>Stop trace</Button>:<Button onClick={()=>{audioTrace.start();setText('');setMessage('');}}>{saved?'Start new trace':'Start trace'}</Button>}
   {saved&&<><Button variant="outline" onClick={()=>void share()}>Share trace</Button><Button variant="outline" onClick={save}>Save trace</Button><Button variant="outline" onClick={()=>void copy()}>Copy trace</Button><Button variant="ghost" onClick={()=>{audioTrace.clear();setText('');setMessage('');}}>Clear trace</Button></>}
  </div>
  {message&&<p role="status" className="text-sm">{message}</p>}
  {text&&<textarea aria-label="Audio trace text" readOnly value={text} rows={6} className="w-full min-w-0 border rounded p-2 text-xs"/>}
 </DialogContent></Dialog>;
}
