import {useState} from 'react';
import {AlertDialog,AlertDialogTrigger,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import type {ChessSnapshot} from '@/lib/chess/client';
import {mayForfeitChess,type ChessIntent} from '@/lib/chess/rules';

export function ChessForfeitControl({view,pending,connected,onIntent}:{view:ChessSnapshot;pending:boolean;connected:boolean;onIntent:(intent:ChessIntent,revision?:number)=>Promise<boolean>}){
 const [confirmation,setConfirmation]=useState<number|null>(null);
 if(!mayForfeitChess(view,view.viewerId)||view.finished||view.settled)return null;
 const unavailable=pending||!connected||view.paused;
 return <AlertDialog open={confirmation!==null&&confirmation===view.revision&&!unavailable} onOpenChange={open=>setConfirmation(open?view.revision:null)}>
  <AlertDialogTrigger asChild><button disabled={unavailable}>Forfeit</button></AlertDialogTrigger>
  <AlertDialogContent><AlertDialogTitle>Forfeit this Chess game?</AlertDialogTitle>
   <AlertDialogDescription>Your opponent will win this game and its stake. This cannot be undone.</AlertDialogDescription>
   <AlertDialogFooter><AlertDialogCancel>Keep playing</AlertDialogCancel><AlertDialogAction disabled={unavailable} onClick={()=>{if(confirmation!==null)void onIntent({type:'resign'},confirmation);}}>Confirm forfeit</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent>
 </AlertDialog>;
}
