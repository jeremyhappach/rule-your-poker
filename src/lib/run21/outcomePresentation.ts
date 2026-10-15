import type {Config, Result} from './model';

/** Read the match's frozen scoring table; this never changes action legality. */
export function qualificationThreshold(config: Config): number {
  return Math.min(...Object.keys(config.multipliers).filter(value => config.multipliers[+value] > 0).map(Number));
}

export function outcomePresentation(result: Result, name: string) {
  if (result.score > 0) return {kind: 'score', title: `${name} scored ${result.aggregate}!`, announcement: `${name} scored ${result.aggregate}!`};
  if (result.reason === 'bust') return {kind: 'bust', title: 'Busted!', announcement: `${name} busted!`};
  return {kind: 'no-qualify', title: 'No Qualify!', announcement: `${name} did not qualify.${result.reason === 'timeout' ? ' Time expired.' : ''}`};
}
