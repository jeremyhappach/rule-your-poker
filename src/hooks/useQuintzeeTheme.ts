import {useState} from 'react';
export const quintzeeThemeKey=(userId:string)=>'quintzee:classic-mode:'+userId;
export function readQuintzeeClassic(userId:string){try{return localStorage.getItem(quintzeeThemeKey(userId))==='true';}catch{return false;}}
export function useQuintzeeTheme(userId:string){const [classic,setClassic]=useState(()=>readQuintzeeClassic(userId));return [classic,(next:boolean)=>{setClassic(next);try{localStorage.setItem(quintzeeThemeKey(userId),String(next));}catch{/* Cosmetic preference remains usable without storage. */}}] as const;}
