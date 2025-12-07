import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatInputProps {
  onSend: (message: string) => void;
  isSending: boolean;
  isMobile?: boolean;
}

export const ChatInput = ({ onSend, isSending, isMobile = false }: ChatInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = () => {
    if (message.trim() && !isSending) {
      onSend(message.trim());
      setMessage('');
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      setMessage('');
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsOpen(true)}
        className={`
          bg-black/60 border-white/30 text-white hover:bg-black/80 hover:text-white
          ${isMobile ? 'h-10 w-10' : 'h-12 w-12'}
        `}
        title="Open chat"
      >
        <MessageCircle className={isMobile ? 'h-5 w-5' : 'h-6 w-6'} />
      </Button>
    );
  }

  return (
    <div className={`
      flex items-center gap-2 bg-black/80 rounded-lg p-2 backdrop-blur-sm
      ${isMobile ? 'w-full' : 'w-72'}
    `}>
      <Input
        ref={inputRef}
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, 100))}
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
        disabled={!message.trim() || isSending}
        className="h-9 w-9 text-white hover:bg-white/20"
      >
        <Send className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { setIsOpen(false); setMessage(''); }}
        className="h-9 w-9 text-white hover:bg-white/20"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
