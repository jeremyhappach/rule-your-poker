import type {V2Scene,V2Snapshot} from './model';

export interface Frame {scene:V2Scene; at:number; hold:number; live:boolean}
export const flipGap=720;
const prefix=(s:V2Scene)=>s.phase==='board_reveal'?s.community.length:s.phase==='showdown'?s.chucky.length:0;
function hold(s:V2Scene){
  switch(s.phase){
    case 'fold':return 350;
    case 'deal':return 2450;
    case 'board_reveal':return s.community.length===2?220:s.community.length===3?600:450;
    case 'showdown':return !s.chucky.length?s.level*180+540:s.chucky.length===s.level?850:flipGap;
    case 'win':return 1450;
    case 'crack':return 3000;
    case 'round_over':return 2150;
    default:return 0;
  }
}
export function seek(s:V2Snapshot,now:number,live=false):Frame[]{
  // A restored result seeks its original visual beat. Historical flips remain silent.
  let at=s.since;
  if(s.phase==='board_reveal'&&s.community.length>2)at+=220+(s.community.length-3)*600;
  if(s.phase==='showdown'&&s.chucky.length)at+=s.level*180+540+(s.chucky.length-1)*flipGap;
  return [{scene:s,at:Math.min(now,at),hold:hold(s),live}];
}
export function admit(frames:Frame[],s:V2Snapshot,now:number):Frame[]{
  const active=frames.filter(f=>f.at<=now).at(-1);
  const queue=frames.filter(f=>f.at>now);
  if(active)queue.unshift(active);
  function add(scene:V2Scene){
    const last=queue.at(-1);
    // Fold receipts and the following authoritative deal share a timestamp.
    const order=(v:V2Scene)=>v.phase==='fold'?-1:prefix(v);
    if(last&&(scene.since<last.scene.since||(scene.since===last.scene.since&&order(scene)<=order(last.scene))))return;
    queue.push({scene,at:Math.max(now,last?last.at+last.hold:now),hold:hold(scene),live:true});
  }
  function showdown(scene:V2Scene,origin:number){
    for(let n=0;n<=scene.chucky.length;n++){
      add({...scene,phase:'showdown',since:origin,chucky:scene.chucky.slice(0,n),best:null,label:null,tie:null,
        risk:scene.phase==='crack'||scene.phase==='win'?scene.beforeRisk:scene.risk,
        cracks:scene.cracks+(scene.phase==='crack'?1:0)});
    }
  }
  function present(scene:V2Scene){
    if(scene.phase==='win'||scene.phase==='crack'){
      showdown(scene,scene.since-(scene.level*180+540+(scene.level-1)*flipGap+850));
    }else if(scene.phase==='showdown'){showdown(scene,scene.since);return;}
    if(scene.phase==='board_reveal'||scene.phase==='choose'){
      const origin=scene.phase==='choose'?scene.since-1270:scene.since;
      for(let n=2;n<=scene.community.length;n++)add({...scene,phase:'board_reveal',since:origin,community:scene.community.slice(0,n)});
    }
    add(scene);
  }
  // Historical receipts allow visible catch-up without revealing an uncommitted card.
  const scenes=[s.lastShowdown,s.lastRound,s.lastFold,s].filter((v):v is V2Scene=>!!v).sort((a,b)=>a.since-b.since||(a.phase==='fold'?-1:b.phase==='fold'?1:0));
  for(const scene of scenes)present(scene);
  return queue;
}
export function scoreMotion(s:V2Scene){
  if(s.phase==='crack'&&s.beforeRisk>0)return {from:s.beforeRisk,to:0,start:1050,end:2050};
  if(s.phase==='win')return {from:s.beforeRisk,to:s.risk,start:100,end:1050};
  if(s.phase==='round_over'&&s.beforeRisk>0)return {from:0,to:s.beforeRisk,start:240,end:1240};
  return null;
}
export function handAnnouncement(s:V2Scene){
  const noun=['Two Pair','High Card','One Pair','Three of a Kind','Four of a Kind'].includes(s.label??'')?s.label:'a '+s.label;
  return (s.tie?'Chucky wins the tie with ':'Chucky cracked you with ')+noun+'!';
}
