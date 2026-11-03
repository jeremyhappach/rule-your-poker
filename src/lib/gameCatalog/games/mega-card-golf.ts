import type {GameDescriptor} from '../types';
import {MEGA_CATALOG_IDENTITY} from '../../megaCardGolf/config';
export default {...MEGA_CATALOG_IDENTITY,order:20,players:{min:2,max:8,selection:'active-roster'},bots:'unsupported',moneyModes:['fake','real'],availability:'mega-card-golf',development:'integrated',ownerSmoke:'pending',rules:{kind:'versioned',key:'mega-card-golf',fixedVersion:'mega-card-golf/4',load:()=>import('@/components/rules/MegaCardGolfRules')},defaultsEditor:'mega-card-golf'} satisfies GameDescriptor;
