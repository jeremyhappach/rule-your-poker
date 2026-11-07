import {supabase} from '@/integrations/supabase/client';
import {parseLayout, type ArcadeLayout, type LobbyLayout} from './lobbyLayout';

export async function loadLobbyLayout():Promise<LobbyLayout> {
  const {data,error} = await supabase.from('arcade_lobby_layout').select('layout,revision').eq('id',true).single();
  if (error || !data) throw Error('Arcade ordering could not be loaded. Please retry.');
  return {layout:parseLayout(data.layout), revision:data.revision};
}

export async function saveLobbyLayout(layout:ArcadeLayout, revision:number):Promise<LobbyLayout> {
  // One row is one atomic publication. The revision prevents stale admin tabs
  // from silently overwriting a newer save; RLS owns admin authorization.
  const {data,error} = await supabase.from('arcade_lobby_layout')
    .update({layout:parseLayout(layout)}).eq('id',true).eq('revision',revision)
    .select('layout,revision').maybeSingle();
  if (error) throw Error('Save was not confirmed. Reload the published order before trying again.');
  if (!data) throw Error('The layout changed or your admin access changed. Reload the published order before trying again.');
  return {layout:parseLayout(data.layout), revision:data.revision};
}
