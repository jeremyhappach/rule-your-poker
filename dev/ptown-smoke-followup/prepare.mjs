import {mkdirSync,writeFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const template=process.argv[2];
if(!/^ptown_polish_\d+$/.test(template))throw Error('Disposable template required');
const database='ptown_polish_'+Date.now(),c=await connect('postgres');
try{await c.query(`CREATE DATABASE "${database}" TEMPLATE "${template}"`);}finally{await c.end();}
mkdirSync('qualification.local/ptown-polish',{recursive:true});
writeFileSync('qualification.local/ptown-polish/context.json',JSON.stringify({database,template}));
console.log(database);
