import {createContext,useContext} from 'react';
import type {AccountAccess} from './accountAccess';

export const AccountAccessContext=createContext<{access:AccountAccess;reminderOpen:boolean}|null>(null);
export const useAccountAccess=()=>useContext(AccountAccessContext);
