import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {ArcadeSwitchboard} from '@/components/arcade/ArcadeSwitchboard';
import '@/index.css';
createRoot(document.getElementById('root')!).render(<BrowserRouter><ArcadeSwitchboard userId="local-fixture"/></BrowserRouter>);
