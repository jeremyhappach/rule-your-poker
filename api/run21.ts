import type {IncomingMessage, ServerResponse} from 'node:http';
import {createProductionAdapter} from '../server/run21/production';

const production = createProductionAdapter(process.env);

/** Vercel's explicit rewrite carries the original authority path to this function. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://authority.invalid');
  const path = url.searchParams.get('run21_path');
  if (path !== null) req.url = `/__run21/${path}`;
  await production.handler(req, res);
}
