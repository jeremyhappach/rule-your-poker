import type {ArcadeSnapshot} from './model';
import type {PendingRun21Action} from '@/lib/run21/actionPresentation';

/** Fresh local response evidence only; never called for state reads or stored retries. */
export function confirmedArcadePass(before:ArcadeSnapshot,after:ArcadeSnapshot,command:PendingRun21Action) {
  const id=command.playerId,a=before.view.boards[id],b=after.view.boards[id];
  return command.intent.type==='pass' && before.id===after.id && after.game==='run21' &&
    before.revision===command.runRevision && after.revision===before.revision+1 &&
    before.view.roundId===command.roundId && after.view.roundId===command.roundId &&
    before.view.viewerId===id && after.view.viewerId===id && !!a && !!b && !a.result &&
    a.revision===command.revision && b.revision===a.revision+1 && b.cardIndex===a.cardIndex+1 &&
    b.passesUsed===a.passesUsed+1 && JSON.stringify(a.columns)===JSON.stringify(b.columns);
}
