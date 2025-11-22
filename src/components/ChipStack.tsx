interface ChipStackProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
}

export const ChipStack = ({ amount, size = 'md' }: ChipStackProps) => {
  const getChipColor = (value: number) => {
    if (value >= 100) return 'bg-poker-chip-black';
    if (value >= 50) return 'bg-poker-chip-green';
    if (value >= 25) return 'bg-poker-chip-blue';
    if (value >= 10) return 'bg-poker-chip-red';
    return 'bg-poker-chip-white';
  };

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base'
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <div className={`${sizeClasses[size]} ${getChipColor(amount)} rounded-full border-4 border-white shadow-lg flex items-center justify-center font-bold text-white relative overflow-hidden`}>
        {/* Chip pattern */}
        <div className="absolute inset-0 border-4 border-dashed border-white/30 rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2/3 h-2/3 border-2 border-white/40 rounded-full" />
        </div>
        <span className="relative z-10 drop-shadow-lg">{amount}</span>
      </div>
    </div>
  );
};
