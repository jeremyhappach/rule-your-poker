import { useState } from 'react';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const EMOTICONS = [
  '😀', '😂', '😍', '🤔', '😎', '😢', '😡', '🤯',
  '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '💪',
  '❤️', '💔', '🔥', '⭐', '💯', '🎉', '🏆', '💰',
  '🃏', '♠️', '♥️', '♦️', '♣️', '🎰', '🎲', '🍀'
];

interface QuickEmoticonPickerProps {
  onSelect: (emoticon: string) => void;
  disabled?: boolean;
}

export const QuickEmoticonPicker = ({ onSelect, disabled = false }: QuickEmoticonPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleEmoticonClick = (emoticon: string) => {
    onSelect(emoticon);
    setIsOpen(false);
  };

  return (
    <div className="flex items-center justify-center py-1">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/20"
            title="Send emoticon"
          >
            <Smile className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-64 p-2 bg-background border-border z-50" 
          side="top"
          align="center"
        >
          <div className="grid grid-cols-8 gap-1">
            {EMOTICONS.map((emoticon) => (
              <button
                key={emoticon}
                onClick={() => handleEmoticonClick(emoticon)}
                className="text-xl hover:bg-primary/20 rounded p-1 transition-colors"
              >
                {emoticon}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
