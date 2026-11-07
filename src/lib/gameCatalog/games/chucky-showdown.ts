import type {GameDescriptor} from '../types';

export default {
  id:'chucky-showdown', defaultsKey:'chucky-showdown', name:'Chucky Showdown', category:'other', order:22,
  family:'megatouch', modes:['arcade','multiplayer'], arcadeSection:'originals', players:{min:2,max:7,selection:'active-roster'},
  bots:'unsupported', availability:'chucky-showdown', development:'integrated', ownerSmoke:'pending',
  rules:{kind:'versioned',key:'chucky-showdown',load:()=>import('@/components/rules/ChuckyShowdownRules')},
  defaultsEditor:'chucky-showdown', artwork:'chucky-showdown',
} satisfies GameDescriptor;
