import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {optimizePng} from './png-lossless.mjs';

const apply=process.argv.includes('--write');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const files=['public/launch-splash/startup','public/arcade'].flatMap(walk).filter(f=>f.endsWith('.png')).sort();
const report={mode:apply?'write':'dry-run',encoding:'lossless PNG; exact RGBA equality; metadata preserved',files:[]};
for(const file of files){
  const original=readFileSync(file),optimized=optimizePng(original);
  if(apply&&optimized.bytes.length<original.length)writeFileSync(file,optimized.bytes);
  const row={file:file.replaceAll('\\','/'),before:original.length,after:optimized.bytes.length,saved:original.length-optimized.bytes.length,width:optimized.width,height:optimized.height,rgbaSha256:createHash('sha256').update(optimized.pixels).digest('hex')};
  report.files.push(row);console.log(`${row.file}: ${row.before} -> ${row.after} (${row.saved} saved)`);
}
report.before=report.files.reduce((n,f)=>n+f.before,0);report.after=report.files.reduce((n,f)=>n+f.after,0);report.saved=report.before-report.after;
const at=process.argv.indexOf('--report');
if(at!==-1){const file=process.argv[at+1];if(!file)throw Error('--report needs a path');mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({before:report.before,after:report.after,saved:report.saved}));
