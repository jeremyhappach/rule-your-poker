import type {GameDescriptor} from '../types';

export default {
  id:'crib-lab', defaultsKey:'crib-lab', name:'Crib Lab', category:'cards', order:21,
  family:'megatouch', modes:['arcade'], players:{min:1,max:1,selection:'solo'},
  bots:'unsupported', availability:'crib-lab', development:'integrated', ownerSmoke:'pending',
  rules:{kind:'versioned',key:'crib-lab',load:()=>import('@/components/rules/CribLabRules')},
  defaultsEditor:'crib-lab', artwork:'crib-lab',
} satisfies GameDescriptor;
