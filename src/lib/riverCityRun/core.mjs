// Frozen River City Run / 1. Extracted from the approved standalone preview.
const RUN_SECONDS = 186, SPEED = 15, LANE_WIDTH = 2.6;
const JUMP_SECONDS = 1.9, DUCK_SECONDS = 1.2, RECOVERY_SECONDS = 1.2;
const DRIVE_SECONDS=180, STOP_SECONDS=3, ARRIVAL_SECONDS=183;
const LANDMARK_OFFSET=(DRIVE_SECONDS-54)*SPEED;
const GANTRY_OPENING=1.16, GANTRY_TOP=5.6;
// One authored span: loading works, moving gates and chicanes replace repeated drills.
const CHALLENGES=[
 ['truck-rear','hurdle',-1,6,5],
 ['pass-low','beam',1,21.4,1.7],['opening-gap','gap',0,26.8,7],
 ['second-pass-low','beam',1,46.8,2.5],['second-pass-gap','gap',0,51.2,9],
 ['chain1-low','beam',-1,58.5,3.2],['chain1-gap','gap',0,61.65,11],
 ['chain2-low','beam',0,63.7,3.4],['chain2-gap','gap',1,66.8,12],
 ['chain3-low','beam',1,70,3.5],['chain3-gap','gap',0,73.1,12.5],
 ['gate-gap','gap',0,78,13],['gate-low','beam',0,80.8,4],
 ['reload-low','beam',0,104,3.8],['reload-gap','gap',-1,107.15,13],
 ['weave-low','beam',-1,109,4],['weave-gap','gap',0,112.15,13.5],
 ['cross-low','beam',0,114.1,4],['cross-gap','gap',1,117.3,14],
 ['rush-low','beam',1,121,4.3],['rush-gap','hurdle',0,124.15,12],
 ['switch-low','beam',-1,126.2,4.2],['switch-gap','gap',0,129.6,14.5],
 ['final1-low','beam',0,139,4.8],['final1-gap','gap',1,142,16],
 ['final2-low','beam',1,144,4.8],['final2-gap','gap',0,147,16],
 ['final3-low','beam',-1,149,5],['final3-gap','gap',0,152,16.5],
 ['final4-low','beam',0,160,5.2],['final4-gap','gap',-1,163,17],
 ['final5-low','beam',1,165,5.3],['final5-gap','gap',0,168.1,17.4],
 ['final6-low','beam',-1,170.2,5.4],['final6-gap','gap',0,173.2,17.6],
 ['final7-low','beam',1,175.3,5.4],['final7-gap','gap',0,178.3,17.6]
].map(([id,kind,lane,at,length])=>Object.freeze({id,kind,lane,at,length,mandatory:true}));
const CHICANES=[[60.1,0],[65.2,1],[71.6,0],[105.6,-1],[110.6,0],[115.7,1],[122.6,0],[128,0],[140.5,1],[145.5,0],[150.5,0],[161.5,-1],[166.6,0],[171.7,0],[176.8,0]];
const GATES=[{id:'swing1',kind:'gate',lane:0,at:55,length:7,offset:0},{id:'swing2',kind:'gate',lane:0,at:77,length:7,offset:1.5},{id:'swing3',kind:'gate',lane:-1,at:94,length:7,offset:1.5},{id:'swing4',kind:'gate',lane:1,at:100,length:7,offset:0},{id:'swing5',kind:'gate',lane:1,at:154,length:7,offset:1.5}];
const COURSE=Object.freeze([
 ...CHALLENGES.flatMap(o=>[o,...[-1,0,1].filter(lane=>lane!==o.lane).map(lane=>({id:o.id+'-guard'+lane,kind:'truck',lane,at:o.at,length:9}))]),
 ...CHICANES.flatMap(([at,open],i)=>[-1,0,1].filter(lane=>lane!==open).map(lane=>({id:'stagger'+i+':'+lane,kind:i%3===1?'boulder':'barrier',lane,at,length:4.2}))),...GATES,
 ...[[8.4,-1,'truck'],[8.4,1,'boulder'],[10.2,0,'boulder'],[10.2,1,'barrier'],[12.6,-1,'boulder'],[12.6,1,'barrier'],[18.6,-1,'boulder'],[24,1,'boulder'],[24,-1,'barrier'],[30,0,'boulder'],[44,-1,'boulder'],[48.8,1,'boulder'],[48.8,-1,'barrier']].map(([at,lane,kind],i)=>({id:'roadwork'+i,kind,at,lane,length:4})),
 ...[[18.6,0],[44,0],[95,0]].map(([at,lane],i)=>({id:'traffic'+i,kind:'traffic',at,lane,length:6,speed:5})),
 ...[[14.2,0,14],[31.4,-1,10],[53,0,12],[118.8,1,12],[155.2,-1,9]].map(([at,lane,length],i)=>({id:'water'+i,kind:'slick',at,lane,length})),
 {id:'early-bonus-low',kind:'beam',lane:1,at:31.4,length:1.3},

 {id:'fork-truck',kind:'truck',lane:0,at:34.7,length:5},{id:'fork-beam',kind:'beam',lane:-1,at:36.4,length:.8},
 // Continuous center works wall commits both routes before the ramp and seals the ground bypass.
 {id:'loading-divider',kind:'divider',lane:0,at:88.4,length:144},
 {id:'ground-low',kind:'beam',lane:-1,at:88.1,length:3.8},{id:'ground-gap',kind:'gap',lane:-1,at:90.25,length:12},
 {id:'upper-low',kind:'beam',lane:1,at:88.6,length:3.8,base:2.2},
 {id:'bonus-divider',kind:'divider',lane:0,at:134.8,length:60},
 {id:'bonus-low',kind:'beam',lane:-1,at:135,length:4.2},{id:'bonus-gap',kind:'gap',lane:1,at:135,length:14.5},
 {id:'last-divider',kind:'divider',lane:0,at:156.2,length:57},
 {id:'last-low',kind:'beam',lane:-1,at:156.7,length:4.8},{id:'last-bonus',kind:'gap',lane:1,at:156.7,length:17}
].sort((a,b)=>a.at-b.at));
const FORK=Object.freeze({reveal:32.7,truck:34.7,start:36.4*SPEED,end:39.2*SPEED,gapEnd:40.1*SPEED,pickup:37.85*SPEED,height:1.1});
const FORK_REWARD=Object.freeze({id:'fork',kind:'bag',value:1000});
const LIFT=Object.freeze({ramp:86*SPEED,start:87.2*SPEED,end:90.6*SPEED,gapEnd:92.3*SPEED,height:2.2,pickup:89.5*SPEED});
const LIFT_REWARD=Object.freeze({id:'flatbed-bag',kind:'bag',value:2200,choice:'loading'});
const PICKUPS=Object.freeze([
 ...[[13.4,0],[31.2,-1],[55.4,-1],[76,1],[99,-1],[119,-1],[137,-1],[158.5,-1]].map(([at,lane],i)=>({id:'wrench'+i,kind:'wrench',at,lane,choice:'route'+at})),
 ...[[6,-1,300,1.2],[15.6,0,200],[22.4,1,350],[31.2,1,700],[47.7,1,300],[52,0,250],[55.4,1,800],[68.4,1,300],[76,-1,650],[89.5,-1,600],[99,1,800],[119,1,700],[135.1,1,1500,1.8],[135.1,-1,350],[137,1,850],[156.8,1,1800,1.8],[156.8,-1,400],[158.5,1,950],[178.3,0,600,1.8]].map(([at,lane,value,minHeight=0],i)=>({id:'bag'+i,kind:'bag',at,lane,value,minHeight,choice:at===89.5?'loading':'route'+at}))
]);
function obstacleZ(o,t){return o.at*SPEED+(o.speed||0)*(t-o.at);}
function gatePose(o,t){const a=(1-Math.cos((t-o.at+o.offset)*Math.PI*2/3))*.5*Math.PI/2;const x=o.lane*LANE_WIDTH-1.24;return {a,x,z:o.at*SPEED,tx:x+2.48*Math.cos(a),tz:o.at*SPEED+2.48*Math.sin(a)};}
function gateCollision(o,s){const g=gatePose(o,s.t),dx=g.tx-g.x,dz=g.tz-g.z;const u=Math.max(0,Math.min(1,((s.x-g.x)*dx+(s.distance-g.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(s.x-g.x-u*dx,s.distance-g.z-u*dz)<.62;}

function distanceAt(t) {
  if(t<=DRIVE_SECONDS) return t*SPEED;
  const u=Math.min(1,(t-DRIVE_SECONDS)/STOP_SECONDS);
  return DRIVE_SECONDS*SPEED+SPEED*STOP_SECONDS*(u-u*u*u+.5*u*u*u*u);
}
function scoreFor(s) {
  const distance=Math.floor(s.distance),money=s.money;
  const clean=s.resultKind==='arrival' && s.hitCount===0?500:0;
  return {distance,money,clean,total:distance+money+clean};
}
function collectPickup(s,p) {
  if(s.collected.includes(p.id)||(p.choice&&s.routeChoices[p.choice]))return false;
  if(p.choice)s.routeChoices[p.choice]=p.id;
  s.collected.push(p.id);
  if(p.kind==='bag'){s.money+=p.value;s.collectLabel='+'+p.value+' points';}
  else if(s.repairReserve){s.collectLabel='Repair already ready';}
  else {
    s.wrenches++;
    if(s.wrenches===4){s.wrenches=0;if(s.markers<2){s.markers++;s.collectLabel='Repair · +1 marker';}else{s.repairReserve=true;s.collectLabel='Repair ready';}}
    else s.collectLabel='Wrench '+s.wrenches+'/4';
  }
  s.collectUntil=s.t+1.1;return true;
}

function freshState() {
  return { skidUntil:-1,skidStart:-1,skidEvents:[], phase: 'ready', t: 0, distance:0, hitCount:0, markers:2, wrenches:0, routeChoices:{}, liftEntry:'pending',liftExit:'pending',liftOn:false,liftJump:-10, repairReserve:false, money:0, collectLabel:'', collectUntil:-1, finalScore:null, recoveryUntil:-1, hitEvents:[], collected:[], resultKind:null, resultTime:0, lane: 0, x: 0, moveFrom: 0, moveStart: -10,
    jumpStart: -10, duckStart: -10, feedbackUntil: -1, actionUntil: -1, actionLabel: '',
    outcomes: COURSE.map(() => 'pending'), inputs: [], airborne: false, groundHeight: 0, jumpBase: 0,
    platformEntry: 'pending', platformExit: 'pending', entryJumpStart: -10, exitJumpStart: -10,
    platformLanded: false, pickupCollected: false };
}

function jumpHeight(s) {
  if (!s.airborne) return s.groundHeight;
  const p = (s.t - s.jumpStart) / JUMP_SECONDS;
  if (p <= 1) return s.jumpBase + Math.sin(Math.max(0,p) * Math.PI) * 2.5;
  // A jump from the raised deck continues down to the road without a height snap.
  const fall = s.t - s.jumpStart - JUMP_SECONDS;
  return s.jumpBase - (Math.PI*2.5/JUMP_SECONDS)*fall - 6*fall*fall;
}
function isDucking(s) { return s.t >= s.duckStart && s.t < s.duckStart + DUCK_SECONDS; }
function act(s, direction) {
  if (s.phase !== 'running') return false;
  if (direction === 'left' || direction === 'right') {
    s.moveFrom = s.x;
    s.moveStart = s.t;
    s.lane = Math.max(-1, Math.min(1, s.lane + (direction === 'left' ? -1 : 1)));
    s.actionLabel = direction === 'left' ? '← LEFT' : 'RIGHT →';
  } else if (direction === 'up') {
    if (s.airborne) return false;
    if (s.groundHeight === FORK.height && s.platformLanded) s.exitJumpStart = s.t;
    if(s.liftOn && s.groundHeight>=LIFT.height-.01)s.liftJump=s.t;
    s.jumpStart = s.t;
    s.jumpBase = s.groundHeight;
    s.airborne = true;
    s.duckStart = -10;
    s.actionLabel = '↑ JUMP';
  } else if (direction === 'down') {
    s.duckStart = s.t;
    s.jumpStart = -10;
    s.airborne = false;
    s.actionLabel = '↓ DUCK';
  } else return false;
  s.actionUntil = s.t + (direction === 'down' ? DUCK_SECONDS : .75);
  s.inputs.push({ direction, at: s.t, lane: s.lane });
  return true;
}
function hit(s, source='platform') {
  if(s.phase!=='running' || s.t<s.recoveryUntil)return false;
  s.hitCount++;s.hitEvents.push({at:s.t,source});s.feedbackUntil=s.t+.23;s.recoveryUntil=s.t+RECOVERY_SECONDS;
  if(s.markers===0){s.phase='crashed';s.resultKind='crash';s.resultTime=0;s.finalScore=scoreFor(s).total;}
  else {
    s.markers=Math.max(0,s.markers-1);
    if(s.repairReserve){s.markers++;s.repairReserve=false;s.collectLabel='Reserve repair · +1 marker';s.collectUntil=s.t+1.1;}
  }
  return true;
}

function stepPlatform(s) {
  const distance=s.distance, right=Math.abs(s.x-LANE_WIDTH)<1.55;
  const overDeck=right && distance>=FORK.start-.65 && distance<FORK.end;
  if(overDeck && s.platformEntry==='pending') {
    const jumpedOn=s.airborne && jumpHeight(s)>=FORK.height;
    s.platformEntry=jumpedOn?'clear':'hit';
    if(jumpedOn) s.entryJumpStart=s.jumpStart; else hit(s);
  }
  // A failed entry recovers onto the deck so the rest of this attempt remains playable.
  if(s.groundHeight===FORK.height && !overDeck && !s.airborne && s.platformExit==='pending') {
    s.platformExit='hit'; hit(s);
  }
  let surface=overDeck?FORK.height:0;
  const onLift=right&&distance>=LIFT.ramp&&distance<LIFT.end;
  const liftHeight=onLift?LIFT.height*Math.min(1,(distance-LIFT.ramp)/(LIFT.start-LIFT.ramp)):0;
  if(onLift&&!s.liftOn&&s.liftEntry==='pending'){
    const frontEntry=distance<LIFT.ramp+1.2;
    s.liftEntry=frontEntry?'clear':'hit';if(s.liftEntry==='hit')hit(s,'flatbed-side');
  }
  if(s.liftOn&&!onLift&&s.liftExit==='pending'&&(distance<LIFT.end||!s.airborne)){s.liftExit='hit';hit(s,distance<LIFT.end?'flatbed-side-rail':'flatbed-rolloff');}
  if(onLift)surface=liftHeight;
  s.liftOn=onLift;s.groundHeight=surface;
  if(onLift&&distance>=LIFT.start&&!s.airborne&&Math.abs(distance-LIFT.pickup)<.9&&s.liftEntry==='clear')collectPickup(s,LIFT_REWARD);
  if(right&&distance+.65>=LIFT.end&&distance-.65<=LIFT.gapEnd&&s.liftExit==='pending'){
    if(!(s.liftJump>=0&&s.liftJump*SPEED<LIFT.end&&s.airborne&&jumpHeight(s)>.6)){s.liftExit='hit';hit(s,'flatbed-gap');}
  }
  if(distance-.65>LIFT.gapEnd){if(s.liftEntry==='pending')s.liftEntry='bypassed';if(s.liftExit==='pending')s.liftExit=s.liftJump>=0?'clear':'bypassed';}
  if(s.airborne && s.t>s.jumpStart+JUMP_SECONDS/2 && jumpHeight(s)<=s.groundHeight) {
    s.airborne=false; s.jumpStart=-10;
  }
  if(overDeck && !s.airborne) s.platformLanded=true;
  if(!s.pickupCollected && s.platformEntry==='clear' && s.platformLanded && right &&
     Math.abs(distance-FORK.pickup)<.9 && jumpHeight(s)<=FORK.height+1.2) { s.pickupCollected=true; collectPickup(s,FORK_REWARD); }
  if(right && distance+.65>=FORK.end && distance-.65<=FORK.gapEnd && s.platformExit==='pending') {
    const jumpedOff=s.exitJumpStart>s.entryJumpStart && s.exitJumpStart>=0 &&
      s.exitJumpStart*SPEED<FORK.end && s.airborne && jumpHeight(s)>.6;
    if(!jumpedOff) { s.platformExit='hit'; hit(s); }
  }
  if(distance-.65>FORK.gapEnd) {
    if(s.platformEntry==='pending') s.platformEntry='bypassed';
    if(s.platformExit==='pending') s.platformExit=s.exitJumpStart>=0?'clear':'bypassed';
  }
}
function step(s, dt) {
  if(s.phase==='crashed' || s.phase==='finished') { s.resultTime+=dt; return; }
  if(!['running','approach','arrival'].includes(s.phase)) return;
  s.t=Math.min(RUN_SECONDS,s.t+dt); s.distance=distanceAt(s.t);
  const p=Math.min(1,(s.t-s.moveStart)/.23), eased=p*p*(3-2*p);
  s.x=s.moveFrom+(s.lane*LANE_WIDTH-s.moveFrom)*eased;
  if(s.phase==='running') {
    stepPlatform(s);
    for(let i=0;i<COURSE.length;i++) {
      if(s.phase!=='running') break;
      const o=COURSE[i]; if(s.outcomes[i]!=='pending') continue;
      const center=obstacleZ(o,s.t),front=s.distance+.65,rear=s.distance-.65;
      if(front>=center-o.length/2 && rear<=center+o.length/2) {
        const inLane=Math.abs(s.x-o.lane*LANE_WIDTH)<1.55;
        if(inLane&&o.kind==='slick'&&!s.airborne){s.skidStart=s.t;s.skidUntil=s.t+1.1;s.skidEvents.push(o.id);s.outcomes[i]='clear';continue;}
        const blocked=o.kind==='truck'||o.kind==='traffic'||o.kind==='boulder'||o.kind==='barrier'||o.kind==='divider'||(o.kind==='hurdle'&&jumpHeight(s)<1.05)||(o.kind==='gate'&&gateCollision(o,s)) || (o.kind==='gap' && jumpHeight(s)<.6) ||
          (o.kind==='beam' && (!isDucking(s) || jumpHeight(s)-(o.base||0)>.15));
        if((o.kind==='gate'||inLane) && blocked) { s.outcomes[i]='hit'; hit(s,o.id); }
      } else if(rear>center+o.length/2) s.outcomes[i]='clear';
    }
    if(s.phase!=='running') return;
    for(const token of PICKUPS) if(!s.collected.includes(token.id) && Math.abs(s.distance-token.at*SPEED)<.9 && Math.abs(s.x-token.lane*LANE_WIDTH)<.9 && jumpHeight(s)>=(token.minHeight||0)) collectPickup(s,token);
    if(s.t>=DRIVE_SECONDS) {
      s.phase='approach'; s.moveFrom=s.x; s.moveStart=s.t; s.lane=0;
      s.airborne=false; s.groundHeight=0; s.duckStart=-10;
    }
  }
  if(s.t>=ARRIVAL_SECONDS) s.phase='arrival';
  if(s.t>=RUN_SECONDS) { s.phase='finished'; s.resultKind='arrival'; s.resultTime=0; }
}

function swipeDirection(dx, dy, threshold = 24) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
// Local, points-only blackjack. Stakes leave available funds at commitment; settlement returns once.
const money=n=>Math.round((n+Number.EPSILON)*100)/100;
const points=n=>n.toLocaleString(undefined,{maximumFractionDigits:2});
const cardValue=c=>c.rank==='A'?11:['K','Q','J'].includes(c.rank)?10:Number(c.rank);
function handValue(cards){let total=cards.reduce((n,c)=>n+cardValue(c),0),aces=cards.filter(c=>c.rank==='A').length;while(total>21&&aces){total-=10;aces--;}return total;}
function shuffledShoe(){throw Error("river:server_shoe_required");}
function createCasino(balance){return {phase:balance>0?'betting':'closed',balance:money(balance),initialBalance:money(balance),deals:0,hands:[],dealer:[],shoe:[],active:0,settledDeals:[],lastNet:0,lastMessage:'Place your chips.',notice:'',reason:balance>0?'':'zero',clock:0,wait:0,actionDelay:0,holeRevealed:false,events:[],soundCursor:0,fx:null,banner:'',draftBet:0};}
function event(c,type,target=''){c.events.push({type,target});c.fx={type,target,id:c.events.length};}
function makeHand(cards,bet){return {cards,bet,done:false,doubled:false,natural:cards.length===2&&handValue(cards)===21,result:'',payout:0};}
function blackjackActions(c){
 const h=c?.hands[c.active],playing=c?.phase==='playing'&&c.actionDelay<=0&&h&&!h.done;
 return {hit:!!playing,stand:!!playing,double:!!playing&&h.cards.length===2&&c.balance>=h.bet,split:false};
}
function startDealer(c){c.phase='dealer';c.wait=.45;c.holeRevealed=false;c.lastMessage='Dealer reveals…';}
function nextHand(c){const next=c.hands.findIndex(h=>!h.done);if(next<0)startDealer(c);else{c.active=next;c.phase='playing';c.lastMessage=c.hands.length>1?'Hand '+(next+1)+' · your move.':'Your move.';}}
function settleDeal(c){
 if(c.phase!=='dealer'||!c.holeRevealed||c.hands.some(h=>!h.done)||c.settledDeals.includes(c.deals))return false;
 const dealer=handValue(c.dealer),dealerNatural=c.dealer.length===2&&dealer===21;
 if(!dealerNatural&&c.hands.some(h=>!h.natural&&handValue(h.cards)<=21)&&dealer<17)return false;
 let credit=0;
 for(const h of c.hands){const value=handValue(h.cards);let payout=0;
  if(dealerNatural){payout=h.natural?h.bet:0;h.result=h.natural?'Push':'Dealer blackjack';}
  else if(h.natural){payout=h.bet*2.5;h.result='Blackjack';}
  else if(value>21)h.result='Bust';
  else if(dealer>21||value>dealer){payout=h.bet*2;h.result='Win';}
  else if(value===dealer){payout=h.bet;h.result='Push';}
  else h.result='Loss';
  h.payout=money(payout);credit+=h.payout;
 }
 c.returned=money(credit);c.committed=money(c.hands.reduce((n,h)=>n+h.bet,0));
 c.lastNet=money(c.balance+credit-c.openingBalance);c.payoutIndex=0;c.credited=0;for(const h of c.hands)h.paid=false;
 c.lastMessage=c.hands.map((h,i)=>(c.hands.length>1?'Hand '+(i+1)+': ':'')+h.result).join(' · ');
 c.banner=c.hands.some(h=>h.result==='Blackjack')?'BLACKJACK':c.hands.every(h=>h.result==='Bust')?'BUST':c.lastNet>0?'YOU WIN':c.lastNet<0?'HOUSE WINS':'PUSH';
 c.finalBanner=c.banner;c.phase='payout';c.notice='';startHandPayout(c);return true;
}
function startHandPayout(c){const h=c.hands[c.payoutIndex];c.wait=.85;c.banner=(c.hands.length>1?'HAND '+(c.payoutIndex+1)+' · ':'')+h.result.toUpperCase();c.lastMessage='';event(c,h.result==='Blackjack'?'blackjack':h.result==='Bust'?'bust':h.payout>h.bet?'win':h.payout===h.bet?'push':'loss');}
function beginDeal(c,wager,shoe){
 if(c.phase!=='betting'||c.deals>=3||c.balance<=0)return false;
 if(!Number.isFinite(wager)||wager<.01||wager>c.balance||Math.abs(money(wager)-wager)>1e-8){c.notice='Enter a wager from 0.01 to '+points(c.balance)+' points.';return false;}
 c.openingBalance=c.balance;c.balance=money(c.balance-wager);c.deals++;c.shoe=(shoe||shuffledShoe()).slice();
 c.hands=[makeHand([],wager)];c.dealer=[];c.openIndex=0;c.active=0;c.phase='dealing';c.notice='';c.banner='';c.holeRevealed=false;c.actionDelay=0;c.wait=.18;c.lastMessage='Good luck.';event(c,'chip');return true;
}
function blackjackAct(c,action){
 if(!blackjackActions(c)[action])return false;
 const h=c.hands[c.active];c.banner='';
 if(action==='hit'||action==='double'){
  if(action==='double'){c.balance=money(c.balance-h.bet);h.bet=money(h.bet*2);h.doubled=true;}
  h.cards.push(c.shoe.shift());event(c,'card','p'+c.active+':'+(h.cards.length-1));
  if(action==='double'||handValue(h.cards)>=21)h.done=true;
  if(handValue(h.cards)>21)c.banner='BUST'; // Settlement owns the outcome sound; the card cue remains intact.
 }
 if(action==='stand')h.done=true;
 c.actionDelay=.42;return true;
}
function advanceCasino(c,dt){
 if(!c||['betting','settled','closed'].includes(c.phase))return;
 c.clock+=dt;
 if(c.phase==='playing'){if(c.actionDelay>0){c.actionDelay-=dt;if(c.actionDelay<=0)nextHand(c);}return;}
 c.wait-=dt;if(c.wait>0)return;
 if(c.phase==='dealing'){
  if(c.openIndex<4){const i=c.openIndex++,dealer=i%2===1,target=dealer?c.dealer:c.hands[0].cards;target.push(c.shoe.shift());event(c,'card',(dealer?'d':'p0')+':'+(target.length-1));c.wait=.28;return;}
  const h=c.hands[0];h.natural=handValue(h.cards)===21;
  if(h.natural||handValue(c.dealer)===21){h.done=true;startDealer(c);}else nextHand(c);return;
 }
 if(c.phase==='dealer'){
  if(!c.holeRevealed){c.holeRevealed=true;event(c,'reveal','d:1');c.lastMessage='Dealer has '+handValue(c.dealer)+'.';c.wait=.65;return;}
  const needsDraw=c.hands.some(h=>!h.natural&&handValue(h.cards)<=21)&&handValue(c.dealer)<17;
  if(needsDraw){c.dealer.push(c.shoe.shift());event(c,'card','d:'+(c.dealer.length-1));c.lastMessage='Dealer has '+handValue(c.dealer)+'.';c.wait=.62;return;}
  settleDeal(c);return;
 }
 if(c.phase==='payout'){
  const h=c.hands[c.payoutIndex];if(!h.paid){h.paid=true;c.balance=money(c.balance+h.payout);c.credited=money(c.credited+h.payout);event(c,'chip');if(h.payout>h.bet)event(c,'countup');}
  c.payoutIndex++;if(c.payoutIndex<c.hands.length){startHandPayout(c);return;}
  c.settledDeals.push(c.deals);c.banner=c.finalBanner;c.phase='settled';if(c.balance===0||c.deals===3){c.phase='closed';c.reason=c.balance===0?'zero':'limit';}
 }
}
function nextDeal(c){if(c.phase!=='settled'||c.deals>=3||c.balance<=0)return false;c.phase='betting';c.draftBet=0;c.hands=[];c.dealer=[];c.notice='';c.banner='';c.fx=null;c.fixtureName='';c.lastMessage='Place your chips.';return true;}
function leaveCasino(c){if(!['betting','settled'].includes(c.phase))return false;c.phase='closed';c.reason='leave';return true;}

export { obstacleZ, gatePose, gateCollision, distanceAt, scoreFor, collectPickup, freshState, jumpHeight, isDucking, act, hit, stepPlatform, step, swipeDirection, handValue, shuffledShoe, createCasino, event, makeHand, blackjackActions, startDealer, nextHand, settleDeal, startHandPayout, beginDeal, blackjackAct, advanceCasino, nextDeal, leaveCasino, RUN_SECONDS, SPEED, LANE_WIDTH, JUMP_SECONDS, DUCK_SECONDS, RECOVERY_SECONDS, DRIVE_SECONDS, STOP_SECONDS, ARRIVAL_SECONDS, LANDMARK_OFFSET, GANTRY_OPENING, GANTRY_TOP, CHALLENGES, CHICANES, GATES, COURSE, FORK, FORK_REWARD, LIFT, LIFT_REWARD, PICKUPS, money, points, cardValue };
