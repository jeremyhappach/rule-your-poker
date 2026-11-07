// Reuse an installed local Arcade template. No network credentials or downloads.
import {mkdirSync,writeFileSync} from 'node:fs';
import {connect} from '../quintzee/database.mjs';
const template=process.argv[2];if(!/^[a-z][a-z0-9_]+$/.test(template??''))throw Error('Supply a qualified local Arcade template database');
const database='ship_cap_voyage_'+Date.now(),c=await connect('postgres');
try{await c.query('CREATE DATABASE '+database+' TEMPLATE '+template);}finally{await c.end();}
mkdirSync('qualification.local/ship-cap-voyage',{recursive:true});writeFileSync('qualification.local/ship-cap-voyage/context.json',JSON.stringify({database}));console.log({database});
