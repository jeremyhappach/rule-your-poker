import {execFileSync} from 'node:child_process';

export const PRODUCTION_MANIFEST='https://holm357.com/build-manifest.json';
export const isSha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
// Deliberately an allowlist. Executable evidence, SQL, tests, configs and unknown
// paths always build, including files added under an otherwise documentary tree.
export function isDocumentation(path){
  return ['README.md','AGENTS.md','CODEX_KICKOFF_PROMPT.md','CUTOVER_CHECKLIST.md'].includes(path)
    || /^docs\/codex\/[^\0]+\.md$/.test(path)
    || /^docs\/codex\/evidence\/[^\0]+\.(json|txt|png|jpg|jpeg|webp)$/.test(path);
}
export function compareCommits(base,head,{cwd=process.cwd(),git=execFileSync}={}){
  const build=reason=>({skip:false,base,head,reason});
  if(!isSha(base)||!isSha(head))return build('Missing or invalid commit identity');
  // A same-SHA redeploy can intentionally change environment settings.
  if(base===head)return build('Same commit: preserve explicit rebuilds');
  try{
    const run=args=>git('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
    if(run(['rev-parse','HEAD']).trim()!==head)return build('Checkout does not match requested commit');
    run(['merge-base','--is-ancestor',base,head]);
    // --no-renames includes BOTH old and new paths; a code-to-doc rename builds.
    const files=run(['diff','--name-only','--no-renames','-z',base,head,'--']).split('\0').filter(Boolean);
    if(!files.length)return build('Empty change range: preserve explicit rebuilds');
    const meaningful=files.filter(path=>!isDocumentation(path));
    return {skip:meaningful.length===0,base,head,files,meaningful,
      reason:meaningful.length?'Runtime, qualification, configuration or unknown paths changed':'Only allowlisted documentation/evidence changed'};
  }catch{return build('History missing, divergent, or unreadable; build required');}
}
export async function productionSha(fetchImpl=fetch){
  const response=await fetchImpl(PRODUCTION_MANIFEST,{headers:{'Cache-Control':'no-cache'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Production manifest unavailable');
  const value=await response.json();
  if(!isSha(value.buildId)||typeof value.bundleFilename!=='string'||!value.bundleFilename.startsWith('assets/'))throw Error('Invalid production manifest');
  return value.buildId;
}
export async function buildDecision(env,{production=productionSha,compare=compareCommits}={}){
  const target=env.VERCEL_TARGET_ENV??env.VERCEL_ENV;
  if(env.PTOWN_FORCE_BUILD==='1'||!['production','preview'].includes(target)||target!==env.VERCEL_ENV||!env.VERCEL_GIT_COMMIT_SHA)
    return {skip:false,reason:'Manual, custom environment, or forced build'};
  if(!env.VERCEL_GIT_COMMIT_REF||(target==='preview'&&env.VERCEL_GIT_COMMIT_REF==='main')||(target==='production'&&env.VERCEL_GIT_COMMIT_REF!=='main'))
    return {skip:false,reason:'Unknown or cross-environment branch baseline; build required'};
  // Vercel documents PREVIOUS_SHA as the last SUCCESSFUL deployment on this
  // project/branch, not the previous pushed commit. First previews always build.
  const base=target==='production'?await production():env.VERCEL_GIT_PREVIOUS_SHA;
  return compare(base,env.VERCEL_GIT_COMMIT_SHA);
}
