import { HorsesHandResultDisplay } from "@/components/HorsesHandResultDisplay";

export default function DicePreview() {
  const examples = [
    { description: "4 6s", isWinning: true },
    { description: "3 6s", isWinning: false },
    { description: "5 1s (Wilds!)", isWinning: true },
    { description: "2 4s", isWinning: false },
    { description: "6 high", isWinning: false },
    { description: "4 high", isWinning: true },
  ];

  return (
    <div className="min-h-screen bg-poker-green p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Dice Result Preview</h1>
      
      <div className="space-y-8">
        {/* On green background (like during game) */}
        <div className="bg-poker-green p-6 rounded-lg border border-white/20">
          <h2 className="text-lg text-white mb-4">On Green Background</h2>
          <div className="flex flex-wrap gap-6">
            {examples.map((ex, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <HorsesHandResultDisplay
                  description={ex.description}
                  isWinning={ex.isWinning}
                  size="md"
                />
                <span className="text-xs text-white/60">
                  {ex.isWinning ? "Winning" : "Not winning"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Size comparison */}
        <div className="bg-poker-green p-6 rounded-lg border border-white/20">
          <h2 className="text-lg text-white mb-4">Size Comparison (4 6s winning)</h2>
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-2">
              <HorsesHandResultDisplay description="4 6s" isWinning={true} size="sm" />
              <span className="text-xs text-white/60">Small</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <HorsesHandResultDisplay description="4 6s" isWinning={true} size="md" />
              <span className="text-xs text-white/60">Medium</span>
            </div>
          </div>
        </div>

        {/* Active player box simulation */}
        <div className="bg-black/40 p-4 rounded-lg border border-poker-gold max-w-xs">
          <h2 className="text-sm text-white/60 mb-2">Active Player Box Simulation</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Beat:</span>
            <HorsesHandResultDisplay description="4 6s" isWinning={true} size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
