// Match the host's unbundled ESM emission; bundlers hide missing file extensions.
import ts from 'typescript';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'qualification.local/canasta/node-entry'),seen=new Set();
function emit(file){
 if(seen.has(file))return;seen.add(file);
 const result=ts.transpileModule(readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const target=path.join(out,file.replace(/\.ts$/,'.js'));mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,result);
 const ast=ts.createSourceFile(file,result,ts.ScriptTarget.ES2022,true);
 for(const node of ast.statements)if(ts.isImportDeclaration(node)&&node.moduleSpecifier.text.startsWith('.')){
  const spec=node.moduleSpecifier.text;assert(spec.endsWith('.js'),`Unresolved native ESM import: ${file} ${spec}`);
  emit(path.normalize(path.join(path.dirname(file),spec.replace(/\.js$/,'.ts'))));
 }
}
emit('api/canasta.ts');
const {default:handler}=await import(pathToFileURL(path.join(out,'api/canasta.js')));
let status,body;await handler({url:'/api/canasta?canasta_path=fixture/state',headers:{}},{writeHead:s=>status=s,end:b=>body=b});
assert.equal(status,503);assert.equal(JSON.parse(body).error,'canasta:release_unavailable');
console.log(JSON.stringify({nativeNodeEntry:true,emittedModules:seen.size,missingCredentialsFailClosed:true}));
