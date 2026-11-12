export async function downloadArtwork(path:string){
 const response=await fetch('/fixture/photo/'+path.split('/').at(-1));
 if(!response.ok)throw Error('Fixture photo missing');
 return response.blob();
}
