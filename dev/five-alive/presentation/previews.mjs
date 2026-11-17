import {startPreview} from './server.mjs';
const cases=['keyboard','results','opponent','sixth','award'];
for(let i=0;i<cases.length;i++){const port=5191+i;const preview=await startPreview(port);await fetch('http://127.0.0.1:'+port+'/fixture/demo?case='+cases[i],{method:'POST'});console.log(preview.url+'?mode='+(['keyboard','award'].includes(cases[i])?'arcade':'async&player=a')+'&demo='+cases[i]);}
