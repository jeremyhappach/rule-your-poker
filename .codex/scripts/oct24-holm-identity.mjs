import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const [configPath, credentialsPath] = process.argv.slice(2);
const api = JSON.parse(readFileSync(configPath, 'utf8'));
if (api.projectRef !== 'xvhmbuppghwmwpwrkzao' || new URL(api.url).hostname !== `${api.projectRef}.supabase.co`) throw new Error('Wrong project');
const env = Object.fromEntries(readFileSync(credentialsPath, 'utf8').split(/\r?\n/).flatMap(line => {
 const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
 return match ? [[match[1],match[2].replace(/^["']|["']$/g,'')]] : [];
}));
const client = createClient(api.url, api.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await client.auth.signInWithPassword({email:env.PTOWN_E2E_PLAYER2_EMAIL,password:env.PTOWN_E2E_PLAYER2_PASSWORD});
if (login.error) throw new Error(`E2E login failed: ${login.error.message}`);
try {
 const owned = await client.from('players').select('id,game_id,games!inner(game_type,status)')
  .eq('user_id',login.data.user.id).eq('games.game_type','holm-game').limit(1);
 if (owned.error) throw owned.error;
 if (!owned.data?.length) throw new Error('Existing E2E account has no visible HOLM participation for read qualification');
 const result = await client.from('players').select('game_id,intent_version,games!players_game_id_fkey(status,game_type,current_game_uuid,current_round,total_hands,rounds!rounds_game_id_fkey(id,dealer_game_id,hand_number,round_number,status))')
  .eq('id',owned.data[0].id).single();
 if (result.error) throw result.error;
 if (result.data.game_id!==owned.data[0].game_id || !Number.isSafeInteger(result.data.intent_version) || !Array.isArray(result.data.games?.rounds)) throw new Error('Invalid identity envelope');
 console.log(JSON.stringify({result:'PASS',check:'authenticated HOLM embedded identity read',roundCount:result.data.games.rounds.length,gameStatus:result.data.games.status,mutations:0}));
} finally { await client.auth.signOut({scope:'local'}); }
