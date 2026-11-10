import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {RiverCityRunPage} from '@/components/riverCityRun/RiverCityRunPage';
import {ArcadeTile} from '@/components/arcade/ArcadeTile';
import '@/lib/arcade/arcade.css';
import '@/index.css';
const request=async<T,>(body:object):Promise<T>=>{const response=await fetch('/__river',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error);return value;};
createRoot(document.getElementById('root')!).render(<BrowserRouter>{location.search==='?tiles'?<main className="arcade-page"><h1>P-Town Originals</h1><div className="arcade-tiles"><ArcadeTile game="river-city-run" name="River City Run" original/></div></main>:<RiverCityRunPage userId="00000000-0000-4000-8000-000000000001" request={request}/>}</BrowserRouter>);
