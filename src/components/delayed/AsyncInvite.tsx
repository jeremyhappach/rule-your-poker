import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {ArrowDownAZ,History} from 'lucide-react';
import {delayedRpc,gameName,type Home} from '@/lib/delayed/client';
import {AsyncLineupEditor} from './AsyncLineupEditor';
import '@/components/midnight/midnight.css';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {configurationIssue,readRunback,reconstructRunback,runbackReturn,saveRunback,validDraftId,type Capabilities,type InviteEntry,type InvitePerson,type RunbackDraft} from '@/lib/delayed/runback';

export function AsyncInvite({userId=''}:{userId?:string}){
 const navigate=useNavigate(),[query,setQuery]=useSearchParams(),source=query.get('runback');
 const [draftId]=useState(()=>validDraftId(query.get('draft'))?query.get('draft')!:crypto.randomUUID());
 const returnTo=source?runbackReturn(query.get('return'),source):'/delayed';
 const [lineup,setLineup]=useState<InviteEntry[]>([]);
 const [caps,setCaps]=useState<Capabilities>({enabled:false,fake_money_only:true,max_children:1,games:[]});
 const [search,setSearch]=useState(''),[sort,setSort]=useState<'username'|'recent'>('recent');
 const [realMoney,setRealMoney]=useState(!source),[draft,setDraft]=useState<RunbackDraft|null>(null),[loaded,setLoaded]=useState(!source);
 const [opponentStage,setOpponentStage]=useState(false);
 const [confirmFake,setConfirmFake]=useState(false);
 const sendButton=useRef<HTMLButtonElement>(null);
 const [people,setPeople]=useState<InvitePerson[]>([]),[opponent,setOpponent]=useState<InvitePerson|null>(null),[cursor,setCursor]=useState<unknown>(null),[more,setMore]=useState(false);
 const [loading,setLoading]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[peopleError,setPeopleError]=useState(''),[storageError,setStorageError]=useState('');
 const edited=useRef(false),request=useRef<string|null>(null),epoch=useRef(0),busy=useRef(false);
 const realAvailable=!caps.fake_money_only,enabled=caps.enabled,maxChildren=caps.max_children;
 const defaultStake=(game:string)=>String(caps.games.find(g=>g.id===game)?.stake??5);
 const stake=lineup.reduce((sum,c)=>sum+(Number(c.stake)||0),0);
 const policyIssue=!!source&&draft?.policyVersion!=='delayed/1';
 const issues=lineup.map(c=>configurationIssue(c,caps));
 const valid=loaded&&!storageError&&!policyIssue&&(!realMoney||realAvailable)&&lineup.length>0&&lineup.length<=maxChildren&&lineup.every((c,i)=>!issues[i]&&/^[1-9][0-9]{0,3}$/.test(c.stake));
 const locked=pending||!!draft?.submission;

 useEffect(()=>{
  if(source&&query.get('draft')!==draftId){const next=new URLSearchParams(query);next.set('draft',draftId);setQuery(next,{replace:true});}
 },[source,draftId,query,setQuery]);
 useEffect(()=>{let alive=true;
  void Promise.all([delayedRpc<Capabilities>('delayed_capabilities'),source?delayedRpc<Home>('delayed_history_detail',{p_match:source}):Promise.resolve(null)]).then(([capabilities,home])=>{
   if(!alive)return;setCaps(capabilities);
   if(home&&source){
    const original=reconstructRunback(home,userId),saved=readRunback(userId,draftId,source),value=saved??original;
    if(saved?.sent){navigate('/delayed',{replace:true});return;}
    if(value.opponent.id===original.opponent.id)value.opponent={...value.opponent,isHuman:original.opponent.isHuman};
    setDraft(value);setLineup(value.lineup);setOpponent(value.opponent);setRealMoney(value.realMoney);setLoaded(true);if(value.submission)setOpponentStage(true);
   }else{
    if(capabilities.fake_money_only)setRealMoney(false);
    if(!edited.current)setLineup(old=>old.map(c=>({...c,stake:String(capabilities.games.find(g=>g.id===c.game)?.stake??c.stake)})));
   }
  }).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};
 },[source,userId,draftId,navigate]);
 useEffect(()=>{
  if(!source||!loaded||!draft||!opponent)return;
  try{saveRunback(userId,draftId,{...draft,lineup,opponent,realMoney});setStorageError('');}
  catch(e){setStorageError((e as Error).message);}
 },[source,loaded,draft,lineup,opponent,realMoney,userId,draftId]);

 const loadPeople=useCallback((after:unknown=null)=>{const generation=++epoch.current;setLoading(true);
  void delayedRpc<{items:InvitePerson[];next:unknown;hasMore:boolean}>('delayed_opponent_page',{p_search:search,p_sort:sort,p_after:after}).then(v=>{
   if(generation!==epoch.current)return;const humans=v.items.filter(p=>p.isHuman===true);
   setPeople(old=>after?[...old,...humans.filter(p=>!old.some(o=>o.id===p.id))]:humans);setCursor(v.next);setMore(v.hasMore);setPeopleError('');
  }).catch(e=>{if(generation===epoch.current)setPeopleError(e.message);}).finally(()=>{if(generation===epoch.current)setLoading(false);});
 },[search,sort]);
 useEffect(()=>{setPeople([]);setCursor(null);setMore(false);loadPeople();return()=>{epoch.current++;};},[loadPeople]);
 function changeMoney(value:boolean){
  setRealMoney(value);request.current=null;
  // Keep historical stakes across explicit mode changes; ordinary creation keeps its established reset.
  if(!value&&!source)setLineup(old=>old.map(c=>({...c,stake:defaultStake(c.game)})));
 }
 async function invite(confirmedFake=false){
  if(busy.current||(!draft?.submission&&(!enabled||!opponent?.isHuman||!valid)))return;
  if(!realMoney&&!draft?.submission&&!confirmedFake){setConfirmFake(true);return;}
  setConfirmFake(false);
  busy.current=true;setPending(true);setError('');request.current??=source?draftId:crypto.randomUUID();
  try{
   const payload=draft?.submission??{p_request:request.current,p_opponent:opponent!.id,p_real_money:realMoney,
    p_lineup:lineup.map(({game,stake,config})=>({game,stake:Number(stake),...(source||game==='mega-card-golf'?{config}:{} )}))};
   if(source&&draft){const sending={...draft,lineup,opponent:opponent!,realMoney,submission:payload};saveRunback(userId,draftId,sending);setDraft(sending);}
   await delayedRpc<string>('delayed_create',payload);
   if(source&&draft)saveRunback(userId,draftId,{...draft,lineup,opponent:opponent!,realMoney,submission:payload,sent:true});
   navigate('/delayed',{replace:true});
  }catch(e){
   const message=e instanceof Error?e.message:'Unable to invite.';
   // A declared validation rejection rolls the SQL transaction back. A lost response
   // stays locked to its original payload until the existing receipt is recovered.
   if(source&&draft&&/^delayed:(unsupported_configuration|invalid_child|invalid_offer|not_authorized|real_money_closed|admission_closed|scope_closed|maintenance)$/.test(message)){
    const editable={...draft,lineup,opponent:opponent!,realMoney,submission:undefined};
    try{saveRunback(userId,draftId,editable);setDraft(editable);}catch(storage){setStorageError((storage as Error).message);}
   }
   setError(message);busy.current=false;setPending(false);
  }
 }
 if(source&&!loaded)return <section className="delayed-invite midnight-invite"><Link className="delayed-back" to={returnTo}>← Back</Link><p role={error?'alert':'status'}>{error||'Restoring completed match…'}</p></section>;
 return <section className="delayed-invite midnight-invite"><Link className="delayed-back" to={returnTo}>{source?'← Cancel Run It Back':'← All matches'}</Link>
  <div className="delayed-match-heading"><small>PLAY ON YOUR SCHEDULE</small><h2>{source?'Run It Back':'New Async Match'}</h2><p className="delayed-match-meta">Two humans · {realMoney?'Real Money':'Fake Money'} · 72-hour turns</p></div>
  {source&&<p>Copied from <Link to={'/delayed/'+source+'?history=1'}>your completed match</Link>. Edit this invitation before sending.</p>}
  {!enabled&&<p role="status">New async matches are unavailable.</p>}
  <fieldset className="delayed-form-card" disabled={locked}><legend>Match settings</legend>
   <label className="delayed-money-toggle"><span>Fake Money</span><span className="delayed-money-switch"><input type="checkbox" role="switch" aria-label="Real Money" checked={realMoney} disabled={!realAvailable&&!realMoney} onChange={e=>changeMoney(e.target.checked)}/><span aria-hidden="true"/></span><span>Real Money</span></label>
   {!realAvailable&&<small>Real-money matches are currently unavailable.</small>}
   {source&&<><p className="delayed-terms">The first player in each game is selected randomly.</p><p className="delayed-terms">Last Call at 48 hours; turns expire at 72 hours. Words passes a missed turn. Quintzee scores zero for a missed, unstarted round and continues. Other games retain their timeout rules. No funds are reserved; {realMoney?'one net amount is posted to both players’ balances after all games finish.':'real balances are unaffected.'} Invitations expire in 72 hours.</p></>}
   {policyIssue&&<p role="alert">This match used an unsupported invitation policy. <button onClick={()=>setDraft(old=>old?{...old,policyVersion:'delayed/1'}:old)}>Use the current terms shown above</button></p>}
  </fieldset>
  <AsyncLineupEditor lineup={lineup} caps={caps} source={!!source} realMoney={realMoney} locked={locked} collapsed={opponentStage} onCollapse={setOpponentStage} onChange={value=>{edited.current=true;request.current=null;setLineup(value);}}/>
  {opponentStage&&<>
  <fieldset className="delayed-form-card" disabled={locked}><legend>Your opponent</legend>
   <div className="delayed-filter"><input aria-label="Filter opponents" placeholder="Filter human players" value={search} maxLength={80} onChange={e=>setSearch(e.target.value)}/><button aria-label={sort==='username'?'Sort by recent opponents':'Sort by username'} onClick={()=>setSort(s=>s==='username'?'recent':'username')}>{sort==='username'?<ArrowDownAZ size={19}/>:<History size={19}/>}</button></div>
   <label>Opponent<select aria-label="Opponent" value={opponent?.id??''} onChange={e=>{setOpponent(people.find(p=>p.id===e.target.value)??null);request.current=null;}}><option value="">Choose a human player</option>{opponent&&!people.some(p=>p.id===opponent.id)&&<option value={opponent.id}>{opponent.name}</option>}{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   {opponent&&!opponent.isHuman&&<p role="alert">{opponent.name} is no longer eligible to receive invitations. Choose another active human player.</p>}
   {loading&&<small role="status">Loading players…</small>}{more&&<button disabled={loading} onClick={()=>loadPeople(cursor)}>Load more players</button>}{!loading&&!people.length&&<small>No matching active human players.</small>}
   {peopleError&&<p role="alert">{peopleError}</p>}
  </fieldset>
  <div className="delayed-offer-summary"><span>Maximum loss per player</span><strong>{realMoney?'$':''}{stake}</strong></div>
  {!source&&<><p className="delayed-terms">The first player in each game is selected randomly.</p><p className="delayed-terms">Last Call at 48 hours; turns expire at 72 hours. Words passes a missed turn. Quintzee scores zero for a missed, unstarted round and continues. Other games retain their timeout rules. No funds are reserved; {realMoney?'one net amount is posted to both players’ balances after all games finish.':'real balances are unaffected.'} Invitations expire in 72 hours.</p></>}
  {!opponent&&<p>Choose a human opponent to send your invitation.</p>}
  {draft?.submission&&!pending&&<p role="status">A send was attempted. Retry the same invitation to confirm its outcome before starting another draft.</p>}
  <button ref={sendButton} className="delayed-primary midnight-primary" disabled={pending||!!storageError||(!draft?.submission&&(!opponent?.isHuman||!enabled||!valid))} onClick={()=>void invite()}>{pending?'Sending…':'Send Invite'}</button></>}
  <AlertDialog open={confirmFake} onOpenChange={setConfirmFake}>
   <AlertDialogContent onCloseAutoFocus={event=>{event.preventDefault();sendButton.current?.focus();}}>
    <AlertDialogTitle>Are you sure you want to set up a fake money match?</AlertDialogTitle>
    <AlertDialogDescription>Confirm to send the invitation to {opponent?.name}.</AlertDialogDescription>
    <AlertDialogFooter>
     <AlertDialogCancel>Cancel</AlertDialogCancel>
     <AlertDialogAction onClick={()=>void invite(true)}>Send Fake Money Invitation</AlertDialogAction>
    </AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>
  {(error||storageError)&&<p role="alert">{error||storageError}</p>}
 </section>;
}
