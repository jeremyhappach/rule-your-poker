// Clone an already-qualified current Arcade schema on loopback; never a remote database.
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const template=process.argv[2];if(!/^[a-z][a-z0-9_]+$/.test(template??''))throw Error('Supply the installed local Arcade template database');
const database='horses_blitz_v1_'+Date.now(),c=await connect('postgres');
try{await c.query('CREATE DATABASE '+database+' TEMPLATE '+template);}finally{await c.end();}
mkdirSync('qualification.local/horses-blitz',{recursive:true});writeFileSync('qualification.local/horses-blitz/context.json',JSON.stringify({database}));console.log({database});
