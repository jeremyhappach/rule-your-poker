import {createServer}from'node:http';import{readFileSync}from'node:fs';
const server=createServer((req,res)=>{const file=req.url==='/preview.js'?'preview.js':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');res.setHeader('Cache-Control','no-store');res.end(readFileSync('qualification.local/web-push/'+file));});
server.listen(15413,'127.0.0.1',()=>console.log('Local mock preview: http://127.0.0.1:15413/'));
