import {useEffect,useState} from 'react';import {useParams} from 'react-router-dom';
import {supabase} from './route-client';import {PtownWordsTable} from '@/components/ptownWords/PtownWordsTable';
import {GameChatContextProvider} from '@/hooks/GameChatContext';import {CanonicalAnnouncementProvider} from '@/lib/canonicalShell/announcements';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
export default function LivePreview(){const {dealerId,gameId}=useParams(),[user,setUser]=useState(''),[tab,setTab]=useState<ShellTabId>('cards');useEffect(()=>{void supabase.auth.getUser().then(r=>setUser(r.data.user?.id??''));},[]);if(!user)return <p>Loading local live Words fixture…</p>;
 return <div className="async-words-turn"><CanonicalAnnouncementProvider dealerGameId={gameId} viewerUserId={user}><GameChatContextProvider value={{allMessages:[],sendMessage:async()=>{},isSending:false} as any}><PtownWordsTable dealerGameId={dealerId!} userId={user} activeTab={tab} setActiveTab={setTab} liveEntry sessionEnded={false} onTerminalActive={()=>{}} onTerminalComplete={()=>{}}/></GameChatContextProvider></CanonicalAnnouncementProvider></div>;
}
