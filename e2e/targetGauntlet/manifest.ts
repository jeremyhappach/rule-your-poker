import type { DealerGameType } from '../liveness/support/twoClientSession';

export type TargetFixtureProfile =
  | `yahtzee:category:${YahtzeeCategory}`
  | 'yahtzee:scratch:yahtzee'
  | 'yahtzee:upper:below'
  | 'yahtzee:upper:threshold'
  | 'yahtzee:joker:forced'
  | 'yahtzee:terminal:unique'
  | 'yahtzee:terminal:tie'
  | 'holm:solo:win'
  | 'holm:solo:loss'
  | 'holm:solo:tie'
  | 'holm:multi:unique'
  | 'holm:multi:partial_tie'
  | 'holm:multi:all_tie_human_win'
  | 'holm:multi:all_tie_chucky_win'
  | 'holm:multi:all_tie_chucky_tie'
  | '357:multi:unique'
  | '357:multi:tie'
  | '357:round:progression'
  | '357:round:rollover'
  | '357:terminal:instant_sweep';

export type YahtzeeCategory =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'three_of_a_kind' | 'four_of_a_kind' | 'full_house'
  | 'small_straight' | 'large_straight' | 'yahtzee' | 'chance';

export type TargetGauntletScenario = {
  id: string;
  gameType: Extract<DealerGameType, 'yahtzee' | 'holm-game' | '3-5-7'>;
  program:
    | 'yahtzee-score'
    | 'holm-fold-fold'
    | 'holm-stay-fold'
    | 'holm-stay-stay'
    | 'holm-next-hand'
    | '357-fold-fold'
    | '357-stay-fold'
    | '357-stay-stay'
    | '357-progression'
    | '357-rollover'
    | '357-instant-sweep';
  fixtureProfile?: TargetFixtureProfile;
  yahtzeeCategory?: YahtzeeCategory;
  expectYahtzeeScratch?: boolean;
  expectYahtzeeTie?: boolean;
  expectJokerForced?: boolean;
  config?: {
    pussyTax?: boolean;
    rabbitHunt?: boolean;
    potMax?: boolean;
    chuckyCards?: number;
    revealAtShowdown?: boolean;
    legsToWin?: number;
    legValue?: number;
    rolloverAmount?: number;
  };
  coverage: readonly string[];
};

const YAHTZEE_CATEGORIES: readonly YahtzeeCategory[] = [
  'ones','twos','threes','fours','fives','sixes','three_of_a_kind',
  'four_of_a_kind','full_house','small_straight','large_straight','yahtzee','chance',
];

const yahtzeeCategoryRows: TargetGauntletScenario[] = YAHTZEE_CATEGORIES.map((category) => ({
  id: `yahtzee-category-${category.replaceAll('_','-')}`,
  gameType: 'yahtzee',
  program: 'yahtzee-score',
  fixtureProfile: `yahtzee:category:${category}`,
  yahtzeeCategory: category,
  coverage: ['exact-game-fixture','category-selection',category,'unique-terminal'],
}));

