import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useChipTransportInternal } from '@/lib/canonicalShell/ChipTransportProvider';
import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';

/** The committed batch's canonical receipt owns terminal navigation. No
 * invisible legacy animation may stand in for a queued or interrupted flight. */
export function useDiceTerminalTransfer({ gameId, dealerGameId, roundId, trigger, amount, ready, onComplete }: {
  gameId?: string | null; dealerGameId?: string | null; roundId?: string | null;
  trigger?: string | null; amount: number; ready: boolean; onComplete?: () => void;
}) {
  const transport = useChipTransportInternal();
  const [receipt, setReceipt] = useState<{ key: string; cursors: number[]; historical: boolean } | null>(null);
  const released = useRef(new Set<string>());
  const parts = trigger?.split('|');
  const valid = !!trigger && !!gameId && !!dealerGameId && !!roundId &&
    parts?.[1] === 'winseq' && parts[2] === gameId && parts[3] === dealerGameId && parts[5] === roundId;
  useEffect(() => {
    if (!valid || !trigger) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const { data, error } = await (supabase as any).from('gameplay_transfer_batches').select('*')
          .eq('game_id', gameId).eq('dealer_game_id', dealerGameId);
        if (disposed) return;
        const awards: ChipPresentationBatch[] = (data ?? []).filter((batch: ChipPresentationBatch) =>
          batch.game_id === gameId && batch.dealer_game_id === dealerGameId &&
          batch.transfers?.some(transfer => transfer.from.kind === 'pot' && transfer.to.kind === 'player'));
        const exact = awards.filter(batch => batch.source_round_id === roundId);
        // Pre-metadata sessions can only finish through historical ledger
        // reconciliation. Never assign an unknown round a live flight receipt.
        const historical = !exact.length && awards.length > 0 && awards.every(batch => !batch.source_round_id);
        const batches = historical ? awards : exact;
        if (!error && batches.length) setReceipt({ key: trigger, cursors: batches.map(batch => batch.cursor), historical });
        else timer = setTimeout(read, 1000);
      } catch {
        if (!disposed) timer = setTimeout(read, 1000);
      }
    };
    if (amount > 0) void read();
    return () => { disposed = true; clearTimeout(timer); };
  }, [valid, trigger, gameId, dealerGameId, roundId, amount]);
  useEffect(() => {
    if (!valid || !trigger || !ready || released.current.has(trigger)) return;
    if (amount > 0) {
      if (receipt?.key !== trigger || !transport || transport.gameId !== gameId) return;
      for (const cursor of receipt.cursors) transport.__ensurePresentationCursor(cursor);
      const terminalStates = receipt.historical ? ['reconciled'] : ['settled', 'reconciled'];
      if (!receipt.cursors.every(cursor => terminalStates.includes(transport.__presentationCursorState(cursor)))) return;
    }
    released.current.add(trigger);
    onComplete?.();
  }, [valid, trigger, ready, receipt, transport, amount, gameId, onComplete]);
}
