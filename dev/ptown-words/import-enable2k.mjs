// Acquisition only. Gameplay never performs network requests.
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const commit='af52415c13af809bd8757a40f17f46e79d09583c';
const base=`https://raw.githubusercontent.com/BartMassey/wordlists/${commit}/`;
const directory=new URL('../../server/ptownWords/dictionaries/enable2k-1/',import.meta.url);
const digest=b=>createHash('sha256').update(b).digest('hex');
const acquire=async name=>{const response=await fetch(base+name);if(!response.ok)throw Error(`ENABLE2K download failed: ${response.status}`);return Buffer.from(await response.arrayBuffer());};
const [archive,notice]=await Promise.all([acquire('enable2k.txt.gz'),acquire('README-enable2k.txt')]);
const original=gunzipSync(archive),text=original.toString('utf8');
const words=text.replace(/\r\n/g,'\n').split('\n');
if(words.at(-1)==='')words.pop();
if(words.length!==173528||words.some(word=>! /^[a-z]+$/.test(word)))throw Error('Unexpected ENABLE2K master vocabulary; inspect before accepting.');
const canonical=words.map(word=>word.toUpperCase()).sort();
if(new Set(canonical).size!==words.length)throw Error('Duplicate source entries; do not silently discard words.');
const normalized=Buffer.from(canonical.join('\n')+'\n','utf8');
const manifest={id:'enable2k/1',edition:'ENABLE2K master vocabulary',sourceRepository:'https://github.com/BartMassey/wordlists',sourceCommit:commit,
 sourceUrl:base+'enable2k.txt.gz',noticeUrl:base+'README-enable2k.txt',wordCount:words.length,
 normalization:'ASCII uppercase; ascending code-unit order; UTF-8; LF; trailing LF; no vocabulary filtering or supplementation',
 archiveSha256:digest(archive),sourceSha256:digest(original),sha256:digest(normalized),noticeSha256:digest(notice),
 minLength:words.reduce((n,w)=>Math.min(n,w.length),Infinity),maxLength:words.reduce((n,w)=>Math.max(n,w.length),0)};
// An existing pinned version cannot silently be replaced by a different artifact.
let existing;try{existing=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(existing&&JSON.stringify(existing)!==JSON.stringify(manifest))throw Error('Pinned version differs; create an explicitly reviewed new version.');
await mkdir(directory,{recursive:true});
await writeFile(new URL('enable2k.txt.gz',directory),archive);
await writeFile(new URL('words.txt',directory),normalized);
await writeFile(new URL('README-enable2k.txt',directory),notice);
await writeFile(new URL('manifest.json',directory),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({directory:fileURLToPath(directory),...manifest},null,2));
