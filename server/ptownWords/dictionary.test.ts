import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {ENABLE2K, dictionaryForMatch, dictionaryRefForNewMatch, verifiedDictionary} from './dictionary.ts';
import {validatePlacementWords, wordsForPlacement} from './placementWords.ts';
import type {BoardTile, Placement} from './placementWords.ts';

const root = new URL('./dictionaries/enable2k-1/', import.meta.url);
const bytes = readFileSync(new URL('words.txt', root));
const dictionary = dictionaryForMatch(ENABLE2K);
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const tile = (letter: string, blank = false): BoardTile => ({letter, blank});
const place = (row: number, column: number, letter: string, blank = false): Placement => ({row, column, letter, blank});
const empty = (): (BoardTile | null)[] => Array.from({length: 225}, () => null);

test('the entire master list, source archive and unchanged notice match the pinned checksums', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  const archive = readFileSync(new URL('enable2k.txt.gz', root));
  const source = gunzipSync(archive), notice = readFileSync(new URL('README-enable2k.txt', root));
  assert.equal(digest(archive), manifest.archiveSha256);
  assert.equal(digest(source), manifest.sourceSha256);
  assert.equal(digest(notice), manifest.noticeSha256);
  assert.equal(digest(bytes), ENABLE2K.dictionarySha256);
  assert.equal(manifest.sha256, ENABLE2K.dictionarySha256);
  const normalized = source.toString('utf8').trimEnd().split(/\r?\n/).map(w => w.toUpperCase()).sort();
  assert.equal(normalized.length, 173528);
  assert.equal(bytes.toString('utf8'), normalized.join('\n') + '\n');
  assert.equal(dictionary.size, 173528);
  assert.ok(normalized.every(word => dictionary.has(word)));
  assert.equal(Math.max(...normalized.filter(w => w.length > 15).map(w => w.length)), 28);
  assert.match(notice.toString('utf8'), /formally released\s+into the Public Domain/);
});

test('obscure words remain legal; newer tournament additions are not silently supplemented', () => {
  for (const word of ['AA', 'XYLYL', 'QUIXOTRY', 'ZYZZYVA', 'ZYZZYVAS']) assert.equal(dictionary.has(word), true, word);
  for (const word of ['QI', 'ZA', 'CATZZZ', 'ZZZZZZ']) assert.equal(dictionary.has(word), false, word);
});

test('lookup is ASCII case-insensitive without trimming, punctuation stripping or Unicode folding', () => {
  assert.equal(dictionary.has('cAt'), true);
  for (const word of ['', ' CAT', 'CAT ', 'C-AT', 'CÁT', 'ＣＡＴ', 'C\nAT', null, 42]) assert.equal(dictionary.has(word), false);
  assert.equal(dictionary.validateWords([]).valid, false);
  assert.deepEqual(dictionary.validateWords(['CAT', 'QO']), {valid: false, invalidWords: ['QO']});
});

test('match ref is immutable and exact; unknown versions and corrupt artifacts fail closed', () => {
  const ref = dictionaryRefForNewMatch();
  assert.equal(Object.isFrozen(ref), true);
  assert.equal(dictionaryForMatch(ref), dictionary);
  assert.throws(() => dictionaryForMatch({...ref, dictionaryId: 'enable2k/2'}), /unsupported_dictionary/);
  assert.throws(() => dictionaryForMatch({...ref, dictionarySha256: '0'.repeat(64)}), /unsupported_dictionary/);
  assert.throws(() => verifiedDictionary(Buffer.from('CAT\n'), ref), /dictionary_integrity/);
});

test('primary word and multiple perpendicular words are all derived and validated', () => {
  const board = empty(); board[6 * 15 + 7] = tile('A'); board[6 * 15 + 8] = tile('T');
  const before = JSON.stringify(board);
  const result = validatePlacementWords(ENABLE2K, board, [place(7, 7, 'T'), place(7, 8, 'O')]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.words.map(w => w.text).sort(), ['AT', 'TO', 'TO']);
  assert.equal(JSON.stringify(board), before);
});

test('a valid primary word is rejected when a newly formed perpendicular word is invalid', () => {
  const board = empty(); board[6 * 15 + 7] = tile('A'); board[6 * 15 + 8] = tile('T');
  const result = validatePlacementWords(ENABLE2K, board, [place(7, 7, 'A'), place(7, 8, 'X')]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.invalidWords, ['TX']);
  assert.ok(result.words.some(w => w.text === 'AX'));
});

test('single intersecting placement checks both words and respects an assigned blank', () => {
  const board = empty(); board[7 * 15 + 6] = tile('C'); board[7 * 15 + 8] = tile('T');
  board[6 * 15 + 7] = tile('B'); board[8 * 15 + 7] = tile('R');
  const result = validatePlacementWords(ENABLE2K, board, [place(7, 7, 'A', true)]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.words.map(w => w.text).sort(), ['BAR', 'CAT']);
  assert.throws(() => wordsForPlacement(board, [place(7, 7, '?', true)]), /invalid_placement/);
});

test('board edges, empty runs, occupied squares and duplicate placements cannot corrupt extraction', () => {
  const board = empty(); board[0] = tile('A');
  assert.equal(validatePlacementWords(ENABLE2K, board, [place(0, 1, 'T')]).valid, true);
  assert.equal(validatePlacementWords(ENABLE2K, empty(), [place(14, 14, 'A')]).valid, false);
  assert.throws(() => wordsForPlacement(board, [place(0, 0, 'T')]), /occupied_square/);
  assert.throws(() => wordsForPlacement(board, [place(15, 0, 'T')]), /invalid_placement/);
  assert.throws(() => wordsForPlacement(board, [place(0, 1, 'T'), place(0, 1, 'T')]), /occupied_square/);
});
