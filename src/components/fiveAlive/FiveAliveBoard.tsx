import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,type ReactNode,type RefObject} from 'react';
import {presentSound} from '@/lib/audio/presentationSound';
import {FiveAliveLogo} from './FiveAliveLogo';
import './fiveAlive.css';

export type FiveAliveColor = 'correct' | 'present' | 'absent';
export interface FiveAliveGuess {word:string; feedback:FiveAliveColor[]}
export interface FiveAliveRoundView {completed:boolean; waiting?:boolean; guesses?:FiveAliveGuess[]; nextBase?:number}
export interface FiveAliveReveal {id:string;row:number;helper?:{base:number;nextBase?:number}}
export interface FiveAliveBoardProps {
  mode:'arcade'|'async'; round:number; score:number; opponentScore?:number; opponentName?:string;
  current:FiveAliveRoundView|null; pending:boolean; error?:string;
  onSubmit:(word:string)=>void; onBack:()=>void; onRules?:()=>void; onAbandon?:()=>void;
  /** An admitted, newly committed wrong guess; presentation audio only. */
  onWrongGuess?:()=>void;
  onHelperDrop?:()=>void; invalidAttempt?:string;
  notice?:ReactNode; summary?:ReactNode; award?:ReactNode; scoreRef?:RefObject<HTMLDivElement>;
  onReconnect?:()=>void;
  reveal?:FiveAliveReveal; onRevealComplete?:(id:string)=>void;
}
const KEYS=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
const EMPTY_GUESSES:FiveAliveGuess[]=[];
const PRIORITY:Record<FiveAliveColor,number>={absent:1,present:2,correct:3};

