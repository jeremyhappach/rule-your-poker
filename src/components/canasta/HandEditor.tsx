import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {PlayingCard} from '@/components/PlayingCard';
import {physicalCardLabel,type PhysicalCard} from '@/lib/cardGames/physicalCard';
import {meldError,points,VERSION,type Meld} from '@/lib/canasta/rules';
import {compareHandCards,orderedMeldRanks,canastaLabel} from './presentation';
import {canastaGuidance} from '@/lib/canasta/guidance';
import type {Rank} from '@/lib/cardUtils';
import {useCardTransportInternal} from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
import {CardFan,CanastaFace as Face} from './CardFan';
export interface EditorView {hand:PhysicalCard[];pile:PhysicalCard[];melds:Meld[];reds?:PhysicalCard[];opponentMelds?:Meld[];score:number;opened:boolean;phase:'draw'|'meld'|'ended';notice:string;stockCount?:number;pileCount?:number;pileFrozen?:boolean;source?:'stock'|'pile'|null;version?:string}

export function HandEditor({view,hand,selected,setSelected,drafts,rank,setRank,discard,message,ready,clear,assign,setDiscard,pickup,finish,reconnect,seconds,paused,draw,viewerId,helpers=true,onHelpersChange,pileTarget,release}:{
  view:EditorView;hand:PhysicalCard[];selected:string[];setSelected:(ids:string[])=>void;drafts:Meld[];
  rank:Rank;setRank:(r:Rank)=>void;discard:string|null;message:string;ready:boolean;clear:()=>void;assign:(rank?:Rank)=>void;setDiscard:()=>void;
  pickup:()=>void;finish:(noDiscard?:boolean)=>void;reconnect:()=>void;reset?:()=>void;seconds:number;paused:boolean;draw?:()=>void;viewerId?:string;helpers?:boolean;onHelpersChange?:(value:boolean)=>void;
  pileTarget?:HTMLElement|null;release?:()=>void;
}) {
  const [modal,setModal]=useState<'melds'|'opponent'|'pickup'|'help'|null>(null);
  const [pileCardWidth,setPileCardWidth]=useState(44);
  useLayoutEffect(()=>{if(!pileTarget)return;const measure=()=>setPileCardWidth(Math.max(28,Math.min(44,(pileTarget.clientHeight-20)*44/62)));const observer=new ResizeObserver(measure);observer.observe(pileTarget);measure();return()=>observer.disconnect();},[pileTarget]);
  const scroll=useRef<HTMLDivElement>(null),[overflow,setOverflow]=useState(false);
  useLayoutEffect(()=>{const node=scroll.current;if(!node)return;const measure=()=>setOverflow(node.scrollHeight>node.clientHeight+1);const observer=new ResizeObserver(measure);observer.observe(node);if(node.firstElementChild)observer.observe(node.firstElementChild);measure();return()=>observer.disconnect();},[hand.length]);
  const flights=useCardTransportInternal()?.__activeIntents??[];
  const advice=canastaGuidance({...view,version:view.version??VERSION},selected,drafts,discard);
  const top=view.pile.at(-1),selection=view.hand.filter(c=>selected.includes(c.id));
  const goWithDiscard=!advice.finish.error&&advice.finish.out;
  const goWithoutDiscard=!advice.noDiscard.error&&advice.noDiscard.out;
  const canFinish=ready&&view.phase==='meld';
  const status=message||(!ready?view.notice:view.phase==='draw'?advice.instruction:goWithDiscard||goWithoutDiscard?'Ready to go out.':advice.finish.error??'Ready. Tap Done to submit your turn.');
  useEffect(()=>{if(!ready||view.phase!=='draw')setModal(m=>m==='pickup'?null:m);},[ready,view.phase]);
  function add(target:Rank){assign(target);setModal(null);}
  const piles=<>
    <button className="canasta-pile-stack" data-card-anchor="discard" aria-label={'Discard pile: '+(view.pileCount??view.pile.length)+' cards'+(view.pileFrozen?', frozen':'')}
      disabled={!ready||view.phase!=='draw'||!top} onClick={()=>setModal('pickup')}>
      {top?<Face card={top} width={pileCardWidth} hidden={flights.some(f=>f.cardId===top.id)}/>:<span className="canasta-empty" style={{width:pileCardWidth,height:Math.round(pileCardWidth*62/44)}}>Empty</span>}
      <small>Pile {view.pileCount??view.pile.length}{view.pileFrozen?' ❄':''}</small>
    </button>
    <button data-card-anchor="stock" aria-label={view.stockCount===0?'Stock empty: end exhausted hand':'Draw two from stock'}
      disabled={!ready||view.phase!=='draw'||advice.mandatory||!draw} onClick={draw}>
      {view.stockCount===0?<span className="canasta-empty" style={{width:pileCardWidth,height:Math.round(pileCardWidth*62/44)}}>Empty</span>:<PlayingCard isHidden style={{width:pileCardWidth,height:Math.round(pileCardWidth*62/44)}}/>}
      <small>{view.stockCount===0?'End hand':'Stock '+(view.stockCount??'—')}</small>
    </button>
  </>;
  return <div className="canasta-hand-area">
    {pileTarget?createPortal(piles,pileTarget):pileTarget===undefined?<div className="canasta-piles canasta-inline-piles">{piles}</div>:null}
    <div className="canasta-hand-heading"><strong>MY · {view.hand.length} cards</strong><span>{selected.length?selected.length+' selected':'Rank order'}{overflow?' · Scroll ↕':''}</span><button aria-label="Canasta help and reconnect" onClick={()=>setModal('help')}>?</button></div>
    <div ref={scroll} className="canasta-hand-scroll" tabIndex={0} aria-label="Your full hand, scroll for more cards">
      <div data-card-anchor={viewerId?'hand-'+viewerId:undefined} className="canasta-hand-grid" aria-label="Your physical cards">
        <CardFan cards={[...hand].sort(compareHandCards)} interactive render={(c,width)=>{
          const group=drafts.find(m=>m.cards.some(card=>card.id===c.id));
          const note=discard===c.id?'Discard':group?'→ '+group.rank:'';
          return <button key={c.id} data-physical-id={c.id} className="canasta-card" disabled={!ready} aria-pressed={selected.includes(c.id)}
            aria-label={physicalCardLabel(c)+' copy '+c.id+(note?' · '+note:'')} onClick={()=>setSelected(selected.includes(c.id)?selected.filter(id=>id!==c.id):[...selected,c.id])}>
            <Face card={c} width={width} hidden={flights.some(f=>f.cardId===c.id)}/>{note&&<span className="canasta-card-note">{note}</span>}
          </button>;
        }}/>
      </div>
    </div>
    <p className="canasta-turn-status" role="status">{status}{helpers&&selection.length>0?' · '+selection.reduce((n,c)=>n+points(c),0)+' selected points':''}</p>
    <div className="canasta-hand-actions">
      <button onClick={()=>setModal('melds')}>Melds{drafts.length?' (+'+drafts.length+')':''}</button>
      <button disabled={!ready||view.phase!=='meld'||selected.length!==1} onClick={setDiscard}>Discard</button>
      <button disabled={!canFinish||!!advice.finish.error||advice.finish.out} onClick={()=>finish()}>Done</button>
      <button disabled={!canFinish||!(goWithDiscard||goWithoutDiscard)} onClick={()=>finish(!goWithDiscard)}>Go Out</button>
    </div>
    <Dialog open={modal!==null} onOpenChange={open=>{if(!open)setModal(null);}}>
      <DialogContent className="canasta-dialog">
        <DialogTitle>{modal==='pickup'?'Pile: '+(view.pileCount??view.pile.length)+' cards. Pick up?':modal==='melds'?'Your melds':modal==='opponent'?'Opponent melds':'Canasta help'}</DialogTitle>
        <DialogDescription>{paused?'Paused':seconds+'s remaining'} · Drafts stay local until you submit.</DialogDescription>
        {(modal==='melds'||modal==='opponent')&&<div className="canasta-dialog-actions" aria-label="Meld owner"><button aria-pressed={modal==='melds'} onClick={()=>setModal('melds')}>Your melds</button><button aria-pressed={modal==='opponent'} onClick={()=>setModal('opponent')}>Opponent melds</button></div>}
        {modal==='pickup'?<>
          <p>Top: {top?physicalCardLabel(top):'empty'}. {advice.pileReason}.</p>
          <p role="status">{advice.pickupError??'Qualified. Yes commits the pickup and its qualifying melds.'}</p>
          {!!advice.pickupError&&<p>Choose No, then select qualifying cards in MY. Use Melds to prepare any other opening groups.</p>}
          <div className="canasta-dialog-actions"><button onClick={()=>setModal(null)}>No</button><button disabled={!ready||view.phase!=='draw'||!!advice.pickupError} onClick={()=>{setModal(null);pickup();}}>Yes</button></div>
        </>:modal==='opponent'?<>
          <div className="canasta-meld-list">{orderedMeldRanks(view.opponentMelds??[]).map(rank=>{
            const meld=view.opponentMelds!.find(m=>m.rank===rank)!;
            return <section key={rank}><strong>{rank} · {meld.cards.length} cards{canastaLabel(meld)?' · '+canastaLabel(meld):''}</strong>
              <div className="canasta-opponent-detail"><CardFan cards={meld.cards}/></div>
            </section>;
          })}{!view.opponentMelds?.length&&<p>No melds yet.</p>}</div>
          <button onClick={()=>setModal(null)}>Back to MY</button>
        </>:modal==='melds'?<>
          <p role="status">{selection.length} selected · {selection.reduce((n,c)=>n+points(c),0)} points. {!view.opened?'Opening '+advice.opening.count+'/'+advice.opening.required+'. ':''}{advice.canastas}/{advice.required} committed canastas.</p>
          {helpers&&<p>Select cards in MY, then choose a meld. Select an assigned card again to move it to another draft.</p>}
          <div className="canasta-meld-list"><section className="canasta-red-threes" aria-label="Your red threes"><strong>RED THREES · {view.reds?.length??0}</strong>
            <CardFan cards={view.reds??[]}/>
            <p>Exposed bonus cards, separate from black-three melds.</p>
          </section>{orderedMeldRanks(view.melds,drafts).map(target=>{
            const committed=view.melds.find(m=>m.rank===target)?.cards??[],draft=drafts.find(m=>m.rank===target)?.cards??[];
            const error=meldError({rank:target,cards:[...committed,...draft]},goWithDiscard||goWithoutDiscard);
            return <section key={target} data-meld-rank={target}><strong>{target} · {committed.length} committed{canastaLabel({rank:target,cards:committed})?' · '+canastaLabel({rank:target,cards:committed}):''}{draft.length?' + '+draft.length+' draft':''}</strong>
              <CardFan cards={[...committed,...draft]} render={(c,width)=><span className="canasta-detail-card" aria-label={physicalCardLabel(c)+(draft.includes(c)?' local draft':'')}><Face card={c} width={width}/>{draft.includes(c)&&<span className="canasta-draft-mark" aria-hidden="true">*</span>}</span>}/>
              <p>{error??'Valid meld'}{draft.length?' · * local draft':''}</p>
              <button disabled={!ready||!selection.length} onClick={()=>add(target)}>Add selected to {target}</button></section>;
          })}</div>
          <div className="canasta-dialog-actions"><label>New meld <select aria-label="New meld rank" value={rank} onChange={e=>setRank(e.target.value as Rank)}>{['A','4','5','6','7','8','9','10','J','Q','K','3'].map(r=><option key={r}>{r}</option>)}</select></label>
            <button disabled={!ready||!selection.length} onClick={()=>add(rank)}>Add selected</button></div>
          <div className="canasta-dialog-actions">{release&&<button disabled={!ready||!selection.length} onClick={()=>{release();setModal(null);}}>Unassign selected</button>}<button onClick={()=>{clear();setModal(null);}}>Cancel draft</button><button onClick={()=>setModal(null)}>Back to MY</button></div>
        </>:<>
          <p>{status}</p><p>Tap stock to draw. Tap the discard pile to review pickup. Select cards in MY to meld or mark one for discard; Done submits a legal turn. Go Out requires an empty hand and two canastas, with or without a final discard.</p>
          <p>{advice.pileReason}. {!view.opened?'Opening '+advice.opening.count+'/'+advice.opening.required+'. ':''}{advice.canastas}/{advice.required} committed canastas.</p>
          {onHelpersChange&&<label className="canasta-helper-toggle"><input type="checkbox" checked={helpers} onChange={e=>onHelpersChange(e.target.checked)}/>Beginner help</label>}
          <button onClick={()=>{clear();setModal(null);}}>Cancel draft</button><button onClick={()=>{setModal(null);reconnect();}}>Reconnect</button>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
