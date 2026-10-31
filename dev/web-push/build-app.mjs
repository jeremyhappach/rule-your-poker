import {createRequire}from'node:module';import{resolve}from'node:path';import{mkdirSync,writeFileSync,readFileSync,copyFileSync}from'node:fs';
const deps='C:/Users/jerem/source/repos/rule-your-poker/node_modules',require=createRequire(deps+'/package.json'),{build}=require('esbuild'),ts=require('typescript');
const out='qualification.local/web-push/app';mkdirSync(out,{recursive:true});
await build({entryPoints:['src/main.tsx'],bundle:true,splitting:true,format:'esm',jsx:'automatic',platform:'browser',outdir:out,entryNames:'app',nodePaths:[deps],alias:{'@':resolve('src')},
 loader:{'.png':'file','.jpg':'file','.jpeg':'file','.svg':'file','.gif':'file','.webp':'file','.mp3':'file','.wav':'file','.woff2':'file','.ico':'file'},external:['/mega-card-golf/*'],
 define:{'process.env.NODE_ENV':'"production"','import.meta.env':JSON.stringify({MODE:'production',PROD:true,DEV:false,VITE_SUPABASE_URL:'http://127.0.0.1:15414',VITE_SUPABASE_PUBLISHABLE_KEY:'local-synthetic-key',VITE_ASYNC_PUSH_ENABLED:'true'}),
 __RUN21_APP_TEST_LANE__:'false',__BUILD_HASH__:'"2cbca79af689"',__BUILD_TIMESTAMP__:'"2026-10-31T13:00:00Z"',__APP_BUILD_SHA__:'"2cbca79af6896e8e08e7db22c66de0b27183d562"',__APP_BUILD_TIMESTAMP__:'"2026-10-31T13:00:00Z"',__APP_DEPLOYMENT_ID__:'"local-web-push-proof"'},logLevel:'warning'});
// Apply the repository's actual Tailwind theme without writing/installing shared dependencies.
const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync('tailwind.config.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,m,m.exports);
const theme=m.exports.default??m.exports;theme.content=[resolve('src/**/*.{ts,tsx}')];
const css=await require('postcss')([require('tailwindcss')(theme),require('autoprefixer')]).process(readFileSync(out+'/app.css','utf8'),{from:resolve(out+'/app.css')});writeFileSync(out+'/app.css',css.css);
writeFileSync(out+'/index.html','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><title>Ptown local Web Push proof</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
copyFileSync('public/ptown-push-sw.js',out+'/ptown-push-sw.js');
writeFileSync(out+'/build-manifest.json',JSON.stringify({buildId:'2cbca79af6896e8e08e7db22c66de0b27183d562',publishedAt:'2026-10-31T13:00:00Z',bundleFilename:'app.js',deploymentId:'local-web-push-proof'}));
console.log('Actual App built with real routes/theme and loopback-only synthetic configuration.');
