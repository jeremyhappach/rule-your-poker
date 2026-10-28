import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DiceTableLayout } from '@/components/DiceTableLayout';
import { DiceAnchoredSlot } from '@/components/DiceAnchoredSlot';
import { DiceGameplayGeometryProvider } from '@/lib/wave5GameplayGeometry/DiceGameplayGeometryProvider';
import { AssignedRectFitter } from '@/lib/wave5GameplayGeometry/AssignedRectPx';
import { setGeometryOverrides } from '@/lib/geometryLab/store';
import { DICE_OBSERVER_PAINT } from '@/lib/dice/observerPaintBounds';
import { useDiceResultPresentation } from '@/hooks/useDiceResultPresentation';
import { useAbsentDicePresenter } from '@/hooks/useAbsentDicePresenter';
import type { HorsesPlayerDiceState } from '@/hooks/useHorsesMobileController';
import type { SCCHand } from '@/lib/sccGameLogic';
import '@/index.css';

const params = new URLSearchParams(location.search);
const game = params.get('game') === 'horses' ? 'horses' : 'ship-captain-crew';
const held = Number(params.get('held') ?? 0);
const artifact = `${game === 'horses' ? 'horses' : 'scc'}.opponentDiceStage`;
setGeometryOverrides(new Map([[artifact, {artifact_id:artifact,game,anchor_x:.5,anchor_y:.42,anchor_origin:'center',size_mode:'widthDriven',width_pct:1,height_pct:null,aspect_ratio:3.409090909090909}]]));
const dice = (game==='horses'?[6,6,4,3,2]:[6,5,4,3,2]).map((value,i)=>({value,isHeld:i<held,isSCC:game!=='horses'&&i<Math.min(held,3),sccType:game!=='horses'&&i<Math.min(held,3)?(['ship','captain','crew'] as const)[i]:undefined}));

function RollStory() {
 const [state,setState]=useState<HorsesPlayerDiceState>({dice,rollsRemaining:1,isComplete:false,rollKey:1});
 const [actor,setActor]=useState<string|null>('Lance');
 const [mounted,setMounted]=useState(true);
 const receipt=useDiceResultPresentation('dealer:round',{lance:state});
 useAbsentDicePresenter(receipt.key,mounted,false,receipt.landed);
 const shown=receipt.hold?.dice??state.dice;
 return <>
  <button id="complete-roll" onClick={()=>{setActor(null);setState({...state,dice:dice.map(d=>({...d,isHeld:true})),rollKey:2,rollStartedAt:new Date().toISOString(),heldMaskBeforeComplete:dice.map(()=>false),isComplete:true,rollsRemaining:0,result:{isQualified:false,cargoSum:0,rank:0,description:'NQ'}});}}>Final actor roll → terminal snapshot</button>
  <div data-actor>{actor??'terminal'}</div>
  <button id="hide-dice" onClick={()=>setMounted(false)}>Switch away from dice tab</button>
  <output data-announcement data-at={receipt.announcement?Date.now():''}>{receipt.announcement?.description??''}</output>
  <div style={{margin:'100px auto',width:280,height:204}}>
   {mounted&&<AssignedRectFitter><DiceTableLayout dice={shown} size="md" gameType={game} isObserver
    observerRollLive={receipt.hold?.isRolling??false} rollKey={state.rollKey} cacheKey="story:lance"
    heldMaskBeforeComplete={state.heldMaskBeforeComplete} animationOrigin={{x:-80,y:-20}}
    presentationKey={receipt.key} onPresentationLanded={receipt.landed}/></AssignedRectFitter>}
  </div>
 </>;
}

createRoot(document.getElementById('root')!).render(params.get('mode')==='completion'?<RollStory/>:<>
  <main style={{width:'76%',margin:'6rem auto',position:'relative'}}>
    <div data-canonical-felt-surface style={{width:'100%',aspectRatio:'0.9',position:'relative',background:'#164c30',borderRadius:'45%'}}>
      <div data-canonical-felt-coord-frame style={{position:'absolute',inset:0}}/>
      <div data-dice-pot-reserve={game} style={{position:'absolute',left:'50%',top:'28%',transform:'translate(-50%,-100%)',background:'#111',color:'#fff',border:'2px solid gold',borderRadius:10,padding:'5px 18px',fontSize:20}}>$8</div>
    </div>
  </main>
  <DiceGameplayGeometryProvider gameType={game} opponentDiceVisible beatBadgeVisible={false}>
    <DiceAnchoredSlot artifactId={artifact}><AssignedRectFitter>
      <div style={{padding:DICE_OBSERVER_PAINT.padding}}>
        <DiceTableLayout dice={dice} gameType={game} size="md" isObserver observerRollLive={false} rollKey={123} cacheKey={`${game}:${held}`} useSCCDisplayOrder={game!=='horses'} sccHand={game!=='horses'?{dice} as SCCHand:undefined} />
      </div>
    </AssignedRectFitter></DiceAnchoredSlot>
  </DiceGameplayGeometryProvider>
</>);
