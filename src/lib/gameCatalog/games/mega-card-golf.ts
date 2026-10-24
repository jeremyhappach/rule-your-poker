import type {GameDescriptor} from '../types';
import {MEGA_CATALOG_IDENTITY} from '../../megaCardGolf/config';
export default {...MEGA_CATALOG_IDENTITY,order:20,players:{min:1,max:1,selection:'solo'},bots:'unsupported',moneyModes:[],availability:'mega-card-golf',development:'integrated',ownerSmoke:'pending',rules:{kind:'versioned',key:'mega-card-golf',fixedVersion:'mega-card-golf/3',load:()=>import('@/components/rules/MegaCardGolfRules')},defaultsEditor:'mega-card-golf'} satisfies GameDescriptor;
