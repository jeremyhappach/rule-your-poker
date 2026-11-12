import photos from './photos.json';

export const GAME_BACKGROUNDS=photos;
export function gameBackground(id:string|undefined|null){
 return id ? GAME_BACKGROUNDS.find(photo=>photo.id===id) : undefined;
}
