import type {GameDescriptor} from '../types';

export default {
  id:'chucky-showdown', defaultsKey:'chucky-showdown', name:'Chucky Showdown', category:'cards', order:22,
  family:'megatouch', modes:['arcade'], players:{min:1,max:1,selection:'solo'},
  bots:'unsupported', availability:'chucky-showdown', development:'integrated', ownerSmoke:'pending',
  rules:{kind:'versioned',key:'chucky-showdown',load:()=>import('@/components/rules/ChuckyShowdownRules')},
  defaultsEditor:'chucky-showdown', artwork:'chucky-showdown',
} satisfies GameDescriptor;
