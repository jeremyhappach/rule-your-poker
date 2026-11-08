// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {GAME_CATALOG,ARCADE_GAMES} from '@/lib/gameCatalog';
import {ASYNC_RULES_GAMES,rulesModes} from '@/lib/gameCatalog/rulesModes';
import audit from '../../../dev/lobby-catalog/rules-audit-20261104.json';
// Preserve the historical audit and enumerate additions separately.
const candidates=vi.hoisted(()=>[
 {game:'crib-lab',id:'crib-lab/1',config:{version:'crib-lab/1',durationMs:240000}},
 {game:'chucky-showdown',id:'chucky-showdown/1',config:{version:'chucky-showdown/1',durationMs:30000}},
 {game:'357-drop',id:'357-drop/4',config:{version:'357-drop/4'}},
 {game:'horses-blitz',id:'horses-blitz/3',config:{version:'horses-blitz/3'}},
 {game:'ship-cap-voyage',id:'ship-cap-voyage/1',config:{version:'ship-cap-voyage/1'}},
]);
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:vi.fn(async({game})=>{
 const {default:a}=await import('../../../dev/lobby-catalog/rules-audit-20261104.json');
 return {currentRuleset:[...a.arcade,...candidates].filter(r=>r.game===game).at(-1)?.id};
})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn(async(_name,{p_ruleset})=>{
 const {default:a}=await import('../../../dev/lobby-catalog/rules-audit-20261104.json');
 return {data:[...a.arcade,...candidates].find(r=>r.id===p_ruleset)?.config,error:null};
})}}));
import {RulesContent} from '../rules/RulesContent';
import {GameRules} from '../GameRules';
afterEach(cleanup);

it('covers the audited registry and current solo additions exactly',()=>{
 expect(GAME_CATALOG.map(g=>g.defaultsKey).sort()).toEqual([...audit.defaults,...candidates.map(g=>g.game)].sort());
 expect(ARCADE_GAMES.map(g=>g.id).sort()).toEqual([...new Set(audit.arcade.map(r=>r.game)),...candidates.map(g=>g.game)].sort());
 expect(new Set(GAME_CATALOG.map(g=>g.id)).size).toBe(GAME_CATALOG.length);
});
it('covers every Async adapter and every explicit Arcade service dispatch',()=>{
 const adapter=readFileSync('server/delayed/adapter.ts','utf8');
 const asyncIds=[...adapter.match(/export type Game=([^;]+)/)![1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 expect(Object.keys(ASYNC_RULES_GAMES).sort()).toEqual([...asyncIds,'ptown-words'].sort());
 const arcade=readFileSync('server/arcade/service.ts','utf8');
 const dispatched=[...arcade.matchAll(/(?:body|row|input)\.game\s*===\s*'([^']+)'/g)].map(m=>m[1]);
 for(const id of [...asyncIds,...dispatched,'run21'])expect(GAME_CATALOG.find(g=>g.id===id)?.rules.load,id).toBeTypeOf('function');
});
it.each(GAME_CATALOG.flatMap(game=>rulesModes(game).map(mode=>({game:game.id,mode}))))('$game / $mode has real accessible rules',async({game,mode})=>{
 const ui=render(<RulesContent game={game} mode={mode}/>);
 await waitFor(()=>{expect(screen.queryByRole('status')).toBeNull();expect(screen.queryByRole('alert')).toBeNull();expect(ui.container.textContent!.length).toBeGreaterThan(200);});
 expect(ui.container.textContent).not.toMatch(/Rules (are |could not|are unavailable)/);
 if(mode==='arcade'){expect(screen.getByRole('heading',{name:'How to play'})).toBeTruthy();expect(screen.getByRole('heading',{name:'What scores'})).toBeTruthy();}
});
it('keeps one selectable entry per game across categories and locates Mega under Other',async()=>{
 render(<GameRules open onOpenChange={()=>{}}/>);
 const select=screen.getByRole('combobox',{name:'Game'});
 expect(select.querySelectorAll('option')).toHaveLength(GAME_CATALOG.length);
 const mega=select.querySelector('option[value="mega-card-golf"]')!;
 expect(mega.parentElement?.getAttribute('label')).toBe('Other');
 fireEvent.change(select,{target:{value:'mega-card-golf'}});
 expect(await screen.findByText(/2–8 players/)).toBeTruthy();
 fireEvent.change(screen.getByRole('combobox',{name:'Mode'}),{target:{value:'arcade'}});
 expect(await screen.findByText(/Completed courses enter/)).toBeTruthy();
 fireEvent.change(screen.getByRole('combobox',{name:'Mode'}),{target:{value:'async'}});
 expect(await screen.findByText(/Two players compete/)).toBeTruthy();
});
it('uses current Golf ending rules and preserves frozen historical help',async()=>{
 const ui=render(<RulesContent game="six-card-golf"/>);
 expect(await screen.findByText('Ptown stock-count house rule')).toBeTruthy();
 ui.rerender(<RulesContent game="six-card-golf" version="six-card-golf/1"/>);
 expect(await screen.findByText('Ptown prolonged-play house rule')).toBeTruthy();
});
it('describes Async Words without live turn clocks, banks or bots',async()=>{
 render(<RulesContent game="ptown-words" mode="async"/>);
 await screen.findByText(/Each turn has a 36-hour/);
 expect(screen.queryByText(/Two time banks/)).toBeNull();
 expect(screen.queryByText(/Bots are available/)).toBeNull();
});
it('shows partial carries from the lobby and preserves explicit legacy Drop help',async()=>{
 const ui=render(<RulesContent game="357-drop" mode="arcade"/>);
 expect(await screen.findByText(/Place four new cards and add the carried card/)).toBeTruthy();
 ui.rerender(<RulesContent game="357-drop" mode="arcade" version="357-drop/2"/>);
 expect(await screen.findByText(/Fill the 3s, 5s and 7s rows with three, five and seven cards/)).toBeTruthy();
});
