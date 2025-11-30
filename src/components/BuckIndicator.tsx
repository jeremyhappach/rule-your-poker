import { DollarSign } from "lucide-react";

interface BuckIndicatorProps {
  show: boolean;
}

export const BuckIndicator = ({ show }: BuckIndicatorProps) => {
  if (!show) return null;

  return (
    <div className="absolute -top-3 -right-3 z-30">
      <div className="bg-green-600 text-white rounded-full p-2 shadow-lg border-2 border-green-400 animate-pulse">
        <DollarSign className="w-4 h-4" />
      </div>
    </div>
  );
};
