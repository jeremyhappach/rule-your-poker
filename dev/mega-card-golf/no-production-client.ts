/** The isolated preview cannot initialize a production auth, database, or realtime client. */
export const supabase=new Proxy({},{get(){throw Error('Production clients are unavailable in the Mega local preview');}});
