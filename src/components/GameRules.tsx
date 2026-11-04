import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {GAME_CATALOG,CATEGORIES,CATEGORY_LABELS,findGame,type Category} from '@/lib/gameCatalog';
import {rulesModes,RULES_MODE_LABELS} from '@/lib/gameCatalog/rulesModes';
import type {RulesMode} from '@/lib/gameCatalog/types';
import {CategoryNavigation} from '@/components/catalog/CategoryNavigation';
import {RulesContent} from '@/components/rules/RulesContent';
import '@/components/catalog/catalog.css';
export const GameRules=({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void})=>{
 const [game,setGame]=useState('3-5-7'),[preferredMode,setMode]=useState<RulesMode>('multiplayer');const entry=findGame(game)!;
 const modes=rulesModes(entry),mode=modes.includes(preferredMode)?preferredMode:modes[0];
 const changeCategory=(category:Category)=>setGame(GAME_CATALOG.find(g=>g.category===category)!.id);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="catalog-dialog max-w-2xl">
 <DialogHeader><DialogTitle>Rules &amp; Info</DialogTitle><DialogDescription>Choose a game to read its rules.</DialogDescription></DialogHeader>
 <CategoryNavigation value={entry.category} onChange={changeCategory}/>
 <label className="grid gap-1 text-sm font-medium">Game<select className="catalog-select" value={game} onChange={e=>setGame(e.target.value)}>{CATEGORIES.map(category=><optgroup key={category} label={CATEGORY_LABELS[category]}>{GAME_CATALOG.filter(g=>g.category===category).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>)}</select></label>
 {modes.length>1&&<label className="grid gap-1 text-sm font-medium">Mode<select className="catalog-select" value={mode} onChange={e=>setMode(e.target.value as RulesMode)}>{modes.map(value=><option key={value} value={value}>{RULES_MODE_LABELS[value]}</option>)}</select></label>}
 <div key={game+mode} className="catalog-scroll" tabIndex={0} aria-label={entry.name+' rules'}>{open&&<RulesContent game={game} mode={mode}/>}</div>
 </DialogContent></Dialog>;
};
