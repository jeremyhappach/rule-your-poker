import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {resolve} from 'node:path';
const client=resolve('dev/midnight-blue/client.ts');
const hooks=['useLobbyGames','useIsAdmin','useRun21Access','useTriTowersTestAccess','useElevenUpAccess','useRoyalFlashAccess','useTakeTwoAccess','useTripFlipAccess','useGolfAccess','useBoxdropAccess','useRacePokerAccess','useBattle31Access','useCanastaAccess','useQuintzeeAccess','usePtownWordsAccess','useChessAccess','useOriginalsAccess','useMegaCompetitionConfig'];
export async function startPreview(){
 const html='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/dev/midnight-blue/entry.tsx"></script></body></html>';
 const server=await createServer({configFile:false,cacheDir:'qualification.local/midnight-vite',plugins:[react(),{name:'local-midnight-review',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0].includes('.')||req.url?.startsWith('/@'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));});}}],resolve:{alias:[{find:'@/integrations/supabase/client',replacement:client},...hooks.map(h=>({find:'@/hooks/'+h,replacement:client})),{find:'@/lib/debugHarness/activeHarnessWarning',replacement:client},{find:'@',replacement:resolve('src')}]},define:{__RUN21_APP_TEST_LANE__:false,__BUILD_HASH__:'"review"',__APP_BUILD_SHA__:'"local-review"',__BUILD_TIMESTAMP__:'"local"'},server:{host:'127.0.0.1',port:5197,strictPort:true,hmr:false,watch:null}});
 await server.listen();return server;
}
if(process.argv[1]?.endsWith('server.mjs')){await startPreview();console.log('Midnight Blue review: http://127.0.0.1:5197');}
