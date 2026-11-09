// Keep the same authenticated adapter and database authority. Only the deployment
// region differs, so Run21's serial Auth/load/commit calls stay near Supabase.
export {default} from './delayed.js';
