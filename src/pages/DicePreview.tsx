import { HorsesHandResultDisplay } from "@/components/HorsesHandResultDisplay";

export default function DicePreview() {
  return (
    <div className="min-h-screen bg-poker-green p-8">
      <h1 className="text-2xl font-bold text-white mb-8">Dice Result Preview</h1>
      
      <div className="space-y-8">
        {/* Main example: 4 6s */}
        <div className="bg-poker-green p-6 rounded-lg border border-white/20">
          <h2 className="text-lg text-white mb-4">"Beat: 4 6s" (what active player sees)</h2>
          <div className="flex items-center gap-4">
            <div className="bg-black/40 p-3 rounded-lg border border-poker-gold">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <span>Beat:</span>
                <HorsesHandResultDisplay description="4 6s" isWinning={true} size="sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Other common examples */}
        <div className="bg-poker-green p-6 rounded-lg border border-white/20">
          <h2 className="text-lg text-white mb-4">Other Examples</h2>
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col items-center gap-2">
              <HorsesHandResultDisplay description="3 6s" isWinning={true} size="sm" />
              <span className="text-xs text-white/60">3 sixes</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <HorsesHandResultDisplay description="5 1s (Wilds!)" isWinning={true} size="sm" />
              <span className="text-xs text-white/60">5 ones (wild)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <HorsesHandResultDisplay description="6 high" isWinning={true} size="sm" />
              <span className="text-xs text-white/60">6 high card</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
