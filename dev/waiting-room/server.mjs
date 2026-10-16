import fs from 'node:fs';
import path from 'node:path';
import {build,preview} from 'vite';
const status=JSON.parse(fs.readFileSync('qualification.local/farkle-full-stack/status.json','utf8'));
if(status.API_URL!=='http://127.0.0.1:57321')throw Error('Loopback only');
process.env.VITE_SUPABASE_URL='https://xvhmbuppghwmwpwrkzao.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY=status.ANON_KEY;
const probe={name:'waiting-qualification-probe',enforce:'pre',transform(code,id){
 if(id.endsWith('/src/hooks/useWaitingRoomActions.ts')){
  code=code.replace('const hasOpenSeats = seatedPlayerCount < 7;',`const hasOpenSeats = seatedPlayerCount < 7;
  (window as any).__waitProbe?.render({gameId,players,currentUserId,currentHost,startBoundary,start,blockerRead,checkScope,hasEnoughPlayers,canStartGame,startCheckFailed});`);
 }
 if(id.endsWith('/src/components/canonicalShell/CanonicalShellWaitingSurface.tsx')){
  code=code.replace('announcementsRef.current.emit({',`(window as any).__waitProbe?.event('announcement-effect', {gameId,ready:actions.hasEnoughPlayers});\n    announcementsRef.current.emit({`);
  code=code.replace("announcementsRef.current.clearAmbient('waiting_for_players');",`(window as any).__waitProbe?.event('announcement-cleanup', {gameId});\n      announcementsRef.current.clearAmbient('waiting_for_players');`);
 }
 if(id.endsWith('/src/pages/Game.tsx')){
  code=code.replace("const publishedPlayers = (playersData || []).sort",`(window as any).__waitProbe?.event('snapshot-publish',{source:fetchTrigger,fetchSeq});\n    const publishedPlayers = (playersData || []).sort`);
 }
 if(id.endsWith('/src/lib/canonicalShell/PersistentTableShell.tsx')){
  code=code.replace('if (ctx.ambient && !isCurrentWaitingAmbient) ctx.clearAmbient();',`if (ctx.ambient && !isCurrentWaitingAmbient) {
    (window as any).__waitProbe?.event('lobby-reset-cleared', {id:ctx.ambient.id,announcementType:ctx.ambient.type,lobbyMode});
    ctx.clearAmbient();
  }`);
 }
 return {code,map:null};
}};
const outDir=path.resolve('qualification.local/waiting-flicker/after/dist');
await build({plugins:[probe],build:{outDir,emptyOutDir:true},logLevel:'error'});
const server=await preview({build:{outDir},preview:{host:'127.0.0.1',port:5183,strictPort:true},logLevel:'error'});
console.log('WAITING_PROBE_READY 5183; product source unchanged');
process.on('SIGINT',()=>{server.httpServer.closeAllConnections();server.httpServer.close(()=>process.exit());});
