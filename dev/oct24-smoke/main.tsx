import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { SccPotPosition } from '../../src/components/SccPotPosition';
import { CanonicalPotZone } from '../../src/lib/canonicalShell/CanonicalPotZone';
import { DiceGameplayGeometryProvider } from '../../src/lib/wave5GameplayGeometry/DiceGameplayGeometryProvider';
import { DiceAnchoredSlot } from '../../src/components/DiceAnchoredSlot';
import { AssignedRectFitter } from '../../src/lib/wave5GameplayGeometry/AssignedRectPx';
import { DiceTableLayout } from '../../src/components/DiceTableLayout';

function Fixture() {
  const [roll, setRoll] = useState(1);
  const [held, setHeld] = useState(false);
  const dice = [6, 5, 4, 3, 2].map((value, index) => ({ value, isHeld: held && index < 3, isSCC: held && index < 3 }));
  return <main style={{ position: 'relative', width: '100%', height: '100%', background: '#064e3b' }} data-canonical-felt-surface>
    <div data-canonical-felt-coord-frame style={{ position: 'absolute', inset: 0 }} />
    <header data-canonical-shell-header style={{ position: 'absolute', top: 0, height: '8%', width: '100%' }}>SCC synthetic geometry fixture</header>
    <div data-hud-row="announcement" style={{ position: 'absolute', top: '8%', height: '7%', width: '100%' }}>Opponent rolling</div>
    <div data-canonical-shell-hud-grid style={{ position: 'absolute', top: '82%', height: '18%', width: '100%' }}>
      <button onClick={() => { setHeld(!held); setRoll(roll + 1); }}>Next roll</button>
    </div>
    <div data-legacy-pot style={{ position: 'absolute', top: '28%', left: '50%', transform: 'translate(-50%,-100%)', visibility: 'hidden' }}>
      <CanonicalPotZone size="prominent"><span className="text-xl font-bold">$6</span></CanonicalPotZone>
    </div>
    <SccPotPosition className="z-20"><CanonicalPotZone size="prominent"><span className="text-xl font-bold text-poker-gold">$6</span></CanonicalPotZone></SccPotPosition>
    <DiceGameplayGeometryProvider gameType="ship-captain-crew" opponentDiceVisible beatBadgeVisible={false}>
      <DiceAnchoredSlot artifactId="scc.opponentDiceStage"><AssignedRectFitter>
        <DiceTableLayout dice={dice} gameType="ship-captain-crew" canToggle={false} isRolling={false} size="md" isObserver
          useSCCDisplayOrder sccHand={{ dice } as any} showWildHighlight={false} cacheKey="oct24-smoke-fixture" rollKey={roll} />
      </AssignedRectFitter></DiceAnchoredSlot>
    </DiceGameplayGeometryProvider>
  </main>;
}
document.documentElement.style.height = '100%';
document.body.style.height = '100%';
document.getElementById('root')!.style.height = '100%';
createRoot(document.getElementById('root')!).render(<Fixture />);
