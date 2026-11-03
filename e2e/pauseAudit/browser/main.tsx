import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DealerGameSetup} from '@/components/DealerGameSetup';
import {CanonicalTableHeader} from '@/lib/canonicalShell/CanonicalTableHeader';
import {PlayerOptionsMenu} from '@/components/PlayerOptionsMenu';
import {game} from './client';
import '@/index.css';
const noop=()=>{};
function Fixture(){
 const [paused,setPaused]=useState(false);
 const host=new URLSearchParams(location.search).get('host')!=='false';
 const toggle=()=>{game.is_paused=!game.is_paused;game.config_deadline=new Date(Date.now()+600000).toISOString();setPaused(game.is_paused);};
 return <><CanonicalTableHeader title="Synthetic pause check"><PlayerOptionsMenu isSittingOut={false} isObserver={false} waiting={false} autoAnte={false} autoAnteRunback={false} sitOutNextHand={false} standUpNextHand={false} onAutoAnteChange={noop} onAutoAnteRunbackChange={noop} onSitOutNextHandChange={noop} onStandUpNextHandChange={noop} onStandUpNow={noop} onLeaveGameNow={noop} isHost={host} isPaused={paused} onTogglePause={toggle} gameStatus="game_selection" variant="mobile"/></CanonicalTableHeader>
 <DealerGameSetup gameId="synthetic" dealerUsername="Dealer" isBot={false} dealerPlayerId="dealer" dealerPosition={1} configDeadline={game.config_deadline} isPaused={paused} onTogglePause={host?toggle:undefined} gameSetupTimerSeconds={600} anteDecisionTimerSeconds={30} activePlayerCount={2} activeHumanCount={2} onConfigComplete={noop} onSessionEnd={noop}/></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
