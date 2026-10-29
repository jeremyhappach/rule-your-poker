// Reuse the unchanged canonical parent proof in the isolated review database.
import {connect} from '../async-words/local.mjs';import {readFileSync as read,writeFileSync as write} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const {database}=JSON.parse(read('qualification.local/async-combined/review-context.json'));
if(!/^async_reviews_\d+$/.test(database))throw Error('Review fixture only');
const db=await connect(database);try{await db.query('BEGIN');await db.query(read('supabase/delayed/reviews.sql','utf8'));await db.query('COMMIT');}finally{await db.end();}
const source=read('dev/async-combined/parent-proof.mjs','utf8').replace("'../async-words/local.mjs'",JSON.stringify(pathToFileURL(resolve('dev/async-words/local.mjs')).href))
 .replaceAll("'qualification.local/async-combined/context.json'","'qualification.local/async-combined/review-context.json'")
 .replaceAll("'qualification.local/async-combined/parent-proof.json'","'qualification.local/async-combined/review-parent-proof.json'");
const path=resolve('qualification.local/async-combined/review-parent-proof.mjs');write(path,source);process.argv.push('--existing');await import(pathToFileURL(path).href);
