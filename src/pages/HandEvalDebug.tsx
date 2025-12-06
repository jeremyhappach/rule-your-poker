import React, { useState, useCallback } from 'react';
import { Card, Suit, Rank, evaluateHand, formatHandRankDetailed, RANKS, SUITS, RANK_VALUES } from '@/lib/cardUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface PlayerInput {
  cards: string;
}

interface EvalResult {
  cards: Card[];
  rank: string;
  value: number;
  detailed: string;
  debug: string[];
}

const parseCardString = (input: string): Card[] => {
  // Parse formats like "2H 3D KC AS 10S" or "2♥ 3♦ K♣ A♠"
  const cards: Card[] = [];
  const tokens = input.trim().toUpperCase().split(/[\s,]+/);
  
  for (const token of tokens) {
    if (!token) continue;
    
    // Map suit letters to symbols
    const suitMap: Record<string, Suit> = {
      'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠',
      '♥': '♥', '♦': '♦', '♣': '♣', '♠': '♠'
    };
    
    // Try to parse rank and suit
    let rank: string = '';
    let suit: string = '';
    
    if (token.length >= 2) {
      // Check for 10
      if (token.startsWith('10')) {
        rank = '10';
        suit = token.slice(2);
      } else {
        rank = token.slice(0, -1);
        suit = token.slice(-1);
      }
    }
    
    const parsedSuit = suitMap[suit];
    const parsedRank = rank as Rank;
    
    if (parsedSuit && RANKS.includes(parsedRank)) {
      cards.push({ suit: parsedSuit, rank: parsedRank });
    }
  }
  
  return cards;
};

