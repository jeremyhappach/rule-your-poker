import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X, Smile, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EMOTICONS = [
  '😀', '😂', '😍', '🤔', '😎', '😢', '😡', '🤯',
  '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '💪',
  '❤️', '💔', '🔥', '⭐', '💯', '🎉', '🏆', '💰',
  '🃏', '♠️', '♥️', '♦️', '♣️', '🎰', '🎲', '🍀'
];

interface ChatInputProps {
  onSend: (message: string, imageFile?: File) => void;
  isSending: boolean;
  isMobile?: boolean;
}

export const ChatInput = ({ onSend, isSending, isMobile = false }: ChatInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [showEmoticons, setShowEmoticons] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = () => {
    if ((message.trim() || selectedImage) && !isSending) {
      onSend(message.trim(), selectedImage || undefined);
      setMessage('');
      setSelectedImage(null);
      setImagePreview(null);
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
      setSelectedImage(null);
      setImagePreview(null);
    }
  };

  const handleEmoticonClick = (emoticon: string) => {
    if (message.length + emoticon.length <= 100) {
      setMessage(prev => prev + emoticon);
    }
    setShowEmoticons(false);
    inputRef.current?.focus();
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type and size (max 5MB)
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
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
      flex flex-col gap-2 bg-black/80 rounded-lg p-2 backdrop-blur-sm
      ${isMobile ? 'w-full' : 'w-80'}
    `}>
      {/* Image preview */}
      {imagePreview && (
        <div className="relative w-16 h-16">
          <img 
            src={imagePreview} 
            alt="Preview" 
            className="w-full h-full object-cover rounded-md"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={clearImage}
            className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      
      <div className="flex items-center gap-1">
        {/* Message input */}
        <Input
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 100))}
          onKeyDown={handleKeyDown}
          placeholder="Type..."
          className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 h-9 min-w-0"
          maxLength={100}
          disabled={isSending}
        />

        {/* Emoticon picker */}
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
          <PopoverContent 
            className="w-64 p-2 bg-black/95 border-white/20" 
            side="top"
            align="end"
          >
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

        {/* Image upload */}
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

        {/* Send button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSend}
          disabled={(!message.trim() && !selectedImage) || isSending}
          className="h-9 w-9 text-white hover:bg-white/20 flex-shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { 
            setIsOpen(false); 
            setMessage(''); 
            setSelectedImage(null);
            setImagePreview(null);
          }}
          className="h-9 w-9 text-white hover:bg-white/20 flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};