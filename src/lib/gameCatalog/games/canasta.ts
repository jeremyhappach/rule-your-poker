import type {GameDescriptor} from '../types';
export default {
 id:'canasta',defaultsKey:'canasta',name:'Canasta',category:'cards',order:17,
 family:'traditional',modes:['multiplayer'],players:{min:2,max:2,selection:'active-roster'},
 bots:'fake-money-only',moneyModes:['fake'],availability:'canasta',development:'integrated',ownerSmoke:'pending',
 rules:{kind:'versioned',key:'canasta',fixedVersion:'canasta-classic-two/1',load:()=>import('@/components/rules/CanastaRules')},
 defaultsEditor:'stake',
} satisfies GameDescriptor;
