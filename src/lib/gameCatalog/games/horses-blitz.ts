import type {GameDescriptor} from '../types';
export default {id:'horses-blitz',defaultsKey:'horses-blitz',name:'Horses Blitz',category:'dice',order:24,
 family:'megatouch',modes:['arcade'],players:{min:1,max:1,selection:'solo'},bots:'unsupported',availability:'horses-blitz',development:'integrated',ownerSmoke:'pending',
 rules:{kind:'versioned',key:'horses-blitz',fixedVersion:'horses-blitz/2',load:()=>import('@/components/rules/HorsesBlitzRules')},defaultsEditor:'legacy',artwork:'horses-blitz'} satisfies GameDescriptor;
