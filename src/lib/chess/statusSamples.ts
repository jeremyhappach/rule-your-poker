// Original approved audition compositions, reconstructed sample-for-sample as PCM16.
const rate=44100;
function normalize(samples:Float32Array,db:number){let mean=0;for(const n of samples)mean+=n;mean/=samples.length;for(let i=0;i<samples.length;i++)samples[i]-=mean;for(let i=0;i<200;i++){samples[i]*=i/200;samples[samples.length-1-i]*=i/200;}let peak=0;for(const n of samples)peak=Math.max(peak,Math.abs(n));const scale=10**(db/20)/peak;for(let i=0;i<samples.length;i++){samples[i]*=scale;samples[i]=Math.round(samples[i]*32767)/32768;}return samples;}
const period=5/6,heart=new Float32Array(Math.round(period*2*rate));
for(let cycle=0;cycle<2;cycle++)for(const [offset,level,pitch] of [[0,1,70],[.19,.7,82]]){const at=cycle*period+offset;for(let i=Math.floor(at*rate);i<Math.min(heart.length,Math.floor((at+.24)*rate));i++){const t=i/rate-at,env=(1-Math.exp(-t*190))*Math.exp(-t*24);heart[i]+=level*env*(Math.sin(2*Math.PI*(pitch*t+24*.028*(1-Math.exp(-t/.028))))+.3*Math.sin(2*Math.PI*pitch*2*t)+.1*Math.sin(2*Math.PI*pitch*3*t));}}
const heartbeat=normalize(heart,-20);
function horn(s:Float32Array,midi:number,at:number,duration:number,amp=1){const hz=440*2**((midi-69)/12);for(let i=Math.floor(at*rate);i<Math.min(s.length,(at+duration)*rate);i++){const t=i/rate-at,e=Math.min(1,t/.035)*Math.min(1,(duration-t)/.17)*(1-.1*t/duration),phase=2*Math.PI*hz*(t+.001*Math.sin(2*Math.PI*4.7*t)/(2*Math.PI*4.7));s[i]+=amp*e*(Math.sin(phase)+.29*Math.sin(2*phase)+.11*Math.sin(3*phase)+.045*Math.sin(4*phase));}}
function bell(s:Float32Array,midi:number,at:number,amp:number){const hz=440*2**((midi-69)/12);for(let i=Math.floor(at*rate);i<s.length;i++){const t=i/rate-at,e=Math.min(1,t/.012)*Math.exp(-t*2.2);s[i]+=amp*e*(Math.sin(2*Math.PI*hz*t)+.2*Math.exp(-t*2)*Math.sin(2*Math.PI*hz*2.01*t)+.07*Math.exp(-t*6)*Math.sin(2*Math.PI*hz*3.98*t));}}
const win=new Float32Array(Math.floor(2.75*rate));for(const [m,t,d,a] of [[60,0,.19,.7],[60,.23,.18,.8],[64,.46,.22,.9],[67,.72,.29,1],[72,1.05,1.25,1],[60,1.05,1.25,.5],[64,1.05,1.25,.4],[67,1.05,1.25,.4]])horn(win,m,t,d,a);normalize(win,-14);
const lose=new Float32Array(Math.floor(3.1*rate));for(const [m,t,a] of [[62,0,1],[60,.48,.88],[57,.98,.9],[50,1.52,1],[53,1.52,.4],[57,1.52,.3]])bell(lose,m,t,a);normalize(lose,-16);

export const chessStatusPCM={heartbeat:{samples:heartbeat,rate},win:{samples:win,rate},loss:{samples:lose,rate}};
