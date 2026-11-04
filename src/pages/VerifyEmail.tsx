import {useState} from 'react';
import {Link} from 'react-router-dom';
import {Button} from '@/components/ui/button';
export default function VerifyEmail(){
 const [state,setState]=useState(''),[busy,setBusy]=useState(false);
 const [hash]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token_hash'));
 return <main className="min-h-screen grid place-items-center bg-background text-foreground p-6"><section className="max-w-md space-y-5 text-center"><h1 className="text-2xl font-semibold">Verify your email</h1><p>Confirm that you own the address that received this email.</p>{hash&&state!=='Your email is verified.'&&<Button disabled={busy} onClick={async()=>{setBusy(true);try{const response=await fetch('/api/account-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'verify',tokenHash:hash})});const result=await response.json();if(!response.ok)throw Error(result.error);setState('Your email is verified.');history.replaceState(null,'','/verify-email');}catch(e){setState(e instanceof Error?e.message:'Verification failed. Request another email.');}finally{setBusy(false);}}}>Verify email</Button>}<p role="status">{state||(!hash?'This link is incomplete. Request another verification email.':'')}</p><Link to="/">Return to P-Town Poker</Link></section></main>;
}
