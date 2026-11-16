import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Answer} from './rules.js';

const guessesSha256='d888446d693992e3b19c218ed997209d8e3a2053f0d9bd7027d3a6e2de06058d';
export const VOCABULARIES = Object.freeze({
  'esdb-five-alive/1': Object.freeze({version:'esdb-five-alive/1',guessesSha256,
    answersSha256:'f6122ac580ff89c0299286c817a1fee26c8690a1eefbd9f9219a4140deec778c',answerCount:498}),
  'esdb-five-alive/2': Object.freeze({version:'esdb-five-alive/2',guessesSha256,
    answersSha256:'5ee93d5a1093c90f579b9ae0c5cf1c675e8150314f14683ede07262778f8b231',answerCount:753}),
  'esdb-five-alive/3': Object.freeze({version:'esdb-five-alive/3',guessesSha256,
    answersSha256:'56b3054ae90f96d725c542c19d4803ebfe3b07be6517aba1f0ecf18b866b38ed',answerCount:1021}),
});
export const VOCABULARY=VOCABULARIES['esdb-five-alive/3'];
interface Vocabulary {version:string;answers:Answer[];isValidGuess:(word:string)=>boolean}
const cache=new Map<string,Vocabulary>();

/** Private vocabulary is version-pinned; callers must not send it to browsers. */
export function loadVocabulary(version:unknown=VOCABULARY.version):Vocabulary {
  if(typeof version!=='string'||!Object.prototype.hasOwnProperty.call(VOCABULARIES,version))throw Error('five_alive:unknown_vocabulary');
  const cached=cache.get(version);if(cached)return cached;
  const definition=VOCABULARIES[version as keyof typeof VOCABULARIES];
  const guessesBytes = readFileSync(new URL('./guesses.esdb.txt', import.meta.url));
  // Literal asset reads preserve server-function file tracing for all versions.
  const answersBytes = version==='esdb-five-alive/1'
    ?readFileSync(new URL('./answers.reviewed.txt',import.meta.url))
    :version==='esdb-five-alive/2'
      ?readFileSync(new URL('./answers.reviewed.v2.txt',import.meta.url))
      :readFileSync(new URL('./answers.reviewed.v3.txt',import.meta.url));
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  if (hash(guessesBytes) !== definition.guessesSha256 || hash(answersBytes) !== definition.answersSha256) {
    throw new Error('five_alive:vocabulary_integrity');
  }
  const guesses = guessesBytes.toString('utf8').trimEnd().split('\n');
  if (guesses.length !== 11204 || guesses.some((word, i) => !/^[A-Z]{5}$/.test(word) || (i > 0 && word <= guesses[i - 1]))) {
    throw new Error('five_alive:invalid_vocabulary');
  }
  const valid = new Set(guesses);
  const answers: Answer[] = [];
  const seen = new Set<string>();
  for (const line of answersBytes.toString('utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Z]{5}) ([1-5])$/.exec(line);
    if (!m || !valid.has(m[1]) || seen.has(m[1])) throw new Error('five_alive:invalid_answers');
    seen.add(m[1]);
    answers.push({word: m[1], difficulty: Number(m[2])});
  }
  if (answers.length !== definition.answerCount) throw new Error('five_alive:invalid_answers');
  const result={version,answers,isValidGuess:(word:string)=>valid.has(word)};
  cache.set(version,result);return result;
}
