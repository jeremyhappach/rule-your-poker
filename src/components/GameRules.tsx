import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {GAME_CATALOG,findGame,type Category} from '@/lib/gameCatalog';
import {CategoryNavigation} from '@/components/catalog/CategoryNavigation';
import {RulesContent} from '@/components/rules/RulesContent';
import '@/components/catalog/catalog.css';
export const GameRules=({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void})=>{
 const [game,setGame]=useState('3-5-7');const entry=findGame(game)!;
 const changeCategory=(category:Category)=>setGame(GAME_CATALOG.find(g=>g.category===category)!.id);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="catalog-dialog max-w-2xl">
 <DialogHeader><DialogTitle>Rules &amp; Info</DialogTitle><DialogDescription>Choose a game to read its rules.</DialogDescription></DialogHeader>
 <CategoryNavigation value={entry.category} onChange={changeCategory}/>
 <label className="grid gap-1 text-sm font-medium">Game<select className="catalog-select" value={game} onChange={e=>setGame(e.target.value)}>{GAME_CATALOG.filter(g=>g.category===entry.category).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
 <div className="catalog-scroll" tabIndex={0} aria-label={entry.name+' rules'}>{open&&<RulesContent game={game}/>}</div>
 </DialogContent></Dialog>;
};
