import {connect,context} from './database.mjs';
import {readFile} from 'node:fs/promises';
const {database}=await context(),c=await connect(database);
try{await c.query('BEGIN');await c.query(await readFile('supabase/eleven-up/production-proof.sql','utf8'));console.log('Production-shaped rollback proof passed locally');}finally{await c.query('ROLLBACK');await c.end();}
