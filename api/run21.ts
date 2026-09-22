import type {IncomingMessage, ServerResponse} from 'node:http';
import {createProductionAdapter} from '../server/run21/production.js';

const production = createProductionAdapter(process.env);

/** Vercel's explicit rewrite carries the original authority path to this function. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://authority.invalid');
  const path = url.searchParams.get('run21_path');
  if (path !== null) {
    url.searchParams.delete('run21_path');
    req.url = `/__run21/${path}${url.search ? url.search : ''}`;
  }
  await production.handler(req, res);
}
