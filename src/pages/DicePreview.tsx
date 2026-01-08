import { HorsesHandResultDisplay } from "@/components/HorsesHandResultDisplay";

export default function DicePreview() {
  return (
    <div className="min-h-screen bg-poker-green p-8">
      <h1 className="text-2xl font-bold text-white mb-8">4 6s Preview</h1>
      
      <div className="flex gap-12">
        <div className="flex flex-col items-center gap-4">
          <span className="text-white text-lg">Winning Hand</span>
          <HorsesHandResultDisplay description="4 6s" isWinning={true} size="md" />
        </div>
        
        <div className="flex flex-col items-center gap-4">
          <span className="text-white text-lg">Not Winning</span>
          <HorsesHandResultDisplay description="4 6s" isWinning={false} size="md" />
        </div>
      </div>
    </div>
  );
}
