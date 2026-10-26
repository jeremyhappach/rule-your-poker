// Local preview uses the real Lab panel/draft/footer; only persistence is isolated.
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {QuintzeeRollTimingPanel} from '@/components/admin/QuintzeeRollTimingPanel';
import {GeometryLabModalChrome} from '@/components/admin/GeometryLabModalChrome';
import {GeometryLabDraftProvider,useGeometryLabDraft} from '@/lib/geometryLab/GeometryLabDraftProvider';
import {_setFromLocalCommit} from '@/lib/geometryLab/defaultsRegistry';
import {QUINTZEE_ROLL_TIMING_KEY} from '@/lib/geometryLab/quintzeeRollTiming';
function LocalPersistence(){
 const {registerCommitAdapter,unregisterCommitAdapter}=useGeometryLabDraft();
 useEffect(()=>{registerCommitAdapter(QUINTZEE_ROLL_TIMING_KEY,async value=>{_setFromLocalCommit(QUINTZEE_ROLL_TIMING_KEY,value);return {ok:true};});return()=>unregisterCommitAdapter(QUINTZEE_ROLL_TIMING_KEY);},[registerCommitAdapter,unregisterCommitAdapter]);
 return <GeometryLabModalChrome><QuintzeeRollTimingPanel/></GeometryLabModalChrome>;
}
export function RollTimingLab(){const [open,setOpen]=useState(false);return <><style>{'.quintzee-timing-lab .sticky{position:static}'}</style><Button size="sm" style={{position:'fixed',top:8,right:8,zIndex:1000}} onClick={()=>setOpen(true)}>Geometry Lab</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="quintzee-timing-lab"><DialogTitle>Quintzee Roll Timing</DialogTitle><p>Local preview only. Apply saves in this browser; no production settings are written.</p><GeometryLabDraftProvider><LocalPersistence/></GeometryLabDraftProvider></DialogContent></Dialog></>;}
