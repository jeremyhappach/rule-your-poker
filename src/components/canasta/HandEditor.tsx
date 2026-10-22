import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogTrigger} from '@/components/ui/dialog';
import {PlayingCard} from '@/components/PlayingCard';
import {isResolvedJoker,physicalCardLabel,type PhysicalCard} from '@/lib/cardGames/physicalCard';
import {meldError,openingReport,pileStatus,points,type Meld} from '@/lib/canasta/rules';
import {canastaGuidance} from '@/lib/canasta/guidance';
import {VERSION} from '@/lib/canasta/rules';
import type {Rank} from '@/lib/cardUtils';
import {useCardTransportInternal} from '@/lib/canonicalShell/cardTransport/CardTransportProvider';
export interface EditorView {hand:PhysicalCard[];pile:PhysicalCard[];melds:Meld[];score:number;opened:boolean;phase:'draw'|'meld'|'ended';notice:string;stockCount?:number;pileCount?:number;pileFrozen?:boolean;source?:'stock'|'pile'|null;version?:string}

function CardPage({cards,selected,onSelect,annotation,disabled=false,viewerId,toolbar}:{cards:PhysicalCard[];selected:string[];onSelect:(id:string)=>void;annotation?:(id:string)=>string;disabled?:boolean;viewerId?:string;toolbar?:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  const flights=useCardTransportInternal()?.__activeIntents??[];
  const [size,setSize]=useState(4),[page,setPage]=useState(0);
  useLayoutEffect(()=>{
    const node=ref.current;if(!node)return;
    const ro=new ResizeObserver(()=>setSize(Math.max(1,Math.floor(node.clientWidth/60))));
    ro.observe(node);return()=>ro.disconnect();
  },[]);
  const pages=Math.max(1,Math.ceil(cards.length/size)),current=Math.min(page,pages-1);
  return <div className="canasta-card-page">
    <div ref={ref} data-card-anchor={viewerId?`hand-${viewerId}`:undefined} className="canasta-hand-grid" aria-label="Your physical cards">
      {cards.slice(current*size,(current+1)*size).map(c=><button key={c.id} data-physical-id={c.id}
        disabled={disabled} className="canasta-card" aria-label={physicalCardLabel(c)+' copy '+c.id}
        aria-pressed={selected.includes(c.id)} onClick={()=>onSelect(c.id)}>
        <PlayingCard card={isResolvedJoker(c.face)?undefined:c.face} jokerFace={isResolvedJoker(c.face)?c.face:undefined}
          physicalId={c.id} highlight={selected.includes(c.id)?'gold':null} activeHandShell tier="large" faceFillPx={48} style={{width:48,height:68,visibility:flights.some(f=>f.cardId===c.id)?'hidden':undefined}}/>
        <span>{annotation?.(c.id)|| (selected.includes(c.id)?'Selected':'Select')}</span>
      </button>)}
    </div>
    <nav className="canasta-pagination" aria-label="Card pages">{toolbar}
      <button disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button>
      <span>Page {current+1}/{pages} · {cards.length} cards</span>
      <button disabled={current===pages-1} onClick={()=>setPage(current+1)}>Next</button>
    </nav>
  </div>;
}

export function HandEditor({view,hand,selected,setSelected,drafts,rank,setRank,filter,setFilter,sort,sorted,discard,message,ready,clear,assign,setDiscard,pickup,finish,reconnect,reset,seconds,paused,draw,viewerId,helpers=true,onHelpersChange}:{
  view:EditorView;hand:PhysicalCard[];selected:string[];setSelected:(ids:string[])=>void;drafts:Meld[];
  rank:Rank;setRank:(r:Rank)=>void;filter:string;setFilter:(r:string)=>void;sort:()=>void;sorted:boolean;
  discard:string|null;message:string;ready:boolean;clear:()=>void;assign:()=>void;setDiscard:()=>void;
  pickup:()=>void;finish:(noDiscard?:boolean)=>void;reconnect:()=>void;reset?:()=>void;seconds:number;paused:boolean;draw?:()=>void;viewerId?:string;helpers?:boolean;onHelpersChange?:(value:boolean)=>void;
}) {
  const [pane,setPane]=useState('hand'),[group,setGroup]=useState(0),[open,setOpen]=useState(false);
  const report=openingReport(drafts,view.score),m=drafts[Math.min(group,drafts.length-1)];
  const pile=pileStatus(view.pile,view.opened),top=view.pile.at(-1);
  const change=(p:string)=>setPane(p);
  const advice=canastaGuidance({...view,version:view.version??VERSION},selected,drafts,discard);
  const selection=view.hand.filter(c=>selected.includes(c.id)),selectionPoints=selection.reduce((n,c)=>n+points(c),0);
  const selectionError=meldError({rank,cards:[...(view.melds.find(m=>m.rank===rank)?.cards??[]),...selection]});
  const status=message||(!ready?view.notice:advice.instruction);
  const guidance=<div className="canasta-guidance" role="status"><strong>{status}</strong>{helpers&&selection.length>0?<span data-selection-valid={!selectionError}>{selection.length} selected · {selectionPoints} points · {selectionError??('Valid selection for '+rank+'; server confirms on submission.')}</span>:helpers&&<span>{!view.opened?'Opening '+advice.opening.count+'/'+advice.opening.required+' · ':''}{advice.canastas}/{advice.required} canastas · {advice.pileReason}</span>}</div>;
  return <div className="canasta-launcher" data-card-anchor={!open&&viewerId?`hand-${viewerId}`:undefined}>
    <Dialog open={open} onOpenChange={setOpen}>
      {guidance}{onHelpersChange&&<label className="canasta-helper-toggle"><input type="checkbox" checked={helpers} onChange={e=>onHelpersChange(e.target.checked)}/>Beginner help</label>}
      <DialogTrigger asChild><button>Arrange {view.hand.length} cards</button></DialogTrigger>
      <span>{advice.melds.map(m=>m.rank+' × '+m.count+(helpers?' · '+m.kind:'')).join(' · ')||'No melds'} · Score {view.score}</span>
      <DialogContent className="canasta-editor">
        <header className="canasta-editor-heading"><DialogTitle>Canasta · {view.hand.length} cards{pane==='melds'? (paused?' · Paused':' · '+seconds+'s'):null}</DialogTitle>
          <DialogDescription>{pane==='melds'?(m?meldError({rank:m.rank,cards:[...(view.melds.find(g=>g.rank===m.rank)?.cards??[]),...m.cards]})??'Valid group. Tap a card to reassign.':'Select cards and add a draft.'):(paused?'Paused':seconds+'s remaining')+' · drafts stay local'}</DialogDescription></header>
        <nav className="canasta-editor-nav" aria-label="Arrange hand">
          <button aria-pressed={pane==='hand'} onClick={()=>change('hand')}>Hand</button>
          <button aria-pressed={pane==='melds'} onClick={()=>change('melds')}>Melds {drafts.length}</button>
          <button aria-pressed={pane==='finish'} onClick={()=>change('finish')}>Finish</button>
        </nav>
        {guidance}
        <div className="canasta-editor-body">
          {pane==='hand'?<>
            <fieldset><CardPage toolbar={<>
              <select aria-label="Hand rank filter" value={filter} onChange={e=>setFilter(e.target.value)}>
                <option value="all">All ranks</option><option value="wild">Wild cards</option>
                {['A','3','4','5','6','7','8','9','10','J','Q','K'].map(r=><option key={r}>{r}</option>)}
              </select>
              <button onClick={sort} aria-pressed={sorted}>Sort</button>
            </>} viewerId={viewerId} disabled={!ready} key={filter} cards={hand} selected={selected} onSelect={id=>setSelected(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id])}
              annotation={id=>drafts.find(m=>m.cards.some(c=>c.id===id))?.rank? 'Draft '+drafts.find(m=>m.cards.some(c=>c.id===id))!.rank:discard===id?'Discard':''}/></fieldset>
          </>:pane==='melds'?<>
            <div className="canasta-filter"><select aria-label="Draft group" value={Math.min(group,Math.max(0,drafts.length-1))} onChange={e=>setGroup(Number(e.target.value))}>
              {drafts.length?drafts.map((m,i)=><option key={m.rank} value={i}>{m.rank} · {m.cards.length} cards</option>):<option>No drafts</option>}
            </select><span>{view.opened?'Opened · draft '+report.count:'Opening '+report.count+'/'+report.required}</span></div>
            {m?<CardPage key={m.rank} cards={m.cards} selected={selected} onSelect={id=>{setSelected([id]);setPane('hand');}}/>:<p>Select cards in Hand and add a draft.</p>}

          </>:<div className="canasta-finish">
            <p>{status}</p>{view.phase==='meld'&&advice.finish.error&&<p>{advice.finish.error}</p>}
            <p>Pile top: {top?physicalCardLabel(top):'empty'} · {advice.pileReason}. {advice.pickupError}</p>
            <p>Discard: {view.hand.find(c=>c.id===discard)?physicalCardLabel(view.hand.find(c=>c.id===discard)!):'not selected'}. Committed melds: {view.melds.map(m=>m.rank+' × '+m.cards.length).join(', ')||'none'}.</p>
            <button disabled={!ready||view.phase!=='draw'||!!advice.pickupError} onClick={pickup}>Take pile · {view.pileCount??view.pile.length}</button>
            {draw&&<button disabled={!ready||view.phase!=='draw'||advice.mandatory} onClick={draw}>{view.stockCount?'Draw two':'End exhausted hand'}</button>}
            <button disabled={!ready||view.phase!=='meld'||!!advice.finish.error} onClick={()=>finish()}>Submit turn</button>
            <button disabled={!ready||view.phase!=='meld'||!!advice.noDiscard.error} onClick={()=>finish(true)}>Go out without discard</button>
            <button onClick={reconnect}>Reconnect</button>
            {reset&&<button onClick={reset}>Reset fixture</button>}
          </div>}
        </div>
        <footer className="canasta-compose">
          {pane==='hand'?<>
            <select aria-label="Draft meld rank" value={rank} onChange={e=>setRank(e.target.value as Rank)}>
              {['A','4','5','6','7','8','9','10','J','Q','K','3'].map(r=><option key={r}>{r}</option>)}
            </select><button disabled={!ready} onClick={()=>{assign();setPane('melds');}}>Add draft</button>
            <button disabled={!ready||view.phase!=='meld'||selected.length!==1} onClick={()=>{setDiscard();setPane('finish');}}>Discard</button>
          </>:<button onClick={()=>setPane('hand')}>Back to hand</button>}
          <button onClick={clear}>Cancel draft</button>
        </footer>
        <div className="sr-only" role="status">{status}</div>
      </DialogContent>
    </Dialog>
  </div>;
}
