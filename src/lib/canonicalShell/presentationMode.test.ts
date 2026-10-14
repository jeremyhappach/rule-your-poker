import { describe, expect, it } from 'vitest';
import { resolvePresentationMode, type GamePresentationMetadata } from './presentationMode';
const tableGames = ['3-5-7','cribbage','farkle','gin-rummy','holm','horses','ship-captain-crew','yahtzee'];
const catalog = [...tableGames.map(game_type => ({game_type,presentation_mode:'table'})),{game_type:'run21',presentation_mode:'fullscreen'}];
describe('catalog presentation routing', () => {
  it.each([...tableGames,'holm-game','357','3-5-7-game'])('%s retains the table', type => {
    expect(resolvePresentationMode(catalog,type,'dealer-game','in_progress')).toBe('table');
  });
  it('uses catalog values rather than game-name exceptions', () => {
    expect(resolvePresentationMode(catalog,'run21','dealer-game','in_progress')).toBe('fullscreen');
    expect(resolvePresentationMode([{game_type:'run21',presentation_mode:'table'}],'run21','dealer-game','in_progress')).toBe('table');
    expect(resolvePresentationMode([{game_type:'future-test',presentation_mode:'fullscreen'}],'future-test','dealer-game','in_progress')).toBe('fullscreen');
  });
  it.each(([[],[{game_type:'run21'}],[{game_type:'run21',presentation_mode:null}],[{game_type:'run21',presentation_mode:'invalid'}]] as GamePresentationMetadata[][]).map(rows=>({rows})))('falls back safely for missing or invalid metadata $rows', ({rows}) => {
    expect(resolvePresentationMode(rows,'run21','dealer-game','in_progress')).toBe('table');
  });
  it.each(['waiting','waiting_for_players','dealer_selection','game_selection','configuring'])('keeps %s lifecycle on the existing table', status => {
    expect(resolvePresentationMode(catalog,'run21','old-dealer-game',status)).toBe('table');
  });
  it('does not reuse a stale fullscreen game when its committed identity clears', () => {
    expect(resolvePresentationMode(catalog,'run21',null,'game_over')).toBe('table');
    expect(resolvePresentationMode(catalog,'run21',null,'session_ended',true)).toBe('fullscreen');
    expect(resolvePresentationMode(catalog,'holm-game','new-dealer-game','in_progress')).toBe('table');
  });
});