export const TARGET_GAUNTLET_MANIFEST: readonly TargetGauntletScenario[] = [
  ...yahtzeeCategoryRows,
  { id:'yahtzee-deliberate-scratch', gameType:'yahtzee', program:'yahtzee-score', fixtureProfile:'yahtzee:scratch:yahtzee', yahtzeeCategory:'yahtzee', expectYahtzeeScratch:true, coverage:['exact-game-fixture','zero-confirmation','deliberate-scratch'] },
  { id:'yahtzee-upper-below', gameType:'yahtzee', program:'yahtzee-score', fixtureProfile:'yahtzee:upper:below', yahtzeeCategory:'chance', coverage:['upper-subtotal-62','no-upper-bonus'] },
  { id:'yahtzee-upper-threshold', gameType:'yahtzee', program:'yahtzee-score', fixtureProfile:'yahtzee:upper:threshold', yahtzeeCategory:'ones', coverage:['upper-subtotal-63','upper-bonus'] },
  { id:'yahtzee-joker-forced', gameType:'yahtzee', program:'yahtzee-score', fixtureProfile:'yahtzee:joker:forced', yahtzeeCategory:'sixes', expectJokerForced:true, coverage:['repeat-yahtzee','yahtzee-bonus','joker-forced-upper'] },
  { id:'yahtzee-tied-scorecard-rollover', gameType:'yahtzee', program:'yahtzee-score', fixtureProfile:'yahtzee:terminal:tie', yahtzeeCategory:'chance', expectYahtzeeTie:true, coverage:['tied-scorecards','no-terminal-settlement','successor-round','identity-reset'] },

  { id:'holm-all-fold-tax-off', gameType:'holm-game', program:'holm-fold-fold', config:{pussyTax:false,rabbitHunt:false}, coverage:['all-fold','tax-off','rabbit-off','carry-forward'] },
  { id:'holm-all-fold-tax-on', gameType:'holm-game', program:'holm-fold-fold', config:{pussyTax:true,rabbitHunt:false}, coverage:['all-fold','pussy-tax','exact-transfer','carry-forward'] },
  { id:'holm-rabbit-hunt-ordering', gameType:'holm-game', program:'holm-fold-fold', config:{pussyTax:true,rabbitHunt:true}, coverage:['rabbit-hunt','ordered-community-reveal','pussy-tax','successor-dwell'] },
  { id:'holm-solo-beats-chucky', gameType:'holm-game', program:'holm-stay-fold', fixtureProfile:'holm:solo:win', coverage:['solo-stayer','chucky-loss','terminal-award'] },
  { id:'holm-solo-loses-chucky', gameType:'holm-game', program:'holm-stay-fold', fixtureProfile:'holm:solo:loss', coverage:['solo-stayer','chucky-win','replacement-pot','continuation'] },
  { id:'holm-solo-ties-chucky', gameType:'holm-game', program:'holm-stay-fold', fixtureProfile:'holm:solo:tie', coverage:['solo-stayer','chucky-tie','replacement-pot','continuation'] },
  { id:'holm-multi-unique', gameType:'holm-game', program:'holm-stay-stay', fixtureProfile:'holm:multi:unique', coverage:['multiple-stayers','unique-winner','loser-match','continuation'] },
  { id:'holm-all-tie-beat-chucky', gameType:'holm-game', program:'holm-stay-stay', fixtureProfile:'holm:multi:all_tie_human_win', coverage:['all-stayers-tie','beat-chucky','split-award'] },
  { id:'holm-all-tie-chucky-wins', gameType:'holm-game', program:'holm-stay-stay', fixtureProfile:'holm:multi:all_tie_chucky_win', coverage:['all-stayers-tie','chucky-win','replacement-pot'] },
  { id:'holm-all-tie-chucky-tie', gameType:'holm-game', program:'holm-stay-stay', fixtureProfile:'holm:multi:all_tie_chucky_tie', coverage:['all-stayers-tie','chucky-tie','replacement-pot'] },
  { id:'holm-options-000-low', gameType:'holm-game', program:'holm-fold-fold', config:{pussyTax:false,rabbitHunt:false,potMax:false,chuckyCards:2}, coverage:['pairwise-options','tax-off','rabbit-off','cap-off','chucky-min'] },
  { id:'holm-options-011-high', gameType:'holm-game', program:'holm-fold-fold', config:{pussyTax:false,rabbitHunt:true,potMax:true,chuckyCards:7}, coverage:['pairwise-options','tax-off','rabbit-on','cap-on','chucky-max'] },
  { id:'holm-options-101-high', gameType:'holm-game', program:'holm-fold-fold', config:{pussyTax:true,rabbitHunt:false,potMax:true,chuckyCards:7}, coverage:['pairwise-options','tax-on','rabbit-off','cap-on','chucky-max'] },
  { id:'holm-options-110-low', gameType:'holm-game', program:'holm-fold-fold', config:{pussyTax:true,rabbitHunt:true,potMax:false,chuckyCards:2}, coverage:['pairwise-options','tax-on','rabbit-on','cap-off','chucky-min'] },
  { id:'holm-next-hand-identity', gameType:'holm-game', program:'holm-next-hand', config:{pussyTax:false,rabbitHunt:false}, coverage:['buck-rotation','no-repeat-ante','prepared-ack','stale-artifact-retirement'] },

  { id:'357-both-fold-tax-off', gameType:'3-5-7', program:'357-fold-fold', config:{pussyTax:false}, coverage:['both-fold','tax-off','successor'] },
  { id:'357-both-fold-tax-on', gameType:'3-5-7', program:'357-fold-fold', config:{pussyTax:true}, coverage:['both-fold','pussy-tax','exact-transfer','successor'] },
  { id:'357-one-stayer-leg', gameType:'3-5-7', program:'357-stay-fold', config:{legsToWin:3}, coverage:['one-stayer','regular-leg','owned-leg-reserve','successor'] },
  { id:'357-multi-unique', gameType:'3-5-7', program:'357-stay-stay', fixtureProfile:'357:multi:unique', coverage:['multiple-stayers','unique-winner','exact-transfer','successor'] },
  { id:'357-multi-tie', gameType:'3-5-7', program:'357-stay-stay', fixtureProfile:'357:multi:tie', coverage:['multiple-stayers','tie','no-transfer','successor'] },
  { id:'357-round-progression', gameType:'3-5-7', program:'357-progression', fixtureProfile:'357:round:progression', coverage:['r1-three-cards-wild-three','r2-five-cards-wild-five','r3-seven-cards-wild-seven','deal-order'] },
  { id:'357-rollover-once', gameType:'3-5-7', program:'357-rollover', fixtureProfile:'357:round:rollover', coverage:['r3-to-r1','new-hand','rollover-once','not-opening-ante'] },
  { id:'357-instant-sweep', gameType:'3-5-7', program:'357-instant-sweep', fixtureProfile:'357:terminal:instant_sweep', coverage:['round-one-3-5-7','instant-sweep','terminal-order','reserve-settlement'] },
  { id:'357-options-000-low', gameType:'3-5-7', program:'357-stay-fold', config:{pussyTax:false,revealAtShowdown:false,potMax:false,legsToWin:1,legValue:1,rolloverAmount:1}, coverage:['pairwise-options','tax-off','reveal-off','cap-off','legs-min','values-min'] },
  { id:'357-options-011-high', gameType:'3-5-7', program:'357-fold-fold', config:{pussyTax:false,revealAtShowdown:true,potMax:true,legsToWin:5,legValue:5,rolloverAmount:5}, coverage:['pairwise-options','tax-off','reveal-on','cap-on','legs-representative','values-representative'] },
  { id:'357-options-101-high', gameType:'3-5-7', program:'357-stay-fold', config:{pussyTax:true,revealAtShowdown:false,potMax:true,legsToWin:5,legValue:5,rolloverAmount:1}, coverage:['pairwise-options','tax-on','reveal-off','cap-on','legs-representative'] },
  { id:'357-options-110-low', gameType:'3-5-7', program:'357-fold-fold', config:{pussyTax:true,revealAtShowdown:true,potMax:false,legsToWin:1,legValue:1,rolloverAmount:5}, coverage:['pairwise-options','tax-on','reveal-on','cap-off','legs-min'] },
];

export function validateTargetGauntletManifest(): void {
  const ids=new Set<string>();
  for(const row of TARGET_GAUNTLET_MANIFEST){
    if(ids.has(row.id)||!row.coverage.length) throw new Error(`Invalid target gauntlet scenario: ${row.id}`);
    ids.add(row.id);
    if(row.gameType==='yahtzee' && (!row.fixtureProfile || !row.yahtzeeCategory)){
      throw new Error(`Yahtzee target row lacks deterministic score fixture: ${row.id}`);
    }
  }
}
