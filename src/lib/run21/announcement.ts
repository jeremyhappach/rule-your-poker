import type {Projection} from './model';

/** Public phase narration only; the canonical rail owns its presentation. */
export function run21Announcement(view:Projection){
  const round=view.roundNumber>view.config.rounds?`sudden death ${view.roundNumber-view.config.rounds}`:`round ${view.roundNumber}/${view.config.rounds}`;
  const playing=view.players.filter(p=>view.playStatus?.[p.id]==='playing');
  const otherPlayers=playing.filter(p=>p.id!==view.viewerId);
  const actors=otherPlayers.length?otherPlayers:playing;
  const names=actors.map(p=>p.id===view.viewerId?'You':p.name);
  const subject=names.join(' and ');
  const complete=view.revealed||view.players.every(p=>view.playStatus?.[p.id]==='finished');
  const title=view.winnerId?'Run21 match complete':complete?`${round[0].toUpperCase()+round.slice(1)} complete`:
    actors.length?`${subject} ${names.length>1||subject==='You'?'are':'is'} playing ${round}`:
    view.playStatus?`Waiting to start ${round}`:round[0].toUpperCase()+round.slice(1);
  const identity=view.identity;
  const phases=view.players.map(p=>`${p.id}:${view.playStatus?.[p.id]??'unknown'}`).join('|');
  return {id:`run21:playing:${identity.dealerGameId}:${identity.handNumber}:${view.roundId}:${view.viewerId}:${phases}:${view.revealed}:${view.winnerId}`,title};
}
