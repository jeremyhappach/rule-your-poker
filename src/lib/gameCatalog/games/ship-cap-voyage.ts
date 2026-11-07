import type {GameDescriptor} from '../types';
export default {id:'ship-cap-voyage',defaultsKey:'ship-cap-voyage',name:'Ship Cap Voyage',category:'dice',order:25,
 family:'megatouch',modes:['arcade'],arcadeSection:'originals',players:{min:1,max:1,selection:'solo'},bots:'unsupported',availability:'ship-cap-voyage',development:'integrated',ownerSmoke:'pending',
 rules:{kind:'versioned',key:'ship-cap-voyage',fixedVersion:'ship-cap-voyage/1',load:()=>import('@/components/rules/ShipCapVoyageRules')},defaultsEditor:'legacy',artwork:'ship-cap-voyage'} satisfies GameDescriptor;
