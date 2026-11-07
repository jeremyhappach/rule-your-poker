import {useCallback,useEffect,useRef,useState} from 'react';
import {loadLobbyLayout} from '@/lib/arcade/lobbyLayoutClient';
import type {LobbyLayout} from '@/lib/arcade/lobbyLayout';

export function useArcadeLobbyLayout(userId:string) {
  const [snapshot,setSnapshot] = useState<{userId:string;value:LobbyLayout}|null>(null);
  const [error,setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(() => {
    const ticket = ++generation.current;
    void loadLobbyLayout().then(value => {
      if (ticket === generation.current) {
        setSnapshot(old => old?.userId === userId && old.value.revision > value.revision ? old : {userId,value});
        setError('');
      }
    }).catch(e => {if (ticket === generation.current) setError(e.message);});
  }, [userId]);
  useEffect(() => {
    setError('');
    refresh();
    window.addEventListener('focus',refresh);
    return () => {generation.current++;window.removeEventListener('focus',refresh);};
  }, [refresh]);
  return {snapshot:snapshot?.userId === userId ? snapshot.value : null,error,refresh};
}
