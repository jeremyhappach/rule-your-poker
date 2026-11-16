import type {GameDescriptor} from '../types';
export default {id:'five-alive',defaultsKey:'five-alive',name:'Five Alive',category:'other',order:26,
 family:'megatouch',modes:['arcade'],arcadeSection:'originals',players:{min:1,max:1,selection:'solo'},
 bots:'unsupported',availability:'five-alive',development:'integrated',ownerSmoke:'pending',
 rules:{kind:'versioned',key:'five-alive',fixedVersion:'five-alive/1',load:()=>import('@/components/rules/FiveAliveRules')},
 defaultsEditor:'legacy',artwork:'five-alive'} satisfies GameDescriptor;