const HandEvalDebug: React.FC = () => {
  const [player1Input, setPlayer1Input] = useState('');
  const [player2Input, setPlayer2Input] = useState('');
  const [communityInput, setCommunityInput] = useState('');
  const [useWildcards, setUseWildcards] = useState(false);
  const [results, setResults] = useState<{ p1: EvalResult | null; p2: EvalResult | null; winner: string } | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const evaluateHands = useCallback(() => {
    const logs: string[] = [];
    const originalLog = console.log;
    
    // Capture console logs
    console.log = (...args) => {
      logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      originalLog(...args);
    };

    try {
      const p1Cards = parseCardString(player1Input);
      const p2Cards = parseCardString(player2Input);
      const community = parseCardString(communityInput);

      logs.push('=== HAND EVALUATION DEBUG ===');
      logs.push(`Player 1 hole cards: ${p1Cards.map(c => `${c.rank}${c.suit}`).join(' ')}`);
      logs.push(`Player 2 hole cards: ${p2Cards.map(c => `${c.rank}${c.suit}`).join(' ')}`);
      logs.push(`Community cards: ${community.map(c => `${c.rank}${c.suit}`).join(' ')}`);
      logs.push(`Use wildcards: ${useWildcards}`);
      logs.push('');

      const p1All = [...p1Cards, ...community];
      const p2All = [...p2Cards, ...community];

      logs.push(`P1 all cards (${p1All.length}): ${p1All.map(c => `${c.rank}${c.suit}`).join(' ')}`);
      logs.push(`P2 all cards (${p2All.length}): ${p2All.map(c => `${c.rank}${c.suit}`).join(' ')}`);
      logs.push('');

      logs.push('--- Evaluating Player 1 ---');
      const p1Eval = evaluateHand(p1All, useWildcards);
      const p1Detailed = formatHandRankDetailed(p1All, useWildcards);
      logs.push(`P1 Result: ${p1Eval.rank} (value: ${p1Eval.value})`);
      logs.push(`P1 Detailed: ${p1Detailed}`);
      logs.push('');

      logs.push('--- Evaluating Player 2 ---');
      const p2Eval = evaluateHand(p2All, useWildcards);
      const p2Detailed = formatHandRankDetailed(p2All, useWildcards);
      logs.push(`P2 Result: ${p2Eval.rank} (value: ${p2Eval.value})`);
      logs.push(`P2 Detailed: ${p2Detailed}`);
      logs.push('');

      logs.push('--- Comparison ---');
      logs.push(`P1 value: ${p1Eval.value}`);
      logs.push(`P2 value: ${p2Eval.value}`);
      logs.push(`Difference: ${p1Eval.value - p2Eval.value}`);

      let winner: string;
      if (p1Eval.value > p2Eval.value) {
        winner = 'Player 1 WINS';
        logs.push('Winner: Player 1');
      } else if (p2Eval.value > p1Eval.value) {
        winner = 'Player 2 WINS';
        logs.push('Winner: Player 2');
      } else {
        winner = 'TIE';
        logs.push('Result: TIE');
      }

      setResults({
        p1: {
          cards: p1All,
          rank: p1Eval.rank,
          value: p1Eval.value,
          detailed: p1Detailed,
          debug: []
        },
        p2: {
          cards: p2All,
          rank: p2Eval.rank,
          value: p2Eval.value,
          detailed: p2Detailed,
          debug: []
        },
        winner
      });

      setDebugLogs(logs);
    } catch (e) {
      logs.push(`ERROR: ${e}`);
      setDebugLogs(logs);
    } finally {
      console.log = originalLog;
    }
  }, [player1Input, player2Input, communityInput, useWildcards]);

  const loadExample = (example: 'tie-bug' | 'pair-vs-pair' | 'flush-vs-straight' | 'full-house') => {
    switch (example) {
      case 'tie-bug':
        // From screenshot: Player has 2H 3S KS, community has (need to check)
        setPlayer1Input('2H 3S KS');
        setPlayer2Input('');
        setCommunityInput('');
        break;
      case 'pair-vs-pair':
        setPlayer1Input('KS 4S 6D 7D');
        setPlayer2Input('3C 5H 6S 9H');
        setCommunityInput('QH AD 3D KC');
        break;
      case 'flush-vs-straight':
        setPlayer1Input('2H 5H 7H 9H');
        setPlayer2Input('4D 5S 6C 7D');
        setCommunityInput('3H 8D QS KH');
        break;
      case 'full-house':
        setPlayer1Input('KS KD 3H 3D');
        setPlayer2Input('AS 2D 4C 5H');
        setCommunityInput('KC 3C 7S 9D');
        break;
    }
  };

  const renderCard = (card: Card) => {
    const isRed = card.suit === '♥' || card.suit === '♦';
    return (
      <span 
        key={`${card.rank}${card.suit}`} 
        className={`inline-block px-2 py-1 mx-0.5 rounded border ${isRed ? 'text-red-500 border-red-500/30' : 'text-foreground border-border'} bg-card`}
      >
        {card.rank}{card.suit}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">8-Card Hand Evaluation Debugger</h1>
        <p className="text-muted-foreground mb-6">
          Enter cards in format: 2H 3D KC AS 10S (rank + suit letter: H/D/C/S)
        </p>

        <div className="grid gap-4 mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="p1">Player 1 Hole Cards (4 cards)</Label>
              <Input
                id="p1"
                value={player1Input}
                onChange={(e) => setPlayer1Input(e.target.value)}
                placeholder="e.g., 2H 3D KC AS"
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="p2">Player 2 Hole Cards (4 cards)</Label>
              <Input
                id="p2"
                value={player2Input}
                onChange={(e) => setPlayer2Input(e.target.value)}
                placeholder="e.g., 5H 6S 7C 8D"
                className="font-mono"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="community">Community Cards (4 cards)</Label>
            <Input
              id="community"
              value={communityInput}
              onChange={(e) => setCommunityInput(e.target.value)}
              placeholder="e.g., QH JD 10C 9S"
              className="font-mono"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="wildcards"
              checked={useWildcards}
              onCheckedChange={setUseWildcards}
            />
            <Label htmlFor="wildcards">Use Wildcards (3s/5s/7s based on card count)</Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <Button onClick={evaluateHands} className="bg-primary">
            Evaluate Hands
          </Button>
          <Button onClick={() => loadExample('pair-vs-pair')} variant="outline">
            Load: Pair vs Pair
          </Button>
          <Button onClick={() => loadExample('flush-vs-straight')} variant="outline">
            Load: Flush vs Straight
          </Button>
          <Button onClick={() => loadExample('full-house')} variant="outline">
            Load: Full House
          </Button>
        </div>

        {results && (
          <div className="space-y-4 mb-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-lg border ${results.winner.includes('1') ? 'border-green-500 bg-green-500/10' : 'border-border'}`}>
                <h3 className="font-semibold mb-2">Player 1</h3>
                <div className="mb-2">{results.p1?.cards.map(renderCard)}</div>
                <div className="text-lg font-bold text-primary">{results.p1?.detailed}</div>
                <div className="text-sm text-muted-foreground">
                  Rank: {results.p1?.rank} | Value: {results.p1?.value}
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${results.winner.includes('2') ? 'border-green-500 bg-green-500/10' : 'border-border'}`}>
                <h3 className="font-semibold mb-2">Player 2</h3>
                <div className="mb-2">{results.p2?.cards.map(renderCard)}</div>
                <div className="text-lg font-bold text-primary">{results.p2?.detailed}</div>
                <div className="text-sm text-muted-foreground">
                  Rank: {results.p2?.rank} | Value: {results.p2?.value}
                </div>
              </div>
            </div>

            <div className={`text-center text-2xl font-bold p-4 rounded-lg ${
              results.winner === 'TIE' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'
            }`}>
              {results.winner}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Debug Logs</h2>
          <div className="bg-card border rounded-lg p-4 font-mono text-xs max-h-96 overflow-y-auto whitespace-pre-wrap">
            {debugLogs.length > 0 ? debugLogs.join('\n') : 'Run evaluation to see debug logs...'}
          </div>
        </div>

        <div className="mt-8 p-4 bg-muted rounded-lg">
          <h3 className="font-semibold mb-2">Quick Reference</h3>
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>Suits:</strong> H = Hearts (♥), D = Diamonds (♦), C = Clubs (♣), S = Spades (♠)</p>
            <p><strong>Ranks:</strong> 2-10, J, Q, K, A</p>
            <p><strong>Examples:</strong> 2H = 2♥, KS = K♠, 10D = 10♦, AC = A♣</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HandEvalDebug;
