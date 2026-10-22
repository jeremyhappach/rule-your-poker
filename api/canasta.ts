import type {IncomingMessage,ServerResponse} from 'node:http';
import {createProductionAdapter} from '../server/canasta/production.js';
const production=createProductionAdapter(process.env);
export default async function handler(req:IncomingMessage,res:ServerResponse){
 const url=new URL(req.url??'/','http://authority.invalid'),path=url.searchParams.get('canasta_path');
 if(path!==null){url.searchParams.delete('canasta_path');req.url=`/__canasta/${path}${url.search}`;}
 await production(req,res);
}
