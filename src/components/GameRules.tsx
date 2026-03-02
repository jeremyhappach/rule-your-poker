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
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="357" className="text-[10px] sm:text-sm px-0.5 sm:px-2">3-5-7</TabsTrigger>
            <TabsTrigger value="holm" className="text-[10px] sm:text-sm px-0.5 sm:px-2">Holm</TabsTrigger>
            <TabsTrigger value="horses" className="text-[10px] sm:text-sm px-0.5 sm:px-2">Horses</TabsTrigger>
            <TabsTrigger value="scc" className="text-[10px] sm:text-sm px-0.5 sm:px-2">SCC</TabsTrigger>
            <TabsTrigger value="cribbage" className="text-[10px] sm:text-sm px-0.5 sm:px-2">Crib</TabsTrigger>
            <TabsTrigger value="gin-rummy" className="text-[10px] sm:text-sm px-0.5 sm:px-2">Gin</TabsTrigger>
            <TabsTrigger value="yahtzee" className="text-[10px] sm:text-sm px-0.5 sm:px-2">Yahtzee</TabsTrigger>
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
                  <li><strong>Note:</strong> Both cargo dice must be held or re-rolled together — you cannot freeze individual cargo dice</li>
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

            <TabsContent value="cribbage" className="mt-0 space-y-4 pr-4">
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-primary">Cribbage Overview</h3>
                <p className="text-sm text-muted-foreground">
                  A classic card game combining pegging and hand-counting. First to the target score wins!
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Setup</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>2–4 players; dealer rotates each hand</li>
                  <li>Players draw for the button (Ace high) to determine first dealer</li>
                  <li>Game modes: Full (121), Half (61), Quick (45), Sprint (31)</li>
                  <li>All players ante to start</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">The Deal & Crib</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>2 players: 6 cards each, discard 2 to the <strong>crib</strong></li>
                  <li>3 players: 5 cards each, discard 1 to the crib (+ 1 from the deck)</li>
                  <li>4 players: 5 cards each, discard 1 to the crib</li>
                  <li>The crib belongs to the dealer and is scored at the end</li>
                  <li>A <strong>starter card</strong> (cut card) is flipped from the deck — if it's a Jack, dealer pegs 2 ("His Heels")</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Pegging (The Play)</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Players alternate playing cards, keeping a running count (max 31)</li>
                  <li><strong>15:</strong> 2 points for hitting exactly 15</li>
                  <li><strong>31:</strong> 2 points for hitting exactly 31</li>
                  <li><strong>Pairs:</strong> 2 pts (pair), 6 pts (three of a kind), 12 pts (four of a kind)</li>
                  <li><strong>Runs:</strong> 1 pt per card in a run of 3+ (cards don't need to be in order)</li>
                  <li><strong>Go:</strong> If you can't play without exceeding 31, say "Go" — opponent pegs 1</li>
                  <li><strong>Last Card:</strong> 1 point for playing the last card (if not 31)</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Counting (Hand Scoring)</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>After pegging, hands are scored using 4 hand cards + the starter card</li>
                  <li><strong>15s:</strong> 2 pts for each combination totaling 15</li>
                  <li><strong>Pairs:</strong> 2 pts per pair</li>
                  <li><strong>Runs:</strong> 1 pt per card in runs of 3+</li>
                  <li><strong>Flush:</strong> 4 pts if all hand cards match suit (5 if starter matches too)</li>
                  <li><strong>"His Nobs":</strong> 1 pt for a Jack in hand matching the starter's suit</li>
                  <li>Order: Non-dealer → Dealer's hand → Dealer's crib</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Skunking</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li><strong>Skunk:</strong> If the loser fails to pass the skunk threshold, the winner earns a 2× multiplier on the ante</li>
                  <li><strong>Double Skunk:</strong> If enabled, failing to pass a lower threshold earns a 3× multiplier</li>
                  <li>Available in Full (121) and Half (61) game modes</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="gin-rummy" className="mt-0 space-y-4 pr-4">
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-primary">Gin Rummy Overview</h3>
                <p className="text-sm text-muted-foreground">
                  A two-player card game where you form melds (sets and runs) to reduce deadwood. First to the match target wins!
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Setup</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>2 players; dealer alternates each hand</li>
                  <li>10 cards dealt to each player</li>
                  <li>One card placed face-up to start the discard pile</li>
                  <li>Match targets: 50 or 100 points</li>
                  <li>Players ante at the start of the match</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Gameplay</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>On your turn, <strong>draw</strong> from the stock pile or the discard pile</li>
                  <li>Then <strong>discard</strong> one card</li>
                  <li>Form <strong>melds</strong>: sets (3–4 of same rank) or runs (3+ consecutive same suit)</li>
                  <li><strong>Deadwood:</strong> Cards not in melds — face cards = 10, Ace = 1, others = face value</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Knocking & Gin</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li><strong>Knock:</strong> End the hand if your deadwood ≤ 10 points</li>
                  <li><strong>Gin:</strong> Knock with 0 deadwood — earns a bonus (configurable, default 25 pts)</li>
                  <li>After a knock, the opponent can <strong>lay off</strong> their deadwood cards onto the knocker's melds</li>
                  <li>Layoffs are <strong>not</strong> allowed against Gin</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Scoring</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li><strong>Knock win:</strong> Difference between deadwood totals</li>
                  <li><strong>Undercut:</strong> If opponent's deadwood ≤ knocker's after layoffs, opponent wins the difference + undercut bonus (configurable, default 25 pts)</li>
                  <li><strong>Gin bonus:</strong> Knocker's bonus + opponent's full deadwood</li>
                  <li>Points accumulate across hands until the match target is reached</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Winning</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>First player to reach the match target (50 or 100 pts) wins</li>
                  <li>Winner collects the ante from the loser</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="yahtzee" className="mt-0 space-y-4 pr-4">
              <div className="space-y-3">
                <h3 className="font-bold text-lg text-primary">Yahtzee Overview</h3>
                <p className="text-sm text-muted-foreground">
                  A classic dice game with 13 scoring categories. Highest total score wins!
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Setup</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>2+ players; all ante to start</li>
                  <li>Each player takes 13 turns (one per category)</li>
                  <li>5 dice, up to 3 rolls per turn</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Rolling</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Roll all 5 dice on your first roll</li>
                  <li>After each roll, hold any dice you want to keep</li>
                  <li>Re-roll the rest (up to 3 total rolls)</li>
                  <li>After your rolls, choose a scoring category</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Upper Section</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li><strong>Ones–Sixes:</strong> Sum of the matching dice (e.g., three 4s = 12)</li>
                  <li><strong>Bonus:</strong> Score 63+ in the upper section to earn a <span className="text-primary font-medium">+35 bonus</span></li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Lower Section</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li><strong>Three of a Kind:</strong> 3 matching dice → sum of all dice</li>
                  <li><strong>Four of a Kind:</strong> 4 matching dice → sum of all dice</li>
                  <li><strong>Full House:</strong> 3 of one + 2 of another → <span className="text-primary font-medium">25 pts</span></li>
                  <li><strong>Sm Straight:</strong> 4 sequential dice → <span className="text-primary font-medium">30 pts</span></li>
                  <li><strong>Lg Straight:</strong> 5 sequential dice → <span className="text-primary font-medium">40 pts</span></li>
                  <li><strong>Yahtzee:</strong> All 5 dice match → <span className="text-primary font-medium">50 pts</span></li>
                  <li><strong>Chance:</strong> Sum of all dice (no requirements)</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Yahtzee Bonus & Joker Rules</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>If you already scored 50 in Yahtzee and roll another, you earn a <span className="text-primary font-medium">+100 bonus</span></li>
                  <li><strong>Joker rule:</strong> You must use the matching upper category if it's open</li>
                  <li>If the matching upper is filled, you may use any open lower category at <strong>full value</strong> (e.g., Full House = 25 even without the right shape)</li>
                  <li>If all lower categories are filled, use any open upper category</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Winning</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  <li>After all 13 categories are filled, totals are calculated</li>
                  <li>Highest total score wins the pot</li>
                </ul>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
