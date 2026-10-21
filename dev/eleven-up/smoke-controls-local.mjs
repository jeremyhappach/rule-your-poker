// Installs only into the existing disposable loopback qualification database.
import {readFileSync as read} from 'node:fs';
import {connect,context} from './human-ready-local.mjs';
const c=await connect(context().database);
try{await c.query(read('supabase/eleven-up/smoke-controls.sql','utf8'));console.log('Installed local smoke candidate in '+context().database);}
finally{await c.end();}
