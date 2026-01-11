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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="357" className="text-xs sm:text-sm px-1 sm:px-3">3-5-7</TabsTrigger>
            <TabsTrigger value="holm" className="text-xs sm:text-sm px-1 sm:px-3">Holm</TabsTrigger>
            <TabsTrigger value="horses" className="text-xs sm:text-sm px-1 sm:px-3">Horses</TabsTrigger>
            <TabsTrigger value="scc" className="text-xs sm:text-sm px-1 sm:px-3">SCC</TabsTrigger>
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
                  <li><strong>Showdown:</strong> Multiple stayers → loser(s) pay winner directly (capped at pot max)</li>
                  <li><strong>Solo Stay:</strong> If only one player stays, they earn a leg</li>
                  <li><strong>Pussy Tax:</strong> If everyone folds, all players pay into the pot</li>
                  <li><strong>Win Condition:</strong> First player to reach required legs wins the pot and all player legs</li>
                  <li><strong>Ties:</strong> No money changes hands</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Special: 3-5-7 Hand</h4>
                <p className="text-sm text-muted-foreground">
                  If you're dealt a <span className="text-primary font-medium">3, 5, and 7</span> in Round 1, you instantly win the entire game and sweep the pot and all legs!
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
                  <li>Players decide one at a time, clockwise starting with the buck</li>
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
                  <li>Chucky is dealt 4 random cards (could differ based on dealer game configuration)</li>
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
                  <li>Loser(s) match the pot (capped at pot max); winner takes the pot</li>
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

            <TabsContent value="horses" className="mt-0 space-y-4 pr-4">
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-primary">Horses Overview</h3>
                <p className="text-sm text-muted-foreground">
                  A dice game where players roll to get the best hand. Highest hand wins the pot!
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Setup</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>All players ante to start</li>
                  <li>Each player gets 5 dice and 3 rolls per turn</li>
                  <li>Players take turns clockwise from the dealer</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Rolling</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Roll all 5 dice on your first roll</li>
                  <li>After each roll, choose which dice to <strong>freeze</strong> (keep)</li>
                  <li>Re-roll any unfrozen dice (up to 3 total rolls)</li>
                  <li>You can stop rolling early if you're satisfied</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Hand Rankings (Best to Worst)</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li><span className="text-primary font-medium">Five of a Kind</span> - All 5 dice match (e.g., 6-6-6-6-6)</li>
                  <li><span className="text-primary font-medium">Four of a Kind</span> - 4 dice match</li>
                  <li><span className="text-primary font-medium">Straight</span> - 1-2-3-4-5 or 2-3-4-5-6</li>
                  <li><span className="text-primary font-medium">Three of a Kind</span> - 3 dice match</li>
                  <li><span className="text-primary font-medium">Two Pair</span> - 2 pairs of matching dice</li>
                  <li><span className="text-primary font-medium">One Pair</span> - 2 dice match</li>
                  <li><span className="text-primary font-medium">High Dice</span> - No matches, highest die wins</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Winning</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>After all players roll, highest hand wins the pot</li>
                  <li>Ties go to the higher dice within the hand type</li>
                  <li><strong>Tie:</strong> Everyone re-antes and rolls again (pot carries over)</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="scc" className="mt-0 space-y-4 pr-4">
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-primary">Ship Captain Crew Overview</h3>
                <p className="text-sm text-muted-foreground">
                  A dice game where you must qualify by rolling Ship (6), Captain (5), and Crew (4) in order. 
                  Your remaining two dice become your cargo (score).
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Setup</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>All players ante to start</li>
                  <li>Each player gets 5 dice and 3 rolls per turn</li>
                  <li>Players take turns clockwise from the dealer</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Qualifying (6-5-4)</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>You <strong>must</strong> roll a <span className="text-primary font-medium">6 (Ship)</span> first</li>
                  <li>Then roll a <span className="text-primary font-medium">5 (Captain)</span></li>
                  <li>Then roll a <span className="text-primary font-medium">4 (Crew)</span></li>
                  <li>These must be obtained <strong>in order</strong> - you cannot keep a 5 before getting a 6</li>
                  <li>Once rolled, 6-5-4 are automatically frozen</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Cargo (Scoring)</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>After qualifying (6-5-4), your remaining 2 dice are your <strong>cargo</strong></li>
                  <li>Your score is the <strong>sum</strong> of your cargo dice (max 12)</li>
                  <li>You can re-roll cargo dice to try for a higher score</li>
                  <li>Best possible cargo: 6 + 6 = <span className="text-primary font-medium">12</span></li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">No Qualify (NQ)</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>If you cannot roll 6-5-4 in order within 3 rolls, you <strong>do not qualify</strong></li>
                  <li>Your hand shows as <span className="text-destructive font-medium">NQ</span> (No Qualify)</li>
                  <li>Any qualified hand beats an NQ hand</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Winning</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Highest cargo sum among qualified players wins</li>
                  <li>Qualified hands always beat NQ hands</li>
                  <li><strong>Tie:</strong> Everyone re-antes and rolls again (pot carries over)</li>
                  <li><strong>All NQ:</strong> Everyone re-antes and rolls again (pot carries over)</li>
                </ul>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
