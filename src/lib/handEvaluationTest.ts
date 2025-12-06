/**
 * Hand Evaluation Test Utility
 * Run this to test hand evaluation logic
 */

import { Card, evaluateHand, formatHandRankDetailed } from './cardUtils';

interface TestCase {
  name: string;
  player1Cards: Card[];
  player2Cards: Card[];
  communityCards: Card[];
  expectedWinner: 'player1' | 'player2' | 'tie';
  expectedP1Hand: string;
  expectedP2Hand: string;
}

// Test case from the screenshot
const testCases: TestCase[] = [
  {
    name: 'Screenshot: Pair of Kings vs Pair of 3s',
    player1Cards: [
      { suit: '♠', rank: '4' },
      { suit: '♦', rank: '6' },
      { suit: '♦', rank: '7' },
      { suit: '♠', rank: 'K' },
    ],
    player2Cards: [
      { suit: '♣', rank: '3' },
      { suit: '♥', rank: '5' },
      { suit: '♠', rank: '6' },
      { suit: '♥', rank: '9' },
    ],
    communityCards: [
      { suit: '♥', rank: 'Q' },
      { suit: '♦', rank: 'A' },
      { suit: '♦', rank: '3' },
      { suit: '♣', rank: 'K' },
    ],
    expectedWinner: 'player1',
    expectedP1Hand: 'Pair of Ks',
    expectedP2Hand: 'Pair of 3s',
  },
  {
    name: 'Two Pair vs One Pair',
    player1Cards: [
      { suit: '♠', rank: 'J' },
      { suit: '♦', rank: 'J' },
      { suit: '♦', rank: '8' },
      { suit: '♠', rank: '8' },
    ],
    player2Cards: [
      { suit: '♣', rank: 'A' },
      { suit: '♥', rank: 'A' },
      { suit: '♠', rank: '2' },
      { suit: '♥', rank: '3' },
    ],
    communityCards: [
      { suit: '♥', rank: 'Q' },
      { suit: '♦', rank: 'K' },
      { suit: '♦', rank: '5' },
      { suit: '♣', rank: '9' },
    ],
    expectedWinner: 'player1',
    expectedP1Hand: 'Two Pair',
    expectedP2Hand: 'Pair of As',
  },
  {
    name: 'Flush vs Straight',
    player1Cards: [
      { suit: '♥', rank: '2' },
      { suit: '♥', rank: '5' },
      { suit: '♥', rank: '7' },
      { suit: '♥', rank: '9' },
    ],
    player2Cards: [
      { suit: '♠', rank: '6' },
      { suit: '♦', rank: '7' },
      { suit: '♣', rank: '8' },
      { suit: '♠', rank: '9' },
    ],
    communityCards: [
      { suit: '♥', rank: 'J' },
      { suit: '♦', rank: '10' },
      { suit: '♠', rank: '3' },
      { suit: '♣', rank: 'K' },
    ],
    expectedWinner: 'player1',
    expectedP1Hand: 'Flush',
    expectedP2Hand: 'Straight',
  },
  {
    name: 'Full House vs Flush',
    player1Cards: [
      { suit: '♠', rank: 'K' },
      { suit: '♦', rank: 'K' },
      { suit: '♣', rank: 'K' },
      { suit: '♥', rank: '2' },
    ],
    player2Cards: [
      { suit: '♥', rank: '3' },
      { suit: '♥', rank: '5' },
      { suit: '♥', rank: '7' },
      { suit: '♥', rank: '9' },
    ],
    communityCards: [
      { suit: '♥', rank: 'J' },
      { suit: '♦', rank: '2' },
      { suit: '♠', rank: 'A' },
      { suit: '♣', rank: '4' },
    ],
    expectedWinner: 'player1',
    expectedP1Hand: 'Full House',
    expectedP2Hand: 'Flush',
  },
  {
    name: 'High Card A vs High Card K',
    player1Cards: [
      { suit: '♠', rank: 'A' },
      { suit: '♦', rank: '5' },
      { suit: '♣', rank: '7' },
      { suit: '♥', rank: '9' },
    ],
    player2Cards: [
      { suit: '♣', rank: 'K' },
      { suit: '♥', rank: '4' },
      { suit: '♠', rank: '6' },
      { suit: '♦', rank: '8' },
    ],
    communityCards: [
      { suit: '♥', rank: 'J' },
      { suit: '♦', rank: '2' },
      { suit: '♠', rank: '3' },
      { suit: '♣', rank: 'Q' },
    ],
    expectedWinner: 'player1',
    expectedP1Hand: 'A High',
    expectedP2Hand: 'K High',
  },
];

export function runHandEvaluationTests(): { passed: number; failed: number; results: string[] } {
  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  console.log('========== HAND EVALUATION TEST SUITE ==========\n');

  testCases.forEach((test, index) => {
    console.log(`\n--- Test ${index + 1}: ${test.name} ---`);

    const p1AllCards = [...test.player1Cards, ...test.communityCards];
    const p2AllCards = [...test.player2Cards, ...test.communityCards];

    console.log('P1 cards:', p1AllCards.map(c => `${c.rank}${c.suit}`).join(' '));
    console.log('P2 cards:', p2AllCards.map(c => `${c.rank}${c.suit}`).join(' '));

    const p1Eval = evaluateHand(p1AllCards, false);
    const p2Eval = evaluateHand(p2AllCards, false);

    const p1Desc = formatHandRankDetailed(p1AllCards, false);
    const p2Desc = formatHandRankDetailed(p2AllCards, false);

    console.log(`P1: ${p1Desc} (value: ${p1Eval.value})`);
    console.log(`P2: ${p2Desc} (value: ${p2Eval.value})`);

    let actualWinner: 'player1' | 'player2' | 'tie';
    if (p1Eval.value > p2Eval.value) {
      actualWinner = 'player1';
    } else if (p2Eval.value > p1Eval.value) {
      actualWinner = 'player2';
    } else {
      actualWinner = 'tie';
    }

    console.log(`Expected winner: ${test.expectedWinner}, Actual: ${actualWinner}`);

    const winnerCorrect = actualWinner === test.expectedWinner;
    const testResult = winnerCorrect ? '✅ PASS' : '❌ FAIL';

    if (winnerCorrect) {
      passed++;
    } else {
      failed++;
      console.error(`❌ FAILURE: Expected ${test.expectedWinner} but got ${actualWinner}`);
      console.error(`   P1 value: ${p1Eval.value}, P2 value: ${p2Eval.value}`);
    }

    results.push(`${testResult}: ${test.name} - P1: ${p1Desc} vs P2: ${p2Desc} - Winner: ${actualWinner}`);
  });

  console.log('\n========== TEST RESULTS ==========');
  console.log(`Passed: ${passed}/${testCases.length}`);
  console.log(`Failed: ${failed}/${testCases.length}`);
  results.forEach(r => console.log(r));

  return { passed, failed, results };
}

// Export test cases for interactive testing
export { testCases };
