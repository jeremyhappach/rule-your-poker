import type {GameDescriptor} from '../gameCatalog/types';
export const MEGA_RULESET = 'mega-card-golf/1' as const;
export const COURSE_IDS = ['sunny-meadows','coastal-links','devils-canyon'] as const;
export type CourseId = typeof COURSE_IDS[number];
export interface CourseSettings {
 enabled:boolean; name:string; difficulty:'Easy'|'Medium'|'Hard'; holes:number;
 stockAllowance:number; discardAllowance:number; initialExposed:number; completionSeconds:number;
}
export interface CourseConfig extends CourseSettings {id:CourseId;configId:string;boardId:string;revision:number}
// Shared catalog identity; gameplay admission is independently enforced by the server.
export const MEGA_CATALOG_IDENTITY = {
 id:'mega-card-golf',defaultsKey:'mega-card-golf',name:'Mega Card Golf',category:'cards',
 family:'megatouch',modes:['arcade'],
} satisfies Pick<GameDescriptor,'id'|'defaultsKey'|'name'|'category'|'family'|'modes'>;
export const COURSE_COPY:Record<CourseId,string>={
 'sunny-meadows':'A little sunshine. Plenty of second chances.',
 'coastal-links':'Ride the breeze. Make every draw count.',
 'devils-canyon':'Keep your cool. The canyon gives nothing away.',
};
export const INITIAL_COURSES:CourseConfig[]=COURSE_IDS.map((id,i)=>({
 id,configId:id+'/config/1',boardId:id+'/board/1',revision:1,enabled:true,
 name:['Sunny Meadows','Coastal Links',"Devil’s Canyon"][i],difficulty:(['Easy','Medium','Hard'] as const)[i],
 holes:9,stockAllowance:[16,12,8][i],discardAllowance:[5,3,1][i],initialExposed:2,completionSeconds:300,
}));
export function settings(input:CourseSettings):CourseSettings {
 if(!input||typeof input.enabled!=='boolean'||typeof input.name!=='string'||!input.name.trim()||input.name.length>60||!['Easy','Medium','Hard'].includes(input.difficulty))throw Error('Invalid course details');
 const limits={holes:[1,18],stockAllowance:[1,46],discardAllowance:[0,46],initialExposed:[0,5],completionSeconds:[60,3600]} as const;
 for(const [key,[min,max]] of Object.entries(limits))if(!Number.isInteger(input[key])||input[key]<min||input[key]>max)throw Error('Invalid '+key);
 if(input.discardAllowance>input.stockAllowance)throw Error('Discards cannot exceed stock');
 return {enabled:input.enabled,name:input.name.trim(),difficulty:input.difficulty,holes:input.holes,stockAllowance:input.stockAllowance,discardAllowance:input.discardAllowance,initialExposed:input.initialExposed,completionSeconds:input.completionSeconds};
}
export function changesCompetition(a:CourseSettings,b:CourseSettings){return ['holes','stockAllowance','discardAllowance','initialExposed','completionSeconds'].some(k=>a[k]!==b[k]);}
