// Local qualification only. Never accepts a remote host or a production URL.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const common=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8'}).trim();
const sourceRoot=dirname(common);
const {default:pg}=await import(pathToFileURL(join(sourceRoot,'qualification.local/tri-towers/tools/node_modules/pg/lib/index.js')).href);
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;}
const path=resolve('qualification.local/quintzee/context.json');
export async function context(){
 if(existsSync(path))return JSON.parse(readFileSync(path,'utf8'));
 const template=JSON.parse(readFileSync(join(sourceRoot,'.codex/evidence/multiplayer-money/context.json'),'utf8')).database;
 if(!/^[a-zA-Z0-9_]+$/.test(template))throw Error('Invalid local template');
 const database='quintzee_'+Date.now(),c=await connect('postgres');
 try{await c.query(`CREATE DATABASE "${database}" TEMPLATE "${template}"`);}finally{await c.end();}
 mkdirSync(dirname(path),{recursive:true});const value={database,template,host:'127.0.0.1',port:55439};writeFileSync(path,JSON.stringify(value,null,2));return value;
}
