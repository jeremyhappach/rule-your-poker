import {createClient} from '@supabase/supabase-js';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {AsyncLocalStorage} from 'node:async_hooks';
import {AuthorityError, Run21Authority, type StoredMatch} from './authority.js';

export interface AuthorityOptions {
  url: string; key: string; loopbackOnly?: boolean; waitUntil?: (work: Promise<unknown>) => void;
}
/** Shared transport. Only the server receives the privileged credential. */
export function createRun21Handler(options: AuthorityOptions) {
  const timing = new AsyncLocalStorage<{receivedAt:number; rpc:{name:string;startedAt:number;completedAt:number}[]}>();
  const db = createClient(options.url, options.key, {auth: {persistSession: false, autoRefreshToken: false}});
  const rpc = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
    const span = {name,startedAt:Date.now(),completedAt:0};
    timing.getStore()?.rpc.push(span);
    const {data, error} = await db.rpc(name, args);
    span.completedAt=Date.now();
    if (error) throw new AuthorityError(error.message.startsWith('run21:') ? error.message : 'run21:database_rejected');
    return data as T;
  };
  const authority = new Run21Authority({
    async load(gameId) {
      const rows = await rpc<StoredMatch[]>('run21_server_load', {p_game_id: gameId ?? null});
      const unstarted = rows.filter(row => !row.state);
      if (!unstarted.length) return rows;
      const {data, error} = await db.from('dealer_games').select('id,dealer_user_id').in('id', unstarted.map(row => row.dealer_game_id));
      if (error) throw new AuthorityError('run21:dealer_identity_unavailable');
      return rows.map(row => ({...row, dealer_user_id: data?.find(d => d.id === row.dealer_game_id)?.dealer_user_id ?? ''}));
    },
    async commit(row, state, botDue) {
      const value = await rpc<{outcome: string; record: StoredMatch}>('run21_server_commit', {
        p_dealer_game_id: row.dealer_game_id, p_expected_revision: row.revision, p_state: state, p_bot_due_at: botDue});
      if (value.outcome !== 'committed') throw new AuthorityError('run21:concurrent_commit');
      return value.record;
    },
    close: (dealerId, userId) => rpc('run21_server_close', {p_dealer_game_id: dealerId, p_user_id: userId}),
  });
  const send = (res: ServerResponse, status: number, body: unknown) => {
    const trace=timing.getStore();
    const payload=JSON.stringify(body);
    res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      ...(trace?{'X-Run21-Timing':JSON.stringify({...trace,sentAt:Date.now()})}:{})}); res.end(payload);
  };
  async function authenticate(req: IncomingMessage) {
    if (options.loopbackOnly && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) throw new AuthorityError('run21:loopback_only', 403);
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new AuthorityError('run21:origin', 403);
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new AuthorityError('run21:authentication_required', 401);
    // The unverified subject is only a speculative lookup key. Neither check
    // authorizes a request until Auth verifies that exact same identity.
    let subject:unknown;
    try{subject=JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString('utf8')).sub;}catch{}
    if(typeof subject!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subject))throw new AuthorityError('run21:authentication_required',401);
    const [{data,error},allowed]=await Promise.all([
      db.auth.getUser(token),rpc<boolean>('run21_server_authorize',{p_user_id:subject}),
    ]);
    if (error || !data.user || data.user.id!==subject) throw new AuthorityError('run21:authentication_required', 401);
    if (!allowed) throw new AuthorityError('run21:release_denied', 403);
    return data.user.id;
  }
  const handler = async (req: IncomingMessage & {body?: unknown}, res: ServerResponse) => {
    let gameId: string | undefined;
    try {
      const userId = await authenticate(req);
      const url = new URL(req.url ?? '/', 'http://authority.invalid');
      let cursor = Number(url.searchParams.get('after') ?? 0);
      if (!Number.isSafeInteger(cursor) || cursor < 0) throw new AuthorityError('run21:invalid_cursor', 400);
      const path = url.pathname.replace(/^\/(?:__run21|api\/run21)/, '');
      const route = /^\/([0-9a-f-]{36})\/(state|action|events|history|close)$/.exec(path);
      if (!route) throw new AuthorityError('run21:route', 404);
      [, gameId] = route; const operation = route[2];
      if ((['action', 'close'].includes(operation) ? 'POST' : 'GET') !== req.method) throw new AuthorityError('run21:method', 405);
      if (operation === 'events') {
        let channel: ReturnType<typeof db.channel> | undefined;
        let expiry: ReturnType<typeof setTimeout> | undefined;
        let stopped = false;
        let refreshing=false,dirty=false;
        const refresh = () => {
          dirty=true;
          if(refreshing||!res.headersSent||stopped)return;
          refreshing=true;
          void (async()=>{while(dirty&&!stopped){
            dirty=false;
            const value=await authority.observe(gameId!,userId,cursor);
            if(!stopped){res.write(`data: ${JSON.stringify(value)}\n\n`);cursor=Math.max(cursor,value.eventSequence);}
          }})().catch(()=>res.end()).finally(()=>{refreshing=false;});
        };
        const cleanup = () => { stopped = true; clearTimeout(expiry); if (channel) void db.removeChannel(channel); };
        res.once('close', cleanup);
        try {
          // Cross-instance notifications contain a revision only. Subscribe before reading.
          channel = db.channel(`run21-${gameId}-${crypto.randomUUID()}`).on('postgres_changes', {
            event: '*', schema: 'public', table: 'run21_revisions', filter: `game_id=eq.${gameId}`,
          }, refresh);
          await new Promise<void>((resolve, reject) => channel!.subscribe(status => {
            if (status === 'SUBSCRIBED') resolve();
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new AuthorityError('run21:transport_unavailable', 503));
          }));
          const initial = await authority.read(gameId, userId, cursor);
          if (stopped) return;
          res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive'});
          res.write(`data: ${JSON.stringify(initial)}\n\n`); cursor = initial.eventSequence;
          if(dirty)refresh();
          // Rotate before the hosting limit. Normal renewal is not a disconnect.
          expiry = setTimeout(() => {res.write('event: renew\ndata: {}\n\n');res.end();}, 240000);
          await new Promise<void>(resolve => res.once('close', resolve));
        } finally { cleanup(); }
        return;
      }
      if (operation === 'state') return send(res, 200, await authority.read(gameId, userId, cursor));
      if (operation === 'history') return send(res, 200, await authority.history(gameId, userId));
      if (operation === 'close') { await authority.close(gameId, userId); return send(res, 200, {closed: true}); }
      let body = '';
      if (req.body !== undefined) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      else for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new AuthorityError('run21:request_size', 413); }
      if (body.length > 4096) throw new AuthorityError('run21:request_size', 413);
      let command: unknown; try { command = JSON.parse(body); } catch { throw new AuthorityError('run21:invalid_json', 400); }
      send(res, 200, await authority.act(gameId, userId, command as Parameters<Run21Authority['act']>[2], cursor));
    } catch (error) {
      if (res.headersSent) res.end();
      else send(res, error instanceof AuthorityError ? error.status : 500, {error: error instanceof AuthorityError ? error.code : 'run21:server_failure'});
    } finally {
      // Retain started-round work even after the HTTP response or browser disconnect.
      if (gameId) options.waitUntil?.(authority.drain(gameId));
    }
  };
  return {handler:(req:IncomingMessage & {body?:unknown},res:ServerResponse)=>
    req.headers['x-run21-timing']==='1'
      ? timing.run({receivedAt:Date.now(),rpc:[]},()=>handler(req,res))
      : handler(req,res), authority,
    dispose: () => { authority.dispose(); void db.removeAllChannels(); }};
}
