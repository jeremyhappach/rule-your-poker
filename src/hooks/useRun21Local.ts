import { useCallback, useEffect, useRef, useState } from 'react';
import { acceptRun21Snapshot, run21Fetch, run21Request, type Run21Snapshot } from '@/lib/run21/localClient';
import type { Command, Intent } from '@/lib/run21/model';

export function useRun21Local(gameId: string, dealerGameId: string) {
  const [snapshot, setSnapshot] = useState<Run21Snapshot | null>(null);
  const latest = useRef<Run21Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [retry, setRetry] = useState(0);
  const offset = useRef(0);
  const [now, setNow] = useState(Date.now());
  const accept = useCallback((value: Run21Snapshot) => {
    const accepted = acceptRun21Snapshot(latest.current, value, dealerGameId);
    if (!accepted) return;
    latest.current = accepted; offset.current = accepted.serverAt - Date.now(); setSnapshot(accepted);
  }, [dealerGameId]);
  useEffect(() => {
    latest.current = null; setSnapshot(null); setError(null);
    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await run21Fetch(gameId, 'events', {signal: controller.signal});
        if (!response.ok || !response.body) throw new Error('Run21 server unavailable. Start the local authority server and reconnect.');
        setConnected(true); setError(null);
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let text = '';
        while (!controller.signal.aborted) {
          const {value, done} = await reader.read(); if (done) break;
          text += decoder.decode(value, {stream: true});
          let end: number;
          while ((end = text.indexOf('\n\n')) >= 0) {
            const frame = text.slice(0, end); text = text.slice(end + 2);
            if (frame.startsWith('data: ')) accept(JSON.parse(frame.slice(6)));
          }
        }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Connection lost.'); }
      finally { if (!controller.signal.aborted) setConnected(false); }
    };
    void run();
    // Display time only. Expiration is committed by the local server scheduler.
    const display = setInterval(() => setNow(Date.now() + offset.current), 100);
    return () => { controller.abort(); clearInterval(display); };
  }, [gameId, dealerGameId, accept, retry]);
  useEffect(() => {
    // A disconnected transport retries with backoff; no state polling or client progression.
    if (connected) return;
    const timer = setTimeout(() => setRetry(n => n + 1), 3000);
    return () => clearTimeout(timer);
  }, [connected, retry]);
  const onIntent = useCallback(async (intent: Intent) => {
    const current = latest.current;
    if (!current?.view.viewerId || !connected || inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null);
    const view = current.view;
    const command: Command = {identity: view.identity, roundId: view.roundId!, playerId: view.viewerId!,
      requestId: crypto.randomUUID(), revision: view.boards[view.viewerId!]!.revision, intent};
    try {
      // A transport retry repeats the exact command key, never a fresh action.
      let response: Run21Snapshot;
      try { response = await run21Request(gameId, 'action', command); }
      catch (e) { if (!(e instanceof TypeError)) throw e; response = await run21Request(gameId, 'action', command); }
      accept(response);
    } catch (e) { setError(e instanceof Error ? e.message : 'Action rejected.'); }
    finally { inFlight.current = false; setPending(false); }
  }, [gameId, connected, accept]);
  return {snapshot: snapshot?.view.identity.dealerGameId === dealerGameId ? snapshot : null, now,
    error, connected, pending, onIntent, reconnect: () => setRetry(n => n + 1)};
}
