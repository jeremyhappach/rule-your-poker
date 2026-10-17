import {Run21SpaceScene} from './Run21SpaceScene';
import type {PendingRun21Action} from '@/lib/run21/actionPresentation';
import type { ReactNode } from 'react';
import type { Run21Snapshot } from '@/lib/run21/localClient';
import type { Intent } from '@/lib/run21/model';
import type { ReplayPackageV1 } from '@/lib/replay/contractV1';
import type { ShellTabId } from '@/lib/canonicalShell/ShellTabBar';
import { FullscreenGameShell } from '@/lib/canonicalShell/FullscreenGameShell';
import { Run21Felt } from './Run21Felt';
import { Run21Scoreboard } from './Run21Scoreboard';
import { Run21PlayerPane, Run21Timer } from './Run21PlayerPane';
import { Run21Replay } from './Run21Replay';

interface Props {
  snapshot: Run21Snapshot | null;
  now: number;
  pending?: boolean;
  placement?:PendingRun21Action|null;
  participationControls?: ReactNode;
  onIntent?: (intent: Intent) => void;
  hideScoring?: boolean;
  sessionEnded: boolean;
  activeTab: ShellTabId;
  setActiveTab: (tab: ShellTabId) => void;
  panel: ReactNode;
  error: ReactNode;
  replay: ReplayPackageV1 | null;
  onReturnLive: () => void;
}

/** Projection-only view; all commands, clocks and terminal effects stay in their existing owners. */
export function Run21FullscreenView(props: Props) {
  const {snapshot, now, sessionEnded, replay} = props;
  const view = snapshot?.view;
  return <FullscreenGameShell className="run21-space-theme" title="Run21" ready={!!view}
    description={sessionEnded ? 'Session ended' : view ? `Round ${view.roundNumber} · $${view.stake.toLocaleString('en-US')}` : 'Connecting…'}
    activeTab={props.activeTab} setActiveTab={props.setActiveTab} panel={props.panel} sessionEnded={sessionEnded}
    scores={view && <Run21Scoreboard view={view} now={now} transportBalances={snapshot.balances}/>}
    actions={view && !sessionEnded && !replay && <div className="run21-fullscreen-footer"><div className="run21-fullscreen-actions"><Run21Timer view={view} now={now}/><Run21PlayerPane view={view} now={now} onIntent={props.onIntent} pending={props.pending}/></div>{props.participationControls}</div>}>
    <Run21SpaceScene/>
    {props.error}
    {!sessionEnded && (view ? replay ? <Run21Replay replay={replay} renderFrame={(frame, at, controls) => <div className="run21-fullscreen-replay">
      <Run21Felt layout="fullscreen" view={frame} now={at}/>
      <div className="run21-fullscreen-replay-controls">{controls}<button onClick={props.onReturnLive}>Return to live match</button></div>
    </div>} /> : <Run21Felt layout="fullscreen" view={view} now={now} acceptedEvents={snapshot.events}
      onIntent={props.onIntent} pending={props.pending} placement={props.placement} hideScoring={props.hideScoring}/>
      : <p role="status" className="p-4 text-center">Preparing Run21…</p>)}
  </FullscreenGameShell>;
}
