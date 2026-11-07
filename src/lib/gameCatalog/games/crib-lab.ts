import type {GameDescriptor} from '../types';

export default {
  id:'crib-lab', defaultsKey:'crib-lab', name:'Crib Lab', category:'other', order:21,
  family:'megatouch', modes:['arcade','multiplayer'], arcadeSection:'originals', players:{min:2,max:7,selection:'active-roster'},
  bots:'unsupported', availability:'crib-lab', development:'integrated', ownerSmoke:'pending',
  rules:{kind:'versioned',key:'crib-lab',load:()=>import('@/components/rules/CribLabRules')},
  defaultsEditor:'crib-lab', artwork:'crib-lab',
} satisfies GameDescriptor;
