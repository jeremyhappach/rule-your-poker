import {supabase} from '@/integrations/supabase/client';

export const ARTWORK_BUCKET='arcade-artwork';
export const ARTWORK_LIMIT=2*1024*1024;
export const ARTWORK_TYPES:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
export type ArcadeGame='run21'|'tri-towers'|'yahtzee'|'eleven-up'|'royal-flash'|'take-two';
export type Artwork={game:ArcadeGame;object_path:string|null;updated_at:string};

export function validateArtwork(file:Pick<File,'size'|'type'>){
  if(!ARTWORK_TYPES[file.type])throw Error('Choose a JPEG, PNG, or WebP image.');
  if(!file.size||file.size>ARTWORK_LIMIT)throw Error('Choose an image up to 2 MB.');
}
export async function loadArtwork():Promise<Artwork[]>{
  const {data,error}=await supabase.from('arcade_game_artwork').select('game,object_path,updated_at');
  if(error)throw Error('Artwork could not be loaded.');
  return data as Artwork[];
}
export async function downloadArtwork(path:string):Promise<Blob>{
  const {data,error}=await supabase.storage.from(ARTWORK_BUCKET).download(path);
  if(error||!data)throw Error('Image unavailable.');
  return data;
}
export async function replaceArtwork(game:ArcadeGame,file:File,previous:string|null):Promise<Artwork>{
  validateArtwork(file);
  const path=game+'/'+crypto.randomUUID()+'.'+ARTWORK_TYPES[file.type],bucket=supabase.storage.from(ARTWORK_BUCKET);
  const {error:uploadError}=await bucket.upload(path,file,{contentType:file.type,upsert:false});
  if(uploadError)throw Error('Upload failed. Your previous artwork is unchanged.');
  let query=supabase.from('arcade_game_artwork').update({object_path:path}).eq('game',game);
  query=previous===null?query.is('object_path',null):query.eq('object_path',previous);
  // Retire only after an acknowledged compare-and-swap. Ambiguous network outcomes
  // retain both files; RLS additionally protects every currently referenced object.
  const {data,error}=await query.select('game,object_path,updated_at').single();
  if(error||!data)throw Error('Artwork was not confirmed. Reopen the info panel to refresh before retrying.');
  if(previous)await bucket.remove([previous]).catch(()=>undefined);
  return data as Artwork;
}
