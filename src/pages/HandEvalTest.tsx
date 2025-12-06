import React, { useState, useEffect } from 'react';
import { Card, evaluateHand, formatHandRankDetailed, createDeck, shuffleDeck } from '@/lib/cardUtils';
import { Button } from '@/components/ui/button';

interface TestResult {
  p1Cards: Card[];
  p2Cards: Card[];
  community: Card[];
  p1Hand: string;
  p2Hand: string;
  p1Value: number;
  p2Value: number;
  winner: string;
  correct: boolean | null;
}

const HandEvalTest: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentTest, setCurrentTest] = useState<TestResult | null>(null);

  const generateRandomHands = () => {
    const deck = shuffleDeck(createDeck());
    const p1Cards = deck.slice(0, 4);
    const p2Cards = deck.slice(4, 8);
    const community = deck.slice(8, 12);

    const p1All = [...p1Cards, ...community];
    const p2All = [...p2Cards, ...community];

    const p1Eval = evaluateHand(p1All, false);
    const p2Eval = evaluateHand(p2All, false);

    const p1Hand = formatHandRankDetailed(p1All, false);
    const p2Hand = formatHandRankDetailed(p2All, false);

    let winner: string;
    if (p1Eval.value > p2Eval.value) {
      winner = 'Player 1';
    } else if (p2Eval.value > p1Eval.value) {
      winner = 'Player 2';
    } else {
      winner = 'TIE';
    }

    const test: TestResult = {
      p1Cards,
      p2Cards,
      community,
      p1Hand,
      p2Hand,
      p1Value: p1Eval.value,
      p2Value: p2Eval.value,
      winner,
      correct: null
    };

    setCurrentTest(test);
  };

  const markResult = (isCorrect: boolean) => {
    if (currentTest) {
      const updated = { ...currentTest, correct: isCorrect };
      setResults(prev => [updated, ...prev]);
      generateRandomHands();
    }
  };

  // Run fixed test case from screenshot
  const runScreenshotTest = () => {
    const p1Cards: Card[] = [
      { suit: '♠', rank: '4' },
      { suit: '♦', rank: '6' },
      { suit: '♦', rank: '7' },
      { suit: '♠', rank: 'K' },
    ];
    const p2Cards: Card[] = [
      { suit: '♣', rank: '3' },
      { suit: '♥', rank: '5' },
      { suit: '♠', rank: '6' },
      { suit: '♥', rank: '9' },
    ];
    const community: Card[] = [
      { suit: '♥', rank: 'Q' },
      { suit: '♦', rank: 'A' },
      { suit: '♦', rank: '3' },
      { suit: '♣', rank: 'K' },
    ];

    const p1All = [...p1Cards, ...community];
    const p2All = [...p2Cards, ...community];

    console.log('=== SCREENSHOT TEST ===');
    console.log('P1 cards:', p1All.map(c => `${c.rank}${c.suit}`).join(' '));
    console.log('P2 cards:', p2All.map(c => `${c.rank}${c.suit}`).join(' '));

    const p1Eval = evaluateHand(p1All, false);
    const p2Eval = evaluateHand(p2All, false);

    console.log('P1 eval:', p1Eval);
    console.log('P2 eval:', p2Eval);

    const p1Hand = formatHandRankDetailed(p1All, false);
    const p2Hand = formatHandRankDetailed(p2All, false);

    console.log('P1 hand:', p1Hand);
    console.log('P2 hand:', p2Hand);

    let winner: string;
    if (p1Eval.value > p2Eval.value) {
      winner = 'Player 1';
    } else if (p2Eval.value > p1Eval.value) {
      winner = 'Player 2';
    } else {
      winner = 'TIE';
    }

    console.log('Winner:', winner);
    console.log('Expected: Player 1 (Pair of Ks beats Pair of 3s)');

    const test: TestResult = {
      p1Cards,
      p2Cards,
      community,
      p1Hand,
      p2Hand,
      p1Value: p1Eval.value,
      p2Value: p2Eval.value,
      winner,
      correct: winner === 'Player 1'
    };

    setCurrentTest(test);
    setResults(prev => [test, ...prev]);
  };

  useEffect(() => {
    generateRandomHands();
  }, []);

  const formatCards = (cards: Card[]) => cards.map(c => `${c.rank}${c.suit}`).join(' ');

  const suitColor = (suit: string) => (suit === '♥' || suit === '♦') ? 'text-red-500' : 'text-foreground';

  const renderCard = (card: Card) => (
    <span key={`${card.rank}${card.suit}`} className={`mx-0.5 ${suitColor(card.suit)}`}>
      {card.rank}{card.suit}
    </span>
  );

  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-2xl font-bold mb-4">Hand Evaluation Test</h1>
      
      <div className="mb-6 space-x-2">
        <Button onClick={runScreenshotTest} variant="destructive">
          Run Screenshot Test (Pair K vs Pair 3)
        </Button>
        <Button onClick={generateRandomHands}>
          Generate Random Hands
        </Button>
      </div>

      {currentTest && (
        <div className="bg-card border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current Test</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-4 bg-muted rounded">
              <h3 className="font-semibold">Player 1</h3>
              <div className="text-lg">{currentTest.p1Cards.map(renderCard)}</div>
              <div className="text-sm text-muted-foreground mt-2">
                All: {[...currentTest.p1Cards, ...currentTest.community].map(renderCard)}
              </div>
              <div className="mt-2 font-bold text-primary">{currentTest.p1Hand}</div>
              <div className="text-xs text-muted-foreground">Value: {currentTest.p1Value}</div>
            </div>
            
            <div className="p-4 bg-muted rounded">
              <h3 className="font-semibold">Player 2</h3>
              <div className="text-lg">{currentTest.p2Cards.map(renderCard)}</div>
              <div className="text-sm text-muted-foreground mt-2">
                All: {[...currentTest.p2Cards, ...currentTest.community].map(renderCard)}
              </div>
              <div className="mt-2 font-bold text-primary">{currentTest.p2Hand}</div>
              <div className="text-xs text-muted-foreground">Value: {currentTest.p2Value}</div>
            </div>
          </div>

          <div className="text-center mb-4">
            <h3 className="font-semibold">Community Cards</h3>
            <div className="text-lg">{currentTest.community.map(renderCard)}</div>
          </div>

          <div className="text-center text-xl font-bold mb-4">
            Winner: <span className="text-primary">{currentTest.winner}</span>
          </div>

          <div className="flex justify-center space-x-4">
            <Button onClick={() => markResult(true)} variant="default" className="bg-green-600 hover:bg-green-700">
              ✓ Correct
            </Button>
            <Button onClick={() => markResult(false)} variant="destructive">
              ✗ Wrong
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">
          Results: {results.filter(r => r.correct === true).length} Correct / {results.filter(r => r.correct === false).length} Wrong
        </h2>
        
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {results.map((r, i) => (
            <div key={i} className={`p-2 rounded text-sm ${r.correct === false ? 'bg-red-900/30 border border-red-500' : 'bg-green-900/30 border border-green-500'}`}>
              <div className="flex justify-between">
                <span>P1: {r.p1Hand} (val: {r.p1Value})</span>
                <span>P2: {r.p2Hand} (val: {r.p2Value})</span>
                <span className={r.correct ? 'text-green-500' : 'text-red-500'}>
                  {r.winner} {r.correct ? '✓' : '✗'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                P1: {formatCards(r.p1Cards)} | P2: {formatCards(r.p2Cards)} | Comm: {formatCards(r.community)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HandEvalTest;
