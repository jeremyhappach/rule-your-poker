import fs from 'node:fs';import assert from 'node:assert/strict';import {build,transform} from 'esbuild';import ts from 'typescript';
const options={entryPoints:['supabase/functions/arcade-recovery/index.ts'],bundle:true,write:false,format:'esm',platform:'neutral',external:['node:crypto'],target:'es2022'};
const base=await build({...options,plugins:[{name:'subtract-river-only',setup(b){b.onLoad({filter:/server[\\/]arcade[\\/]service\.ts$/},args=>({contents:fs.readFileSync(args.path,'utf8').split('\n').filter(l=>!l.includes("../riverCityRun/")&&!l.includes("game==='river-city-run'")).join('\n'),loader:'ts'}));}}]});
const prior=fs.readFileSync(new URL('./prior-worker.local.mjs',import.meta.url),'utf8');
const normalize=async code=>(await transform(code,{minifyWhitespace:true,minifySyntax:true,target:'es2022'})).code;
// Bundler traversal can reorder hoisted functions and rename collision aliases.
// Compare all statements after normalizing only identifier suffixes; strings,
// numeric literals, expressions, handlers and function bodies stay exact.
// The existing extracted Mega shuffle also renamed decks/a to megaDecks/deck;
// those two inspected identifier-only differences are normalized explicitly.
const statements=async code=>{const ast=ts.createSourceFile('worker.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),result=[];for(const s of ast.statements){const text=await normalize(s.getText(ast));const scan=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,text);let out='',kind;while((kind=scan.scan())!==ts.SyntaxKind.EndOfFileToken){let token=scan.getTokenText();if(kind===ts.SyntaxKind.Identifier){token=token.replace(/\d+$/,'');if(token==='megaDecks')token='decks';if(s.name?.text==='decks'&&token==='a')token='deck';}out+=token+' ';}result.push(out);}return result.sort();};
const a=await statements(base.outputFiles[0].text),z=await statements(prior);const added=a.filter(x=>!z.includes(x)),removed=z.filter(x=>!a.includes(x));if(added.length||removed.length){console.log(JSON.stringify({added:added.map(x=>x.slice(0,200)),removed:removed.map(x=>x.slice(0,200))}));throw Error('Non-River worker behavior differs');}
const next=await build(options);fs.writeFileSync(new URL('./recovery-bundle.local.mjs',import.meta.url),next.outputFiles[0].text);console.log('PASS deployed worker minus River addition is identical; no other game changes');
