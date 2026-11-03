import {Info} from 'lucide-react';
import {Dialog,DialogClose,DialogContent,DialogDescription,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
import type {Home} from '@/lib/delayed/client';
import {AsyncSessionName} from './AsyncSessionName';
import {CurrentNet} from './CurrentNet';
import {PushPreferences} from './PushPreferences';

export function MatchInfo({home,userId,historical}:{home:Home;userId:string;historical:boolean}){
 const status=home.status==='settled'?'Completed':home.status.charAt(0).toUpperCase()+home.status.slice(1);
 return <section className="async-match-info" aria-label="Match Info">
  <div className="async-match-info-heading">
   <h2><AsyncSessionName realMoney={home.realMoney}>{home.players.map(p=>p.name).join(' vs. ')}</AsyncSessionName></h2>
   <Dialog>
    <DialogTrigger asChild><button type="button" className="async-match-info-trigger" aria-label="Match information"><Info aria-hidden="true" size={22}/></button></DialogTrigger>
    <DialogContent className="async-match-info-dialog" showCloseButton={false}>
     <DialogTitle>Match Info</DialogTitle>
     <DialogDescription>Match details and turn rules</DialogDescription>
     <dl>
      <div><dt>Money mode</dt><dd>{home.realMoney?'Real Money':'Fake Money'}</dd></div>
      <div><dt>Match status</dt><dd>{status}</dd></div>
      <div><dt>Progress</dt><dd>{home.completed}/{home.lineup.length} Complete</dd></div>
      <div><dt>Maximum loss per player</dt><dd>{home.realMoney?'$':''}{home.exposure.toLocaleString()}</dd></div>
     </dl>
     <p>A missed deadline forfeits this game only.</p>
     <p>{home.realMoney?'One net settlement after all games finish.':'Play money settles once at the end; real balances are unaffected.'}</p>
     <DialogClose asChild><button type="button" className="async-match-info-close">Done</button></DialogClose>
    </DialogContent>
   </Dialog>
  </div>
  {home.acceptedAt&&<CurrentNet home={home} userId={userId}/>}
  <p className="async-match-timing"><strong>36h</strong> per turn · Last Call <strong>24h</strong></p>
  {!historical&&<PushPreferences key={userId+home.id} userId={userId} matchId={home.id}/>}
 </section>;
}
