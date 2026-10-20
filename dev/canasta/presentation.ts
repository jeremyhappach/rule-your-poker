import '@/lib/canonicalShell/canonicalShellLayoutConfig';
import '@/lib/canonicalShell/shellNameplateConfig';
import '@/lib/canonicalShell/shellChipBalanceConfig';
import {_setFromRemote} from '@/lib/geometryLab/defaultsRegistry';

// Read-only production capture, 2026-10-20. No credentials, profiles or live writes.
// Apply through the same registered/sanitized owners as GeometryLabDefaultsLoader.
export const presentationSnapshot = {
  canonical_shell_layout: {playSafeTop:2,playSafeBottom:8},
  shell_nameplate: {attachment:'center',xOffsetDia:0,yOffsetDia:0.05,anchorStart:'upper',maxWidthDia:2.2},
  shell_chip_balance: {minSizePct:0.18,maxWidthPct:0.97,prefSizePct:0.3},
};
export function loadPresentationSnapshot() {
  for(const [key,value] of Object.entries(presentationSnapshot))
    _setFromRemote(key,value,{isInitialFetch:true,rowExists:true});
}
