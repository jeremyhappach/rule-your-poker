import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  username?: string;
}

interface MobileChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  isSending: boolean;
}

export const MobileChatPanel = ({ 
  messages, 
  onSend, 
  isSending
}: MobileChatPanelProps) => {
  const [inputMessage, setInputMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new messages arrive (newest first)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages]);

  const handleSend = () => {
    if (inputMessage.trim() && !isSending) {
      onSend(inputMessage.trim());
      setInputMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-black/90 rounded-lg border border-white/20 overflow-hidden h-20 flex flex-col">
      {/* Input row - no border */}
      <div className="flex items-center gap-1 px-2 py-1 flex-shrink-0">
        <Input
          ref={inputRef}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value.slice(0, 100))}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 h-7 text-sm"
          style={{ fontSize: '16px' }}
          maxLength={100}
          disabled={isSending}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSend}
          disabled={!inputMessage.trim() || isSending}
          className="h-7 w-7 text-white hover:bg-white/20"
        >
          <Send className="h-3 w-3" />
        </Button>
      </div>
      
      {/* Chat history */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 pb-1 space-y-0.5"
      >
        {messages.length === 0 ? (
          <p className="text-white/40 text-xs text-center">No messages yet</p>
        ) : (
          [...messages].reverse().map((msg) => (
            <div key={msg.id} className="text-xs leading-tight">
              <span className="text-amber-400 font-medium">{msg.username || 'Unknown'}:</span>{' '}
              <span className="text-white">{msg.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
