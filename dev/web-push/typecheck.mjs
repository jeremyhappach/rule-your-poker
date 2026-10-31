import {createRequire}from'node:module';import{resolve}from'node:path';
const deps='C:/Users/jerem/source/repos/rule-your-poker/node_modules',require=createRequire(deps+'/package.json'),ts=require('typescript');
const input=ts.readConfigFile('tsconfig.app.json',ts.sys.readFile),config=ts.parseJsonConfigFileContent(input.config,ts.sys,process.cwd());
config.options.typeRoots=[deps+'/@types'];
const host=ts.createCompilerHost(config.options),fallback={...config.options,paths:undefined,baseUrl:undefined};
const primaryCache=ts.createModuleResolutionCache(process.cwd(),p=>p,config.options),fallbackCache=ts.createModuleResolutionCache(resolve(deps,'..'),p=>p,fallback);
host.resolveModuleNames=(names,file)=>names.map(name=>ts.resolveModuleName(name,file,config.options,host,primaryCache).resolvedModule??(!name.startsWith('.')?ts.resolveModuleName(name,resolve(deps,'../__read_only_resolver.ts'),fallback,host,fallbackCache).resolvedModule:undefined));
host.resolveTypeReferenceDirectives=(names,file)=>names.map(name=>{
 const n=typeof name==='string'?name:name.fileName;
 return ts.resolveTypeReferenceDirective(n,file,config.options,host).resolvedTypeReferenceDirective??ts.resolveTypeReferenceDirective(n,resolve(deps,'../__read_only_resolver.ts'),fallback,host).resolvedTypeReferenceDirective;
});
const program=ts.createProgram([...config.fileNames,resolve('api/web-push.ts')],config.options,host),errors=ts.getPreEmitDiagnostics(program);
if(errors.length){console.log(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>process.cwd(),getNewLine:()=> '\n'}));process.exitCode=1;}else console.log('Full application TypeScript check passed using read-only existing dependencies.');
