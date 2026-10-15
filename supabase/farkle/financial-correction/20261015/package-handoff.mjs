import fs from 'node:fs';
import path from 'node:path';
const root='qualification.local/farkle-full-stack/';
const out='supabase/farkle/financial-correction/20261015/';
const cases=[['continuation','handoff-v4','continuation'],['one-eligible','handoff-v2','one-eligible'],['no-dealer','handoff-v2','no-dealer'],['rotation','handoff-v3','continuation-rotation'],['explicit-end','handoff-v3','explicit-end']];
const evidence={at:new Date().toISOString(),sourceChange:'Farkle inactive/retired surface falls through to existing canonical MobileGameTable; server policy unchanged',cases:{}};
for(const [name,run,scenario] of cases){
 const directory=path.join(root,run+'-output','browser-two-browsers-Farkle-'+scenario);
 const data=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json'),'utf8'));
 evidence.cases[name]=data;
 for(const file of fs.readdirSync(directory).filter(f=>/^(terminal|history|setup|waiting)-client-[01]\.png$/.test(f)))fs.copyFileSync(path.join(directory,file),path.join(out,'handoff-'+name+'-'+file));
}
fs.writeFileSync(path.join(out,'handoff-browser-evidence.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({cases:Object.keys(evidence.cases),productionWrites:0}));
