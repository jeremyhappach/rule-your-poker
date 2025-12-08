import { useState, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  username?: string;
  expiresAt: number;
}

interface MobileChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  isSending: boolean;
  onClose: () => void;
}

export const MobileChatPanel = ({ 
  messages, 
  onSend, 
  isSending, 
  onClose 
}: MobileChatPanelProps) => {
  const [inputMessage, setInputMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="bg-black/90 rounded-lg border border-white/20 overflow-hidden">
      {/* Input row */}
      <div className="flex items-center gap-2 p-2 border-b border-white/10">
        <Input
          ref={inputRef}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value.slice(0, 100))}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 h-9"
          maxLength={100}
          disabled={isSending}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSend}
          disabled={!inputMessage.trim() || isSending}
          className="h-9 w-9 text-white hover:bg-white/20"
        >
          <Send className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-9 w-9 text-white hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Chat history */}
      <div 
        ref={scrollRef}
        className="max-h-32 overflow-y-auto p-2 space-y-1"
      >
        {messages.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-2">No messages yet</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="text-sm">
              <span className="text-amber-400 font-medium">{msg.username || 'Unknown'}:</span>{' '}
              <span className="text-white">{msg.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
