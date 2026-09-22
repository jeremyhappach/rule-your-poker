import type {ReactNode} from 'react';
import {QuickEmoticonPicker} from '@/components/QuickEmoticonPicker';
import {PresentationChipBalance} from './PresentationChipBalance';
import {cn} from '@/lib/utils';

/** Shared HUD identity strip extracted from Yahtzee's shell identity slot. */
export function CanonicalPlayerIdentityRow({playerId,name,chips,active=false,balance}: {
  playerId:string;name:string;chips:number;active?:boolean;balance?:ReactNode;
}) {
  return <div data-canonical-player-identity className="w-full h-full flex items-center justify-center gap-2 px-3 overflow-hidden">
    <QuickEmoticonPicker onSelect={()=>{}} disabled/>
    <p className="text-sm font-semibold text-foreground truncate">{name}
      {active&&<span className="ml-1 text-green-500">(active)</span>}
    </p>
    <span data-chip-delta-anchor={`player:${playerId}`} className={cn('font-bold text-lg tabular-nums',chips<0?'text-destructive':'text-poker-gold')}>
      {balance??<PresentationChipBalance playerId={playerId} rawBalance={chips} prefix=""/>}
    </span>
  </div>;
}
