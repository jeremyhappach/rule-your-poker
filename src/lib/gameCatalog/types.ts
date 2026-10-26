import type {ComponentType} from 'react';
export interface RuleRendererProps {config?:unknown;version?:string;solo?:boolean}
export type Category = 'cards' | 'dice' | 'other';
export type Capability = 'run21' | 'tri-towers' | 'eleven-up' | 'royal-flash' | 'take-two' | 'trip-flip' | 'battle-31' | 'quintzee' | 'boxdrop' | 'canasta' | 'six-card-golf' | 'race-poker' | 'mega-card-golf';
export type GameDescriptor = {
 id: string; defaultsKey: string; name: string; category: Category; order: number;
 family: 'traditional' | 'megatouch'; modes: readonly ('multiplayer' | 'arcade')[];
 players: {min: number; max: number; selection: 'active-roster' | 'solo'};
 bots: 'supported' | 'fake-money-only' | 'unsupported';
 moneyModes?: readonly ('fake' | 'real')[];
 availability: 'existing-setup' | Capability;
 development: 'integrated'; ownerSmoke: 'existing-release' | 'pending';
 rules: {kind: 'traditional' | 'versioned'; key: string; fixedVersion?:string; supportedVersions?:readonly string[]; load?:()=>Promise<{default:ComponentType<RuleRendererProps>}>};
 defaultsEditor: 'legacy' | 'farkle' | 'stake' | 'mega-card-golf'; geometry?: string; artwork?: string;
};
