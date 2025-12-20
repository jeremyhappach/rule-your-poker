import { useState } from 'react';

// Common emoticons for quick selection
const QUICK_EMOTICONS = ['😀', '😂', '😎', '🔥', '👍', '👎', '💰', '🃏'];

interface QuickEmoticonPickerProps {
  onSelect: (emoticon: string) => void;
  disabled?: boolean;
}

export const QuickEmoticonPicker = ({ onSelect, disabled = false }: QuickEmoticonPickerProps) => {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1">
      {QUICK_EMOTICONS.map((emoticon) => (
        <button
          key={emoticon}
          onClick={() => !disabled && onSelect(emoticon)}
          disabled={disabled}
          className={`
            w-8 h-8 rounded-full flex items-center justify-center text-lg
            transition-all duration-150
            ${disabled 
              ? 'opacity-50 cursor-not-allowed' 
              : 'hover:bg-primary/20 hover:scale-110 active:scale-95 cursor-pointer'
            }
          `}
        >
          {emoticon}
        </button>
      ))}
    </div>
  );
};
