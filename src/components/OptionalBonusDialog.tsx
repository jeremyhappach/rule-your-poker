import {AlertDialog,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {Button} from '@/components/ui/button';
import type {OptionalBonus} from '@/lib/optionalBonus';

/** The server owns eligibility and completion. This modal only sends a choice. */
export function OptionalBonusDialog({decision,actor,disabled=false,error,onChoice,onReconnect}:{decision?:OptionalBonus|null;actor?:string|null;disabled?:boolean;error?:string;onChoice:(choice:'play'|'skip')=>void;onReconnect?:()=>void}){
 return <AlertDialog open={decision?.choice==='pending'&&decision.actor===actor}><AlertDialogContent>
  <AlertDialogTitle>Play your bonus round?</AlertDialogTitle>
  <AlertDialogDescription>You won this game either way.</AlertDialogDescription>
  {error&&<p role="alert">{error}{onReconnect&&<Button variant="outline" onClick={onReconnect}>Reconnect</Button>}</p>}
  <AlertDialogFooter>
   <Button disabled={disabled||!!error} onClick={()=>onChoice('play')}>Play Bonus</Button>
   <Button variant="secondary" disabled={disabled||!!error} onClick={()=>onChoice('skip')}>Skip Bonus</Button>
  </AlertDialogFooter>
 </AlertDialogContent></AlertDialog>;
}
