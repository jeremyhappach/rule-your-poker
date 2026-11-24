import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
await build({entryPoints:['src/lib/chess/rules.ts'],outfile:'qualification.local/chess-untimed/rules.mjs',bundle:true,platform:'node',format:'esm'});
const {newChess,playChess,promotionOptions}=await import(pathToFileURL(resolve('qualification.local/chess-untimed/rules.mjs')));
const before=JSON.parse(read('qualification.local/chess-untimed/production-before.json','utf8')).child;
const expected=before.state;
let s={...newChess(expected,expected.moves[0].at-1000,expected.initialFen),timingPolicy:'play-money-untimed/1',deadline:null,clockDuration:0,opened:true};
for(const move of expected.moves){s=playChess(s,s.players[s.turnIndex].id,{type:'move',from:move.from,to:move.to,...(move.promotion?{promotion:move.promotion}:{})},move.at);assert.equal(s.fen,move.fen);}
for(const key of ['fen','moves','positions','captured','turn','turnIndex','banks'])assert.deepEqual(JSON.parse(JSON.stringify(s[key])),expected[key],key);
const receipt={passed:true,ply:s.moves.length,fen:s.fen,actor:s.players[s.turnIndex].id,captured:s.captured,promotionWhite:promotionOptions(s,'w'),promotionBlack:promotionOptions(s,'b')};
write('qualification.local/chess-untimed/history-replay.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));

