import {connect,candidate,localContext} from './database.mjs';
const c=await connect(localContext().database);try{await c.query('BEGIN');await c.query(candidate());await c.query('COMMIT');console.log('Installed in isolated loopback database; gates CLOSED');}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
