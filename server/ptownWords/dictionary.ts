import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

/** Server-only vocabulary. Never import this module from src/ or expose a lookup API. */
export const ENABLE2K = Object.freeze({
  dictionaryId: 'enable2k/1',
  dictionarySha256: 'd5ec7b3b1d35db798cee044fe3ec37e7cc0a96a00dee5695ad34c767f1797925',
});
export interface DictionaryRef { readonly dictionaryId: string; readonly dictionarySha256: string }
export interface Dictionary {
  readonly ref: Readonly<DictionaryRef>;
  readonly size: number;
  has(word: unknown): boolean;
  validateWords(words: readonly string[]): {valid: boolean; invalidWords: readonly string[]};
}

function assertVersion(ref: DictionaryRef): void {
  if (!ref || ref.dictionaryId !== ENABLE2K.dictionaryId || ref.dictionarySha256 !== ENABLE2K.dictionarySha256) {
    throw new Error('ptown_words:unsupported_dictionary');
  }
}

/** Verify before indexing; any corruption or unreviewed vocabulary change fails closed. */
export function verifiedDictionary(bytes: Uint8Array, ref: DictionaryRef): Dictionary {
  assertVersion(ref);
  if (createHash('sha256').update(bytes).digest('hex') !== ref.dictionarySha256) {
    throw new Error('ptown_words:dictionary_integrity');
  }
  const text = Buffer.from(bytes).toString('utf8');
  const entries = text.slice(0, -1).split('\n');
  if (!text.endsWith('\n') || entries.length !== 173528 || entries.some((word, i) =>
    !/^[A-Z]+$/.test(word) || (i > 0 && word <= entries[i - 1]))) {
    throw new Error('ptown_words:dictionary_format');
  }
  const index = new Set(entries); // Private immutable-by-closure index, built once per worker.
  const has = (word: unknown): boolean => typeof word === 'string' && /^[A-Za-z]+$/.test(word) && index.has(word.toUpperCase());
  return Object.freeze({
    ref: Object.freeze({...ENABLE2K}),
    size: index.size,
    has,
    validateWords(words: readonly string[]) {
      const invalidWords = Object.freeze(words.filter(word => !has(word)));
      return {valid: words.length > 0 && invalidWords.length === 0, invalidWords};
    },
  });
}

let cached: Dictionary | undefined;
/** Resolve the persisted match ref, never silently fall back to a current dictionary. */
export function dictionaryForMatch(ref: DictionaryRef): Dictionary {
  assertVersion(ref);
  cached ??= verifiedDictionary(readFileSync(new URL('./dictionaries/enable2k-1/words.txt', import.meta.url)), ENABLE2K);
  return cached;
}

/** Future admission must persist this alongside the rule version in its creation transaction. */
export function dictionaryRefForNewMatch(): Readonly<DictionaryRef> {
  dictionaryForMatch(ENABLE2K); // Do not admit with an unavailable/corrupt dictionary.
  return Object.freeze({...ENABLE2K});
}
