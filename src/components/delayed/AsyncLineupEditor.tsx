import {useEffect,useState} from 'react';
import {Plus,Minus} from 'lucide-react';
import {findGame} from '@/lib/gameCatalog';
import {gameName} from '@/lib/delayed/client';
import {configurationIssue,type Capabilities,type InviteEntry} from '@/lib/delayed/runback';
import {inviteGroups} from '@/lib/delayed/inviteGroups';
import {AsyncGameArtwork,AsyncGameHeader,AsyncGameTitle} from './AsyncGameHeader';
import {AmountControl} from '@/components/midnight/Settings';
import {MegaCompetitionSettings} from '@/components/megaCardGolf/MegaCompetitionConfig';
import type {MegaCompetitionConfig} from '@/lib/megaCardGolf/competition';

export const inviteGameName=(id:string)=>findGame(id)?.name??gameName(id);
export function AsyncLineupEditor({lineup,caps,source,realMoney,locked,collapsed,onCollapse,onChange}:{lineup:InviteEntry[];caps:Capabilities;source:boolean;realMoney:boolean;locked:boolean;collapsed:boolean;onCollapse:(value:boolean)=>void;onChange:(value:InviteEntry[])=>void}){
  const [stage,setStage]=useState<'pick'|'configure'|'review'>(source?'review':'pick');
  const [editing,setEditing]=useState<InviteEntry|null>(null);
  useEffect(()=>{if(!realMoney&&!source)setEditing(old=>old?{...old,stake:String(caps.games.find(c=>c.id===old.game)?.stake??5)}:old);},[realMoney,source,caps.games]);
  const groups=inviteGroups(lineup),index=editing?lineup.findIndex(c=>c.key===editing.key):-1;
  const issue=editing?configurationIssue(editing,caps):null;
  const invalidStake=!!editing&&!/^[1-9][0-9]{0,3}$/.test(editing.stake);
  const valid=!!editing&&!issue&&!invalidStake;
  const name=editing?inviteGameName(editing.game):'';
  const newEntry=(game:string):InviteEntry=>({key:editing?.key??crypto.randomUUID(),game,stake:source&&editing?editing.stake:String(caps.games.find(c=>c.id===game)?.stake??5),...(source||game==='mega-card-golf'?{config:structuredClone(caps.games.find(c=>c.id===game)?.rules??null)}:{})});
  const edit=(entry:InviteEntry)=>{setEditing(structuredClone(entry));setStage('configure');};
  const commit=()=>{if(!valid||locked)return;onChange(index<0?[...lineup,editing!]:lineup.map(c=>c.key===editing!.key?editing!:c));setEditing(null);setStage('review');};
  const remove=(key:string)=>{onChange(lineup.filter(c=>c.key!==key));setEditing(null);setStage('review');};
  return <fieldset className="delayed-form-card" disabled={locked}>
    <legend>Games{lineup.length?' ('+lineup.length+')':''}</legend>
    {collapsed?<button type="button" className="midnight-games-summary" onClick={()=>{setStage('review');setEditing(null);onCollapse(false);}}>Games ({lineup.length})<small>{groups.map(g=>`${g.entries.length}× $${g.entries[0].stake} ${inviteGameName(g.entries[0].game)}`).join(', ')}</small></button>:<>
    {stage==='pick'&&<><h3>Choose game #{index<0?lineup.length+1:index+1}</h3><div className="midnight-tile-grid async-picker-grid">{caps.games.map(game=><button type="button" className="midnight-tile async-brand-surface" data-brand={game.id} data-picker-game={game.id} key={game.id} onClick={()=>{setEditing(newEntry(game.id));setStage('configure');}}><AsyncGameTitle game={game.id} name={inviteGameName(game.id)} placement="picker"/><AsyncGameArtwork game={game.id}/></button>)}</div>{lineup.length>0&&<button type="button" onClick={()=>{setEditing(null);setStage('review');}}>Back to review</button>}</>}
    {stage==='configure'&&editing&&<>
      <button type="button" onClick={()=>setStage('pick')}>← Back to games</button>
      <h3>Configure game #{index<0?lineup.length+1:index+1}</h3>
      <div className="midnight-config-card"><AsyncGameHeader game={editing.game} name={name}/><div className="midnight-config-controls"><label htmlFor={'stake-'+editing.key}>Stake</label>
        <AmountControl label={'Stake '+(index<0?lineup.length+1:index+1)} id={'stake-'+editing.key} value={editing.stake} invalid={invalidStake} describedBy={invalidStake?'stake-error-'+editing.key:undefined} min={1} max={9999} disabled={locked||(!realMoney&&!source)} onChange={stake=>setEditing({...editing,stake})}/>
        {!realMoney&&!source&&<small>Play-money stake: {editing.stake}</small>}
        {invalidStake&&<p id={'stake-error-'+editing.key} role="alert">Stake must be a whole number from 1 to 9,999.</p>}
        {editing.game==='mega-card-golf'&&!!editing.config&&<MegaCompetitionSettings courses={caps.games.find(g=>g.id===editing.game)?.courses??[]} value={editing.config as MegaCompetitionConfig} disabled={locked} onChange={config=>setEditing({...editing,config})}/>}
        {issue&&<p role="alert">{issue} {caps.games.some(g=>g.id===editing.game)&&<button type="button" onClick={()=>setEditing({...editing,config:structuredClone(caps.games.find(g=>g.id===editing.game)?.rules??null)})}>Use current rules for game {index+1}</button>}</p>}
      </div></div>
      {index>=0&&<div className="midnight-game-editor-actions"><button type="button" disabled={index===0} onClick={()=>{const next=[...lineup];[next[index-1],next[index]]=[next[index],next[index-1]];onChange(next);}}>Move game {index+1} up</button><button type="button" onClick={()=>remove(editing.key)}>Remove game {index+1}</button><button type="button" onClick={()=>{setEditing(null);setStage('review');}}>Cancel edit</button></div>}
      <button type="button" className="midnight-primary" disabled={!valid||locked||(index<0&&lineup.length>=caps.max_children)} onClick={commit}>OK</button>
    </>}
    {stage==='review'&&<><div className="midnight-review-list">{groups.map(group=>{const first=group.entries[0];return <div className="midnight-review-card async-brand-surface" data-brand={first.game} key={group.key}>
      <span className="midnight-quantity" data-multiple={group.entries.length>1}>{group.entries.length}×</span><button type="button" className="midnight-review-edit" aria-label={`Edit ${inviteGameName(first.game)}, $${first.stake}`} onClick={()=>edit(first)}><AsyncGameTitle game={first.game} name={inviteGameName(first.game)}/><small>${first.stake} stake{group.entries.length>1?' each':''}</small></button><AsyncGameArtwork game={first.game}/><div className="midnight-review-actions">
      <button type="button" aria-label={`Remove one ${inviteGameName(first.game)}, $${first.stake}`} onClick={()=>remove(group.entries.at(-1)!.key)}><Minus size={19}/></button>
      <button type="button" disabled={lineup.length>=caps.max_children} aria-label={`Copy ${inviteGameName(first.game)}, $${first.stake}`} onClick={()=>onChange([...lineup,{...structuredClone(first),key:crypto.randomUUID()}])}><Plus size={19}/></button></div>
    </div>;})}</div>
      {lineup.some(c=>configurationIssue(c,caps))&&<p role="alert">Some saved game settings need review. Edit the affected game before sending.</p>}
      <button type="button" className="midnight-create" disabled={lineup.length>=caps.max_children||!caps.games.length} onClick={()=>{setEditing(null);setStage('pick');}}>Add Game</button>
      <small>{lineup.length} of {caps.max_children} games · Repeats allowed</small>
      {lineup.length>caps.max_children&&<p role="alert">Only {caps.max_children} games are currently supported. Remove games before sending.</p>}
      <button type="button" className="midnight-primary" disabled={!lineup.length||lineup.length>caps.max_children||lineup.some(c=>configurationIssue(c,caps)||!/^[1-9][0-9]{0,3}$/.test(c.stake))} onClick={()=>onCollapse(true)}>Choose Opponent</button>
    </>}
    </>}
  </fieldset>;
}
