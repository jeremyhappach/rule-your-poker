import {startPreview} from './server.mjs';
if(process.env.VERCEL)throw Error('Local preview only');
const {url}=await startPreview(5196);
console.log(url.replace('index.html','polish.html'));
