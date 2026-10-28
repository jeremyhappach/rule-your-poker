import type {GameDescriptor} from '../types';
export default {
 id:'six-card-golf',defaultsKey:'six-card-golf',name:'Six-Card Golf',category:'cards',order:15,
 family:'traditional',modes:['multiplayer'],players:{min:2,max:4,selection:'active-roster'},
 bots:'supported',availability:'six-card-golf',development:'integrated',ownerSmoke:'pending',
 rules:{kind:'versioned',key:'six-card-golf',fixedVersion:'six-card-golf/1',load:()=>import('@/components/rules/GolfRules')},
 defaultsEditor:'legacy',
} satisfies GameDescriptor;
