// Use already installed dependencies read-only; no install, link or preview deployment.
import {createRequire,isBuiltin} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const deps='C:/Users/jerem/source/repos/rule-your-poker/node_modules',require=createRequire(deps+'/package.json');
const config=resolve('qualification.local/async-real-money/vite.config.mjs');
await require('esbuild').build({entryPoints:['vite.config.ts'],bundle:true,platform:'node',format:'esm',outfile:config,define:{__dirname:JSON.stringify(process.cwd())},plugins:[{name:'existing-dependencies',setup(b){b.onResolve({filter:/^[^./]/},args=>{if(isBuiltin(args.path))return {path:args.path,external:true};try{return {path:pathToFileURL(args.path==='vite'?deps+'/vite/dist/node/index.js':require.resolve(args.path)).href,external:true};}catch{}});}}]});
const factory=(await import(pathToFileURL(config))).default;
const original=await factory({command:'build',mode:'production',isSsrBuild:false,isPreview:false});
original.plugins.push({name:'existing-dependencies',enforce:'pre',resolveId(id){if(id.startsWith('.')||id.startsWith('/')||id.startsWith('@/')||id.includes(':')||id.startsWith('\0'))return;try{return require.resolve(id);}catch{}}});
const {build}=await import(pathToFileURL(deps+'/vite/dist/node/index.js'));
await build({...original,configFile:false,root:process.cwd(),css:{...original.css,postcss:{plugins:[require('tailwindcss')({...((await import(pathToFileURL(resolve('qualification.local/async-real-money/tailwind.config.mjs')))).default),content:[resolve('src/**/*.{ts,tsx}')]}),require('autoprefixer')()]}},build:{...original.build,outDir:'qualification.local/async-real-money/dist',emptyOutDir:true}});
