import type {GameDescriptor} from '../types';
export default {
 id:'race-poker', defaultsKey:'race-poker', name:'Race Poker', category:'other', order:15,
 family:'megatouch', modes:['multiplayer'], players:{min:2,max:2,selection:'active-roster'},
 bots:'supported', availability:'race-poker', development:'integrated', ownerSmoke:'pending',
 rules:{kind:'versioned',key:'race-poker',fixedVersion:'race-poker/2',supportedVersions:['race-poker/1','race-poker/2'],load:()=>import('@/components/rules/RacePokerRules')},
 defaultsEditor:'stake',
} satisfies GameDescriptor;