/** View only: no answer, score, progression, or persistence authority. */
export function FiveAliveBoard({mode,round,score,opponentScore,opponentName='Opponent',current,pending,error,onSubmit,onBack,onRules,onAbandon,onWrongGuess,onHelperDrop,invalidAttempt,notice,summary,award,scoreRef,onReconnect,reveal,onRevealComplete}:FiveAliveBoardProps){
  const [draft,setDraft]=useState('');
  const [flip,setFlip]=useState<{id:string;column:number;phase:'close'|'open'}|null>(null);
  const finished=useRef<string|null>(null);
  const [helper,setHelper]=useState<{id:string;phase:'burst'|'drop'}|null>(null);
  const helperPhase=helper?.id===reveal?.id?helper?.phase:undefined;
  const progress=flip?.id===reveal?.id&&flip?flip:{id:reveal?.id??'',column:0,phase:'close' as const};
  const visibleTiles=progress.column+(progress.phase==='open'?1:0);
  const guesses=current?.guesses??EMPTY_GUESSES;
  const guessCount=guesses.length;
  const waiting=!!current?.waiting;
  const canPlay=!!current&&!current.completed&&!pending&&!reveal;
  const surface=useRef<HTMLElement>(null),previousDraft=useRef({round,guessCount,draft});
  useLayoutEffect(()=>{
    const previous=previousDraft.current;previousDraft.current={round,guessCount,draft};
    // Only newly placed local letters, after DOM commit. History/recovery and
    // deletions are silent, including React effect rehearsal and batched input.
    if(!canPlay||previous.round!==round||previous.guessCount!==guessCount)return;
    const tiles=surface.current?.querySelectorAll('.five-alive-row')[guessCount]?.querySelectorAll('.five-alive-tile');
    for(let column=previous.draft.length;column<draft.length;column++)
      presentSound('peg',`five-alive:letter:${round}:${guessCount}:${crypto.randomUUID()}`,tiles?.[column]??null);
  },[draft,round,guessCount,canPlay]);
  useEffect(()=>{setDraft('');},[round,guessCount]);
  useEffect(()=>{setFlip(null);setHelper(null);finished.current=null;},[round]);
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
  return <section className="five-alive" aria-label="Five Alive" data-finished={current?.completed||!!summary||undefined} ref={surface}>
    <header className="five-alive-header"><button type="button" onClick={onBack}>{mode==='async'?'‹ Match':'‹ Arcade'}</button>
      {onRules?<button type="button" onClick={onRules} aria-label="Rules and information">ⓘ</button>:<span/>}
      {mode==='arcade'?<button type="button" onClick={onAbandon} disabled={!onAbandon}>Abandon</button>:<span aria-hidden="true"/>}</header>
    <div className="five-alive-body">
      <div className="five-alive-title"><span>P-Town Originals</span><h1><FiveAliveLogo/></h1></div>
      <div className="five-alive-scores"><div className="five-alive-score" ref={scoreRef}><span>You</span><strong>{score.toLocaleString()}</strong></div>
        <div className="five-alive-round">Word {round} of 3<div className="five-alive-dots" aria-hidden="true">{[1,2,3].map(i=><i key={i} data-active={i===round}/>)}</div></div>
        {mode==='async'?<div className="five-alive-score" data-opponent-score><span>{opponentName}</span><strong>{(opponentScore??0).toLocaleString()}</strong></div>:<span/>}</div>
      {notice}
      {waiting&&<div className="five-alive-wait" role="status">Waiting on opponent.</div>}
      {error&&<p className="five-alive-error" role="alert">{error} {onReconnect&&<button type="button" onClick={onReconnect}>Reconnect</button>}</p>}
      {summary?summary:<div className="five-alive-grid" aria-label="Guess board">
        {Array.from({length:6},(_,row)=>{
          const active=row===guessCount&&!current?.completed&&!reveal,guess=guesses[row];
          const oldHelper=reveal?.row===row&&reveal.helper&&helperPhase!=='drop';
          const dropping=!!reveal&&row===reveal.row+1&&helperPhase==='drop';
          const helperValue=oldHelper?reveal.helper?.base:dropping?reveal.helper?.nextBase:active?current?.nextBase:undefined;
          const helperAnimation=oldHelper&&helperPhase==='burst'?'burst':dropping?'drop':undefined;
          return <div className={'five-alive-row'+(active&&invalidAttempt?' five-alive-invalid':'')} key={`${row}:${active?invalidAttempt??'':''}`}>
            <div className="five-alive-tiles">
              {helperValue!=null&&<span className="five-alive-points" data-helper={helperAnimation} onAnimationEnd={event=>{
                if(!reveal||!helperAnimation||event.target!==event.currentTarget||event.animationName!=='five-alive-helper-'+helperAnimation)return;
                if(helperAnimation==='burst'&&reveal.helper?.nextBase!=null&&reveal.row<5){setHelper({id:reveal.id,phase:'drop'});onHelperDrop?.();}
                else onRevealComplete?.(reveal.id);
              }}>+{helperValue}{helperAnimation==='burst'&&<span className="five-alive-helper-sparks" aria-hidden="true">✦</span>}</span>}
              {Array.from({length:5},(_,column)=>{
                const revealing=reveal?.row===row,flipping=revealing&&column===progress.column;
                const color=guess&&(!revealing||column<visibleTiles)?guess.feedback[column]:'';
                return <div className={'five-alive-tile'+(flipping?' five-alive-flip-'+progress.phase:'')}
                  data-color={color} data-reveal={flipping?progress.phase:undefined} key={column}
                  onAnimationStart={event=>{
                    // The feedback face opens after the approved placement cue's short tail.
                    if(reveal&&flipping&&progress.phase==='open'&&event.target===event.currentTarget&&event.animationName==='five-alive-flip-open')
                      presentSound('flip',`five-alive:flip:${reveal.id}:${row}:${column}`,event.currentTarget);
                  }}
                  onAnimationEnd={event=>{
                    if(!reveal||!flipping||event.target!==event.currentTarget||event.animationName!=='five-alive-flip-'+progress.phase||finished.current===reveal.id)return;
                    if(progress.phase==='close'){setFlip({id:reveal.id,column,phase:'open'});return;}
                    if(column<4){setFlip({id:reveal.id,column:column+1,phase:'close'});return;}
                    finished.current=reveal.id;
                    if(guess.feedback.some(color=>color!=='correct')){
                      onWrongGuess?.();
                      if(reveal.helper){setHelper({id:reveal.id,phase:'burst'});return;}
                    }
                    onRevealComplete?.(reveal.id);
                  }}><span>{guess?.word[column]??(active?draft[column]:'')}</span></div>;})}
            </div>
          </div>;
        })}
      </div>}

      {!!current&&!current.completed&&!waiting&&!summary&&<div className="five-alive-keyboard" aria-label="Keyboard">{KEYS.map((line,index)=><div className="five-alive-keys" key={line}>
        {index===2&&<button type="button" onClick={()=>press('ENTER')} disabled={!canPlay} className="five-alive-key-wide">Enter</button>}
        {[...line].map(key=><button type="button" key={key} data-color={keyColors[key]??''} onClick={()=>press(key)} disabled={!canPlay}>{key}</button>)}
        {index===2&&<button type="button" onClick={()=>press('BACKSPACE')} disabled={!canPlay} className="five-alive-key-wide" aria-label="Delete letter">⌫</button>}
      </div>)}</div>}
      {award}
    </div>
  </section>;
}
