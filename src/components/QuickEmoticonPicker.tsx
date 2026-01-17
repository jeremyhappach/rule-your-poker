import { useState } from 'react';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDeviceSize } from '@/hooks/useDeviceSize';

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
  const { isTablet, isDesktop } = useDeviceSize();

  const handleEmoticonClick = (emoticon: string) => {
    onSelect(emoticon);
    setIsOpen(false);
  };

  const isLargeScreen = isTablet || isDesktop;

  return (
    <div className="flex items-center justify-center py-1">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            className={`text-muted-foreground hover:text-foreground hover:bg-primary/20 ${
              isLargeScreen ? 'h-14 w-14' : 'h-8 w-8'
            }`}
            title="Send emoticon"
          >
            <Smile className={isLargeScreen ? 'h-9 w-9' : 'h-5 w-5'} />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className={`p-2 bg-background border-border z-50 ${isLargeScreen ? 'w-96' : 'w-64'}`}
          side="top"
          align="center"
        >
          <div className="grid grid-cols-8 gap-1">
            {EMOTICONS.map((emoticon) => (
              <button
                key={emoticon}
                onClick={() => handleEmoticonClick(emoticon)}
                className={`hover:bg-primary/20 rounded p-1 transition-colors ${
                  isLargeScreen ? 'text-3xl' : 'text-xl'
                }`}
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
