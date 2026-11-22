import type {AuthoritativeConnectionState} from '@/lib/authoritativeSubscription';

export function WordsConnectionStatus({connection,connected,error='',pending=false,onReconnect}:{
 connection?:AuthoritativeConnectionState;connected:boolean;error?:string;pending?:boolean;onReconnect:()=>unknown;
}){
 if(connected&&!error)return null;
 const phase=connected?'connected':connection?.phase;
 const failed=phase==='failed',offline=phase==='offline';
 const message=failed?'Could not reconnect to Words. Check your connection and try again.'
  :offline?'Connection unavailable. Reconnect when you are back online.'
  :phase==='connecting'?'Connecting…':phase==='recovering'?'Reconnecting…':error||'Reconnecting…';
 const retry=failed||offline||!connection&&!connected||pending&&!!error;
 return <div className="words-error" role={failed?'alert':'status'}>{message}{retry&&<button onClick={()=>void onReconnect()}>{failed?'Retry':'Reconnect'}</button>}</div>;
}
