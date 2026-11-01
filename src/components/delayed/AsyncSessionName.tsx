import type {ReactNode} from 'react';

/** Money mode comes only from the existing authoritative match projection. */
export function AsyncSessionName({realMoney,children}:{realMoney:boolean;children:ReactNode}){
 return <span>{realMoney&&<span className="text-green-400 font-semibold mr-1" aria-label="Real money">$</span>}{children}</span>;
}
