import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {compareCommits,isDocumentation,productionSha,buildDecision} from './change-policy.mjs';
import {releaseDecision} from './release-decision.mjs';
import {qualify} from './validate.mjs';

test('every qualification stage inherits production push and preserves other configuration',()=>{
  const calls=[],env={npm_execpath:'npm-cli.js',VITE_ASYNC_PUSH_ENABLED:'false',OTHER:'preserved'};
  assert.equal(qualify(env,(exe,args,options)=>{calls.push(args.at(-1));assert.equal(exe,process.execPath);assert.equal(options.env.VITE_ASYNC_PUSH_ENABLED,'true');assert.equal(options.env.OTHER,'preserved');return {status:0};}),0);
  assert.deepEqual(calls,['typecheck','test:unit','test:release-tooling']);
  assert.equal(env.VITE_ASYNC_PUSH_ENABLED,'false');
});
test('qualification stops at the first failing or terminated stage',()=>{
  for(const status of [1,7,null]){
    const calls=[];
    assert.equal(qualify({npm_execpath:'npm-cli.js'},(_exe,args)=>{calls.push(args.at(-1));return {status:args.at(-1)==='test:unit'?status:0};}),status??1);
    assert.deepEqual(calls,['typecheck','test:unit']);
  }
});

mkdirSync('.storage-audit',{recursive:true});
const cwd=mkdtempSync('.storage-audit/policy-test-');
const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git('init','-q');git('config','user.email','fixture@example.invalid');git('config','user.name','Storage policy fixture');
function commit(path,content){mkdirSync(join(cwd,path,'..'),{recursive:true});writeFileSync(join(cwd,path),content);git('add','--',path);git('commit','-qm','fixture');return git('rev-parse','HEAD');}
const base=commit('src/app.ts','export const value=1;');
const doc=commit('docs/codex/REPORT.md','evidence');

test('only explicitly non-executable documentation and evidence can skip',()=>{
  for(const path of ['README.md','AGENTS.md','docs/codex/REPORT.md','docs/codex/evidence/proof.json','docs/codex/evidence/phone.png'])assert(isDocumentation(path));
  for(const path of ['public/README.md','src/instructions.md','docs/codex/proof.sql','docs/codex/evidence/run.mjs','docs/codex/evidence/check.ts','dev/evidence/result.json','package.json','package-lock.json','bun.lockb','vercel.json','index.html','.github/workflows/publish.yml','api/run21.ts','server/arcade/service.ts','supabase/migrations/new.sql','scripts/report.mjs','src/x.test.ts','new-file'])assert(!isDocumentation(path),path);
});
test('docs-only full range skips; deployed identity is retained without a fabricated signal',()=>{
  assert.equal(compareCommits(base,doc,{cwd}).skip,true);
  assert.equal(releaseDecision(doc,base,{cwd}).action,'skip');
  assert.equal(releaseDecision(doc,doc,{cwd}).action,'publish');
});
test('missing, invalid, unknown, equal and wrong-checkout identities keep building',()=>{
  for(const [a,b]of [[undefined,doc],['',doc],['--help',doc],['a'.repeat(40),doc],[doc,doc],[base,base]])assert.equal(compareCommits(a,b,{cwd}).skip,false);
  assert.throws(()=>releaseDecision('unbuilt',doc,{cwd}));
});
test('a multi-commit push ending in documentation cannot hide earlier code changes',()=>{
  commit('src/app.ts','export const value=2;');const head=commit('docs/codex/REPORT.md','new evidence');
  assert.equal(compareCommits(base,head,{cwd}).skip,false);
  assert.equal(releaseDecision(head,base,{cwd}).action,'wait');
});
test('rename from runtime code into documentation still builds',()=>{
  const before=git('rev-parse','HEAD');git('mv','src/app.ts','docs/codex/moved.md');git('commit','-qm','move');
  assert.equal(compareCommits(before,git('rev-parse','HEAD'),{cwd}).skip,false);
});
test('divergent and missing history never skip',()=>{
  const other=git('rev-parse','HEAD');git('checkout','--detach',base);const head=commit('docs/codex/BRANCH.md','branch');
  assert.equal(compareCommits(other,head,{cwd}).skip,false);
  assert.equal(compareCommits(base,head,{cwd,git:()=>{throw Error('shallow');}}).skip,false);
});
test('manifest reads use the fixed production origin, no redirects, and reject malformed or failed responses',async()=>{
  assert.equal(await productionSha(async(url,options)=>{assert.equal(url,'https://holm357.com/build-manifest.json');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return {ok:true,json:async()=>({buildId:base,bundleFilename:'assets/app.js'})};}),base);
  for(const response of [{ok:false},{ok:true,json:async()=>({buildId:'dev'})},{ok:true,json:async()=>({buildId:base,bundleFilename:'index.html'})}])await assert.rejects(productionSha(async()=>response));
});
test('production uses live identity; preview uses the successful-branch identity; custom and forced builds never skip',async()=>{
  const env={VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_COMMIT_SHA:doc,VERCEL_GIT_PREVIOUS_SHA:'b'.repeat(40)};
  const comparisons=[];const deps={production:async()=>base,compare:(a,b)=>{comparisons.push([a,b]);return {skip:true};}};
  assert.equal((await buildDecision(env,deps)).skip,true);assert.deepEqual(comparisons.pop(),[base,doc]);
  assert.equal((await buildDecision({...env,VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/review'},deps)).skip,true);assert.deepEqual(comparisons.pop(),[env.VERCEL_GIT_PREVIOUS_SHA,doc]);
  for(const values of [{PTOWN_FORCE_BUILD:'1'},{VERCEL_TARGET_ENV:'staging'},{VERCEL_ENV:'development'},{VERCEL_GIT_COMMIT_SHA:''},{VERCEL_GIT_COMMIT_REF:''},{VERCEL_ENV:'preview'},{VERCEL_GIT_COMMIT_REF:'codex/review'}])assert.equal((await buildDecision({...env,...values},deps)).skip,false);
  assert.equal(comparisons.length,0);
  assert.equal((await buildDecision({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:doc})).skip,false);
  await assert.rejects(buildDecision(env,{production:async()=>{throw Error('unavailable');}}));
});
