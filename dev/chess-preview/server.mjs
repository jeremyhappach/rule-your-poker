import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { Chess } from 'chess.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Local-only synthetic match. The persisted move list preserves repetition history.
const file = resolve('dev/chess-preview/match.local.json');
const duration = 36 * 60 * 60 * 1000;
let state;
try { state = JSON.parse(readFileSync(file, 'utf8')); } catch { state = { moves: [], revision: 0, deadline: Date.now() + duration }; }
const peers = new Set();
function game() { const chess = new Chess(); for (const move of state.moves) chess.move(move); return chess; }
function save() { writeFileSync(file, JSON.stringify(state)); }
function snapshot() { const chess = game(); return { ...state, fen: chess.fen(), pgn: chess.pgn(), turn: chess.turn(), check: chess.isCheck(), checkmate: chess.isCheckmate(), stalemate: chess.isStalemate(), repetition: chess.isThreefoldRepetition(), insufficient: chess.isInsufficientMaterial(), fiftyMoves: chess.isDrawByFiftyMoves(), gameOver: chess.isGameOver(), serverAt: Date.now(), duration }; }
function broadcast() { const value = `data: ${JSON.stringify(snapshot())}\n\n`; for (const peer of peers) peer.write(value); }
const host=process.argv[2] || '127.0.0.1';
const port=Number(process.argv[3] || 15431);
const server = await createServer({configFile:false,envFile:false,plugins:[react(),{name:'chess-local-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/chess/events') { res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'}); res.write(`data: ${JSON.stringify(snapshot())}\n\n`); peers.add(res); req.on('close',()=>peers.delete(res)); return; }
 if(url.pathname==='/chess/move' && req.method==='POST') { try { let raw=''; for await(const part of req) raw+=part; const request=JSON.parse(raw), chess=game(); if(request.revision!==state.revision) throw Error('The board changed. Try again.'); if(!['w','b'].includes(request.viewer)||request.viewer!==chess.turn()) throw Error('Waiting for the other player.'); if(chess.isGameOver()) throw Error('Game complete.'); if(Date.now()>=state.deadline) throw Error('Turn deadline reached.'); const move=chess.move({from:request.from,to:request.to,promotion:request.promotion}); if(!move) throw Error('Illegal move.'); state.moves.push({from:move.from,to:move.to,promotion:move.promotion}); state.revision++; state.deadline=Date.now()+duration; save(); broadcast(); res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(snapshot())); } catch(e) {res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));} return; }
 if(url.pathname==='/chess/reset' && req.method==='POST') { state={moves:[],revision:state.revision+1,deadline:Date.now()+duration}; save(); broadcast(); res.end('{}'); return; }
 if(url.pathname==='/'||url.pathname==='/game') { const html=await s.transformIndexHtml(req.url,readFileSync(resolve('dev/chess-preview/index.html'),'utf8'));res.setHeader('Content-Type','text/html');res.end(html);return; } next();
});}}],resolve:{alias:{'@':resolve('src')}},server:{host,port,strictPort:true}});
await server.listen(); console.log(`Chess local preview: http://${host}:${port}/`);
