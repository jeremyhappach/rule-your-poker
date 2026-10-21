import {useLayoutEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogTrigger} from '@/components/ui/dialog';
import {PlayingCard} from '@/components/PlayingCard';
import {isResolvedJoker,physicalCardLabel,type PhysicalCard} from '@/lib/cardGames/physicalCard';
import {meldError,openingReport,pileStatus,type Meld} from '@/lib/canasta/rules';
import type {Rank} from '@/lib/cardUtils';
export interface EditorView {hand:PhysicalCard[];pile:PhysicalCard[];melds:Meld[];score:number;opened:boolean;phase:'draw'|'meld'|'ended';notice:string;stockCount?:number}

function CardPage({cards,selected,onSelect,annotation,disabled=false,viewerId}:{cards:PhysicalCard[];selected:string[];onSelect:(id:string)=>void;annotation?:(id:string)=>string;disabled?:boolean;viewerId?:string}) {
  const ref=useRef<HTMLDivElement>(null);
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
          physicalId={c.id} highlight={selected.includes(c.id)?'gold':null} activeHandShell tier="large" faceFillPx={48} style={{width:48,height:68}}/>
        <span>{annotation?.(c.id)|| (selected.includes(c.id)?'Selected':'Select')}</span>
      </button>)}
    </div>
    <nav className="canasta-pagination" aria-label="Card pages">
      <button disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button>
      <span>Page {current+1}/{pages} · {cards.length} cards</span>
      <button disabled={current===pages-1} onClick={()=>setPage(current+1)}>Next</button>
    </nav>
  </div>;
}

export function HandEditor({view,hand,selected,setSelected,drafts,rank,setRank,filter,setFilter,sort,sorted,discard,message,ready,clear,assign,setDiscard,pickup,finish,reconnect,reset,seconds,paused,draw,viewerId}:{
  view:EditorView;hand:PhysicalCard[];selected:string[];setSelected:(ids:string[])=>void;drafts:Meld[];
  rank:Rank;setRank:(r:Rank)=>void;filter:string;setFilter:(r:string)=>void;sort:()=>void;sorted:boolean;
  discard:string|null;message:string;ready:boolean;clear:()=>void;assign:()=>void;setDiscard:()=>void;
  pickup:()=>void;finish:(noDiscard?:boolean)=>void;reconnect:()=>void;reset?:()=>void;seconds:number;paused:boolean;draw?:()=>void;viewerId?:string;
}) {
  const [pane,setPane]=useState('hand'),[group,setGroup]=useState(0),[open,setOpen]=useState(false);
  const report=openingReport(drafts,view.score),m=drafts[Math.min(group,drafts.length-1)];
  const pile=pileStatus(view.pile,view.opened),top=view.pile.at(-1);
  const change=(p:string)=>setPane(p);
  const status=message||view.notice;
  return <div className="canasta-launcher">
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><button>Arrange {view.hand.length} cards</button></DialogTrigger>
      <span>{view.melds.map(m=>m.rank+' × '+m.cards.length).join(' · ')||'No melds'} · Score {view.score}</span>
      <DialogContent className="canasta-editor">
        <header className="canasta-editor-heading"><DialogTitle>Canasta · {view.hand.length} cards{pane==='melds'? (paused?' · Paused':' · '+seconds+'s'):null}</DialogTitle>
          <DialogDescription>{pane==='melds'?(m?meldError(m)??'Valid group. Tap a card to reassign.':'Select cards and add a draft.'):(paused?'Paused':seconds+'s remaining')+' · drafts stay local'}</DialogDescription></header>
        <nav className="canasta-editor-nav" aria-label="Arrange hand">
          <button aria-pressed={pane==='hand'} onClick={()=>change('hand')}>Hand</button>
          <button aria-pressed={pane==='melds'} onClick={()=>change('melds')}>Melds {drafts.length}</button>
          <button aria-pressed={pane==='finish'} onClick={()=>change('finish')}>Finish</button>
        </nav>
        <div className="canasta-editor-body">
          {pane==='hand'?<>
            <div className="canasta-filter">
              <select aria-label="Hand rank filter" value={filter} onChange={e=>setFilter(e.target.value)}>
                <option value="all">All ranks</option><option value="wild">Wild cards</option>
                {['A','3','4','5','6','7','8','9','10','J','Q','K'].map(r=><option key={r}>{r}</option>)}
              </select>
              <button onClick={sort} aria-pressed={sorted}>Sort</button><span>{selected.length} selected</span>
            </div>
            <fieldset><CardPage viewerId={viewerId} disabled={!ready} key={filter} cards={hand} selected={selected} onSelect={id=>setSelected(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id])}
              annotation={id=>drafts.find(m=>m.cards.some(c=>c.id===id))?.rank? 'Draft '+drafts.find(m=>m.cards.some(c=>c.id===id))!.rank:discard===id?'Discard':''}/></fieldset>
          </>:pane==='melds'?<>
            <div className="canasta-filter"><select aria-label="Draft group" value={Math.min(group,Math.max(0,drafts.length-1))} onChange={e=>setGroup(Number(e.target.value))}>
              {drafts.length?drafts.map((m,i)=><option key={m.rank} value={i}>{m.rank} · {m.cards.length} cards</option>):<option>No drafts</option>}
            </select><span>{view.opened?'Opened · draft '+report.count:'Opening '+report.count+'/'+report.required}</span></div>
            {m?<CardPage key={m.rank} cards={m.cards} selected={selected} onSelect={id=>{setSelected([id]);setPane('hand');}}/>:<p>Select cards in Hand and add a draft.</p>}

          </>:<div className="canasta-finish">
            <p>{status}</p>
            <p>Pile top: {top?physicalCardLabel(top):'empty'} · {pile.blocked?'blocked':pile.globalFreeze||pile.personalFreeze?'two natural cards required':'meld qualification required'}.</p>
            <p>Discard: {view.hand.find(c=>c.id===discard)?physicalCardLabel(view.hand.find(c=>c.id===discard)!):'not selected'}. Committed melds: {view.melds.map(m=>m.rank+' × '+m.cards.length).join(', ')||'none'}.</p>
            <button disabled={!ready||view.phase!=='draw'} onClick={pickup}>Take pile · {view.pile.length}</button>
            {draw&&<button disabled={!ready||view.phase!=='draw'} onClick={draw}>{view.stockCount?'Draw two':'End exhausted hand'}</button>}
            <button disabled={!ready} onClick={()=>finish()}>Submit turn</button>
            <button disabled={!ready} onClick={()=>finish(true)}>Go out without discard</button>
            <button onClick={reconnect}>Reconnect</button>
            {reset&&<button onClick={reset}>Reset fixture</button>}
          </div>}
        </div>
        <footer className="canasta-compose">
          {pane==='hand'?<>
            <select aria-label="Draft meld rank" value={rank} onChange={e=>setRank(e.target.value as Rank)}>
              {['A','4','5','6','7','8','9','10','J','Q','K','3'].map(r=><option key={r}>{r}</option>)}
            </select><button disabled={!ready} onClick={()=>{assign();setPane('melds');}}>Add draft</button>
            <button disabled={!ready||selected.length!==1} onClick={()=>{setDiscard();setPane('finish');}}>Discard</button>
          </>:<button onClick={()=>setPane('hand')}>Back to hand</button>}
          <button onClick={clear}>Cancel draft</button>
        </footer>
        <div className="sr-only" role="status">{status}</div>
      </DialogContent>
    </Dialog>
  </div>;
}
