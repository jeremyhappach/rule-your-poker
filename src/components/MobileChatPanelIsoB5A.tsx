// CHAT-ISO-B4: Same as B3, but restore ONLY the mute-preference read:
//   supabase.from('profiles').select('mute_dealer_chat').single()
//
// Still disabled (unchanged from B3):
//   - recordConsumerSubscription
//   - recordChatDeliveryEvent
//   - recordReactRenderObserved
//   - recordSelectorProof / chat-message-mounted ledger writes
//   - recordChatDeliveryViolation
//   - every window.dispatchEvent
//   - runtime tracer / instrumentation dynamic import
//   - incident/export subtree
//   - voice hook (as in B1)
//   - profile WRITE on mute toggle (local-only)
//
// The profile READ is:
//   - fire-and-forget (no await at render level)
//   - locally try/catch'd
//   - never triggers auth/session recovery, navigation, router replace,
//     shell teardown, or retry loops
import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Smile, Mic, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { recordReactRenderObserved } from '@/lib/chatDelivery/chatDeliveryLedger';

type VoiceState = 'idle' | 'recording' | 'transcribing' | 'error';
type VoicePermission = 'prompt' | 'granted' | 'denied';
const VOICE_ISO_B5A_STUB: {
  state: VoiceState;
  error: string | null;
  permission: VoicePermission;
  isSupported: boolean;
  diagnostics: { code: string; detail?: string }[];
  recordDiagnostic: (code: string, detail?: string) => void;
  finalize: () => Promise<string>;
  stop: () => Promise<string>;
  start: () => Promise<void>;
  reset: () => void;
} = {
  state: 'idle',
  error: null,
  permission: 'prompt',
  isSupported: false,
  diagnostics: [],
  recordDiagnostic: () => {},
  finalize: async () => '',
  stop: async () => '',
  start: async () => {},
  reset: () => {},
};

const EMOTICONS = [
  '😀', '😂', '😍', '🤔', '😎', '😢', '😡', '🤯',
  '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '💪',
  '❤️', '💔', '🔥', '⭐', '💯', '🎉', '🏆', '💰',
  '🃏', '♠️', '♥️', '♦️', '♣️', '🎰', '🎲', '🍀'
];

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

interface MobileChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string, imageFile?: File) => void;
  isSending: boolean;
  chatInputValue?: string;
  onChatInputChange?: (value: string) => void;
  dealerMessages?: DealerMessage[];
  currentUserId?: string;
  instrumentationCurrentUserId?: string;
  diagnosticGameId?: string | null;
  diagnosticDealerGameId?: string | null;
}

