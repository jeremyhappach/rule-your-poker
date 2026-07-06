// CHAT-ISO-B2: Render-only Chat panel.
//
// Mirrors MobileChatPanel's visual DOM/layout exactly — same container
// chrome, same composer row (input + emoticon + mic + send button
// geometry), same scroll container, same mobile CSS classes, same
// message bubble markup for player and dealer messages — but does
// ZERO side effects:
//   - no hooks beyond React primitives required for render structure
//   - no profile fetch, no supabase calls
//   - no ledger/event dispatch (no chatDeliveryLedger)
//   - no runtime tracing / selector-proof work
//   - no incident/export subtree
//   - no realtime/read-state work
//   - no event listeners, no timers
//   - no voice hook, no permission query, no media detection
//   - no onClick handlers wired to state
//
// This is a static projection of props. The composer input is
// uncontrolled and inert; buttons are disabled affordances.
import { Send, Smile, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  image_url?: string | null;
  username?: string;
  created_at?: string;
}

interface DealerMessage {
  id: string;
  message: string;
  created_at: string;
  isDealer: true;
}

export interface MobileChatPanelIsoB2Props {
  messages: ChatMessage[];
  dealerMessages?: DealerMessage[];
}

export const MobileChatPanelIsoB2 = ({
  messages,
  dealerMessages = [],
}: MobileChatPanelIsoB2Props) => {
  // Pure derivation, no memo needed — this is a render-only stub and
  // we want to exclude even useMemo/useEffect from the profile.
  const combined: Array<
    (ChatMessage & { isDealer?: false }) | DealerMessage
  > = [
    ...messages.map((m) => ({ ...m, isDealer: false as const })),
    ...dealerMessages,
  ].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return (
    <div className="bg-black/90 rounded-lg border border-white/20 overflow-hidden h-full flex flex-col">
      <div className="px-2 py-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          <Input
            defaultValue=""
            placeholder="Type…"
            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 h-9 text-sm min-w-0"
            style={{ fontSize: '16px' }}
            maxLength={100}
            readOnly
          />

          <Button
            variant="ghost"
            size="icon"
            disabled
            aria-disabled="true"
            className="h-9 w-9 text-white/40 flex-shrink-0 cursor-not-allowed"
            title="CHAT-ISO-B2 — VISUAL ONLY"
            aria-label="Add emoticon (disabled)"
          >
            <Smile className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            disabled
            aria-disabled="true"
            className="h-9 w-9 text-white/40 flex-shrink-0 cursor-not-allowed"
            title="CHAT-ISO-B2 — VISUAL ONLY"
            aria-label="Voice input (disabled)"
          >
            <Mic className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            disabled
            aria-disabled="true"
            className="h-9 w-9 text-white/40 flex-shrink-0 cursor-not-allowed"
            title="CHAT-ISO-B2 — VISUAL ONLY"
            aria-label="Send (disabled)"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-1 px-1 text-[10px] text-white/70 leading-tight font-mono">
          CHAT-ISO-B2 — VISUAL ONLY
        </div>

        <div className="flex items-center gap-2 mt-2 px-1">
          <Checkbox
            id="mute-dealer-iso-b2"
            checked={false}
            disabled
            className="h-3.5 w-3.5 border-white/40 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
          />
          <label
            htmlFor="mute-dealer-iso-b2"
            className="text-xs text-white/60 cursor-not-allowed select-none"
          >
            mute dealer
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {combined.length === 0 ? (
          <p className="text-white/40 text-xs text-center">No messages yet</p>
        ) : (
          combined.map((msg) => {
            if ((msg as DealerMessage).isDealer) {
              const d = msg as DealerMessage;
              return (
                <div key={d.id} className="text-xs leading-tight">
                  <div>
                    <span className="text-emerald-400 font-medium">Dealer:</span>{' '}
                    <span className="text-emerald-200/90">{d.message}</span>
                  </div>
                </div>
              );
            }
            const p = msg as ChatMessage;
            return (
              <div key={p.id} className="text-xs leading-tight">
                <div>
                  <span className="text-amber-400 font-medium">{p.username || 'Unknown'}:</span>{' '}
                  {p.message && <span className="text-white">{p.message}</span>}
                </div>
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt="Chat attachment"
                    className="mt-1 w-28 h-20 object-cover rounded border border-white/10"
                    loading="lazy"
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
