import {connect,candidate,localContext} from './database.mjs';
const c=await connect(localContext().database);try{await c.query('BEGIN');await c.query(candidate());await c.query('COMMIT');console.log('Installed qualified candidate in isolated database.');}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
