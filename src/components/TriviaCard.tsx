import { cn } from "@/lib/utils";

interface TriviaCardProps {
  text: string;
  index: number;
  isSelected: boolean;
  isCorrect?: boolean;
  isRevealed: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

export const TriviaCard = ({
  text,
  index,
  isSelected,
  isCorrect,
  isRevealed,
  isDisabled,
  onClick,
}: TriviaCardProps) => {
  const cardLabels = ['A', 'B', 'C', 'D'];
  
  const getCardStyle = () => {
    if (isRevealed) {
      if (isCorrect) {
        return "border-green-500 bg-green-900/50 ring-2 ring-green-400";
      }
      if (isSelected && !isCorrect) {
        return "border-red-500 bg-red-900/50 ring-2 ring-red-400";
      }
      return "border-gray-600 bg-gray-800/50 opacity-50";
    }
    
    if (isSelected) {
      return "border-poker-gold bg-amber-900/60 ring-2 ring-poker-gold";
    }
    
    return "border-amber-600/50 bg-amber-900/30 hover:bg-amber-900/50 hover:border-poker-gold";
  };

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        "relative w-full p-4 rounded-xl border-2 transition-all duration-300",
        "flex items-start gap-3 text-left",
        getCardStyle(),
        isDisabled && !isRevealed && "cursor-not-allowed opacity-70"
      )}
    >
      <span className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
        isRevealed && isCorrect 
          ? "bg-green-500 text-white" 
          : isRevealed && isSelected && !isCorrect
            ? "bg-red-500 text-white"
            : isSelected 
              ? "bg-poker-gold text-black"
              : "bg-amber-800 text-amber-200"
      )}>
        {cardLabels[index]}
      </span>
      <span className={cn(
        "text-base font-medium flex-1",
        isRevealed && isCorrect 
          ? "text-green-200" 
          : isRevealed && isSelected && !isCorrect
            ? "text-red-200"
            : "text-amber-100"
      )}>
        {text}
      </span>
      {isRevealed && isCorrect && (
        <span className="text-2xl">✓</span>
      )}
      {isRevealed && isSelected && !isCorrect && (
        <span className="text-2xl">✗</span>
      )}
    </button>
  );
};