export const MobileChatPanelIsoB5A = ({
  messages,
  onSend,
  isSending,
  chatInputValue,
  onChatInputChange,
  dealerMessages = [],
  currentUserId,
}: MobileChatPanelProps) => {
  const [internalInputMessage, setInternalInputMessage] = useState('');
  const inputMessage = chatInputValue ?? internalInputMessage;
  const setInputMessage = onChatInputChange ?? setInternalInputMessage;

  const [showEmoticons, setShowEmoticons] = useState(false);
  const [muteDealerChat, setMuteDealerChat] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const voice = VOICE_ISO_B5A_STUB;

  // CHAT-ISO-B4: restore ONLY the profile read. Fire-and-forget, local
  // try/catch, never rethrows, never triggers navigation/session work.
  useEffect(() => {
    if (!currentUserId) {
      setIsLoadingPreference(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('mute_dealer_chat')
          .eq('id', currentUserId)
          .single();
        if (cancelled) return;
        if (!error && data) {
          setMuteDealerChat(data.mute_dealer_chat ?? false);
        }
      } catch {
        // swallow — no auth recovery, no retry, no navigation
      } finally {
        if (!cancelled) setIsLoadingPreference(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const handleMuteToggle = (checked: boolean) => {
    // Local-only toggle. No DB write in B4 (write is not the read path).
    setMuteDealerChat(checked);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages]);

  const [isFinalizing] = useState(false);
  const sendInFlightRef = useRef(false);

  const performSend = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    onSend(trimmed);
    setInputMessage('');
    return true;
  };

  const handleSend = () => {
    if (sendInFlightRef.current) return;
    if (isSending) return;
    if (inputMessage.trim()) {
      sendInFlightRef.current = true;
      try {
        performSend(inputMessage);
      } finally {
        sendInFlightRef.current = false;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmoticonClick = (emoticon: string) => {
    if (inputMessage.length + emoticon.length <= 100) {
      setInputMessage(inputMessage + emoticon);
    }
    setShowEmoticons(false);
    inputRef.current?.focus();
  };

  const sendDisabled =
    isFinalizing ||
    isSending ||
    (voice.state !== 'recording' && !inputMessage.trim());

  type CombinedMessage =
    | (ChatMessage & { isDealer?: false })
    | DealerMessage;

  const visibleDealerMessages = useMemo(
    () => (muteDealerChat ? [] : dealerMessages),
    [dealerMessages, muteDealerChat]
  );

  const combinedMessages = useMemo<CombinedMessage[]>(() => {
    const playerMessages = messages.map(m => ({ ...m, isDealer: false as const }));
    const combined: CombinedMessage[] = [
      ...playerMessages,
      ...visibleDealerMessages,
    ];

    combined.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

    return combined;
  }, [messages, visibleDealerMessages]);

  return (
    <div className="bg-black/90 rounded-lg border border-white/20 overflow-hidden h-full flex flex-col">
      <div className="px-2 py-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value.slice(0, 100))}
            onKeyDown={handleKeyDown}
            placeholder={'Type…'}
            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 h-9 text-sm min-w-0"
            style={{ fontSize: '16px' }}
            maxLength={100}
          />

          <Popover open={showEmoticons} onOpenChange={setShowEmoticons}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-white hover:bg-white/20 flex-shrink-0"
                title="Add emoticon"
              >
                <Smile className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 bg-black/95 border-white/20" side="top" align="end">
              <div className="grid grid-cols-8 gap-1">
                {EMOTICONS.map((emoticon) => (
                  <button
                    key={emoticon}
                    onClick={() => handleEmoticonClick(emoticon)}
                    className="text-xl hover:bg-white/20 rounded p-1 transition-colors"
                  >
                    {emoticon}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* CHAT-ISO-B4: disabled mic affordance (voice remains off). */}
          <Button
            variant="ghost"
            size="icon"
            disabled
            aria-disabled="true"
            className="h-9 w-9 text-white/40 flex-shrink-0 cursor-not-allowed"
            title="VOICE DISABLED — ISO B5A"
            aria-label="VOICE DISABLED — ISO B5A"
          >
            <Mic className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleSend()}
            disabled={sendDisabled}
            className="h-9 w-9 text-white hover:bg-white/20 flex-shrink-0"
            title={'Send'}
            aria-label={'Send'}
          >
            {isFinalizing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-1 px-1 text-[10px] text-white/60 leading-tight font-mono">
          CHAT-ISO-B5A — RENDER OBSERVED ONLY
        </div>

        <div className="flex items-center gap-2 mt-2 px-1">
          <Checkbox
            id="mute-dealer"
            checked={muteDealerChat}
            onCheckedChange={handleMuteToggle}
            disabled={isLoadingPreference}
            className="h-3.5 w-3.5 border-white/40 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
          />
          <label
            htmlFor="mute-dealer"
            className="text-xs text-white/60 cursor-pointer select-none"
          >
            mute dealer
          </label>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {(() => {
          if (combinedMessages.length === 0) {
            return <p className="text-white/40 text-xs text-center">No messages yet</p>;
          }

          return combinedMessages.map((msg) => {
            if (msg.isDealer) {
              return (
                <div key={msg.id} className="text-xs leading-tight">
                  <div>
                    <span className="text-emerald-400 font-medium">Dealer:</span>{' '}
                    <span className="text-emerald-200/90">{msg.message}</span>
                  </div>
                </div>
              );
            }

            const playerMsg = msg as ChatMessage;
            return (
              <div key={playerMsg.id} className="text-xs leading-tight">
                <div>
                  <span className="text-amber-400 font-medium">{playerMsg.username || 'Unknown'}:</span>{' '}
                  {playerMsg.message && <span className="text-white">{playerMsg.message}</span>}
                </div>
                {playerMsg.image_url && (
                  <img
                    src={playerMsg.image_url}
                    alt="Chat attachment"
                    className="mt-1 w-28 h-20 object-cover rounded border border-white/10"
                    loading="lazy"
                  />
                )}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
};
