import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PersistentTableShell } from '@/lib/canonicalShell/PersistentTableShell';
import { ResponsiveGeometryProvider } from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import { CanonicalSeatCluster } from '@/lib/canonicalShell/CanonicalSeatCluster';
import { useSeatAnchors } from '@/lib/canonicalShell/SeatAnchorLayer';
import { ShellHudGrid } from '@/lib/canonicalShell/ShellHudGrid';
import { useShellTabBar, type ShellTabId } from '@/lib/canonicalShell/ShellTabBar';
import { useCanonicalFeltInteractionLayerElement } from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import { CanonicalChipDisc } from '@/components/canonicalShell/CanonicalChipDisc';
import { Run21Felt } from '@/components/run21/Run21Felt';
import {Run21PlayerPane,Run21PassStatus,Run21Timer} from '@/components/run21/Run21PlayerPane';
import {Run21Announcement} from '@/components/run21/Run21Announcement';
import type { Intent, Projection } from '@/lib/run21/model';
import type { Run21Geometry } from '@/lib/run21/geometry';
import {useSafeFelt} from './useSafeFelt';

interface Props {
  view: Projection; now: number; pane: ReactNode; header: ReactNode;
  geometry: Run21Geometry; onIntent?: (intent: Intent)=>void;
}
function Contents({view,now,pane,geometry,onIntent}:Props) {
  const layer=useCanonicalFeltInteractionLayerElement(true);
  const anchors=useSeatAnchors();
  const [tab,setTab]=useState<ShellTabId>('cards');
  useShellTabBar({cardsIcon:'spade',activeTab:tab,setActiveTab:setTab});
  const self=view.players.find(p=>p.id===view.viewerId)??view.players[0];
  const {area,draw}=useSafeFelt(layer,`${view.viewerId}:${view.roundId}:${view.revealed}`,geometry,!!view.viewerId);
  const compact=(n:number|undefined)=>n===undefined?'—':Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
  return <>
    <Run21Announcement view={view} dealerGameScope={null}/>
    <div className="run21-canonical-play">
      <div className="run21-canonical-seats">
      {view.players.filter(p=>p.id!==view.viewerId).map(p=><CanonicalSeatCluster key={p.id}
        slot={anchors.byPosition.get(p.seat)?.slot} position={p.seat} name={p.name}
        chipValue="100" chipAmount={100} playerId={p.id} ownerLabel="Run21Fixture" isDealer={p.id===view.players[1].id}
        scoreLine={compact(view.cumulative[p.id])}>
          <Run21PassStatus used={view.passUsed[p.id]??false}/>
        </CanonicalSeatCluster>)}
      </div>
    </div>
    {layer&&area.width>0&&createPortal(<div className="run21-felt-safe-area" data-run21-deadline={view.boards[self.id]?.deadline} data-run21-started={view.boards[self.id]?.startedAt} style={{left:`${area.x*100}%`,top:`${area.y*100}%`,width:`${area.width*100}%`,height:`${area.height*100}%`}}><Run21Felt view={view} now={now} geometry={geometry} drawLayer={layer} drawRect={draw} onIntent={onIntent}/></div>,layer)}
    <ShellHudGrid timer={<Run21Timer view={view} now={now}/>}
      pane={<div className="run21-player-pane">{tab==='cards'?<>
        <Run21PlayerPane view={view} now={now} onIntent={onIntent}/>
        <div className="run21-lab-controls"><details open><summary>Preview controls</summary>{pane}</details></div>
      </>:<p>Isolated {tab} fixture. Production integration is deferred.</p>}</div>}
      identity={view.viewerId?<div className="run21-self-identity" data-run21-score-owner={self.id}>
        <strong>{self.name}</strong><CanonicalChipDisc amount={100} positionAnchor={self.seat} size="cluster"/>
        <span aria-label={`Score ${view.cumulative[self.id].toLocaleString()}`}>{view.cumulative[self.id].toLocaleString()}</span>
      </div>:<div className="run21-self-identity">Observing Run21</div>}/>
  </>;
}
/** Offline fixture: real shell imports, no live session ID or production routing. */
export function CanonicalRun21Fixture(props:Props) {
  const self=props.view.players.find(p=>p.id===props.view.viewerId)??props.view.players[0];
  return <ResponsiveGeometryProvider><PersistentTableShell gameType="run21" anteAmount={props.view.stake}
    projectionMode={props.view.viewerId?'active-canonical':'observer-absolute'} viewerPosition={props.view.viewerId?self.seat:undefined} viewerUserId={props.view.viewerId??undefined}
    seats={props.view.players.map(p=>({position:p.seat,occupied:true}))} header={props.header}>
    <Contents {...props}/>
  </PersistentTableShell></ResponsiveGeometryProvider>;
}
