import { useState } from "react";
import { DiceTableLayout } from "@/components/DiceTableLayout";
import { HorsesDie } from "@/lib/horsesGameLogic";
import { Button } from "@/components/ui/button";

// Test configurations for different held/unheld combinations
const testConfigs: { label: string; dice: HorsesDie[] }[] = [
  {
    label: "5 unheld (initial roll)",
    dice: [
      { value: 3, isHeld: false },
      { value: 6, isHeld: false },
      { value: 2, isHeld: false },
      { value: 5, isHeld: false },
      { value: 1, isHeld: false },
    ],
  },
  {
    label: "4 unheld, 1 held",
    dice: [
      { value: 6, isHeld: true },
      { value: 3, isHeld: false },
      { value: 2, isHeld: false },
      { value: 5, isHeld: false },
      { value: 1, isHeld: false },
    ],
  },
  {
    label: "3 unheld, 2 held",
    dice: [
      { value: 6, isHeld: true },
      { value: 5, isHeld: true },
      { value: 2, isHeld: false },
      { value: 4, isHeld: false },
      { value: 1, isHeld: false },
    ],
  },
  {
    label: "2 unheld, 3 held (SCC locked)",
    dice: [
      { value: 6, isHeld: true },
      { value: 5, isHeld: true },
      { value: 4, isHeld: true },
      { value: 3, isHeld: false },
      { value: 2, isHeld: false },
    ],
  },
  {
    label: "1 unheld, 4 held",
    dice: [
      { value: 6, isHeld: true },
      { value: 5, isHeld: true },
      { value: 4, isHeld: true },
      { value: 3, isHeld: true },
      { value: 1, isHeld: false },
    ],
  },
  {
    label: "All 5 held (done)",
    dice: [
      { value: 6, isHeld: true },
      { value: 5, isHeld: true },
      { value: 4, isHeld: true },
      { value: 3, isHeld: true },
      { value: 2, isHeld: true },
    ],
  },
];

export default function DicePreview() {
  const [isRolling, setIsRolling] = useState(false);

  const handleRoll = () => {
    setIsRolling(true);
    setTimeout(() => setIsRolling(false), 500);
  };

  return (
    <div className="min-h-screen bg-emerald-900 p-8">
      <h1 className="text-2xl font-bold text-white mb-4">Dice Layout Preview</h1>
      <p className="text-white/70 mb-6">Testing organic scatter layouts for different held/unheld combinations</p>
      
      <Button onClick={handleRoll} className="mb-8">
        Test Roll Animation
      </Button>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
        {testConfigs.map((config, idx) => (
          <div key={idx} className="flex flex-col items-center gap-4">
            <span className="text-white text-sm font-medium">{config.label}</span>
            <div className="bg-emerald-800/50 rounded-lg p-4 border border-emerald-700/50">
              <DiceTableLayout
                dice={config.dice}
                isRolling={isRolling && !config.dice.every(d => d.isHeld)}
                canToggle={false}
                size="sm"
                gameType="horses"
                showWildHighlight={true}
              />
            </div>
          </div>
        ))}
      </div>
      
      <h2 className="text-xl font-bold text-white mt-12 mb-4">SCC Game Variations</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
        {testConfigs.slice(0, 4).map((config, idx) => (
          <div key={`scc-${idx}`} className="flex flex-col items-center gap-4">
            <span className="text-white text-sm font-medium">{config.label} (SCC)</span>
            <div className="bg-emerald-800/50 rounded-lg p-4 border border-emerald-700/50">
              <DiceTableLayout
                dice={config.dice}
                isRolling={isRolling && !config.dice.every(d => d.isHeld)}
                canToggle={false}
                size="sm"
                gameType="ship-captain-crew"
                showWildHighlight={false}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
