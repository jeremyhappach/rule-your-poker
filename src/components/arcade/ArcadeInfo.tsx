import {useEffect,useId,useState,type ReactNode} from 'react';
import {Info,Upload} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle,DialogTrigger} from '@/components/ui/dialog';
import {Run21ScoringReference} from '@/components/run21/Run21ScoringHelp';
import {supabase} from '@/integrations/supabase/client';
import type {Config} from '@/lib/run21/model';
import {downloadArtwork,replaceArtwork,validateArtwork,type ArcadeGame,type Artwork} from '@/lib/arcade/artwork';

export function ArcadeArtwork({path}:{path:string|null}){
  const [image,setImage]=useState<{path:string;url:string}|null>(null);
  useEffect(()=>{
    if(!path)return;
    let alive=true,url:string|undefined;
    void downloadArtwork(path).then(blob=>{if(alive){url=URL.createObjectURL(blob);setImage({path,url});}}).catch(()=>{});
    return()=>{alive=false;if(url)URL.revokeObjectURL(url);};
  },[path]);
  return path&&image?.path===path?<img className="arcade-artwork" src={image.url} alt=""/>:null;
}
export function ArcadeInfo({game,name,ruleset,children,admin=false,artwork,onArtwork,onOpen}:{game:ArcadeGame;name:string;ruleset?:string;children?:ReactNode;admin?:boolean;artwork?:Artwork;onArtwork?:(row:Artwork)=>void;onOpen?:()=>void}){
  const [open,setOpen]=useState(false),[config,setConfig]=useState<Config|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const inputId=useId();
  useEffect(()=>{
    if(!open||game!=='run21')return;
    let alive=true;setConfig(null);setError('');
    void supabase.rpc('arcade_rules_help',{p_ruleset:ruleset??null}).then(({data,error})=>{
      if(alive){if(error||!data)setError('Rules could not be loaded. Close and reopen to retry.');else setConfig(data as unknown as Config);}
    });
    return()=>{alive=false;};
  },[open,game,ruleset]);
  async function upload(file:File){
    if(busy||!artwork)return;
    setBusy(true);setError('');
    try{
      validateArtwork(file);
      const bitmap=await createImageBitmap(file);bitmap.close();
      onArtwork?.(await replaceArtwork(game,file,artwork.object_path));
    }catch(e){setError(e instanceof Error?e.message:'Unable to read this image.');}
    finally{setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={value=>{setOpen(value);if(value)onOpen?.();}}>
    <DialogTrigger asChild><button type="button" className="arcade-info-button" aria-label={name+' rules and info'}><Info size={21} aria-hidden="true"/></button></DialogTrigger>
    <DialogContent className="arcade-info"><DialogTitle>{name} · Rules &amp; info</DialogTitle>
      <DialogDescription>{game==='run21'?'How to play and compare your scores.':'Coming Soon'}</DialogDescription>
      {game==='run21'?(config?<Run21ScoringReference config={config} solo/>:<p role="status">Loading rules…</p>):<p>{game==='tri-towers'?'Clear the towers by matching cards one rank above or below the active card.':'Roll dice to fill a scorecard of combinations.'} Arcade rules will be available when this game launches.</p>}
      {children}
      {admin&&<div className="arcade-upload">
        <label htmlFor={inputId}>{busy?'Uploading…':artwork?.object_path?'Replace artwork':'Upload artwork'}</label>
        <Upload size={16} aria-hidden="true"/>
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!artwork} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/>
        <small>JPEG, PNG, or WebP · Up to 2 MB</small>
      </div>}
      {error&&<p role="alert">{error}</p>}
    </DialogContent>
  </Dialog>;
}
