import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GameRulesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GameRules = ({ open, onOpenChange }: GameRulesProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">Game Rules</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="357" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="357">3-5-7</TabsTrigger>
            <TabsTrigger value="holm">Holm</TabsTrigger>
          </TabsList>
          
          <ScrollArea className="h-[60vh] mt-4">
            <TabsContent value="357" className="mt-0 space-y-4 pr-4">
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-primary">3-5-7 Overview</h3>
                <p className="text-sm text-muted-foreground">
                  A multi-round poker game where wild cards change each round. Win legs to win the game!
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Setup</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>All players ante to start</li>
                  <li>Dealer selects game configuration</li>
                  <li>Goal: Win the required number of legs</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Round 1 (3 Cards)</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Each player receives 3 cards</li>
                  <li><span className="text-primary font-medium">3s are wild</span></li>
                  <li>Decide to Stay or Fold (timer enforced)</li>
                  <li>Best 3-card hand wins</li>
                  <li>Only high card, one pair, and three of a kind count — straights and flushes do not</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Round 2 (5 Cards)</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Keep your 3 cards, receive 2 more (5 total)</li>
                  <li><span className="text-primary font-medium">5s are wild</span></li>
                  <li>Same Stay/Fold decision</li>
                  <li>Best 5-card hand wins</li>
                  <li>Five of a kind beats a straight flush</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Round 3 (7 Cards)</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Keep your 5 cards, receive 2 more (7 total)</li>
                  <li><span className="text-primary font-medium">7s are wild</span></li>
                  <li>Cards are revealed at showdown</li>
                  <li>Best 5-card hand (from 7 cards) wins</li>
                  <li>Five of a kind beats a straight flush</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Winning & Scoring</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li><strong>Showdown:</strong> Multiple stayers → cards stay hidden, app determines winner secretly, loser(s) pay winner directly (capped at pot max)</li>
                  <li><strong>Solo Stay:</strong> If only one player stays, they earn a leg</li>
                  <li><strong>Pussy Tax:</strong> If everyone folds, all players pay into the pot</li>
                  <li><strong>Win Condition:</strong> First player to reach required legs wins the game</li>
                  <li><strong>Ties:</strong> No money changes hands</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Special: 3-5-7 Hand</h4>
                <p className="text-sm text-muted-foreground">
                  If you're dealt a <span className="text-primary font-medium">3, 5, and 7</span> in Round 1, you instantly win the entire game and sweep the pot!
                </p>
              </div>
            </TabsContent>

            <TabsContent value="holm" className="mt-0 space-y-4 pr-4">
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-primary">Holm Overview</h3>
                <p className="text-sm text-muted-foreground">
                  A turn-based poker game where you compete against other players or "Chucky" (the house). 
                  Make your best 5-card hand from your 4 cards + community cards.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Setup</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>All players ante to start the first hand only</li>
                  <li>Buck (betting marker) starts one seat left of dealer</li>
                  <li>Each player receives 4 hole cards</li>
                  <li>4 community cards are dealt (2 face-up, 2 face-down)</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Gameplay</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Players decide one at a time, clockwise from the buck</li>
                  <li>Choose to <strong>Stay</strong> (remain in hand) or <strong>Fold</strong> (exit hand)</li>
                  <li>Timer enforced - timeout = auto-fold</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Showdown Scenarios</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li><strong>Everyone folds:</strong> Pussy tax - all players pay into pot, buck passes</li>
                  <li><strong>One player stays:</strong> Play against Chucky (4 random cards)</li>
                  <li><strong>Multiple players stay:</strong> Player vs Player showdown</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Playing Chucky</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Chucky is dealt 4 random cards</li>
                  <li>Remaining community cards are revealed</li>
                  <li><strong>Beat Chucky:</strong> You win the pot, game ends</li>
                  <li><strong>Lose/Tie to Chucky:</strong> You match the pot (capped at pot max), buck passes, game continues</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Player vs Player</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>All cards revealed, remaining community cards exposed</li>
                  <li>Best 5-card hand wins the pot</li>
                  <li>Loser(s) match the pot (capped at pot max)</li>
                  <li>Buck passes, matched amount becomes new pot</li>
                  <li><strong>Tie between players:</strong> Both play Chucky together</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Key Differences from 3-5-7</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>No wild cards</li>
                  <li>Antes only on first hand (pot carries over)</li>
                  <li>Turn-based decisions (not simultaneous)</li>
                  <li>Chucky acts as the "house" opponent</li>
                  <li>Game continues until someone beats Chucky alone</li>
                </ul>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
