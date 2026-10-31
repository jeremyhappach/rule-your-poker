import {startVitest} from 'vitest/node';
import path from 'node:path';
const root=process.cwd();
const ctx=await startVitest('test',process.argv.length>2?process.argv.slice(2):[
 'src/components/triTowers','src/lib/triTowers','src/hooks/useTriTowers.test.tsx',
 'src/hooks/useTriIntentBuffer.test.tsx','src/components/delayed/CurrentNet.test.tsx',
 'src/components/delayed/DelayedTurn.triCompletion.test.tsx','src/lib/delayed/reviews.test.ts',
 'src/lib/audio/audioManager.test.ts',
],{root,config:false,watch:false,maxWorkers:2,reporters:['default'],testTimeout:15000},
 {cacheDir:path.join(root,'qualification.local/tri-polish/vitest-cache'),
 resolve:{alias:{'@':path.join(root,'src').replaceAll('\\','/')}},esbuild:{jsx:'automatic'}});
await ctx.close();
