import type {GameDescriptor} from '../types';
export default {id:'357-drop',defaultsKey:'357-drop',name:'357 Drop',category:'other',order:23,family:'megatouch',modes:['arcade'],
 arcadeSection:'originals',players:{min:1,max:1,selection:'solo'},bots:'unsupported',availability:'357-drop',development:'integrated',ownerSmoke:'pending',
 rules:{kind:'versioned',key:'357-drop',fixedVersion:'357-drop/5',supportedVersions:['357-drop/1','357-drop/2','357-drop/3','357-drop/4','357-drop/5'],load:()=>import('@/components/rules/Drop357Rules')},defaultsEditor:'stake',artwork:'357-drop'} satisfies GameDescriptor;
