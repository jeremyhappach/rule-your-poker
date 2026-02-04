import { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';

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
  // Lifted chat input state (persists across remounts)
  chatInputValue?: string;
  onChatInputChange?: (value: string) => void;
  // Dealer messages (scoring announcements) - styled differently
  dealerMessages?: DealerMessage[];
  // Current user ID for preference management
  currentUserId?: string;
}

export const MobileChatPanel = ({ 
  messages, 
  onSend, 
  isSending,
  chatInputValue,
  onChatInputChange,
  dealerMessages = [],
  currentUserId,
}: MobileChatPanelProps) => {
  // Use external state if provided, otherwise internal
  const [internalInputMessage, setInternalInputMessage] = useState('');
  const inputMessage = chatInputValue ?? internalInputMessage;
  const setInputMessage = onChatInputChange ?? setInternalInputMessage;

  const [showEmoticons, setShowEmoticons] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [muteDealerChat, setMuteDealerChat] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Load user preference from database
  useEffect(() => {
    if (!currentUserId) {
      setIsLoadingPreference(false);
      return;
    }
    
    const loadPreference = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('mute_dealer_chat')
          .eq('id', currentUserId)
          .single();
        
        if (!error && data) {
          setMuteDealerChat(data.mute_dealer_chat ?? false);
        }
      } catch (err) {
        console.error('[MobileChatPanel] Error loading mute preference:', err);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    
    loadPreference();
  }, [currentUserId]);
  
  // Handle mute dealer chat toggle
  const handleMuteToggle = async (checked: boolean) => {
    setMuteDealerChat(checked);
    
    if (!currentUserId) return;
    
    try {
      await supabase
        .from('profiles')
        .update({ mute_dealer_chat: checked })
        .eq('id', currentUserId);
    } catch (err) {
      console.error('[MobileChatPanel] Error saving mute preference:', err);
    }
  };

  // Auto-scroll to top when new messages arrive (newest first)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages]);

  const handleSend = () => {
    if ((inputMessage.trim() || selectedImage) && !isSending) {
      onSend(inputMessage.trim(), selectedImage || undefined);
      setInputMessage('');
      setSelectedImage(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      setInputMessage(prev => prev + emoticon);
    }
    setShowEmoticons(false);
    inputRef.current?.focus();
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-black/90 rounded-lg border border-white/20 overflow-hidden h-full flex flex-col">
      {/* Input section */}
      <div className="px-2 py-2 flex-shrink-0">
        {imagePreview && (
          <div className="relative w-16 h-16 mb-2">
            <img
              src={imagePreview}
              alt="Selected chat image preview"
              className="w-full h-full object-cover rounded-md"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={clearImage}
              className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0"
              title="Remove image"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value.slice(0, 100))}
            onKeyDown={handleKeyDown}
            placeholder="Type..."
            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 h-9 text-sm min-w-0"
            style={{ fontSize: '16px' }}
            maxLength={100}
            disabled={isSending}
          />

          {/* Emoticon picker (left of send) */}
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

          {/* Attach image (paperclip) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="h-9 w-9 text-white hover:bg-white/20 flex-shrink-0"
            title="Attach image"
            disabled={isSending}
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {/* Send */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSend}
            disabled={(!inputMessage.trim() && !selectedImage) || isSending}
            className="h-9 w-9 text-white hover:bg-white/20 flex-shrink-0"
            title="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Mute dealer chat option */}
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

      {/* Chat history */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {(() => {
          // Combine player messages and dealer messages, sorted by timestamp (newest first)
          type CombinedMessage = 
            | (ChatMessage & { isDealer?: false })
            | DealerMessage;
          
          // Filter dealer messages based on mute preference
          const visibleDealerMessages = muteDealerChat ? [] : dealerMessages;
          
          const combined: CombinedMessage[] = [
            ...messages.map(m => ({ ...m, isDealer: false as const })),
            ...visibleDealerMessages,
          ];
          
          // Sort by created_at descending (newest first)
          combined.sort((a, b) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return timeB - timeA;
          });
          
          if (combined.length === 0) {
            return <p className="text-white/40 text-xs text-center">No messages yet</p>;
          }
          
          return combined.map((msg) => {
            if (msg.isDealer) {
              // Dealer message - different styling (green/teal color, no image support)
              return (
                <div key={msg.id} className="text-xs leading-tight">
                  <div>
                    <span className="text-emerald-400 font-medium">Dealer:</span>{' '}
                    <span className="text-emerald-200/90">{msg.message}</span>
                  </div>
                </div>
              );
            }
            
            // Player message
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
