import {useCallback, useEffect, useMemo, useRef, useState,type ReactNode,type RefObject} from 'react';
import './fiveAlive.css';

export type FiveAliveColor = 'correct' | 'present' | 'absent';
export interface FiveAliveGuess {word:string; feedback:FiveAliveColor[]}
export interface FiveAliveRoundView {completed:boolean; waiting?:boolean; guesses?:FiveAliveGuess[]; nextBase?:number}
export interface FiveAliveReveal {id:string;row:number}
export interface FiveAliveBoardProps {
  mode:'arcade'|'async'; round:number; score:number; opponentScore?:number;
  current:FiveAliveRoundView|null; pending:boolean; error?:string;
  onSubmit:(word:string)=>void; onBack:()=>void; onRules:()=>void; onAbandon?:()=>void;
  /** An admitted, newly committed wrong guess; presentation audio only. */
  onWrongGuess?:()=>void;
  notice?:ReactNode; summary?:ReactNode; award?:ReactNode; scoreRef?:RefObject<HTMLDivElement>;
  onReconnect?:()=>void;
  reveal?:FiveAliveReveal; onRevealComplete?:(id:string)=>void;
}
const KEYS=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
const EMPTY_GUESSES:FiveAliveGuess[]=[];
const PRIORITY:Record<FiveAliveColor,number>={absent:1,present:2,correct:3};

/** View only: no answer, score, progression, or persistence authority. */
export function FiveAliveBoard({mode,round,score,opponentScore,current,pending,error,onSubmit,onBack,onRules,onAbandon,onWrongGuess,notice,summary,award,scoreRef,onReconnect,reveal,onRevealComplete}:FiveAliveBoardProps){
  const [draft,setDraft]=useState('');
  const [flip,setFlip]=useState<{id:string;column:number;phase:'close'|'open'}|null>(null);
  const finished=useRef<string|null>(null);
  const progress=flip?.id===reveal?.id&&flip?flip:{id:reveal?.id??'',column:0,phase:'close' as const};
  const visibleTiles=progress.column+(progress.phase==='open'?1:0);
  const guesses=current?.guesses??EMPTY_GUESSES;
  const guessCount=guesses.length;
  const waiting=!!current?.waiting;
  const canPlay=!!current&&!current.completed&&!pending&&!reveal;
  useEffect(()=>{setDraft('');},[round,guessCount]);
  useEffect(()=>{setFlip(null);finished.current=null;},[round]);
  const keyColors=useMemo(()=>{
    const result:Record<string,FiveAliveColor>={};
    for(const [row,guess] of guesses.entries()) for(let i=0;i<guess.word.length;i++){
      if(reveal?.row===row&&i>=visibleTiles)continue;
      const letter=guess.word[i],color=guess.feedback[i];
      if(color&&(!result[letter]||PRIORITY[color]>PRIORITY[result[letter]]))result[letter]=color;
    }
    return result;
  },[guesses,reveal?.row,visibleTiles]);
  const press=useCallback((key:string)=>{
    if(!canPlay)return;
    if(key==='ENTER'){if(draft.length===5)onSubmit(draft);return;}
    if(key==='BACKSPACE'){setDraft(value=>value.slice(0,-1));return;}
    if(/^[A-Z]$/.test(key))setDraft(value=>value.length<5?value+key:value);
  },[canPlay,draft,onSubmit]);
  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{
      if(!canPlay||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
      const target=event.target as HTMLElement|null;
      if(target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName??''))return;
      const key=event.key.toUpperCase();
      if(key==='ENTER'||key==='BACKSPACE'||/^[A-Z]$/.test(key)){event.preventDefault();press(key);}
    };
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
  },[canPlay,press]);
  return <section className="five-alive" aria-label="Five Alive">
    <header className="five-alive-header"><button type="button" onClick={onBack}>{mode==='async'?'‹ Match':'‹ Arcade'}</button>
      <button type="button" onClick={onRules} aria-label="Rules and information">ⓘ</button>
      {mode==='arcade'?<button type="button" onClick={onAbandon} disabled={!onAbandon}>Abandon</button>:<span aria-hidden="true"/>}</header>
    <div className="five-alive-body">
      <div className="five-alive-title"><span>P-Town Originals</span><h1>Five Alive</h1></div>
      <div className="five-alive-scores"><div className="five-alive-score" ref={scoreRef}><span>You</span><strong>{score.toLocaleString()}</strong></div>
        <div className="five-alive-round">Word {round} of 3<div className="five-alive-dots" aria-hidden="true">{[1,2,3].map(i=><i key={i} data-active={i===round}/>)}</div></div>
        {mode==='async'?<div className="five-alive-score"><span>Opponent</span><strong>{(opponentScore??0).toLocaleString()}</strong></div>:<span/>}</div>
      {notice}
      {waiting&&<div className="five-alive-wait" role="status">Waiting for the other player.</div>}
      {summary?summary:<div className="five-alive-grid" aria-label="Guess board">
        {Array.from({length:6},(_,row)=>{
          const active=row===guessCount&&!current?.completed&&!reveal,guess=guesses[row];
          return <div className="five-alive-row" key={row}>
            {active&&current?.nextBase!=null&&<span className="five-alive-points">+{current.nextBase}</span>}
            <div className="five-alive-tiles">
              {Array.from({length:5},(_,column)=>{
                const revealing=reveal?.row===row,flipping=revealing&&column===progress.column;
                const color=guess&&(!revealing||column<visibleTiles)?guess.feedback[column]:'';
                return <div className={'five-alive-tile'+(flipping?' five-alive-flip-'+progress.phase:'')}
                  data-color={color} data-reveal={flipping?progress.phase:undefined} key={column}
                  onAnimationEnd={event=>{
                    if(!reveal||!flipping||event.target!==event.currentTarget||event.animationName!=='five-alive-flip-'+progress.phase||finished.current===reveal.id)return;
                    if(progress.phase==='close'){setFlip({id:reveal.id,column,phase:'open'});return;}
                    if(column<4){setFlip({id:reveal.id,column:column+1,phase:'close'});return;}
                    finished.current=reveal.id;
                    if(guess.feedback.some(color=>color!=='correct'))onWrongGuess?.();
                    onRevealComplete?.(reveal.id);
                  }}>{guess?.word[column]??(active?draft[column]:'')}</div>;})}
            </div>
          </div>;
        })}
      </div>}
      {error&&<p className="five-alive-error" role="alert">{error} {onReconnect&&<button type="button" onClick={onReconnect}>Reconnect</button>}</p>}
      {!waiting&&!summary&&<div className="five-alive-keyboard" aria-label="Keyboard">{KEYS.map((line,index)=><div className="five-alive-keys" key={line}>
        {index===2&&<button type="button" onClick={()=>press('ENTER')} disabled={!canPlay} className="five-alive-key-wide">Enter</button>}
        {[...line].map(key=><button type="button" key={key} data-color={keyColors[key]??''} onClick={()=>press(key)} disabled={!canPlay}>{key}</button>)}
        {index===2&&<button type="button" onClick={()=>press('BACKSPACE')} disabled={!canPlay} className="five-alive-key-wide" aria-label="Delete letter">⌫</button>}
      </div>)}</div>}
      {award}
    </div>
  </section>;
}
